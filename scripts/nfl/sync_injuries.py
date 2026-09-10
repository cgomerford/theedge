"""
scripts/nfl/sync_injuries.py

Syncs weekly injury reports into nfl_injuries. gsis_id confirmed
consistent with player_id format elsewhere -- joins cleanly against
nfl_player_stats_weekly/nfl_next_gen_stats.

NOTE ON report_date/first_seen_at/last_seen_at: nflreadpy's injury
data has no per-report timestamp, only season/week -- confirmed via
schema inspection. report_date is left null here; first_seen_at/
last_seen_at (added in migration 002 to replace the old ESPN polling
table) also stay null. This script gives a weekly SNAPSHOT, not a
change log. If real change-tracking matters later, this script would
need to run more than once a week and diff against the prior row
before upserting -- not attempted here, see migration 002's comments.

report_primary_injury + report_secondary_injury are combined into a
single `injury` text field ("Knee, Ankle" style) since the table has
one injury column, not two.

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


def combine_injury(primary: str | None, secondary: str | None) -> str | None:
    parts = [p for p in (primary, secondary) if p]
    return ", ".join(parts) if parts else None


def fetch_injuries() -> list[dict]:
    rows: list[dict] = []
    for season in SEASONS:
        try:
            df = nfl.load_injuries(seasons=season)
        except (ValueError, ConnectionError) as e:
            print(f"  Skipping season {season}: no data available yet ({type(e).__name__})")
            continue
        for r in df.to_dicts():
            rows.append(
                {
                    "player_id": r["gsis_id"],
                    "player_name": r["full_name"],
                    "team_id": normalize_team_id(r["team"]),
                    "season": r["season"],
                    "week": r["week"],
                    "report_status": r["report_status"],
                    "practice_status": r["practice_status"],
                    "injury": combine_injury(r["report_primary_injury"], r["report_secondary_injury"]),
                    "report_date": None,  # not available at this granularity -- see docstring
                }
            )
    return rows


def main() -> None:
    print(f"Fetching NFL injury reports for seasons {SEASONS}...")
    rows = fetch_injuries()
    print(f"Fetched {len(rows)} rows.\n")

    print("=== SANITY CHECK: first 5 rows ===")
    for r in rows[:5]:
        print(r)
    print()

    if len(rows) < 500:
        print(f"WARNING: expected 500+ injury rows, got {len(rows)}. Check before proceeding.")

    print(f"About to insert {len(rows)} rows into nfl_injuries. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Confirm the intended re-run behavior before scheduling this on
    # a recurring cron.
    batch_size = 100
    total_upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = supabase.table("nfl_injuries").upsert(
            batch, on_conflict="player_id,season,week"
        ).execute()
        total_upserted += len(result.data)
        print(f"  Upserted batch {i // batch_size + 1}: {len(result.data)} rows")

    print(f"\nDone. Upserted {total_upserted} total rows into nfl_injuries.")


if __name__ == "__main__":
    main()