"""
scripts/nfl/sync_nextgen.py

Syncs Next Gen Stats (passing/rushing/receiving) into nfl_next_gen_stats.
One row per player per week per stat_type, raw_source_json holds the
full type-specific field set since columns differ meaningfully across
the three types (time-to-throw for passing, separation for receiving,
etc) -- not worth forcing into one flat schema.

player_gsis_id confirmed consistent with player_id format used in
nfl_player_stats_weekly (e.g. '00-0023459') -- these join cleanly,
unlike the PFR-sourced tables (see sync_pfr_advstats.py docstring).

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

TEAM_ID_ALIASES = {"LA": "LAR"}
SEASONS = [2025, 2026]
STAT_TYPES = ["passing", "rushing", "receiving"]


def normalize_team_id(team: str | None) -> str | None:
    if team is None:
        return None
    return TEAM_ID_ALIASES.get(team, team)


def fetch_nextgen() -> list[dict]:
    rows: list[dict] = []
    for stat_type in STAT_TYPES:
        for season in SEASONS:
            try:
                df = nfl.load_nextgen_stats(stat_type=stat_type, seasons=season)
            except (ValueError, ConnectionError) as e:
                print(f"  Skipping {stat_type} season {season}: no data available yet ({type(e).__name__})")
                continue
            # Next Gen Stats includes a week=0 "season total" row per
            # player alongside weekly rows -- excluded here since this
            # table is meant to be weekly granularity only.
            df = df.filter(pl.col("week") > 0)
            for r in df.to_dicts():
                rows.append(
                    {
                        "player_id": r["player_gsis_id"],
                        "team_id": normalize_team_id(r["team_abbr"]),
                        "season": r["season"],
                        "week": r["week"],
                        "stat_type": stat_type,
                        "raw_source_json": r,
                    }
                )
    return rows


def main() -> None:
    print(f"Fetching Next Gen Stats ({', '.join(STAT_TYPES)}) for seasons {SEASONS}...")
    rows = fetch_nextgen()
    print(f"Fetched {len(rows)} rows.\n")

    print("=== SANITY CHECK: first 3 rows per stat_type ===")
    seen_types: dict[str, int] = {}
    for r in rows:
        st = r["stat_type"]
        if seen_types.get(st, 0) < 3:
            print(r)
            seen_types[st] = seen_types.get(st, 0) + 1
    print()

    if len(rows) < 1000:
        print(f"WARNING: expected 1000+ rows, got {len(rows)}. Check before proceeding.")

    print(f"About to upsert {len(rows)} rows into nfl_next_gen_stats. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    batch_size = 100
    total_upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = supabase.table("nfl_next_gen_stats").upsert(
            batch, on_conflict="player_id,season,week,stat_type"
        ).execute()
        total_upserted += len(result.data)
        print(f"  Upserted batch {i // batch_size + 1}: {len(result.data)} rows")

    print(f"\nDone. Upserted {total_upserted} total rows into nfl_next_gen_stats.")


if __name__ == "__main__":
    main()