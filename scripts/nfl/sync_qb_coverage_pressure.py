#!/usr/bin/env python3
"""
scripts/nfl/sync_qb_coverage_pressure.py

Same join methodology as sync_team_scheme_profile.py (already proven
in production): load_participation() joined to load_pbp() on
(nflverse_game_id, play_id), cast to Float64 first since play_id dtype
varies by season. The team-level script only needed team identity
(posteam/defteam, already in participation/pbp); this script needs
PASSER identity, which participation doesn't have (confirmed empty by
direct check) -- pulled from pbp's passer_player_id instead, same join,
just a different column read off the merged frame.

Grain: one row per (player_id, game_id, coverage_type, man_zone_type,
was_pressure) combination -- game-level, not season-aggregated. Season
view is a SUM across game_id at read time in queries.ts, matching every
other _weekly table in this build.

Excludes BLOWN coverage from the coverage_type breakdown (a bust, not
an intentional scheme) -- same convention as sync_team_scheme_profile.py.

Run: python3 scripts/nfl/sync_qb_coverage_pressure.py --season 2025 --dry-run
Then without --dry-run to actually write.
"""
from __future__ import annotations

import os
import sys
import time
import argparse

import nflreadpy as nfl
import polars as pl
from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(".env.local")

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase credentials.")
    sys.exit(1)


def load_and_join_season(season: int) -> pl.DataFrame | None:
    try:
        pbp = nfl.load_pbp(seasons=season).select(
            ["game_id", "play_id", "play_type", "week", "passer_player_id", "epa", "complete_pass", "success"]
        )
    except ValueError as e:
        print(f"  Skipping season {season} (no pbp): {e}")
        return None

    try:
        part = nfl.load_participation(seasons=season)
    except (ValueError, ConnectionError) as e:
        print(f"  Skipping season {season} (no participation data): {type(e).__name__}")
        return None

    part = part.with_columns(pl.col("play_id").cast(pl.Float64))
    pbp = pbp.with_columns(pl.col("play_id").cast(pl.Float64))

    merged = part.join(pbp, left_on=["nflverse_game_id", "play_id"], right_on=["game_id", "play_id"], how="inner")

    # Only pass plays with a known passer -- rushes and no-play penalties
    # don't have a passer_player_id and aren't relevant here.
    plays = merged.filter((pl.col("play_type") == "pass") & pl.col("passer_player_id").is_not_null())
    return plays


def compute_qb_splits(plays: pl.DataFrame, season: int) -> list[dict]:
    classified = plays.filter(
        pl.col("defense_coverage_type").is_not_null() & (pl.col("defense_coverage_type") != "BLOWN")
    )

    grouped = classified.group_by(
        ["passer_player_id", "nflverse_game_id", "week", "defense_coverage_type", "defense_man_zone_type", "was_pressure"]
    ).agg(
        [
            pl.len().alias("attempts"),
            pl.col("complete_pass").sum().alias("completions"),
            pl.col("epa").sum().alias("epa_sum"),
            pl.col("success").sum().alias("success_count"),
        ]
    )

    rows = []
    for r in grouped.to_dicts():
        if r["passer_player_id"] is None or r["nflverse_game_id"] is None:
            continue
        rows.append(
            {
                "player_id": r["passer_player_id"],
                "game_id": r["nflverse_game_id"],
                "season": season,
                "week": int(r["week"]) if r["week"] is not None else None,
                "coverage_type": r["defense_coverage_type"],
                "man_zone_type": r["defense_man_zone_type"],
                "was_pressure": bool(r["was_pressure"]) if r["was_pressure"] is not None else None,
                "attempts": int(r["attempts"] or 0),
                "completions": int(r["completions"] or 0),
                "epa_sum": float(r["epa_sum"]) if r["epa_sum"] is not None else None,
                "success_count": int(r["success_count"] or 0),
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"Computing QB coverage/pressure splits for {args.season}...")
    plays = load_and_join_season(args.season)
    if plays is None:
        sys.exit(1)

    rows = compute_qb_splits(plays, args.season)
    if not rows:
        print("No rows computed -- aborting before touching the table.")
        sys.exit(1)

    print(f"\nSample rows (first 5 of {len(rows)}):")
    for r in rows[:5]:
        print(f"  {r['player_id']} wk{r['week']} vs {r['coverage_type']}/{r['man_zone_type']} "
              f"pressure={r['was_pressure']}: {r['completions']}/{r['attempts']}, EPA sum {r['epa_sum']}")

    if args.dry_run:
        print("\n--dry-run set — not writing to Supabase.")
        return

    print(f"\nAbout to upsert {len(rows)} rows. Ctrl+C within 5 seconds to abort...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    BATCH = 500
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        supabase.table("nfl_qb_coverage_pressure_plays").upsert(
            batch, on_conflict="player_id,game_id,coverage_type,man_zone_type,was_pressure"
        ).execute()

    print(f"Done. {len(rows)} rows upserted.")


if __name__ == "__main__":
    main()