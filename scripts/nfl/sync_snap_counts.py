"""
scripts/nfl/sync_snap_counts.py

Syncs weekly snap counts into nfl_snap_counts.

SAME ID CAVEAT AS sync_pfr_advstats.py: this endpoint (PFR-sourced)
uses pfr_player_id, not gsis_id -- confirmed via schema inspection.
Doesn't join cleanly against nfl_player_stats_weekly/nfl_next_gen_stats
by ID. Stored as-is.

NOTE: requires Python 3.10+ (nflreadpy/Polars dependency chain).
"""

from __future__ import annotations

import os
import sys
import time

import nflreadpy as nfl
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


def fetch_snap_counts() -> list[dict]:
    rows: list[dict] = []
    for season in SEASONS:
        try:
            df = nfl.load_snap_counts(seasons=season)
        except (ValueError, ConnectionError) as e:
            print(f"  Skipping season {season}: no data available yet ({type(e).__name__})")
            continue
        for r in df.to_dicts():
            rows.append(
                {
                    "player_id": r["pfr_player_id"],
                    "player_name": r["player"],
                    "team_id": normalize_team_id(r["team"]),
                    "season": r["season"],
                    "week": r["week"],
                    "offense_snaps": int(r["offense_snaps"]) if r["offense_snaps"] is not None else None,
                    "offense_pct": r["offense_pct"],
                    "defense_snaps": int(r["defense_snaps"]) if r["defense_snaps"] is not None else None,
                    "defense_pct": r["defense_pct"],
                    "st_snaps": int(r["st_snaps"]) if r["st_snaps"] is not None else None,
                    "st_pct": r["st_pct"],
                }
            )
    return rows


def main() -> None:
    print(f"Fetching NFL snap counts for seasons {SEASONS}...")
    rows = fetch_snap_counts()
    print(f"Fetched {len(rows)} rows.\n")

    print("=== SANITY CHECK: first 5 rows ===")
    for r in rows[:5]:
        print(r)
    print()

    if len(rows) < 3000:
        print(f"WARNING: expected 3000+ snap count rows, got {len(rows)}. Check before proceeding.")

    print(f"About to upsert {len(rows)} rows into nfl_snap_counts. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    batch_size = 100
    total_upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = supabase.table("nfl_snap_counts").upsert(
            batch, on_conflict="player_id,team_id,season,week"
        ).execute()
        total_upserted += len(result.data)
        print(f"  Upserted batch {i // batch_size + 1}: {len(result.data)} rows")

    print(f"\nDone. Upserted {total_upserted} total rows into nfl_snap_counts.")


if __name__ == "__main__":
    main()