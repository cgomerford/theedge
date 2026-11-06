#!/usr/bin/env python3
"""
build_re24.py — BCAA step 4: run expectancy matrix and run value of one base

Reads the cached Savant day files written by build_season.py:
  data/bcaa/cache/savant/<YYYY-MM-DD>.json
Each file is a list of terminal-pitch rows for every plate appearance in regular-season
games (bases empty included), with these fields (verified from the live CSV header):
  game_pk, game_date, at_bat_number, inning, inning_topbot, on_1b, on_2b, on_3b,
  outs_when_up, bat_score, post_bat_score

RE24(state) = average runs scored from that plate appearance to the end of the half-inning.
  runs from a row = (final score of the half-inning) - bat_score of that row
Half-innings are excluded if they can be cut short by a walk-off: the bottom half of the
last inning of each game. Rows labelled truncated_pa (a plate appearance cut short by a
caught stealing or pickoff for the third out) are not counted as plate appearances.

Usage (from the theedge folder):
  python3 scripts/bcaa/build_re24.py

Output:
  data/bcaa/re24_<year>.csv    one row per base/out state: bases, outs, n, runs_rest_of_inning
  data/bcaa/re24_pooled.csv    all four seasons together
  Printed: the 24-state matrix and the run value of advancing a runner one base, by outs
"""
import csv
import glob
import json
import os
import sys
from collections import defaultdict
from typing import Dict, List, Tuple

CACHE = "data/bcaa/cache/savant"
OUT_DIR = "data/bcaa"
BASES = ["___", "1__", "_2_", "__3", "12_", "1_3", "_23", "123"]


def base_code(r: dict) -> str:
    return ("1" if (r.get("on_1b") or "").strip() else "_") + \
           ("2" if (r.get("on_2b") or "").strip() else "_") + \
           ("3" if (r.get("on_3b") or "").strip() else "_")


def load_year(year: str) -> List[dict]:
    rows: List[dict] = []
    for path in sorted(glob.glob(os.path.join(CACHE, f"{year}-*.json"))):
        with open(path) as f:
            rows.extend(json.load(f))
    return rows


def build(rows: List[dict]) -> Tuple[Dict[Tuple[str, int], List[float]], int, int]:
    """Returns {(bases, outs): [sum_runs, n]}, half-innings used, half-innings dropped."""
    halves: Dict[Tuple[str, int, str], List[dict]] = defaultdict(list)
    for r in rows:
        try:
            halves[(r["game_pk"], int(r["inning"]), r["inning_topbot"])].append(r)
        except (KeyError, ValueError):
            continue
    last_half: Dict[str, Tuple[int, int]] = {}
    for (pk, inn, tb) in halves:
        key = (inn, 1 if tb == "Bot" else 0)
        if pk not in last_half or key > last_half[pk]:
            last_half[pk] = key
    acc: Dict[Tuple[str, int], List[float]] = defaultdict(lambda: [0.0, 0])
    used = dropped = 0
    for (pk, inn, tb), rs in halves.items():
        if tb == "Bot" and last_half[pk] == (inn, 1):
            dropped += 1
            continue
        rs.sort(key=lambda r: int(r["at_bat_number"]))
        try:
            final = int(rs[-1]["post_bat_score"])
            for r in rs:
                if (r.get("events") or "") == "truncated_pa":
                    continue
                runs = final - int(r["bat_score"])
                outs = int(r["outs_when_up"])
                if runs < 0 or outs not in (0, 1, 2):
                    raise ValueError
                a = acc[(base_code(r), outs)]
                a[0] += runs
                a[1] += 1
        except (ValueError, KeyError):
            dropped += 1
            continue
        used += 1
    return acc, used, dropped


def write(path: str, acc) -> None:
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["bases", "outs", "n", "runs_rest_of_inning"])
        for b in BASES:
            for o in (0, 1, 2):
                s, n = acc.get((b, o), [0.0, 0])
                w.writerow([b, o, n, round(s / n, 4) if n else ""])


def re_of(acc, b: str, o: int) -> float:
    s, n = acc.get((b, o), [0.0, 0])
    return s / n if n else float("nan")


def one_base_values(acc) -> Dict[Tuple[int, int], float]:
    """Average change in expected runs when one runner moves up one base, by (start base, outs).
    Frequency-weighted over the states that have that runner. Scoring from 3rd adds one run."""
    out: Dict[Tuple[int, int], float] = {}
    for start in (1, 2, 3):
        for o in (0, 1, 2):
            tot = wn = 0.0
            for b in BASES:
                if b[start - 1] == "_":
                    continue
                n = acc.get((b, o), [0.0, 0])[1]
                if not n:
                    continue
                cur = list(b)
                cur[start - 1] = "_"
                if start == 3:
                    new_b, bonus = "".join(cur), 1.0
                else:
                    if cur[start] != "_":
                        continue            # base ahead is occupied: runner cannot simply move up
                    cur[start] = str(start + 1)
                    new_b, bonus = "".join(cur), 0.0
                d = bonus + re_of(acc, new_b, o) - re_of(acc, b, o)
                if d == d:
                    tot += d * n
                    wn += n
            out[(start, o)] = tot / wn if wn else float("nan")
    return out


def main() -> None:
    years = sorted({os.path.basename(p)[:4] for p in glob.glob(os.path.join(CACHE, "*.json"))})
    if not years:
        print(f"No cached Savant day files found in {CACHE}. Run build_season.py first.", file=sys.stderr)
        sys.exit(1)
    pooled: Dict[Tuple[str, int], List[float]] = defaultdict(lambda: [0.0, 0])
    for y in years:
        acc, used, dropped = build(load_year(y))
        write(os.path.join(OUT_DIR, f"re24_{y}.csv"), acc)
        for k, (s, n) in acc.items():
            pooled[k][0] += s
            pooled[k][1] += n
        print(f"{y}: {sum(v[1] for v in acc.values()):,} plate appearances, {used:,} half-innings used, "
              f"{dropped:,} dropped (walk-off or bad rows)")
    write(os.path.join(OUT_DIR, "re24_pooled.csv"), pooled)
    print("\nPooled run expectancy (runs to the end of the inning):")
    print("bases   0 out   1 out   2 out")
    for b in BASES:
        print(f"{b}    " + "   ".join(f"{re_of(pooled, b, o):.3f}" for o in (0, 1, 2)))
    vals = one_base_values(pooled)
    print("\nRun value of moving one runner up one base (3rd = scoring), by outs:")
    print("from    0 out   1 out   2 out")
    for s in (1, 2, 3):
        print(f" {s}      " + "   ".join(f"{vals[(s, o)]:.3f}" for o in (0, 1, 2)))
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()