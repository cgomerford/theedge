"""
scripts/nfl/sync_teams.py

Syncs NFL team reference data from nflreadpy into nfl_teams.
Rare-run script — team metadata barely changes in-season. Safe to
re-run any time; upserts on team_id.

IMPORTANT: nflreadpy's `team_abbr` field (e.g. 'WAS') is what we store
as our team_id primary key — NOT nflreadpy's own `team_id` field,
which is an unrelated internal numeric code ('3800' for ARI, etc).
Every other nfl_* table's team_id foreign key expects the abbreviation.
Confirmed via direct schema inspection before writing this mapping —
do not "fix" this to use nflreadpy's team_id field, that would break
every join in the schema.

NOTE: nflreadpy requires Python 3.10+ (Polars dependency chain).
This conflicts with the 3.9 target used by the MLB scripts — GitHub
Actions workflow for this script needs python-version >= '3.10',
not the 3.9 pin used elsewhere. Flagging so it's not a silent CI
failure the first time this runs on a schedule.
"""

from __future__ import annotations

import os
import sys
import time

import nflreadpy as nfl
from dotenv import load_dotenv
from supabase import Client, create_client

# Dual env fallback: local dev uses .env.local, GitHub Actions may use
# either naming convention depending on which workflow set it up.
load_dotenv(".env.local")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
    sys.exit(1)


CURRENT_TEAMS = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
    "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA",
    "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB",
    "TEN", "WAS",
}


def fetch_teams() -> list[dict]:
    """Pull team reference data from nflreadpy and map to our schema."""
    df = nfl.load_teams()
    rows = [r for r in df.to_dicts() if r["team_abbr"] in CURRENT_TEAMS]

    mapped = []
    for r in rows:
        mapped.append(
            {
                "team_id": r["team_abbr"],  # NOT r['team_id'] -- see module docstring
                "team_name": r["team_name"],
                "team_nick": r["team_nick"],
                "conference": r["team_conf"],
                "division": r["team_division"],
                "team_color": r["team_color"],
                "team_color2": r["team_color2"],
                "team_logo_url": r["team_logo_espn"],
                "team_wordmark_url": r["team_wordmark"],
            }
        )
    return mapped


def main() -> None:
    print("Fetching NFL team reference data from nflreadpy...")
    teams = fetch_teams()
    print(f"Fetched {len(teams)} teams.\n")

    print("=== SANITY CHECK: first 5 rows ===")
    for t in teams[:5]:
        print(t)
    print()

    if len(teams) != 32:
        print(f"WARNING: expected 32 NFL teams, got {len(teams)}. Aborting — check nflreadpy output before proceeding.")
        sys.exit(1)

    print(f"About to upsert {len(teams)} rows into nfl_teams. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    result = supabase.table("nfl_teams").upsert(teams, on_conflict="team_id").execute()

    print(f"Upserted {len(result.data)} teams into nfl_teams.")


if __name__ == "__main__":
    main()