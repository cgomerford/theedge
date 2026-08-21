"""
nfl_boxscore_ingest.py

Reads gameIds from nfl_games (is_complete=true, filtered by seasontype/week/
year like nfl_scoreboard_ingest.py), pulls each game's playbyplay endpoint,
and writes player stat rows to nfl_player_game_stats. Single writer for
that table -- do not write it from anywhere else.

Depends on nfl_scoreboard_ingest.py having already run for these games --
this script reads gameIds FROM nfl_games, it does not hit the scoreboard
endpoint itself.

Usage:
  python3 scripts/nfl_boxscore_ingest.py --seasontype 1 --week 2 --year 2026

Field mapping curl-verified against a real playbyplay payload
(https://cdn.espn.com/core/nfl/playbyplay?xhr=1&gameId=401772510) pulled
earlier in this project. The players array lives at the TOP-LEVEL key
gamepackageJSON.boxscore.players -- NOT under content.gamepackageJSON
(an earlier version of this script guessed that nesting wrong and threw
KeyError: 'gamepackageJSON' on every game). It's an array of exactly 2
entries (one per team), each with a `statistics[]` array of category
objects. Each category object has:
  - name: 'passing' | 'rushing' | 'receiving' | 'defensive' | 'interceptions'
          | 'kicking' | 'punting' | 'kickReturns' | 'puntReturns' | 'fumbles'
  - keys: ordered list of stat field names for this category
  - athletes: [{ athlete: {...}, stats: [...] }] -- stats[] is positionally
    matched to keys[], NEVER assume a fixed order across categories, always
    zip(keys, stats) per the project's "never guess field position" rule.

Known per-category key sets (may not be exhaustive -- unmapped keys land in
`raw` rather than being silently dropped):
  passing:       completions/passingAttempts, passingYards, yardsPerPassAttempt,
                 passingTouchdowns, interceptions, sacks-sackYardsLost, adjQBR, QBRating
  rushing:       rushingAttempts, rushingYards, yardsPerRushAttempt,
                 rushingTouchdowns, longRushing
  receiving:     receptions, receivingYards, yardsPerReception,
                 receivingTouchdowns, longReception, receivingTargets
  defensive:     totalTackles, soloTackles, sacks, tacklesForLoss,
                 passesDefended, QBHits, defensiveTouchdowns
  interceptions: interceptions, interceptionYards, interceptionTouchdowns

NOTE on qb_rating: ESPN's per-game "QBRating" field is NOT a cumulative
season passer rating -- it's that single game's rating. Summing or
averaging it across games to build a "season QB rating leaderboard" is
mathematically wrong (passer rating isn't linearly averageable). This
script stores it as-is per game; do not build a naive AVG() leaderboard
on qb_rating without recomputing the real formula from cumulative
completions/attempts/yards/TDs/INTs first.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(".env.local")

PLAYBYPLAY_URL = "https://cdn.espn.com/core/nfl/playbyplay"

GAMES_TABLE = "nfl_games"
STATS_TABLE = "nfl_player_game_stats"


def get_supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: missing Supabase URL/key env vars (checked both GitHub Actions and .env.local names)")
        sys.exit(1)
    return create_client(url, key)


def get_completed_game_ids(client: Client, seasontype: int, week: int, year: int) -> list[dict]:
    resp = (
        client.table(GAMES_TABLE)
        .select("game_id, season_year, season_type, week")
        .eq("season_type", seasontype)
        .eq("week", week)
        .eq("season_year", year)
        .eq("is_complete", True)
        .execute()
    )
    return resp.data or []


def fetch_playbyplay(game_id: str) -> dict:
    resp = requests.get(PLAYBYPLAY_URL, params={"xhr": "1", "gameId": game_id}, timeout=20)
    resp.raise_for_status()
    return resp.json()


def to_number(raw: Any) -> Optional[float]:
    """
    Convert an ESPN stat string to a number, or None if it's not a plain
    numeric value (e.g. "0-0" completion strings, empty strings). Callers
    that need the "0-0" split (completions/passingAttempts,
    sacks-sackYardsLost) handle that BEFORE calling this -- this is only
    for plain single-value fields.
    """
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def split_pair(raw: Any, sep: str) -> tuple[Optional[float], Optional[float]]:
    if not raw or not isinstance(raw, str) or sep not in raw:
        return None, None
    left, right = raw.split(sep, 1)
    return to_number(left), to_number(right)


# Per-category extraction: given a dict of {key: raw_value_string} for one
# athlete in one category, return the column-mapped fields for that category.
# Everything not explicitly mapped stays in `raw` on the row (set by the caller).

def extract_passing(stats: dict) -> dict:
    completions, attempts = split_pair(stats.get("completions/passingAttempts"), "/")
    sacks_taken, sack_yards = split_pair(stats.get("sacks-sackYardsLost"), "-")
    return {
        "pass_completions": completions,
        "pass_attempts": attempts,
        "passing_yards": to_number(stats.get("passingYards")),
        "yards_per_pass_attempt": to_number(stats.get("yardsPerPassAttempt")),
        "passing_touchdowns": to_number(stats.get("passingTouchdowns")),
        "interceptions_thrown": to_number(stats.get("interceptions")),
        "sacks_taken": sacks_taken,
        "sack_yards_lost": sack_yards,
        "qb_rating": to_number(stats.get("QBRating")),
    }


def extract_rushing(stats: dict) -> dict:
    return {
        "rushing_attempts": to_number(stats.get("rushingAttempts")),
        "rushing_yards": to_number(stats.get("rushingYards")),
        "yards_per_rush": to_number(stats.get("yardsPerRushAttempt")),
        "rushing_touchdowns": to_number(stats.get("rushingTouchdowns")),
        "long_rushing": to_number(stats.get("longRushing")),
    }


def extract_receiving(stats: dict) -> dict:
    return {
        "receptions": to_number(stats.get("receptions")),
        "receiving_yards": to_number(stats.get("receivingYards")),
        "yards_per_reception": to_number(stats.get("yardsPerReception")),
        "receiving_touchdowns": to_number(stats.get("receivingTouchdowns")),
        "long_reception": to_number(stats.get("longReception")),
        "receiving_targets": to_number(stats.get("receivingTargets")),
    }


def extract_defensive(stats: dict) -> dict:
    return {
        "total_tackles": to_number(stats.get("totalTackles")),
        "solo_tackles": to_number(stats.get("soloTackles")),
        "sacks": to_number(stats.get("sacks")),
        "tackles_for_loss": to_number(stats.get("tacklesForLoss")),
        "passes_defended": to_number(stats.get("passesDefended")),
        "qb_hits": to_number(stats.get("QBHits")),
        "defensive_touchdowns": to_number(stats.get("defensiveTouchdowns")),
    }


def extract_interceptions(stats: dict) -> dict:
    return {
        "def_interceptions": to_number(stats.get("interceptions")),
        "interception_yards": to_number(stats.get("interceptionYards")),
        "interception_touchdowns": to_number(stats.get("interceptionTouchdowns")),
    }


CATEGORY_EXTRACTORS = {
    "passing": extract_passing,
    "rushing": extract_rushing,
    "receiving": extract_receiving,
    "defensive": extract_defensive,
    "interceptions": extract_interceptions,
}


def extract_player_rows(payload: dict, game_meta: dict) -> list[dict]:
    # CORRECTED: gamepackageJSON is a top-level key in the response, NOT
    # nested under "content" -- confirmed against the real payload pasted
    # earlier in this project (Cowboys @ Eagles, gameId 401772510). The
    # original content.gamepackageJSON.boxscore.players guess was wrong
    # and threw KeyError: 'gamepackageJSON' on every game.
    boxscore_players = payload["gamepackageJSON"]["boxscore"]["players"]

    rows: list[dict] = []
    for team_block in boxscore_players:
        team_id = team_block.get("team", {}).get("id")
        team_abbrev = team_block.get("team", {}).get("abbreviation")

        for category in team_block.get("statistics", []):
            cat_name = category.get("name")
            keys = category.get("keys", [])
            extractor = CATEGORY_EXTRACTORS.get(cat_name)
            if extractor is None:
                # Categories we don't have a column mapping for yet
                # (kicking, punting, kickReturns, puntReturns, fumbles) --
                # skip rather than guess a schema. Add an extractor above
                # if/when these are needed.
                continue

            for athlete_entry in category.get("athletes", []):
                athlete = athlete_entry.get("athlete", {})
                stat_values = athlete_entry.get("stats", [])
                stats_dict = dict(zip(keys, stat_values))  # never guess position -- always zip against this category's own keys

                mapped = extractor(stats_dict)

                rows.append({
                    "game_id": game_meta["game_id"],
                    "athlete_id": str(athlete.get("id", "")),
                    "athlete_name": athlete.get("displayName"),
                    "team_id": team_id,
                    "team_abbrev": team_abbrev,
                    "category": cat_name,
                    "season_year": game_meta["season_year"],
                    "season_type": game_meta["season_type"],
                    "week": game_meta["week"],
                    "raw": stats_dict,
                    **mapped,
                })

    return rows


def write_to_supabase(client: Client, rows: list[dict]) -> None:
    for row in rows:
        client.table(STATS_TABLE).upsert(row, on_conflict="game_id,athlete_id,category").execute()
    print(f"Wrote {len(rows)} player-stat rows to {STATS_TABLE}.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasontype", type=int, required=True)
    parser.add_argument("--week", type=int, required=True)
    parser.add_argument("--year", type=int, default=datetime.now(timezone.utc).year)
    args = parser.parse_args()

    client = get_supabase_client()
    games = get_completed_game_ids(client, args.seasontype, args.week, args.year)

    if not games:
        print(f"No completed games found in nfl_games for seasontype={args.seasontype} week={args.week} year={args.year}.")
        print("Run nfl_scoreboard_ingest.py for this week first.")
        sys.exit(0)

    print(f"Found {len(games)} completed game(s). Fetching boxscores...")

    all_rows: list[dict] = []
    for game in games:
        game_id = game["game_id"]
        print(f"  {game_id}...", end=" ")
        try:
            payload = fetch_playbyplay(game_id)
            rows = extract_player_rows(payload, game)
            all_rows.extend(rows)
            print(f"{len(rows)} player-stat rows")
        except Exception as e:
            print(f"FAILED: {e}")
        time.sleep(0.5)  # be polite to ESPN's CDN, not hammering it in a tight loop

    if not all_rows:
        print("No player-stat rows extracted. Exiting without writing.")
        sys.exit(0)

    print(f"\n{len(all_rows)} total rows. Writing in 5s -- Ctrl+C to abort...")
    time.sleep(5)
    write_to_supabase(client, all_rows)


if __name__ == "__main__":
    main()