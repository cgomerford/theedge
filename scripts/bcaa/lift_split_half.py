#!/usr/bin/env python3
"""
lift_split_half.py: is Lineup Lift real, or is the optimiser finding noise?

team_scenarios.py picks each club's best order using the hitters' measured season rates, then values that
order with the same rates. Any random ups and downs in those rates are part of what it exploits, so
the lift it reports can be too high. This test removes that: the season's games are split into two halves
(game number odd or even), the best order is chosen using ONE half's rates, and it is valued using the
OTHER half's rates, which that choice never saw. Both directions are run and averaged.

  in-sample     lift on the half the order was chosen from (what team_scenarios.py reports, on half the data)
  out-of-sample lift the same order shows on the half it did not see
If out-of-sample is close to in-sample, the lift is real. If it collapses toward zero, most of it was noise.
Each half has half the plate appearances, so its rates are noisier; that makes this test a harsh one, and the
out-of-sample number a conservative one.

Reads  data/bcaa/all_pa_<year>.csv, transitions.csv, between.csv; imports sim_engine.py and team_scenarios.py
Writes data/bcaa/split_a/, split_b/ (temporary half-season copies; safe to delete)

Usage (from the theedge folder):
  python3 scripts/bcaa/lift_split_half.py
"""
import csv
import glob
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_engine as se
import team_scenarios as ts

OUT_DIR = "data/bcaa"


def make_half(Y, parity, tag):
    d = os.path.join(OUT_DIR, f"split_{tag}")
    os.makedirs(d, exist_ok=True)
    for fn in ("transitions.csv", "between.csv"):
        src = os.path.join(OUT_DIR, fn)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(d, fn))
    with open(os.path.join(OUT_DIR, f"all_pa_{Y}.csv")) as f, open(os.path.join(d, f"all_pa_{Y}.csv"), "w", newline="") as g:
        r = csv.DictReader(f)
        w = csv.DictWriter(g, fieldnames=r.fieldnames)
        w.writeheader()
        for row in r:
            if int(row["game_pk"]) % 2 == parity:
                w.writerow(row)
    return d


def load_model(d, Y):
    saved = se.OUT_DIR
    se.OUT_DIR = d
    try:
        return se.Model(seasons=[Y], verbose=False)
    finally:
        se.OUT_DIR = saved


def main():
    years = sorted(int(os.path.basename(p)[7:11]) for p in glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    Y = years[-1]
    t0 = time.time()
    starts, left_games, games, bp_left = ts.read_teams(Y)
    MA = load_model(make_half(Y, 0, "a"), Y)
    MB = load_model(make_half(Y, 1, "b"), Y)
    print(f"{Y}: two half-season models built ({time.time() - t0:.0f}s). Between layer "
          f"{'on' if getattr(MA, 'between', None) else 'OFF'}.\n")
    print("  team    in-sample   out-of-sample   (runs per 162; average of both directions)")
    rows = []
    for team in sorted(starts):
        order = ts.core_nine(starts[team])
        if len(order) < 9:
            continue
        pL = ts.PL_STARTER * left_games[team] / max(games[team], 1) + (1 - ts.PL_STARTER) * bp_left
        ins, outs = [], []
        for P, Q in ((MA, MB), (MB, MA)):
            best, _ = ts.best_order(P, order, pL, order)
            ins.append((P.lineup_runs(best, pL) - P.lineup_runs(order, pL)) * ts.GAMES)
            outs.append((Q.lineup_runs(best, pL) - Q.lineup_runs(order, pL)) * ts.GAMES)
        i, o = sum(ins) / 2, sum(outs) / 2
        rows.append((team, i, o))
        print(f"  {team:5s}   {i:+6.1f}      {o:+6.1f}        [{time.time() - t0:.0f}s]", end="\r")
    print(" " * 70)
    for team, i, o in sorted(rows, key=lambda x: -x[2]):
        print(f"  {team:5s}   {i:+6.1f}      {o:+6.1f}")
    n = len(rows)
    mi = sum(r[1] for r in rows) / n
    mo = sum(r[2] for r in rows) / n
    pos = sum(1 for r in rows if r[2] > 0)
    print(f"\n  average across {n} clubs: in-sample {mi:+.1f}, out-of-sample {mo:+.1f} runs per 162  "
          f"({mo / mi:.0%} of the in-sample lift survives)" if mi else "")
    print(f"  clubs whose out-of-sample lift is above zero: {pos} of {n}")
    print("  Each half has half the plate appearances, so both numbers are noisier than the full-season lift in")
    print("  team_scenarios.py. Read the share that survives, not the absolute size.")
    for d in ("split_a", "split_b"):
        shutil.rmtree(os.path.join(OUT_DIR, d), ignore_errors=True)
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()