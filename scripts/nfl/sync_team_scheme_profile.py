"""
scripts/nfl/sync_team_scheme_profile.py

Aggregates play-level participation + FTN charting data into
team-season scheme tendencies (nfl_team_scheme_profile) -- the
"Scheme Profile" section: formation/personnel/play-action/motion
rates on offense, coverage shell/man-zone/blitz rates on defense.

SOURCES, CONFIRMED BY DIRECT TESTING:
  - load_participation(): formation, personnel, coverage type,
    man/zone, box count. Available from 2016.
  - load_ftn_charting(): play-action, motion, screen, no-huddle, RPO,
    blitz count. Available from 2022 ONLY. For season 2021 (in the
    backfill window), this script left-joins FTN, so 2021 rows get
    real formation/personnel/coverage data but null play-action/
    motion/blitz fields -- not a bug, an honest source-availability
    gap. Confirmed by direct check: load_ftn_charting(seasons=2021)
    raises "Season must be between 2022 and 2025".
  - Join key: participation.nflverse_game_id = pbp.game_id,
    participation.play_id = pbp.play_id (NOT participation's own
    old_game_id, which doesn't match pbp's game_id format -- confirmed
    the wrong join returns 0 rows before finding the right one).
    FTN joins on nflverse_game_id + nflverse_play_id (cast to match
    participation's play_id dtype).

METHODOLOGY:
  - Personnel grouping (11/12/21/etc) is parsed from the raw
    offense_personnel string (e.g. "1 C, 1 QB, 4 T, 1 TE, 4 WR") by
    counting RB and TE tokens -- standard football notation, not
    provided directly by any nflreadpy field.
  - Coverage percentages exclude BLOWN (a coverage bust, not an
    intentional scheme) from the main breakdown -- tracked separately
    as def_blown_coverage_pct.
  - def_coverage_classified_pct is a COMPLETENESS metric (~49-63% of
    plays get a real coverage_type charted, confirmed varies by team/
    season) -- shown in the UI so a percentage isn't presented with
    false precision from an incomplete sample.
  - Blitz rate = 5+ pass rushers, matching the "5+ rushers" convention
    used elsewhere in the industry.

Processed one season at a time (participation is ~46k rows/season,
much lighter than full pbp, but keeping the same safe pattern as
sync_team_stats.py rather than concatenating across seasons).

NOTE: requires Python 3.10+ (nflreadpy/Polars dependency chain).
"""

from __future__ import annotations

import os
import re
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

TEAM_ID_ALIASES = {"LA": "LAR", "AZ": "ARI"}
SEASONS = list(range(2021, 2027))  # matches CAREER_DATA_START_SEASON -- see queries.ts


def normalize_team_id(team: str | None) -> str | None:
    if team is None:
        return None
    return TEAM_ID_ALIASES.get(team, team)


def parse_personnel_group(personnel_str: str | None) -> str | None:
    """'1 C, 1 QB, 4 T, 1 TE, 4 WR' -> '01' (0 RB, 1 TE)."""
    if personnel_str is None:
        return None
    rb = sum(int(m) for m in re.findall(r"(\d+)\s*RB", personnel_str))
    te = sum(int(m) for m in re.findall(r"(\d+)\s*TE", personnel_str))
    return f"{rb}{te}"


