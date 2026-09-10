"""
scripts/nfl/sync_qb_zone_profile.py

Syncs nfl_qb_zone_profile -- QB pass-location x pass-length zone grid
(left/middle/right x short/deep), replacing the old placeholder
QBRoomHeatmap data flow entirely.

Verified against real 2024 Mahomes data before this script was
written: pass_attempt=1 still includes sack plays in this nflreadpy
data version (they show up as a null-pass_location bucket, since sacks
have no target location) -- those rows are dropped here, not forced
into a zone. Result: 579 classified attempts vs 581 official season
attempts, a small expected gap from the handful of throwaways/spikes
that don't get a location tag either. Worth surfacing that gap in the
UI (e.g. "579 of 581 attempts charted") rather than hiding it.

Run this AFTER sync_teams.py (team_id foreign key). Independent of
sync_player_route_profile.py and sync_team_scheme_profile.py -- same
source data, different grouping key, no dependency between them.
"""

from __future__ import annotations

import os
import sys
import time
from typing import Optional

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

SEASONS = [2022, 2023, 2024, 2025, 2026]

# Same known nflreadpy/nfl_teams abbreviation mismatch caught during
# the player route profile build -- applied here from the start rather
# than discovered again the hard way.
TEAM_ID_ALIASES = {
    "LA": "LAR",  # Rams
}


def load_season_attempts(season: int) -> Optional[pl.DataFrame]:
    """Real, location-classified pass attempts for one season. Returns
    None if the season has no pbp yet, so main() can tell 'nothing
    happened' from 'genuinely zero attempts'."""
    try:
        pbp = nfl.load_pbp(seasons=season).filter(pl.col("season_type") == "REG").select(
            [
                "passer_player_id",
                "posteam",
                "pass_attempt",
                "pass_location",
                "pass_length",
                "complete_pass",
                "cpoe",
                "epa",
                "pass_touchdown",
                "interception",
            ]
        )
    except ValueError as e:
        print(f"  No pbp data for {season}: {e}")
        return None

    return pbp.filter(
        (pl.col("pass_attempt") == 1)
        & pl.col("pass_location").is_not_null()
        & pl.col("pass_length").is_not_null()
        & pl.col("passer_player_id").is_not_null()
    )


def compute_qb_zone_profile(att: pl.DataFrame, season: int) -> list[dict]:
    grouped = att.group_by(["passer_player_id", "posteam", "pass_location", "pass_length"]).agg(
        [
            pl.len().alias("attempts"),
            pl.col("complete_pass").sum().alias("completions"),
            pl.col("cpoe").mean().alias("cpoe"),
            pl.col("epa").mean().alias("epa_per_att"),
            pl.col("pass_touchdown").sum().alias("touchdowns"),
            pl.col("interception").sum().alias("interceptions"),
        ]
    )

    rows = []
    for r in grouped.to_dicts():
        if r["passer_player_id"] is None or r["posteam"] is None:
            continue
        attempts = r["attempts"]
        completions = int(r["completions"] or 0)
        rows.append(
            {
                "player_id": r["passer_player_id"],
                "season": season,
                "team_id": TEAM_ID_ALIASES.get(r["posteam"], r["posteam"]),
                "pass_location": r["pass_location"],
                "pass_length": r["pass_length"],
                "attempts": attempts,
                "completions": completions,
                "comp_pct": (completions / attempts) * 100 if attempts else None,
                "cpoe": r["cpoe"],
                "epa_per_att": r["epa_per_att"],
                "touchdowns": int(r["touchdowns"] or 0),
                "interceptions": int(r["interceptions"] or 0),
            }
        )
    return rows


def main() -> None:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    valid_team_ids = {row["team_id"] for row in supabase.table("nfl_teams").select("team_id").execute().data}
    grand_total = 0

    for season in SEASONS:
        print(f"=== Season {season} ===")
        att = load_season_attempts(season)
        if att is None or att.height == 0:
            print("  No attempts this season, skipping.\n")
            continue

        rows = compute_qb_zone_profile(att, season)
        print(f"  Computed {len(rows)} player/team/zone rows.")

        bad_teams = {r["team_id"] for r in rows} - valid_team_ids
        if bad_teams:
            print(f"  WARNING: unmapped team_id(s) {bad_teams} -- dropping, add to TEAM_ID_ALIASES to fix properly.")
            rows = [r for r in rows if r["team_id"] in valid_team_ids]

        if not rows:
            print()
            continue

        print("  Sanity check, first 5 rows:")
        for r in rows[:5]:
            print(f"    {r}")

        print(f"  About to upsert {len(rows)} rows. Aborting in 5 seconds (Ctrl+C to cancel)...")
        time.sleep(5)

        batch_size = 200
        season_total = 0
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            result = supabase.table("nfl_qb_zone_profile").upsert(
                batch, on_conflict="player_id,season,team_id,pass_location,pass_length"
            ).execute()
            season_total += len(result.data)
        print(f"  Upserted {season_total} rows for {season}.\n")
        grand_total += season_total

    print(f"Done. Upserted {grand_total} total rows across all seasons.")


if __name__ == "__main__":
    main()