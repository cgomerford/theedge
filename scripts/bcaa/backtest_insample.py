#!/usr/bin/env python3
"""
backtest_insample.py: step 8b. Does the engine turn hitter rates into runs correctly?

backtest_lineups.py asked a projection question: can last year's numbers predict this year's team
scoring? That mixes two things: how well hitters are projected, and whether the engine converts
hitter rates into runs correctly. This script separates the second. Each team-game's lineup is run
using every hitter's rates from the SAME season (lightly shrunk), and compared with what that
team scored in the first eight innings.

It is a reconstruction test, not a forecast: it can only show whether the engine's mechanics
(transitions, double plays, order, platoon) add up to real run scoring. Nothing here says anything about
how well a hitter's future can be predicted.

What it should show if the mechanics are right
  - engine average within about 0.05 of the runs scored on batter results
  - team-season r about 0.85 or higher, slope about 0.8 to 1.2
  - calibration across team-season quintiles close to the diagonal

Reads  data/bcaa/all_pa_<year>.csv and transitions.csv; imports sim_engine.py and backtest_lineups.py
Usage (from the theedge folder):
  python3 scripts/bcaa/backtest_insample.py
"""
import glob
import os
import sys
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_engine as se
import backtest_lineups as bt

OUT_DIR = bt.OUT_DIR


def main():
    years = sorted(int(os.path.basename(p)[7:11]) for p in glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    bp_left = bt.bullpen_left_share(years)
    allrows = []
    t0 = time.time()
    for Y in years:
        M = se.Model(seasons=[Y], verbose=False)
        recs = bt.read_team_games(Y, bp_left)
        cache = {}
        pv = {h: bt.plain_value(M, h) for h in {h for r in recs for h in r["lineup"]}}
        for r in recs:
            pL = bt.PL_STARTER * r["starter_left"] + (1 - bt.PL_STARTER) * bp_left
            r["engine"] = bt.mix_runs(M, r["lineup"], pL, cache)
            r["plain"] = sum(pv[h] for h in r["lineup"]) / 9 * 38.0 * 8 / 9
        allrows += recs
        a = sum(r["actual"] for r in recs) / len(recs)
        p = sum(r["pa_runs"] for r in recs) / len(recs)
        e = sum(r["engine"] for r in recs) / len(recs)
        print(f"  {Y}: {len(recs):,} team-games  actual {a:.3f}  batter-result runs {p:.3f}  engine {e:.3f}  "
              f"engine minus batter-result {e - p:+.3f}  ({time.time() - t0:.0f}s)")

    N = len(allrows)
    act = sum(r["actual"] for r in allrows) / N
    par = sum(r["pa_runs"] for r in allrows) / N
    eng = sum(r["engine"] for r in allrows) / N
    print(f"\nALL SEASONS: {N:,} team-games, first eight innings")
    print(f"  actual runs per team-game:               {act:.3f}")
    print(f"  scored on batter results:                {par:.3f}")
    print(f"  engine prediction:                       {eng:.3f}   (engine minus batter-result runs {eng - par:+.3f})")

    ts = bt.team_seasons(allrows)
    print("\nHOW WELL EACH PREDICTOR RECONSTRUCTS TEAM SCORING (same-season hitter rates)")
    print(f"                                 team-season (n={len(ts)})        single game")
    print("                                 r      RMSE   slope       r")
    for key, label in (("engine", "engine"), ("plain", "plain linear-weight sum")):
        tx = [sum(g[key] for g in v) / len(v) for v in ts.values()]
        ty = [sum(g["actual"] for g in v) / len(v) for v in ts.values()]
        r1 = bt.pearson(tx, ty); e1, b1 = bt.calibrated_rmse(tx, ty)
        r2 = bt.pearson([g[key] for g in allrows], [g["actual"] for g in allrows])
        print(f"  {label:28s}  {r1:5.2f}  {e1:6.3f}  {b1:5.2f}     {r2:5.3f}")

    print("\nTEAM-SEASON QUINTILES BY ENGINE PREDICTION (average runs per game)")
    rows = sorted(((sum(g["engine"] for g in v) / len(v), sum(g["actual"] for g in v) / len(v)) for v in ts.values()))
    n = len(rows)
    print("  quintile   engine   actual   difference")
    for q in range(5):
        c = rows[q * n // 5:(q + 1) * n // 5]
        p = sum(x[0] for x in c) / len(c); a = sum(x[1] for x in c) / len(c)
        print(f"     {q + 1}       {p:6.3f}   {a:6.3f}    {a - p:+6.3f}")

    print("\nBY SEASON (team-season r, engine)")
    for Y in years:
        v = {k: x for k, x in ts.items() if k[0] == Y}
        tx = [sum(g["engine"] for g in x) / len(x) for x in v.values()]
        ty = [sum(g["actual"] for g in x) / len(x) for x in v.values()]
        print(f"  {Y}: r = {bt.pearson(tx, ty):.2f} over {len(v)} teams")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()