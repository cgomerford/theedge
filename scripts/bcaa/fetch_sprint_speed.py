#!/usr/bin/env python3
"""
fetch_sprint_speed.py — BCAA step 3a: download Savant sprint speed leaderboard per season

Verified header (Nov 2026):
  "last_name, first_name","player_id","team_id","team","position","age",
  "competitive_runs","bolts","hp_to_1b","sprint_speed"
min=0 returns every player, including those with very few competitive runs
(reliability handled later by regressing low-run players toward the league mean).

Usage (from the theedge folder):
  python3 scripts/bcaa/fetch_sprint_speed.py
  python3 scripts/bcaa/fetch_sprint_speed.py 2025 2026

Output: data/bcaa/sprint_speed_<year>.csv  (raw Savant CSV, unchanged)
"""
import csv
import io
import os
import sys
from typing import List

from build_pa_states import fetch

URL = ("https://baseballsavant.mlb.com/leaderboard/sprint_speed"
       "?year={y}&position=&team=&min=0&csv=true")
OUT_DIR = "data/bcaa"
EXPECTED = ["player_id", "competitive_runs", "bolts", "hp_to_1b", "sprint_speed"]


def num(v: str):
    v = (v or "").strip()
    try:
        return float(v)
    except ValueError:
        return None


def main(years: List[int]) -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for y in years:
        raw = fetch(URL.format(y=y))
        if raw is None:
            print(f"{y}: FETCH FAILED")
            continue
        text = raw.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        missing = [c for c in EXPECTED if c not in (reader.fieldnames or [])]
        if missing:
            print(f"{y}: unexpected response, missing columns {missing}; not saved "
                  f"(first 120 chars: {text[:120]!r})")
            continue
        rows = list(reader)
        with open(os.path.join(OUT_DIR, f"sprint_speed_{y}.csv"), "w") as f:
            f.write(text)

        speeds = [num(r["sprint_speed"]) for r in rows]
        runs = [num(r["competitive_runs"]) for r in rows]
        no_speed = sum(1 for s in speeds if s is None)
        low = sum(1 for s, n in zip(speeds, runs) if s is not None and (n is None or n < 10))
        odd = sum(1 for r in rows
                  if num(r["bolts"]) is not None and num(r["competitive_runs"]) is not None
                  and num(r["bolts"]) > num(r["competitive_runs"]))
        valid = sorted(s for s in speeds if s is not None)
        mid = valid[len(valid) // 2] if valid else None
        print(f"{y}: {len(rows)} players | median {mid} ft/s | no speed: {no_speed} | "
              f"under 10 competitive runs: {low} | bolts > competitive_runs: {odd}")


if __name__ == "__main__":
    ys = [int(a) for a in sys.argv[1:]] or [2023, 2024, 2025, 2026]
    main(ys)