def load_and_join_season(season: int) -> pl.DataFrame | None:
    try:
        pbp = nfl.load_pbp(seasons=season).select(
            ["game_id", "play_id", "play_type", "posteam", "defteam", "epa", "yards_gained", "yardline_100", "success", "complete_pass"]
        )
    except ValueError as e:
        print(f"  Skipping season {season} (no pbp): {e}")
        return None

    try:
        part = nfl.load_participation(seasons=season)
    except (ValueError, ConnectionError) as e:
        print(f"  Skipping season {season} (no participation data): {type(e).__name__}")
        return None

    # play_id dtype varies by season (confirmed: Int32 in 2021,
    # Float64 in 2024) -- cast explicitly rather than assume, since a
    # join on mismatched types raises rather than silently failing.
    part = part.with_columns(pl.col("play_id").cast(pl.Float64))
    pbp = pbp.with_columns(pl.col("play_id").cast(pl.Float64))

    merged = part.join(pbp, left_on=["nflverse_game_id", "play_id"], right_on=["game_id", "play_id"], how="inner")

    has_ftn = True
    try:
        ftn = nfl.load_ftn_charting(seasons=season).with_columns(pl.col("nflverse_play_id").cast(pl.Float64))
        merged = merged.join(
            ftn,
            left_on=["nflverse_game_id", "play_id"],
            right_on=["nflverse_game_id", "nflverse_play_id"],
            how="left",
        )
    except (ValueError, ConnectionError):
        print(f"  No FTN charting for season {season} (starts 2022) -- formation/coverage still computed, play-action/motion/blitz will be null.")
        has_ftn = False

    plays = merged.filter(pl.col("play_type").is_in(["pass", "run"]))
    plays = plays.with_columns(
        [
            pl.col("posteam").map_elements(normalize_team_id, return_dtype=pl.String),
            pl.col("defteam").map_elements(normalize_team_id, return_dtype=pl.String),
            pl.col("offense_personnel").map_elements(parse_personnel_group, return_dtype=pl.String).alias("personnel_group"),
        ]
    )
    if not has_ftn:
        for col in ["is_play_action", "is_motion", "is_screen_pass", "is_no_huddle", "is_rpo", "n_pass_rushers"]:
            if col not in plays.columns:
                plays = plays.with_columns(pl.lit(None).alias(col))

    return plays


def compute_offense_scheme(plays: pl.DataFrame, season: int) -> list[dict]:
    rows = []
    for team_id in plays.select("posteam").drop_nulls().unique().to_series().to_list():
        team_plays = plays.filter(pl.col("posteam") == team_id)
        n = team_plays.height
        if n == 0:
            continue

        personnel_counts = team_plays.select("personnel_group").drop_nulls().to_series().value_counts()
        personnel_map = {row["personnel_group"]: row["count"] for row in personnel_counts.to_dicts()}
        n_personnel = sum(personnel_map.values()) or 1

        ftn_charted = team_plays.filter(pl.col("is_play_action").is_not_null()).height

        rows.append(
            {
                "team_id": team_id,
                "season": season,
                "off_plays_charted": n,
                "off_formation_shotgun_pct": _pct(team_plays, "offense_formation", "SHOTGUN"),
                "off_formation_undercenter_pct": _pct(team_plays, "offense_formation", "UNDER CENTER"),
                "off_formation_pistol_pct": _pct(team_plays, "offense_formation", "PISTOL"),
                "off_personnel_11_pct": (personnel_map.get("11", 0) / n_personnel) * 100,
                "off_personnel_12_pct": (personnel_map.get("12", 0) / n_personnel) * 100,
                "off_personnel_21_pct": (personnel_map.get("21", 0) / n_personnel) * 100,
                "off_personnel_other_pct": (
                    (n_personnel - personnel_map.get("11", 0) - personnel_map.get("12", 0) - personnel_map.get("21", 0))
                    / n_personnel
                )
                * 100,
                "off_ftn_plays_charted": ftn_charted,
                "off_play_action_rate": _rate(team_plays, "is_play_action", ftn_charted),
                "off_motion_rate": _rate(team_plays, "is_motion", ftn_charted),
                "off_screen_rate": _rate(team_plays, "is_screen_pass", ftn_charted),
                "off_no_huddle_rate": _rate(team_plays, "is_no_huddle", ftn_charted),
                "off_rpo_rate": _rate(team_plays, "is_rpo", ftn_charted),
            }
        )
    return rows


