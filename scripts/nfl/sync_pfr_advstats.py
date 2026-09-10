"""
scripts/nfl/sync_pfr_advstats.py

Syncs Pro Football Reference advanced stats (pass/rush/rec/def) into
nfl_pfr_advstats. One row per player per game per stat_type.

IMPORTANT ID MISMATCH: this endpoint's pfr_player_id (e.g. 'MahoPa00'
style) is PFR's own scheme, confirmed NOT the same as the gsis_id
format ('00-0033873') used in nfl_player_stats_weekly and
nfl_next_gen_stats. Stored as-is under player_id -- do not assume this
joins cleanly against those tables by ID. If cross-referencing by
player is needed (e.g. "show this QB's pressure rate next to his EPA
numbers"), that requires either a name-based join (fragile -- suffix
mismatches, Jr./II, etc) or a proper id crosswalk, neither of which
this script builds. Flagging now rather than after something silently
joins wrong.

This script ONLY writes nfl_pfr_advstats (raw player-level storage).
It does NOT compute team-level pressure_rate_allowed/created on
nfl_team_stats_weekly -- that requires joining these player-level
pressure counts against the play/dropback counts already computed in
sync_team_stats.py, which is a separate aggregation step not yet
built. Those two columns stay null until that's written -- don't
backfill them with a guess.

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
STAT_TYPES = ["pass", "rush", "rec", "def"]


def normalize_team_id(team: str | None) -> str | None:
    if team is None:
        return None
    return TEAM_ID_ALIASES.get(team, team)


def fetch_pfr_advstats() -> list[dict]:
    rows: list[dict] = []
    for stat_type in STAT_TYPES:
        for season in SEASONS:
            try:
                df = nfl.load_pfr_advstats(stat_type=stat_type, seasons=season)
            except (ValueError, ConnectionError) as e:
                print(f"  Skipping {stat_type} season {season}: no data available yet ({type(e).__name__})")
                continue
            for r in df.to_dicts():
                rows.append(
                    {
                        "player_id": r["pfr_player_id"],
                        "team_id": normalize_team_id(r["team"]),
                        "season": r["season"],
                        "week": r["week"],
                        "stat_type": stat_type,
                        "raw_source_json": r,
                    }
                )
    return rows


def main() -> None:
    print(f"Fetching PFR advanced stats ({', '.join(STAT_TYPES)}) for seasons {SEASONS}...")
    rows = fetch_pfr_advstats()
    print(f"Fetched {len(rows)} rows.\n")

    print("=== SANITY CHECK: first row per stat_type ===")
    seen_types: set[str] = set()
    for r in rows:
        if r["stat_type"] not in seen_types:
            print(r)
            seen_types.add(r["stat_type"])
    print()

    if len(rows) < 5000:
        print(f"WARNING: expected 5000+ rows, got {len(rows)}. Check before proceeding.")

    print(f"About to upsert {len(rows)} rows into nfl_pfr_advstats. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    batch_size = 100
    total_upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = supabase.table("nfl_pfr_advstats").upsert(
            batch, on_conflict="player_id,season,week,stat_type"
        ).execute()
        total_upserted += len(result.data)
        print(f"  Upserted batch {i // batch_size + 1}: {len(result.data)} rows")

    print(f"\nDone. Upserted {total_upserted} total rows into nfl_pfr_advstats.")


if __name__ == "__main__":
    main()