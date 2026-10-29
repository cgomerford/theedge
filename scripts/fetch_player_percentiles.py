#!/usr/bin/env python3
"""
scripts/fetch_player_percentiles.py

Stores Baseball Savant's percentile ranks for every batter and pitcher into player_percentiles (supabase/migrations/20261030190000_player_percentiles.sql), so the My x9Lab
player cards read one small table instead of downloading Savant's CSV on each page view.

TABLE OWNERSHIP: this script is the SINGLE writer of player_percentiles.
Source: https://baseballsavant.mlb.com/leaderboard/percentile-rankings?type=batter|pitcher&year=YYYY&csv=true (checked against the live header: player_name, player_id, year, then one
column per metric). Savant's ranks are already direction-corrected (higher = better), so they are stored as they come. A blank is stored as null.
Runs as a step of the existing nightly workflow (.github/workflows/nightly-statcast-events.yml); no new schedule.

Usage:  python3 scripts/fetch_player_percentiles.py --season 2026 [--dry-run]
Prints a 5-row sample and waits 5 seconds (Ctrl+C aborts) before writing. Re-running is safe (upsert).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

from supabase import create_client

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
UA = {"User-Agent": "Mozilla/5.0 (x9lab percentile pull)"}


def fetch(kind, season):
    url = f"https://baseballsavant.mlb.com/leaderboard/percentile-rankings?type={kind}&year={season}&csv=true"
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=60)
            r.raise_for_status()
            text = r.content.decode("utf-8-sig")
            rows = list(csv.DictReader(io.StringIO(text)))
            if rows:
                return rows
            print(f"  empty file for {kind}")
        except Exception as e:
            print(f"  retry {attempt + 1} ({kind}): {str(e)[:70]}")
            time.sleep(3)
    return []


def to_rows(kind, season, raw):
    out = []
    for r in raw:
        try:
            pid = int(r["player_id"])
        except (KeyError, ValueError):
            continue
        ranks = {}
        for k, v in r.items():
            if k in ("player_name", "player_id", "year") or k is None:
                continue
            v = (v or "").strip()
            ranks[k] = int(float(v)) if v not in ("", "null") else None
        if any(v is not None for v in ranks.values()):
            out.append({"season": season, "player_id": pid, "kind": kind, "ranks": ranks})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=dt.date.today().year)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    rows = []
    for kind in ("batter", "pitcher"):
        got = to_rows(kind, a.season, fetch(kind, a.season))
        print(f"{kind}: {len(got):,} players with at least one rank")
        rows += got
    if not rows:
        sys.exit("Nothing fetched; nothing written.")
    for r in rows[:5]:
        print(r)
    if a.dry_run:
        print("Dry run: nothing written.")
        return
    if not URL or not KEY:
        sys.exit("Missing Supabase URL / service key")
    sb = create_client(URL, KEY)
    try:
        sb.table("player_percentiles").select("season").limit(1).execute()
    except Exception:
        sys.exit("The table player_percentiles does not exist yet: run supabase/migrations/20261030190000_player_percentiles.sql in the SQL Editor first. Nothing was written.")
    print("--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
    time.sleep(5)
    for i in range(0, len(rows), 500):
        for attempt in range(4):
            try:
                sb.table("player_percentiles").upsert(rows[i:i + 500], on_conflict="season,player_id,kind").execute()
                break
            except Exception as e:
                print(f"  retry {attempt + 1}: {str(e)[:70]}")
                time.sleep(3)
        else:
            sys.exit(f"Stopped at row {i}.")
    print(f"Done. {len(rows):,} rows.")


if __name__ == "__main__":
    main()
