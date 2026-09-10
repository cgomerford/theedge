"""
scripts/nfl/sync_depth_charts.py

Syncs depth chart ordering into nfl_depth_charts.

IMPORTANT LIMITATION: this endpoint has no season/week columns --
only a capture timestamp (`dt`, e.g. '2026-03-14T07:32:09Z'). Season
is derived from the year in `dt`; week is left NULL, since there's no
reliable way to map a depth-chart snapshot timestamp to an NFL week
(snapshots happen continuously, not aligned to game weeks). This
means nfl_depth_charts.week will be null for all rows from this
script -- confirmed by checking the real schema, not an oversight.
If week-specific depth charts matter later (e.g. "who started at RB2
in week 6"), that needs either a different data source or inferring
week from proximity to nfl_games.gametime, neither built here.

pos_rank is used as depth_rank directly (1 = starter).

NOTE: requires Python 3.10+ (nflreadpy/Polars dependency chain).
"""

from __future__ import annotations

import os
import sys
import time
from datetime import datetime

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

TEAM_ID_ALIASES = {"LA": "LAR"}
SEASONS = [2025, 2026]


def normalize_team_id(team: str | None) -> str | None:
    if team is None:
        return None
    return TEAM_ID_ALIASES.get(team, team)


def fetch_depth_charts() -> list[dict]:
    rows: list[dict] = []
    for season in SEASONS:
        try:
            df = nfl.load_depth_charts(seasons=season)
        except (ValueError, ConnectionError) as e:
            print(f"  Skipping season {season}: no data available yet ({type(e).__name__})")
            continue

        # This endpoint returns EVERY historical snapshot, not just
        # the current depth chart -- confirmed 221 snapshots/season at
        # ~2,500 rows each (554k rows for 2025 alone). The product
        # only needs the current ordering, not a year of scrape
        # history, so keep only the most recent snapshot.
        latest_dt = df.select("dt").max().item()
        df = df.filter(pl.col("dt") == latest_dt)
        print(f"  Season {season}: using latest snapshot ({latest_dt}), {df.height} rows")

        for r in df.to_dicts():
            dt_year = datetime.fromisoformat(r["dt"].replace("Z", "+00:00")).year if r["dt"] else season
            rows.append(
                {
                    "team_id": normalize_team_id(r["team"]),
                    "season": dt_year,
                    "week": None,  # not available at this granularity -- see docstring
                    "player_id": r["gsis_id"],
                    "player_name": r["player_name"],
                    "position": r["pos_abb"],
                    "depth_rank": r["pos_rank"],
                }
            )
    return rows


def main() -> None:
    print(f"Fetching NFL depth charts for seasons {SEASONS}...")
    rows = fetch_depth_charts()
    print(f"Fetched {len(rows)} rows.\n")

    print("=== SANITY CHECK: first 5 rows ===")
    for r in rows[:5]:
        print(r)
    print()

    if len(rows) < 500:
        print(f"WARNING: expected 500+ depth chart rows, got {len(rows)}. Check before proceeding.")

    print(f"About to insert {len(rows)} rows into nfl_depth_charts. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Upserts on (team_id, player_id, position, season) -- migration
    # 006 adds that constraint. Re-running daily updates depth_rank
    # in place instead of accumulating a new ~2,500-row snapshot every
    # time, which is what a straight insert would do here.
    batch_size = 100
    total_upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = supabase.table("nfl_depth_charts").upsert(
            batch, on_conflict="team_id,player_id,position,season"
        ).execute()
        total_upserted += len(result.data)
        print(f"  Upserted batch {i // batch_size + 1}: {len(result.data)} rows")

    print(f"\nDone. Upserted {total_upserted} total rows into nfl_depth_charts.")


if __name__ == "__main__":
    main()