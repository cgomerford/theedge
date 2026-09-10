"""
scripts/nfl/sync_defense_special_teams.py

Syncs individual defensive and special-teams player stats. One
nflreadpy fetch (load_player_stats(), the same endpoint
sync_player_stats.py uses), filtered and written to two separate
tables -- avoids pulling the ~19k-row full dataset twice.

DEFENSE positions: DL, DE, DT, NT, LB, ILB, MLB, OLB, CB, DB, FS, S, SAF
SPECIAL TEAMS positions: K, P

Confirmed real field values for both categories via direct nflreadpy
inspection before writing this mapping (def_sacks is fractional --
e.g. 1.5 for a shared sack -- not an int).

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

TEAM_ID_ALIASES = {"LA": "LAR", "AZ": "ARI"}
SEASONS = [2025, 2026]
DEFENSE_POSITIONS = ["DL", "DE", "DT", "NT", "LB", "ILB", "MLB", "OLB", "CB", "DB", "FS", "S", "SAF"]
SPECIAL_TEAMS_POSITIONS = ["K", "P"]


def normalize_team_id(team: str | None) -> str | None:
    if team is None:
        return None
    return TEAM_ID_ALIASES.get(team, team)


def fetch_source() -> pl.DataFrame:
    frames = []
    for season in SEASONS:
        try:
            frames.append(nfl.load_player_stats(seasons=season))
        except (ValueError, ConnectionError) as e:
            print(f"  Skipping season {season}: no data available yet ({type(e).__name__})")
    if not frames:
        print("ERROR: no valid seasons had player stats data.")
        sys.exit(1)
    return pl.concat(frames, how="diagonal_relaxed")


def build_defense_rows(df: pl.DataFrame) -> list[dict]:
    filtered = df.filter(pl.col("position").is_in(DEFENSE_POSITIONS))
    rows = []
    for r in filtered.to_dicts():
        if not any(
            r.get(f)
            for f in ["def_tackles_solo", "def_tackles_with_assist", "def_sacks", "def_interceptions", "def_pass_defended"]
        ):
            continue
        rows.append(
            {
                "player_id": r["player_id"],
                "team_id": normalize_team_id(r["team"]),
                "opponent_team": normalize_team_id(r["opponent_team"]),
                "position": r["position"],
                "season": r["season"],
                "week": r["week"],
                "season_type": r["season_type"],
                "tackles_solo": r["def_tackles_solo"],
                "tackles_assist": r["def_tackles_with_assist"],
                "tackles_for_loss": r["def_tackles_for_loss"],
                "sacks": r["def_sacks"],
                "qb_hits": r["def_qb_hits"],
                "interceptions": r["def_interceptions"],
                "interception_yards": r["def_interception_yards"],
                "passes_defended": r["def_pass_defended"],
                "fumbles_forced": r["def_fumbles_forced"],
                "fumbles_recovered": r["fumble_recovery_own"],
                "defensive_tds": r["def_tds"],
                "safeties": r["def_safeties"],
            }
        )
    return rows


def build_special_teams_rows(df: pl.DataFrame) -> list[dict]:
    filtered = df.filter(pl.col("position").is_in(SPECIAL_TEAMS_POSITIONS))
    rows = []
    for r in filtered.to_dicts():
        if not any(r.get(f) for f in ["fg_att", "pat_att", "pt_att"]):
            continue
        rows.append(
            {
                "player_id": r["player_id"],
                "team_id": normalize_team_id(r["team"]),
                "opponent_team": normalize_team_id(r["opponent_team"]),
                "position": r["position"],
                "season": r["season"],
                "week": r["week"],
                "season_type": r["season_type"],
                "fg_made": r["fg_made"],
                "fg_att": r["fg_att"],
                "fg_pct": r["fg_pct"],
                "fg_long": r["fg_long"],
                "pat_made": r["pat_made"],
                "pat_att": r["pat_att"],
                "punts": r["pt_att"],
                "punt_yards": r["pt_yards"],
                "punt_net_yards": r["pt_net_yards"],
                "punt_long": r["pt_long"],
                "punts_inside_20": r["pt_inside_20"],
                "punt_returns": r["punt_returns"],
                "punt_return_yards": r["punt_return_yards"],
                "kickoff_returns": r["kickoff_returns"],
                "kickoff_return_yards": r["kickoff_return_yards"],
                "return_tds": r["pt_return_tds"],
            }
        )
    return rows


def upsert_rows(supabase: Client, table: str, rows: list[dict], on_conflict: str) -> None:
    if not rows:
        print(f"  {table}: 0 rows, skipping.")
        return
    batch_size = 100
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = supabase.table(table).upsert(batch, on_conflict=on_conflict).execute()
        total += len(result.data)
    print(f"  {table}: upserted {total} rows.")


def main() -> None:
    print(f"Fetching NFL player stats for seasons {SEASONS} (defense + special teams)...")
    df = fetch_source()

    defense_rows = build_defense_rows(df)
    st_rows = build_special_teams_rows(df)

    print(f"Defense rows: {len(defense_rows)}")
    print(f"Special teams rows: {len(st_rows)}\n")

    print("=== SANITY CHECK: defense sample ===")
    for r in defense_rows[:3]:
        print(r)
    print("\n=== SANITY CHECK: special teams sample ===")
    for r in st_rows[:3]:
        print(r)
    print()

    if len(defense_rows) < 1000:
        print(f"WARNING: expected 1000+ defense rows, got {len(defense_rows)}. Check before proceeding.")
    if len(st_rows) < 100:
        print(f"WARNING: expected 100+ special teams rows, got {len(st_rows)}. Check before proceeding.")

    print("About to upsert into nfl_player_defense_stats_weekly and nfl_special_teams_stats_weekly. Aborting in 5 seconds (Ctrl+C to cancel)...")
    time.sleep(5)

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    upsert_rows(supabase, "nfl_player_defense_stats_weekly", defense_rows, "player_id,season,week,season_type")
    upsert_rows(supabase, "nfl_special_teams_stats_weekly", st_rows, "player_id,season,week,season_type")

    print("\nDone.")


if __name__ == "__main__":
    main()