"""
scripts/nfl/sync_player_route_profile.py

Syncs nfl_player_route_profile -- per-player, per-team, per-route
target distribution and efficacy. Powers the homepage's RB/WR marquee
route charts.

Every aggregation here was tested against real 2024 data before this
script was written, including the specific edge case that motivated
keying the table by (player_id, season, team_id, route) instead of
just (player_id, season, route): 11 players had targets for more than
one team in 2024 alone (e.g. Davante Adams: LV -> NYJ). Keying by team
splits their profile correctly instead of blending pre/post-trade
context into one misleading number -- verified Adams' output lands as
two independent rows with two independent target_pct denominators.

Run this AFTER sync_teams.py (team_id foreign key) and independently
of sync_team_scheme_profile.py -- same source join, different grouping
key, no dependency between them.

Requires Python 3.10+ (nflreadpy/Polars), same as the other nflreadpy
scripts -- see sync_schedule.py header for the GitHub Actions version
note.
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

SEASONS = [2022, 2023, 2024, 2025, 2026]  # FTN/participation route charting starts 2022

# nflreadpy's pbp/participation `posteam` uses different abbreviations
# than nfl_teams.team_id for a couple of franchises. Known as of this
# data window -- add to this map if another team_id foreign key error
# turns up (main() also validates against real nfl_teams rows below,
# so an unmapped mismatch gets skipped with a clear warning instead of
# crashing the whole sync).
TEAM_ID_ALIASES = {
    "LA": "LAR",  # Rams -- pbp/participation says 'LA', nfl_teams says 'LAR'
}

def load_and_join_season(season: int) -> Optional[pl.DataFrame]:
    """Join participation's route label onto pbp's receiver/outcome
    fields for one season. Returns None (not an empty frame) if the
    season has no data yet, so main() can tell 'nothing happened' from
    'genuinely zero targets' -- same convention as sync_team_scheme_profile.py."""
    try:
        pbp = nfl.load_pbp(seasons=season).select(
            [
                "game_id",
                "play_id",
                "play_type",
                "posteam",
                "receiver_player_id",
                "receiver_player_name",
                "yards_gained",
                "complete_pass",
                "air_yards",
                "yards_after_catch",
                "epa",
                "yardline_100",
                "pass_touchdown",
            ]
        )
    except ValueError as e:
        print(f"  No pbp data for {season}: {e}")
        return None

    try:
        part = nfl.load_participation(seasons=season).select(["nflverse_game_id", "play_id", "route"])
    except ValueError as e:
        print(f"  No participation data for {season}: {e}")
        return None

    part = part.with_columns(pl.col("play_id").cast(pl.Float64))
    pbp = pbp.with_columns(pl.col("play_id").cast(pl.Float64))

    merged = part.join(pbp, left_on=["nflverse_game_id", "play_id"], right_on=["game_id", "play_id"], how="inner")
    targets = merged.filter(
        pl.col("receiver_player_id").is_not_null() & pl.col("route").is_not_null() & (pl.col("route") != "")
    )
    return targets


def compute_player_route_profile(targets: pl.DataFrame, season: int) -> list[dict]:
    """Per-player, per-team, per-route target distribution + efficacy.
    Denominator for target_pct is this player's targets FOR THIS TEAM
    this season -- not their combined-team total -- so a traded
    player's two rows each read as a real share of their role there."""
    grouped = targets.group_by(["receiver_player_id", "posteam", "route"]).agg(
        [
            pl.len().alias("targets"),
            pl.col("yards_gained").mean().alias("yards_per_target"),
            pl.col("complete_pass").mean().alias("catch_rate"),
            pl.col("air_yards").mean().alias("avg_air_yards"),
            pl.col("yards_after_catch").mean().alias("avg_yac"),
            pl.col("epa").mean().alias("epa_per_target"),
            (pl.col("yardline_100") <= 20).mean().alias("red_zone_pct"),
            pl.col("pass_touchdown").sum().alias("touchdowns"),
        ]
    )
    player_team_totals = grouped.group_by(["receiver_player_id", "posteam"]).agg(
        pl.col("targets").sum().alias("total")
    )
    grouped = grouped.join(player_team_totals, on=["receiver_player_id", "posteam"])

    rows = []
    for r in grouped.to_dicts():
        if r["receiver_player_id"] is None or r["posteam"] is None:
            continue
        rows.append(
            {
                "player_id": r["receiver_player_id"],
                "season": season,
                "team_id": TEAM_ID_ALIASES.get(r["posteam"], r["posteam"]),
                "route": r["route"],
                "targets": r["targets"],
                "target_pct": (r["targets"] / r["total"]) * 100 if r["total"] else None,
                "yards_per_target": r["yards_per_target"],
                "catch_rate": (r["catch_rate"] or 0) * 100,
                "avg_air_yards": r["avg_air_yards"],
                "avg_yac": r["avg_yac"],
                "epa_per_target": r["epa_per_target"],
                "red_zone_pct": (r["red_zone_pct"] or 0) * 100,
                "touchdowns": int(r["touchdowns"] or 0),
            }
        )
    return rows


def main() -> None:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    valid_team_ids = {row["team_id"] for row in supabase.table("nfl_teams").select("team_id").execute().data}
    grand_total = 0

    for season in SEASONS:
        print(f"=== Season {season} ===")
        targets = load_and_join_season(season)
        if targets is None or targets.height == 0:
            print("  No targets this season, skipping.\n")
            continue

        rows = compute_player_route_profile(targets, season)
        print(f"  Computed {len(rows)} player/team/route rows.")

        bad_teams = {r["team_id"] for r in rows} - valid_team_ids
        if bad_teams:
            print(f"  WARNING: unmapped team_id(s) {bad_teams} -- dropping rows for these, add to TEAM_ID_ALIASES to fix properly.")
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
            result = supabase.table("nfl_player_route_profile").upsert(
                batch, on_conflict="player_id,season,team_id,route"
            ).execute()
            season_total += len(result.data)
        print(f"  Upserted {season_total} rows for {season}.\n")
        grand_total += season_total

    print(f"Done. Upserted {grand_total} total rows across all seasons.")


if __name__ == "__main__":
    main()