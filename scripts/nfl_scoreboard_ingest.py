"""
nfl_scoreboard_ingest.py

Pulls the ESPN scoreboard for a given NFL week/seasontype, checks that every
game in that week is complete, and — only if so — writes game-level rows to
Supabase. Does NOT pull boxscore/playbyplay; that's a separate script
(nfl_game_detail_ingest.py) that runs after this one confirms the week is closed.

Usage:
  python3 scripts/nfl_scoreboard_ingest.py --seasontype 1 --week 2 --year 2026
  python3 scripts/nfl_scoreboard_ingest.py --seasontype 1 --week 2 --year 2026 --force

--force writes whatever games are already complete and skips the rest,
instead of requiring the entire week to be finished. Safe to re-run later
without --force (or with it again) once the remaining games finish --
upsert on game_id means no duplicates, no conflicts.

NOTE on ESPN's week numbering: `week` in the API does NOT match the human
label. Confirmed via curl on 2026-08-14: seasontype=1&week=2 returns games
labelled "Preseason Week 1" in calendar[0].entries (Hall of Fame weekend
eats week 1). Always cross-check the returned event's `season.slug` /
calendar label before assuming week=N means "Preseason Week N" -- don't
hardcode the offset, since it may differ across regular season too.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(".env.local")

SCOREBOARD_URL = "https://cdn.espn.com/core/nfl/scoreboard"

# Single writer for this table -- do not write nfl_games from any other script.
TABLE = "nfl_games"


def get_supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: missing Supabase URL/key env vars (checked both GitHub Actions and .env.local names)")
        sys.exit(1)
    return create_client(url, key)


def fetch_scoreboard(seasontype: int, week: int, year: int) -> dict:
    params = {"xhr": "1", "year": year, "seasontype": seasontype, "week": week}
    resp = requests.get(SCOREBOARD_URL, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def extract_games(payload: dict) -> list[dict]:
    """
    Field names curl-verified against a live 2026 preseason payload on
    2026-08-14. If ESPN changes these, this will KeyError loudly rather than
    silently write wrong data -- that's intentional, don't wrap in .get()
    defaults for the required fields below.
    """
    events = payload["content"]["sbData"]["events"]
    games = []
    for event in events:
        comp = event["competitions"][0]
        status = event["status"]
        is_complete = status["type"]["completed"]

        home = next(c for c in comp["competitors"] if c["homeAway"] == "home")
        away = next(c for c in comp["competitors"] if c["homeAway"] == "away")

        # leaders[] is only present once the game has started/finished
        leaders = comp.get("leaders", [])
        leaders_summary = [
            {
                "category": leader.get("name"),
                "display_value": leader["leaders"][0].get("displayValue") if leader.get("leaders") else None,
                "athlete_name": leader["leaders"][0]["athlete"].get("displayName") if leader.get("leaders") else None,
                "athlete_id": leader["leaders"][0]["athlete"].get("id") if leader.get("leaders") else None,
                "team_id": leader["leaders"][0].get("team", {}).get("id") if leader.get("leaders") else None,
            }
            for leader in leaders
        ]

        games.append({
            "game_id": event["id"],
            "season_year": event["season"]["year"],
            "season_type": event["season"]["type"],  # 1=pre, 2=regular, 3=post
            "week": event["week"]["number"],
            "start_date": event["date"],
            "home_team_id": home["team"]["id"],
            "home_team_abbrev": home["team"]["abbreviation"],
            "away_team_id": away["team"]["id"],
            "away_team_abbrev": away["team"]["abbreviation"],
            "home_score": int(home.get("score", 0)),
            "away_score": int(away.get("score", 0)),
            "is_complete": is_complete,
            "status_detail": status["type"]["detail"],
            "leaders": leaders_summary,
        })
    return games


def all_complete(games: list[dict]) -> bool:
    return all(g["is_complete"] for g in games)


def sanity_print(games: list[dict]) -> None:
    print(f"\n{'game_id':<12}{'matchup':<14}{'score':<10}{'complete':<10}{'week':<6}")
    for g in games[:5]:
        matchup = f"{g['away_team_abbrev']}@{g['home_team_abbrev']}"
        score = f"{g['away_score']}-{g['home_score']}"
        print(f"{g['game_id']:<12}{matchup:<14}{score:<10}{str(g['is_complete']):<10}{g['week']:<6}")
    print(f"...({len(games)} games total)\n")


def write_to_supabase(client: Client, games: list[dict]) -> None:
    # json.dumps() not needed here -- supabase-py handles dict/list -> JSONB
    for g in games:
        client.table(TABLE).upsert(g, on_conflict="game_id").execute()
    print(f"Wrote {len(games)} rows to {TABLE}.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasontype", type=int, required=True, help="1=preseason, 2=regular, 3=postseason")
    parser.add_argument("--week", type=int, required=True)
    parser.add_argument("--year", type=int, default=datetime.now(timezone.utc).year)
    parser.add_argument("--force", action="store_true", help="Write completed games even if the week isn't fully finished")
    args = parser.parse_args()

    payload = fetch_scoreboard(args.seasontype, args.week, args.year)
    games = extract_games(payload)

    if not games:
        print(f"No games found for seasontype={args.seasontype} week={args.week} year={args.year}. Exiting.")
        sys.exit(0)

    sanity_print(games)

    week_complete = all_complete(games)

    if not week_complete and not args.force:
        incomplete = [g["game_id"] for g in games if not g["is_complete"]]
        print(f"Week not fully complete yet -- {len(incomplete)} game(s) still pending: {incomplete}")
        print("Exiting without writing (this is expected mid-week, not an error). Pass --force to write completed games anyway.")
        sys.exit(0)

    completed_games = [g for g in games if g["is_complete"]]

    if args.force and not week_complete:
        skipped = len(games) - len(completed_games)
        print(f"--force set: writing {len(completed_games)} completed game(s), skipping {skipped} still pending.")
        games_to_write = completed_games
    else:
        print("All games complete. Writing all games.")
        games_to_write = games

    if not games_to_write:
        print("No completed games to write yet. Exiting.")
        sys.exit(0)

    print("Writing in 5s -- Ctrl+C to abort...")
    time.sleep(5)

    client = get_supabase_client()
    write_to_supabase(client, games_to_write)


if __name__ == "__main__":
    main()