def compute_defense_scheme(plays: pl.DataFrame, season: int) -> list[dict]:
    rows = []
    for team_id in plays.select("defteam").drop_nulls().unique().to_series().to_list():
        team_plays = plays.filter(pl.col("defteam") == team_id)
        n = team_plays.height
        if n == 0:
            continue

        classified = team_plays.filter(
            pl.col("defense_coverage_type").is_not_null() & (pl.col("defense_coverage_type") != "BLOWN")
        )
        n_classified = classified.height or 1

        coverage_counts = classified.group_by("defense_coverage_type").len().to_dicts()
        coverage_map = {row["defense_coverage_type"]: row["len"] for row in coverage_counts}

        man_zone_valid = team_plays.filter(pl.col("defense_man_zone_type").is_in(["MAN_COVERAGE", "ZONE_COVERAGE"]))
        n_man_zone = man_zone_valid.height or 1

        ftn_charted = team_plays.filter(pl.col("n_pass_rushers").is_not_null()).height
        blown = team_plays.filter(pl.col("defense_coverage_type") == "BLOWN").height

        rows.append(
            {
                "team_id": team_id,
                "season": season,
                "def_plays_charted": n,
                "def_coverage_classified_pct": (classified.height / n) * 100,
                "def_cover0_pct": (coverage_map.get("COVER_0", 0) / n_classified) * 100,
                "def_cover1_pct": (coverage_map.get("COVER_1", 0) / n_classified) * 100,
                "def_cover2_pct": (coverage_map.get("COVER_2", 0) / n_classified) * 100,
                "def_cover3_pct": (coverage_map.get("COVER_3", 0) / n_classified) * 100,
                "def_cover4_pct": (coverage_map.get("COVER_4", 0) / n_classified) * 100,
                "def_cover6_pct": (coverage_map.get("COVER_6", 0) / n_classified) * 100,
                "def_cover9_pct": (coverage_map.get("COVER_9", 0) / n_classified) * 100,
                "def_2man_pct": (coverage_map.get("2_MAN", 0) / n_classified) * 100,
                "def_combo_pct": (coverage_map.get("COMBO", 0) / n_classified) * 100,
                "def_blown_coverage_pct": (blown / n) * 100,
                "def_man_pct": (man_zone_valid.filter(pl.col("defense_man_zone_type") == "MAN_COVERAGE").height / n_man_zone) * 100,
                "def_zone_pct": (man_zone_valid.filter(pl.col("defense_man_zone_type") == "ZONE_COVERAGE").height / n_man_zone) * 100,
                "def_avg_box_defenders": team_plays.select(pl.col("defenders_in_box").mean()).item(),
                "def_ftn_plays_charted": ftn_charted,
                "def_blitz_rate": _rate_ge(team_plays, "n_pass_rushers", 5, ftn_charted),
            }
        )
    return rows


def _pct(df: pl.DataFrame, col: str, value: str) -> float | None:
    n = df.height
    if n == 0:
        return None
    matched = df.filter(pl.col(col) == value).height
    return (matched / n) * 100


def _rate(df: pl.DataFrame, col: str, denom: int) -> float | None:
    if denom == 0:
        return None
    matched = df.filter(pl.col(col) == True).height  # noqa: E712
    return (matched / denom) * 100


def _rate_ge(df: pl.DataFrame, col: str, threshold: int, denom: int) -> float | None:
    if denom == 0:
        return None
    matched = df.filter(pl.col(col) >= threshold).height
    return (matched / denom) * 100


