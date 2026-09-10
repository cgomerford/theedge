"""
scripts/nfl/sync_player_stats.py

Syncs weekly player stat lines into nfl_player_stats_weekly. Feeds
the Key Players section on game pages.

FILTERED TO SKILL POSITIONS (QB/RB/WR/TE/FB) -- confirmed via schema
inspection that load_player_stats() returns every position (O-line,
DL, DB, K, P, etc), but nfl_player_stats_weekly only has passing/
rushing/receiving columns. Storing non-skill positions here would
just be rows of nulls; the table isn't built to hold their stats.
If defensive playmaker stats (individual sacks/INTs/pressures) become
a factor input later, that's a new table, not an extension of this one
-- def_sacks/def_interceptions etc are already sitting in the raw
nflreadpy response and easy to pull in when there's a real use for them.

Uses player_display_name (full name, e.g. 'Dak Prescott') rather than
player_name (abbreviated, e.g. 'D.Prescott') -- confirmed via sample
row inspection which field is which.

NOTE: requires Python 3.10+ (nflreadpy/Polars dependency chain).
"""

from __future__ import annotations

import os
import sys
import time

import nflreadpy as nfl
import polars as pl
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(".env.local")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
    sys.exit(1)

# Same LA/LAR mismatch confirmed present in this endpoint too.
TEAM_ID_ALIASES = {"LA": "LAR"}

SEASONS = list(range(2021, 2027))  # last 6 seasons -- see sync_team_stats.py for CAREER_DATA_START_SEASON note
SKILL_POSITIONS = ["QB", "RB", "WR", "TE", "FB"]


def normalize_team_id(team: str | None) -> str | None:
    if team is None:
        return None
    return TEAM_ID_ALIASES.get(team, team)


def fetch_player_stats() -> list[dict]:
    frames = []
    for season in SEASONS:
        try:
            frames.append(nfl.load_player_stats(seasons=season))
        except (ValueError, ConnectionError) as e:
            # load_player_stats raises ConnectionError (404) for a
            # season with no published file yet, unlike load_pbp's
            # ValueError -- confirmed by hitting this directly rather
            # than assuming the same exception type across endpoints.
            print(f"  Skipping season {season}: no data available yet ({type(e).__name__})")
    if not frames:
        print("ERROR: no valid seasons had player stats data.")
        sys.exit(1)
    df = pl.concat(frames, how="diagonal_relaxed")

    df = df.filter(pl.col("position").is_in(SKILL_POSITIONS))
    rows = df.to_dicts()

    mapped = []
    for r in rows:
        mapped.append(
            {
                "player_id": r["player_id"],
                "player_name": r["player_display_name"],
                "team_id": normalize_team_id(r["team"]),
                "position": r["position"],
                "season": r["season"],
                "week": r["week"],
                "season_type": r["season_type"],
                "completions": r["completions"],
                "attempts": r["attempts"],
                "passing_yards": r["passing_yards"],
                "passing_tds": r["passing_tds"],
                "interceptions": r["passing_interceptions"],
                "passing_epa": r["passing_epa"],
                "cpoe": r["passing_cpoe"],
                "carries": r["carries"],
                "rushing_yards": r["rushing_yards"],
                "rushing_tds": r["rushing_tds"],
                "rushing_epa": r["rushing_epa"],
                "targets": r["targets"],
                "receptions": r["receptions"],
                "receiving_yards": r["receiving_yards"],
                "receiving_tds": r["receiving_tds"],
                "receiving_epa": r["receiving_epa"],
                "target_share": r["target_share"],
                "air_yards_share": r["air_yards_share"],
                "opponent_team": normalize_team_id(r["opponent_team"]),
                "fantasy_points": r["fantasy_points"],
                "fantasy_points_ppr": r["fantasy_points_ppr"],
                # snap_pct intentionally left null -- populated by
                # sync_snap_counts.py via a separate UPDATE, not here.
                "raw_source_json": {k: v for k, v in r.items() if isinstance(v, (int, float, str, bool)) or v is None},
            }
        )
    return mapped


def main() -> None:
    print(f"Fetching NFL player stats for seasons {SEASONS} (skill positions only)...")
    rows = fetch_player_stats()
    print(f"Fetched {len(rows)} player-week rows.\n")

    print("=== SANITY CHECK: first 5 rows ===")
    for r in rows[:5]:
        preview = {k: v for k, v in r.items() if k != "raw_source_json"}
        print(preview)
    print()

    if len(rows) < 3000:  # loose floor -- ~6400 for one season, less if only partial
        print(f"WARNING: expected 3000+ player-week rows, got {len(rows)}. Check before proceeding.")

    print(f"About to upsert {len(rows)} rows into nfl_player_stats_weekly. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    batch_size = 100
    total_upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = supabase.table("nfl_player_stats_weekly").upsert(
            batch, on_conflict="player_id,season,week,season_type"
        ).execute()
        total_upserted += len(result.data)
        print(f"  Upserted batch {i // batch_size + 1}: {len(result.data)} rows")

    print(f"\nDone. Upserted {total_upserted} total rows into nfl_player_stats_weekly.")


if __name__ == "__main__":
    main()