#!/usr/bin/env python3
"""
scripts/load_stuff_lab.py

Loads the pitch-grade model's CSV outputs into the three x9Stuff Lab tables (supabase/migrations/20261030110000_stuff_lab.sql).

TABLE OWNERSHIP: this script is the SINGLE writer of stuff_lab_pitch_grades, stuff_lab_pitcher_grades and stuff_lab_pressure.

Two CSV shapes are understood, per file:
  Stuff Grade v1.0   (models/reports/stuff_v1.0_<season>_pitch_types.csv / _pitchers.csv)
        columns pitcher, pitch_type, player_name, pitches, xrv_mean, xrv_per_100, stuff_grade   (+ era, xera, kbb on the pitcher file)
        stuff_grade is 50-based (SD 10): the loader adds 50 so every grade is on the lab's 100 scale. xrv_per_100 (positive = better for
        the pitcher) becomes expected_rv_per100. Names arrive as "Last, First" and are stored "First Last". Command, overall, sub-grades,
        pressure and actual run value stay NULL.
  Full model         the pitch_type_grades / pitcher_grades / pressure_profile CSVs of the mockup (already on the 100 scale, columns as named
        in the tables), loaded as they are. Detected by the presence of expected_rv_per100.

Usage:
  python3 scripts/load_stuff_lab.py --season 2026 --pitch-types models/reports/stuff_v1.0_2026_pitch_types.csv --pitchers models/reports/stuff_v1.0_2026_pitchers.csv --version stuff_v1.0
  python3 scripts/load_stuff_lab.py ... --pressure path/to/pressure_profile.csv
  python3 scripts/load_stuff_lab.py ... --dry-run          # parse and print, write nothing

Prints a 5-row sample for each table and waits 5 seconds (Ctrl+C aborts) before writing. Re-running is safe: rows are upserted by their keys.
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import sys
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
BATCH = 500
GRADES = ["stuff_grade", "command_grade", "overall_grade", "miss_bats_grade", "chase_grade", "steal_strikes_grade",
          "ground_balls_grade", "pop_ups_grade", "weak_contact_grade"]


def num(v: Optional[str], digits: Optional[int] = None) -> Optional[float]:
    """A float, or None for blank / nan. Never 0 for a missing value."""
    if v is None or v.strip() == "":
        return None
    try:
        x = float(v)
    except ValueError:
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return round(x, digits) if digits is not None else x


def intval(v: Optional[str]) -> Optional[int]:
    x = num(v)
    return None if x is None else int(round(x))


def tidy_name(name: str) -> str:
    """'Last, First' -> 'First Last' (a trailing 'Jr.' stays with the last name)."""
    if "," not in name:
        return name.strip()
    last, first = [p.strip() for p in name.split(",", 1)]
    return f"{first} {last}".strip()


def read(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def note_for(pitches: int, has_command: bool) -> Optional[str]:
    if pitches < 100:
        return "very small sample"
    if has_command and pitches < 400:
        return "command still settling"
    return None


def grade(v: Optional[str], offset: float) -> Optional[float]:
    x = num(v)
    return None if x is None else round(x + offset, 1)


def build_pitch_rows(rows: list[dict], season: int, version: str) -> list[dict]:
    full = bool(rows) and "expected_rv_per100" in rows[0]
    offset = 0.0 if full else 50.0
    totals: dict[str, int] = {}
    for r in rows:
        totals[r["pitcher"]] = totals.get(r["pitcher"], 0) + (intval(r.get("pitches")) or 0)
    out = []
    for r in rows:
        n = intval(r.get("pitches")) or 0
        if not r.get("pitcher") or not r.get("pitch_type") or n <= 0:
            continue
        tot = totals[r["pitcher"]]
        row = {
            "season": season, "pitcher_id": int(r["pitcher"]), "pitch_type": r["pitch_type"],
            "player_name": tidy_name(r.get("player_name") or "") or None, "p_throws": (r.get("p_throws") or None),
            "pitches": n, "usage_pct": num(r.get("usage_pct"), 1) if full else round(n / tot * 100, 1) if tot else None,
            "velo": num(r.get("velo"), 1), "ivb": num(r.get("ivb"), 1), "hb": num(r.get("hb"), 1), "spin": intval(r.get("spin")),
            "actual_rv_per100": num(r.get("actual_rv_per100"), 2),
            "expected_rv_per100": num(r.get("expected_rv_per100") if full else r.get("xrv_per_100"), 2),
            "sample_note": (r.get("sample_note") or None) if full else note_for(n, False),
            "model_version": version,
        }
        for g in GRADES:
            row[g] = grade(r.get(g), offset)
        out.append(row)
    return out


def build_pitcher_rows(rows: list[dict], season: int, version: str) -> list[dict]:
    full = bool(rows) and "expected_rv_per100" in rows[0]
    offset = 0.0 if full else 50.0
    out = []
    for r in rows:
        n = intval(r.get("pitches")) or 0
        if not r.get("pitcher") or n <= 0:
            continue
        row = {
            "season": season, "pitcher_id": int(r["pitcher"]), "player_name": tidy_name(r.get("player_name") or "") or None,
            "p_throws": (r.get("p_throws") or None), "pitches": n,
            "velo": num(r.get("velo"), 1), "ivb": num(r.get("ivb"), 1), "hb": num(r.get("hb"), 1), "spin": intval(r.get("spin")),
            "actual_rv_per100": num(r.get("actual_rv_per100"), 2),
            "expected_rv_per100": num(r.get("expected_rv_per100"), 2) if full else (round(-num(r.get("xrv_mean"), 6) * 100, 2) if num(r.get("xrv_mean")) is not None else None),
            "era": num(r.get("era"), 2), "xera": num(r.get("xera"), 2), "kbb": num(r.get("kbb"), 1),
            "sample_note": (r.get("sample_note") or None) if full else note_for(n, False),
            "model_version": version,
        }
        for g in GRADES:
            row[g] = grade(r.get(g), offset)
        out.append(row)
    return out


def build_pressure_rows(rows: list[dict], season: int, version: str) -> list[dict]:
    out = []
    for r in rows:
        if r.get("pressure") not in ("high", "normal") or not r.get("pitcher"):
            continue
        out.append({
            "season": season, "pitcher_id": int(r["pitcher"]), "pressure": r["pressure"], "player_name": tidy_name(r.get("player_name") or "") or None,
            "pitches": intval(r.get("pitches")) or 0, "overall_grade": num(r.get("overall_grade"), 1), "command_grade": num(r.get("command_grade"), 1),
            "fastball_pct": num(r.get("fastball_pct"), 1), "actual_rv_per100": num(r.get("actual_rv_per100"), 2), "model_version": version,
        })
    return out


def confirm(label: str, rows: list[dict]) -> bool:
    if not rows:
        print(f"{label}: 0 rows, skipping.")
        return False
    print(f"\n--- {label}: {len(rows)} rows. First 5: ---")
    for r in rows[:5]:
        print(r)
    print("--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
    try:
        time.sleep(5)
    except KeyboardInterrupt:
        print("Aborted.")
        return False
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description="Load the pitch-grade model CSVs into the x9Stuff Lab tables.")
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--pitch-types", required=True)
    ap.add_argument("--pitchers", required=True)
    ap.add_argument("--pressure", default=None)
    ap.add_argument("--version", required=True, help="model version label stored on every row, e.g. stuff_v1.0")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    pitch = build_pitch_rows(read(a.pitch_types), a.season, a.version)
    pitchers = build_pitcher_rows(read(a.pitchers), a.season, a.version)
    pressure = build_pressure_rows(read(a.pressure), a.season, a.version) if a.pressure else []
    print(f"Parsed {len(pitch)} pitch-type rows, {len(pitchers)} pitcher rows, {len(pressure)} pressure rows.")
    if a.dry_run:
        for label, rows in (("pitch types", pitch), ("pitchers", pitchers), ("pressure", pressure)):
            print(f"\n{label} sample:")
            for r in rows[:3]:
                print(r)
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing Supabase credentials (SUPABASE_URL/SUPABASE_SERVICE_KEY or NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).")
        sys.exit(1)
    from supabase import create_client  # noqa: E402
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    for table, rows, key in (("stuff_lab_pitch_grades", pitch, "season,pitcher_id,pitch_type"), ("stuff_lab_pitcher_grades", pitchers, "season,pitcher_id"),
                             ("stuff_lab_pressure", pressure, "season,pitcher_id,pressure")):
        if not confirm(table, rows):
            continue
        for i in range(0, len(rows), BATCH):
            try:
                sb.table(table).upsert(rows[i:i + BATCH], on_conflict=key).execute()
                print(f"  {table}: upserted {i + 1}-{min(i + BATCH, len(rows))} of {len(rows)}")
            except Exception as e:  # noqa: BLE001
                print(f"  {table}: ERROR on batch {i + 1}: {e}")
    print("\nDone.")


if __name__ == "__main__":
    main()
