"""
scripts/nfl/sync_schedule.py

Syncs the full-season NFL schedule from nflreadpy into nfl_games.
Run daily (games get added rarely, but scores/QB names/weather fill
in as the season progresses — re-running is cheap and idempotent).

DELIBERATE EXCLUSION: nflreadpy's load_schedules() includes Vegas
lines (spread_line, total_line, moneylines, spread/total odds) on
every row. These are NOT selected or stored anywhere in this script,
per brand decision to keep the DB itself free of odds data — not just
hidden from public views. Do not add them back without checking that
decision first.

KNOWN LIMITATION: nflreadpy has no live "in progress" signal — a game
either has no scores yet (unplayed) or has final scores (completed).
game_status below approximates 'in_progress' by comparing kickoff time
to now, which will be wrong for any game that's gone to overtime or
been delayed. If live win-probability/in-game state matters later,
that needs a separate live-score source, not this script.

TIMEZONE ASSUMPTION: nflreadpy's `gametime` field is local Eastern
Time with no explicit timezone marker. Combined with `gameday` and
localized as America/New_York before conversion to UTC. Worth a spot
check against a known primetime game once games start airing, to
confirm this assumption holds.

NOTE: requires Python 3.10+ (nflreadpy/Polars dependency chain) —
GitHub Actions workflow needs python-version >= '3.10', not the 3.9
pin used by the MLB scripts.
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

import nflreadpy as nfl
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(".env.local")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
    sys.exit(1)

# Sync current season plus the tail end of the prior one, so games
# still resolving in early-season rest/travel calcs aren't missing.
SEASONS = [2025, 2026]

# nflreadpy is internally inconsistent: load_teams() uses 'LAR' for
# the Rams, load_schedules() uses 'LA'. Confirmed via direct diff of
# both functions' output -- this is the only abbreviation that
# diverges between the two. Normalized here rather than adding an
# alias row to nfl_teams, so there's exactly one team_id for the Rams.
TEAM_ID_ALIASES = {"LA": "LAR"}


def normalize_team_id(team_abbr: str) -> str:
    return TEAM_ID_ALIASES.get(team_abbr, team_abbr)


def combine_gametime_utc(gameday: Optional[str], gametime: Optional[str]) -> Optional[str]:
    """Combine gameday (YYYY-MM-DD) + gametime (HH:MM, assumed ET) into UTC ISO timestamp."""
    if not gameday or not gametime:
        return None
    naive = datetime.strptime(f"{gameday} {gametime}", "%Y-%m-%d %H:%M")
    et = naive.replace(tzinfo=ZoneInfo("America/New_York"))
    return et.astimezone(timezone.utc).isoformat()


def infer_game_status(home_score: Optional[int], away_score: Optional[int], gametime_utc: Optional[str]) -> str:
    """Best-effort status. See KNOWN LIMITATION in module docstring."""
    if home_score is not None and away_score is not None:
        return "final"
    if gametime_utc:
        kickoff = datetime.fromisoformat(gametime_utc)
        if kickoff < datetime.now(timezone.utc):
            return "in_progress"
    return "scheduled"


def fetch_games() -> list[dict]:
    df = nfl.load_schedules(seasons=SEASONS)
    rows = df.to_dicts()

    mapped = []
    for r in rows:
        gametime_utc = combine_gametime_utc(r["gameday"], r["gametime"])
        mapped.append(
            {
                "game_id": r["game_id"],
                "season": r["season"],
                "season_type": r["game_type"],
                "week": r["week"],
                "gameday": r["gameday"],
                "gametime": gametime_utc,
                "home_team": normalize_team_id(r["home_team"]),
                "away_team": normalize_team_id(r["away_team"]),
                "home_score": r["home_score"],
                "away_score": r["away_score"],
                "game_status": infer_game_status(r["home_score"], r["away_score"], gametime_utc),
                "stadium": r["stadium"],
                "roof": r["roof"],
                "surface": r["surface"],
                "temp": r["temp"],
                "wind": r["wind"],
                "referee": r["referee"],
                "div_game": bool(r["div_game"]) if r["div_game"] is not None else False,
                "overtime": bool(r["overtime"]) if r["overtime"] is not None else False,
                "away_rest": r["away_rest"],
                "home_rest": r["home_rest"],
                "home_qb_id": r["home_qb_id"],
                "home_qb_name": r["home_qb_name"],
                "away_qb_id": r["away_qb_id"],
                "away_qb_name": r["away_qb_name"],
                # NOTE: spread_line / total_line / moneylines / odds
                # deliberately NOT included -- see module docstring.
            }
        )
    return mapped


def main() -> None:
    print(f"Fetching NFL schedule for seasons {SEASONS} from nflreadpy...")
    games = fetch_games()
    print(f"Fetched {len(games)} games.\n")

    print("=== SANITY CHECK: first 5 rows ===")
    for g in games[:5]:
        print(g)
    print()

    status_counts: dict[str, int] = {}
    for g in games:
        status_counts[g["game_status"]] = status_counts.get(g["game_status"], 0) + 1
    print(f"Status breakdown: {status_counts}\n")

    if len(games) < 500:  # ~285/season x 2 seasons, loose sanity floor
        print(f"WARNING: expected ~500+ combined games across {SEASONS}, got {len(games)}. Check before proceeding.")

    print(f"About to upsert {len(games)} rows into nfl_games. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Upsert in batches -- Supabase client has payload size limits and
    # batching also means a mid-run failure doesn't lose everything.
    batch_size = 100
    total_upserted = 0
    for i in range(0, len(games), batch_size):
        batch = games[i : i + batch_size]
        result = supabase.table("nfl_games").upsert(batch, on_conflict="game_id").execute()
        total_upserted += len(result.data)
        print(f"  Upserted batch {i // batch_size + 1}: {len(result.data)} rows")

    print(f"\nDone. Upserted {total_upserted} total games into nfl_games.")


if __name__ == "__main__":
    main()