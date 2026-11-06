#!/usr/bin/env python3
"""
pitches_vs_production.py: how much does a hitter's batting average, on-base rate and run value
change with the number of pitches he sees?

Two questions, two designs, for hitters with 300+ plate appearances in a season:
  A. Across hitters: do hitters who see more pitches per plate appearance hit for a higher average,
     reach base more, or produce more runs?
  B. Within the same hitter, season to season: when a hitter's pitches per plate appearance goes up,
     does his average, on-base rate or run value go up with it? (This is the closer match to
     "does he improve when he takes more pitches".)
Each is run for two pitch measures:
  pitches per PA          raw. More pitches mostly means more walks and strikeouts.
  pitches above expected  pitches beyond what the plate appearance's RESULT implies (a walk takes
                          about 5.5 pitches, a ball in play about 3.4). This strips out walks and
                          strikeouts and asks about the extra pitches themselves.

Measures: AVG-like = hits / (PA - walks and hit by pitch); sacrifices are not removed, so it runs a
little below official average. OBP-like = (hits + walks and hit by pitch) / PA. Run value per PA uses
fixed weights (1B .47, 2B .76, 3B 1.04, HR 1.40, BB .33, K -.27, other out -.27, error .40).
Intentional walks are excluded throughout.

Reads  data/bcaa/hitter_rates_<year>.csv   (hitter_rates.py)
Usage (from the theedge folder):
  python3 scripts/bcaa/pitches_vs_production.py
"""
import csv
import glob
import math
import os
import sys
from collections import defaultdict

OUT_DIR = "data/bcaa"
MIN_PA = 300
for i, a in enumerate(sys.argv):
    if a == "--minpa" and i + 1 < len(sys.argv):
        MIN_PA = int(sys.argv[i + 1])
W = {"n_1B": .47, "n_2B": .76, "n_3B": 1.04, "n_HR": 1.40, "n_BB": .33, "n_K": -.27, "n_IPout": -.27, "n_ROE": .40}
COLS = ["PA", "n_1B", "n_2B", "n_3B", "n_HR", "n_BB", "n_K", "n_IPout", "n_ROE", "pitches", "pitch_resid"]


def load():
    data = {}
    for p in sorted(glob.glob(os.path.join(OUT_DIR, "hitter_rates_20*.csv"))):
        year = os.path.basename(p)[13:17]
        agg = defaultdict(lambda: defaultdict(float))
        with open(p) as f:
            for r in csv.DictReader(f):
                for c in COLS:
                    agg[r["batter"]][c] += float(r[c])
        for b, a in agg.items():
            if a["PA"] >= MIN_PA:
                hits = a["n_1B"] + a["n_2B"] + a["n_3B"] + a["n_HR"]
                data[(year, b)] = {
                    "ppa": a["pitches"] / a["PA"], "pae": a["pitch_resid"] / a["PA"],
                    "avg": hits / (a["PA"] - a["n_BB"]),
                    "obp": (hits + a["n_BB"]) / a["PA"],
                    "val": sum(W[c] * a[c] for c in W) / a["PA"],
                    "k": a["n_K"] / a["PA"], "bb": a["n_BB"] / a["PA"], "pa": a["PA"]}
    return data


def ols(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    b = sxy / sxx if sxx else float("nan")
    r = sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else float("nan")
    se = math.sqrt(max(syy - b * sxy, 0) / (n - 2) / sxx) if n > 2 and sxx else float("nan")
    return b, se, r, math.sqrt(sxx / n)


def main():
    data = load()
    if len(data) < 30:
        print(f"Only {len(data)} hitter-seasons with {MIN_PA}+ plate appearances; nothing to analyse.", file=sys.stderr)
        sys.exit(1)
    years = sorted({k[0] for k in data})
    print(f"Hitter-seasons with {MIN_PA}+ PA: {len(data):,} across {len(years)} seasons")
    rows = list(data.values())
    print(f"Spread across hitters (one standard deviation): pitches per PA {ols([r['ppa'] for r in rows], [0]*len(rows))[3]:.2f}, "
          f"pitches above expected {ols([r['pae'] for r in rows], [0]*len(rows))[3]:.2f}")
    measures = [("avg", "batting avg (points)", 1000), ("obp", "on-base (points)", 1000), ("val", "run value (runs/650 PA)", 650)]

    for pk, plabel in (("ppa", "PITCHES PER PA"), ("pae", "PITCHES ABOVE EXPECTED GIVEN RESULT")):
        print(f"\n=== {plabel} ===")
        print("A. Across hitters: change per +1.0 extra pitch per PA (+/- standard error), correlation")
        for mk, mlabel, mult in measures:
            b, se, r, _ = ols([r[pk] for r in rows], [r[mk] for r in rows])
            print(f"   {mlabel:26s} {b * mult:+8.1f} +/- {se * mult:5.1f}    r = {r:+.2f}")
        xs = defaultdict(list)
        for y0, y1 in zip(years, years[1:]):
            for (yy, b), d0 in data.items():
                if yy != y0 or (y1, b) not in data:
                    continue
                d1 = data[(y1, b)]
                xs[pk].append(d1[pk] - d0[pk])
                for mk, _, _ in measures:
                    xs[mk].append(d1[mk] - d0[mk])
        print(f"B. Same hitter, next season ({len(xs[pk]):,} pairs): change in the measure when his pitch measure rises by 1.0")
        for mk, mlabel, mult in measures:
            b, se, r, _ = ols(xs[pk], xs[mk])
            print(f"   {mlabel:26s} {b * mult:+8.1f} +/- {se * mult:5.1f}    r = {r:+.2f}")

    print("\n=== QUARTILES OF PITCHES ABOVE EXPECTED (all hitter-seasons) ===")
    srt = sorted(rows, key=lambda r: r["pae"])
    n = len(srt)
    print("  quartile  pitches/PA  above exp   avg    obp   run value/650   K%     BB%")
    for q in range(4):
        c = srt[q * n // 4:(q + 1) * n // 4]
        m = lambda k: sum(x[k] for x in c) / len(c)
        print(f"     {q + 1}        {m('ppa'):5.2f}     {m('pae'):+6.2f}   {m('avg'):.3f}  {m('obp'):.3f}   {650 * m('val'):+7.1f}      {m('k'):.1%}  {m('bb'):.1%}")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()