def compute_coverage_efficacy(plays: pl.DataFrame, season: int) -> list[dict]:
    """Coverage-shell EFFICACY, not just frequency -- EPA/yards
    allowed, red-zone usage, success rate, per team per coverage type.
    Excludes BLOWN (a bust, not a scheme) same as compute_defense_scheme."""
    classified = plays.filter(
        pl.col("defense_coverage_type").is_not_null() & (pl.col("defense_coverage_type") != "BLOWN")
    )
    rows = []
    grouped = classified.group_by(["defteam", "defense_coverage_type"]).agg(
        [
            pl.len().alias("plays"),
            pl.col("epa").mean().alias("epa_allowed_per_play"),
            pl.col("yards_gained").mean().alias("yards_allowed_per_play"),
            (pl.col("yardline_100") <= 20).mean().alias("red_zone_pct"),
            pl.col("success").mean().alias("success_rate_allowed"),
        ]
    )
    for r in grouped.to_dicts():
        if r["defteam"] is None:
            continue
        rows.append(
            {
                "team_id": r["defteam"],
                "season": season,
                "coverage_type": r["defense_coverage_type"],
                "plays": r["plays"],
                "epa_allowed_per_play": r["epa_allowed_per_play"],
                "yards_allowed_per_play": r["yards_allowed_per_play"],
                "red_zone_pct": (r["red_zone_pct"] or 0) * 100,
                "success_rate_allowed": (r["success_rate_allowed"] or 0) * 100,
            }
        )
    return rows


def compute_route_profile(plays: pl.DataFrame, season: int) -> list[dict]:
    """Route distribution + efficacy for each team's offense --
    targets, yards/target, catch rate, per team per route type."""
    routed = plays.filter((pl.col("route") != "") & pl.col("route").is_not_null())
    rows = []
    grouped = routed.group_by(["posteam", "route"]).agg(
        [
            pl.len().alias("targets"),
            pl.col("yards_gained").mean().alias("yards_per_target"),
            pl.col("complete_pass").mean().alias("catch_rate"),
        ]
    )
    team_totals = grouped.group_by("posteam").agg(pl.col("targets").sum().alias("team_total_targets"))
    grouped = grouped.join(team_totals, on="posteam")

    for r in grouped.to_dicts():
        if r["posteam"] is None:
            continue
        rows.append(
            {
                "team_id": r["posteam"],
                "season": season,
                "route": r["route"],
                "targets": r["targets"],
                "target_pct": (r["targets"] / r["team_total_targets"]) * 100 if r["team_total_targets"] else None,
                "yards_per_target": r["yards_per_target"],
                "catch_rate": (r["catch_rate"] or 0) * 100,
            }
        )
    return rows


def main() -> None:
    print(f"Computing team scheme profiles for seasons {SEASONS[0]}-{SEASONS[-1]}...")
    print("Processes one season at a time. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)
    print()

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    grand_total = 0
    for season in SEASONS:
        print(f"--- Season {season} ---")
        plays = load_and_join_season(season)
        if plays is None:
            continue

        offense_rows = compute_offense_scheme(plays, season)
        defense_rows = compute_defense_scheme(plays, season)
        coverage_efficacy_rows = compute_coverage_efficacy(plays, season)
        route_profile_rows = compute_route_profile(plays, season)

        by_key: dict[tuple[str, int], dict] = {}
        for r in offense_rows:
            by_key[(r["team_id"], r["season"])] = r
        for r in defense_rows:
            key = (r["team_id"], r["season"])
            if key in by_key:
                by_key[key].update(r)
            else:
                by_key[key] = r

        rows = list(by_key.values())
        print(f"  {len(rows)} team-season rows.")
        if len(rows) < 20:
            print(f"  WARNING: expected close to 32 teams, got {len(rows)}.")

        if rows:
            result = supabase.table("nfl_team_scheme_profile").upsert(rows, on_conflict="team_id,season").execute()
            print(f"  Upserted {len(result.data)} rows for {season}.")
            grand_total += len(result.data)

        if coverage_efficacy_rows:
            result2 = supabase.table("nfl_team_coverage_efficacy").upsert(
                coverage_efficacy_rows, on_conflict="team_id,season,coverage_type"
            ).execute()
            print(f"  Upserted {len(result2.data)} coverage efficacy rows for {season}.")

        if route_profile_rows:
            result3 = supabase.table("nfl_team_route_profile").upsert(
                route_profile_rows, on_conflict="team_id,season,route"
            ).execute()
            print(f"  Upserted {len(result3.data)} route profile rows for {season}.")
        print()

    print(f"Done. Upserted {grand_total} total team-season scheme profiles.")


if __name__ == "__main__":
    main()