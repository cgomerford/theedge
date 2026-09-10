"""
scripts/nfl/sync_team_stats.py

Aggregates nflreadpy play-by-play data into team-week rows in
nfl_team_stats_weekly. This is the heaviest sync script -- pbp is
~48k rows/season, aggregated down to ~32 teams x ~18 weeks.

WHAT'S COMPUTED HERE vs LEFT FOR OTHER SCRIPTS:
  - off/def EPA per play, success rate, PROE, pass/rush EPA,
    third-down %, red-zone TD %, turnover margin, sack rate:
    all computed directly from play-by-play in this script.
  - pressure_rate_allowed / pressure_rate_created: LEFT NULL here.
    Raw pbp's qb_hit column undercounts true pressure (misses
    hurries that don't result in a hit) -- PFR's advstats has the
    real pressure numbers. sync_pfr_advstats.py populates those
    columns via a separate UPDATE, not this script. Empty/null is
    correct here, not a bug -- do not backfill with a qb_hit proxy.

METHODOLOGY NOTES (so these numbers can be sanity-checked later):
  - "Play" for EPA/success-rate purposes = play_type in ('pass','run').
    This excludes kickoffs, punts, field goals, extra points, no-plays,
    qb_spike, and qb_kneel -- standard nflfastR convention, since kneels
    in particular distort EPA (they're clock-killing, not real offense).
  - Red-zone efficiency is per-DRIVE, not per-play: a drive counts as
    a red-zone trip if drive_inside20 is true anywhere on the drive,
    and counts as a red-zone TD if fixed_drive_result == 'Touchdown'.
    Deduplicated on (game_id, fixed_drive) before aggregating.
  - Turnover margin is PER-WEEK (not cumulative season-to-date) --
    that rollup happens in compute_team_reports.py, not here.
  - PROE (pass_oe) is nflfastR's own model output, averaged across
    all pass+run plays for the team -- not recomputed from scratch.

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

# Same alias issue found in sync_schedule.py -- pbp uses schedule-style
# team codes in some seasons' data. Applied defensively here too.
TEAM_ID_ALIASES = {"LA": "LAR"}

# Full backfill: nflreadpy's play-by-play goes back to 1999. 27 seasons
# of pbp is ~1.3M rows total -- too much to hold in memory across all
# seasons at once (the original version of this script did exactly
# that via pl.concat before aggregating, which worked fine for 2
# seasons but would be a real risk of failing partway through a full
# backfill and losing the whole run's progress). Restructured below to
# process one season at a time: fetch that season's pbp, aggregate it,
# upsert it, discard it, move to the next season. A failure on season
# 12 doesn't lose seasons 1-11's already-upserted work.
SEASONS = list(range(2021, 2027))  # last 6 seasons -- see CAREER_DATA_START_SEASON note below

# CAREER_DATA_START_SEASON = 2021. Deeper backfill (further per-source
# bounds already confirmed: player_stats/schedule/pbp back to 1999,
# injuries to 2009, snap counts to 2012, NGS to 2016, PFR advstats to
# 2018) is scoped for later, not abandoned. The player page's career
# table should read this constant (mirrored in queries.ts) and show
# something like "Career stats since 2021 -- earlier seasons coming
# soon" rather than silently presenting 6 years as a full career.


def normalize_team_id(team: str) -> str:
    return TEAM_ID_ALIASES.get(team, team)


def compute_offense_stats(pbp: pl.DataFrame) -> pl.DataFrame:
    """Team-week offensive EPA/success-rate/PROE/third-down/turnovers."""
    plays = pbp.filter(pl.col("play_type").is_in(["pass", "run"]))

    base = (
        plays.group_by(["posteam", "season", "week", "season_type"])
        .agg(
            [
                pl.len().alias("plays_offense"),
                pl.col("epa").mean().alias("off_epa_per_play"),
                pl.col("success").mean().alias("off_success_rate"),
                pl.col("pass_oe").mean().alias("proe"),
                pl.col("epa").filter(pl.col("play_type") == "pass").mean().alias("pass_epa_per_dropback"),
                pl.col("epa").filter(pl.col("play_type") == "run").mean().alias("rush_epa_per_carry"),
                pl.col("sack").sum().alias("_sacks_taken"),
                (pl.col("play_type") == "pass").sum().alias("_dropbacks"),
                pl.col("interception").sum().alias("_giveaway_ints"),
                pl.col("fumble_lost").sum().alias("_giveaway_fumbles"),
            ]
        )
        .rename({"posteam": "team_id"})
    )

    third_down = (
        plays.filter(pl.col("down") == 3)
        .group_by(["posteam", "season", "week", "season_type"])
        .agg(
            [
                pl.col("third_down_converted").sum().alias("_3d_conv"),
                (pl.col("third_down_converted").sum() + pl.col("third_down_failed").sum()).alias("_3d_att"),
            ]
        )
        .with_columns((pl.col("_3d_conv") / pl.col("_3d_att")).alias("third_down_pct"))
        .rename({"posteam": "team_id"})
        .select(["team_id", "season", "week", "season_type", "third_down_pct"])
    )

    drives = (
        plays.filter(pl.col("drive_inside20") == True)  # noqa: E712
        .unique(subset=["game_id", "fixed_drive"])
        .group_by(["posteam", "season", "week", "season_type"])
        .agg(
            [
                pl.len().alias("_rz_trips"),
                (pl.col("fixed_drive_result") == "Touchdown").sum().alias("_rz_tds"),
            ]
        )
        .with_columns((pl.col("_rz_tds") / pl.col("_rz_trips")).alias("red_zone_td_pct"))
        .rename({"posteam": "team_id"})
        .select(["team_id", "season", "week", "season_type", "red_zone_td_pct"])
    )

    out = base.join(third_down, on=["team_id", "season", "week", "season_type"], how="left")
    out = out.join(drives, on=["team_id", "season", "week", "season_type"], how="left")
    out = out.with_columns(
        [
            (pl.col("_sacks_taken") / (pl.col("_dropbacks") + pl.col("_sacks_taken"))).alias("sack_rate_allowed"),
            (pl.col("_giveaway_ints") + pl.col("_giveaway_fumbles")).alias("giveaways"),
        ]
    )
    return out.drop(["_sacks_taken", "_dropbacks", "_giveaway_ints", "_giveaway_fumbles"])


def compute_defense_stats(pbp: pl.DataFrame) -> pl.DataFrame:
    """Team-week defensive EPA/success-rate/third-down allowed/sacks created/takeaways."""
    plays = pbp.filter(pl.col("play_type").is_in(["pass", "run"]))

    base = (
        plays.group_by(["defteam", "season", "week", "season_type"])
        .agg(
            [
                pl.len().alias("plays_defense"),
                pl.col("epa").mean().alias("def_epa_per_play"),
                pl.col("success").mean().alias("def_success_rate"),
                pl.col("sack").sum().alias("_sacks_created"),
                (pl.col("play_type") == "pass").sum().alias("_dropbacks_faced"),
                pl.col("interception").sum().alias("_takeaway_ints"),
                pl.col("fumble_lost").sum().alias("_takeaway_fumbles"),
            ]
        )
        .rename({"defteam": "team_id"})
    )

    third_down_def = (
        plays.filter(pl.col("down") == 3)
        .group_by(["defteam", "season", "week", "season_type"])
        .agg(
            [
                pl.col("third_down_converted").sum().alias("_3d_conv"),
                (pl.col("third_down_converted").sum() + pl.col("third_down_failed").sum()).alias("_3d_att"),
            ]
        )
        .with_columns((pl.col("_3d_conv") / pl.col("_3d_att")).alias("third_down_def_pct"))
        .rename({"defteam": "team_id"})
        .select(["team_id", "season", "week", "season_type", "third_down_def_pct"])
    )

    rz_def = (
        plays.filter(pl.col("drive_inside20") == True)  # noqa: E712
        .unique(subset=["game_id", "fixed_drive"])
        .group_by(["defteam", "season", "week", "season_type"])
        .agg(
            [
                pl.len().alias("_rz_trips_faced"),
                (pl.col("fixed_drive_result") == "Touchdown").sum().alias("_rz_tds_allowed"),
            ]
        )
        .with_columns((pl.col("_rz_tds_allowed") / pl.col("_rz_trips_faced")).alias("red_zone_def_td_pct"))
        .rename({"defteam": "team_id"})
        .select(["team_id", "season", "week", "season_type", "red_zone_def_td_pct"])
    )

    out = base.join(third_down_def, on=["team_id", "season", "week", "season_type"], how="left")
    out = out.join(rz_def, on=["team_id", "season", "week", "season_type"], how="left")
    out = out.with_columns(
        [
            (pl.col("_sacks_created") / (pl.col("_dropbacks_faced") + pl.col("_sacks_created"))).alias("sack_rate_created"),
            (pl.col("_takeaway_ints") + pl.col("_takeaway_fumbles")).alias("takeaways"),
        ]
    )
    return out.drop(["_sacks_created", "_dropbacks_faced", "_takeaway_ints", "_takeaway_fumbles"])


def aggregate_one_season(season: int) -> list[dict] | None:
    """Fetch + aggregate a single season's pbp. Returns None if that
    season has no data (future season not yet played)."""
    try:
        pbp = nfl.load_pbp(seasons=season)
    except ValueError as e:
        print(f"  Skipping season {season}: {e}")
        return None

    pbp = pbp.with_columns(
        [
            pl.col("posteam").map_elements(normalize_team_id, return_dtype=pl.String),
            pl.col("defteam").map_elements(normalize_team_id, return_dtype=pl.String),
        ]
    )
    pbp = pbp.filter(pl.col("posteam").is_not_null() & pl.col("defteam").is_not_null())

    offense = compute_offense_stats(pbp)
    defense = compute_defense_stats(pbp)

    merged = offense.join(defense, on=["team_id", "season", "week", "season_type"], how="full", coalesce=True)
    merged = merged.with_columns((pl.col("takeaways") - pl.col("giveaways")).alias("turnover_margin"))

    merged = merged.with_columns(
        [
            pl.col("plays_offense").cast(pl.Int64),
            pl.col("plays_defense").cast(pl.Int64),
            pl.col("giveaways").cast(pl.Int64),
            pl.col("takeaways").cast(pl.Int64),
        ]
    )

    return merged.to_dicts()


def main() -> None:
    print(f"About to backfill seasons {SEASONS[0]}-{SEASONS[-1]} ({len(SEASONS)} seasons) of play-by-play into nfl_team_stats_weekly.")
    print("Processes and upserts one season at a time, so a failure partway through doesn't lose already-completed seasons.")
    print("Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)
    print()

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    grand_total = 0
    seasons_processed = 0
    seasons_skipped = 0

    for season in SEASONS:
        print(f"--- Season {season} ---")
        rows = aggregate_one_season(season)
        if rows is None:
            seasons_skipped += 1
            continue

        print(f"  Aggregated {len(rows)} team-week rows.")
        if len(rows) < 500:
            print(f"  WARNING: expected ~500+ team-week rows for a full season, got {len(rows)}.")

        batch_size = 100
        season_total = 0
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            result = supabase.table("nfl_team_stats_weekly").upsert(
                batch, on_conflict="team_id,season,week,season_type"
            ).execute()
            season_total += len(result.data)
        print(f"  Upserted {season_total} rows for {season}.\n")

        grand_total += season_total
        seasons_processed += 1

    print(f"Done. Processed {seasons_processed} seasons ({seasons_skipped} skipped, no data). Upserted {grand_total} total rows into nfl_team_stats_weekly.")


if __name__ == "__main__":
    main()