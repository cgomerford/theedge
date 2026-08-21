#!/usr/bin/env python3
"""
scripts/fetch_statcast_events.py

Pulls pitch-by-pitch Statcast data for a date range from Baseball Savant
(via pybaseball) and writes it into two Supabase tables:

  - pitch_events        every pitch, needed for the "AVG/wOBA allowed on
                         97mph+ pitches" range leaderboard
  - batted_ball_events  every ball in play (a subset of pitches, filtered
                         to launch_speed not null), needed for the
                         hardest-hit-balls and HR-by-distance boards

Usage:
    python3 scripts/fetch_statcast_events.py                     # yesterday only
    python3 scripts/fetch_statcast_events.py --start-date 2026-07-01 --end-date 2026-07-31

Designed to run as a daily GitHub Actions cron (yesterday's games), with
manual backfill via --start-date/--end-date for historical ranges.
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, timedelta
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
import os

from pathlib import Path

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

# Dual env-var fallback: GitHub Actions secrets use SUPABASE_URL /
# SUPABASE_SERVICE_KEY; .env.local uses the NEXT_PUBLIC_ prefixed pair.
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing Supabase credentials. Set SUPABASE_URL/SUPABASE_SERVICE_KEY "
          "(GitHub Actions) or NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (.env.local).")
    sys.exit(1)

from supabase import create_client, Client  # noqa: E402

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BATCH_SIZE = 500  # Supabase REST payload limit headroom


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch Statcast pitch/batted-ball events into Supabase.")
    parser.add_argument("--start-date", type=str, default=None, help="YYYY-MM-DD, defaults to yesterday")
    parser.add_argument("--end-date", type=str, default=None, help="YYYY-MM-DD, defaults to yesterday")
    return parser.parse_args()


def resolve_date_range(args: argparse.Namespace) -> tuple[str, str]:
    if args.start_date and args.end_date:
        return args.start_date, args.end_date
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    return yesterday, yesterday


def fetch_statcast_data(start_date: str, end_date: str) -> Optional[pd.DataFrame]:
    """Pulls raw Statcast data via pybaseball. Returns None on failure."""
    try:
        from pybaseball import statcast  # imported lazily so --help works without it installed
    except ImportError:
        print("ERROR: pybaseball not installed. Run: pip3 install pybaseball --break-system-packages")
        return None

    print(f"Fetching Statcast data: {start_date} to {end_date} ...")
    try:
        df = statcast(start_dt=start_date, end_dt=end_date)
    except Exception as e:
        print(f"ERROR: pybaseball statcast() call failed: {e}")
        return None

    if df is None or df.empty:
        print(f"No Statcast data returned for {start_date} to {end_date}. "
              f"(Normal for off-days / future dates / very recent games not yet processed.)")
        return None

    print(f"Fetched {len(df)} raw pitch rows.")
    return df


def build_pitch_events(df: pd.DataFrame) -> list[dict]:
    rows = []
    for _, r in df.iterrows():
        if pd.isna(r.get("game_pk")) or pd.isna(r.get("at_bat_number")) or pd.isna(r.get("pitch_number")):
            continue  # skip rows missing the natural key
        rows.append({
            "game_pk": int(r["game_pk"]),
            "game_date": str(r["game_date"]),
            "at_bat_number": int(r["at_bat_number"]),
            "pitch_number": int(r["pitch_number"]),
            "pitcher_id": int(r["pitcher"]) if not pd.isna(r.get("pitcher")) else None,
            "batter_id": int(r["batter"]) if not pd.isna(r.get("batter")) else None,
            "pitch_type": r.get("pitch_type") if not pd.isna(r.get("pitch_type")) else None,
            "release_speed": float(r["release_speed"]) if not pd.isna(r.get("release_speed")) else None,
            "description": r.get("description") if not pd.isna(r.get("description")) else None,
            "events": r.get("events") if not pd.isna(r.get("events")) else None,
            "zone": int(r["zone"]) if not pd.isna(r.get("zone")) else None,
        })
    return rows


def build_batted_ball_events(df: pd.DataFrame) -> list[dict]:
    # A batted ball is any pitch with a recorded launch_speed — Statcast
    # only populates that field when the ball was actually put in play.
    batted = df[df["launch_speed"].notna()]
    rows = []
    for _, r in batted.iterrows():
        if pd.isna(r.get("game_pk")) or pd.isna(r.get("at_bat_number")) or pd.isna(r.get("pitch_number")):
            continue
        if pd.isna(r.get("events")):
            continue  # a batted-ball row without a recorded outcome isn't useful here
        rows.append({
            "game_pk": int(r["game_pk"]),
            "game_date": str(r["game_date"]),
            "at_bat_number": int(r["at_bat_number"]),
            "pitch_number": int(r["pitch_number"]),
            "batter_id": int(r["batter"]) if not pd.isna(r.get("batter")) else None,
            "pitcher_id": int(r["pitcher"]) if not pd.isna(r.get("pitcher")) else None,
            "launch_speed": float(r["launch_speed"]),
            "launch_angle": float(r["launch_angle"]) if not pd.isna(r.get("launch_angle")) else None,
            "hit_distance_sc": float(r["hit_distance_sc"]) if not pd.isna(r.get("hit_distance_sc")) else None,
            "events": str(r["events"]),
        })
    return rows


def sanity_check_and_confirm(label: str, rows: list[dict]) -> bool:
    """Prints a 5-row sample and gives a 5-second window to Ctrl+C before writing."""
    if not rows:
        print(f"{label}: 0 rows to write, skipping.")
        return False

    print(f"\n--- {label}: {len(rows)} rows total. Sample of first 5: ---")
    for row in rows[:5]:
        print(row)
    print(f"--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
    try:
        time.sleep(5)
    except KeyboardInterrupt:
        print("Aborted by user.")
        return False
    return True


def upsert_batched(table: str, rows: list[dict], on_conflict: str) -> None:
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        try:
            supabase.table(table).upsert(batch, on_conflict=on_conflict).execute()
            print(f"  {table}: upserted rows {i + 1}-{min(i + BATCH_SIZE, total)} of {total}")
        except Exception as e:
            print(f"  {table}: ERROR on batch {i + 1}-{min(i + BATCH_SIZE, total)}: {e}")


def main() -> None:
    args = parse_args()
    start_date, end_date = resolve_date_range(args)

    df = fetch_statcast_data(start_date, end_date)
    if df is None:
        sys.exit(0)  # not an error — just nothing to do (off-day, etc.)

    pitch_rows = build_pitch_events(df)
    batted_rows = build_batted_ball_events(df)

    if sanity_check_and_confirm("pitch_events", pitch_rows):
        upsert_batched("pitch_events", pitch_rows, on_conflict="game_pk,at_bat_number,pitch_number")

    if sanity_check_and_confirm("batted_ball_events", batted_rows):
        upsert_batched("batted_ball_events", batted_rows, on_conflict="game_pk,at_bat_number,pitch_number")

    print("\nDone.")


if __name__ == "__main__":
    main()