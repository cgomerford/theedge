#!/usr/bin/env python3
"""
hitter_rates.py: step 4. Per-hitter outcome counts by season and by pitcher hand, plus the
table-setting, double-play and pitches-seen measures, and a year-to-year carryover check on each.

Reads  data/bcaa/all_pa_<year>.csv   (export_all_pa.py)
Writes data/bcaa/hitter_rates_<year>.csv   one row per hitter x pitcher hand, counts only
       data/bcaa/hitter_rates_pooled.csv   same, all seasons together

Outcome classes: 1B, 2B, 3B, HR, BB (walk + hit by pitch), K, IPout (every other ball-in-play out,
double plays, sacrifices, fielder's choice), ROE (reached on error / catcher interference).
Intentional walks are a manager's decision, not a hitter skill: counted in n_IBB and left out of PA.

Table-setting measures (counts; rates are derived later):
  empty_PA / empty_ob / empty_xbh   plate appearances with the bases empty; times he reached base;
                                    times he hit a double, triple or home run (scoring-position creation)
  lead_PA / lead_ob / lead_xbh      the same, for plate appearances that lead off an inning
Double-play measure: dp_chances = plate appearances with a runner on first and fewer than two outs;
  dp = times he grounded into a double play (grounded_into_double_play + double_play events).
Pitches measures:
  pitches        total pitches seen
  pitch_resid    sum of (pitches in the PA minus the league average for that result class), so it
                 measures pitches seen BEYOND what his strikeouts, walks and so on already imply

Usage (from the theedge folder):
  python3 scripts/bcaa/hitter_rates.py
"""
import csv
import glob
import math
import os
import sys
from collections import defaultdict

OUT_DIR = "data/bcaa"
CLASS = {"single": "1B", "double": "2B", "triple": "3B", "home_run": "HR",
         "walk": "BB", "hit_by_pitch": "BB", "strikeout": "K", "strikeout_double_play": "K",
         "field_error": "ROE", "catcher_interf": "ROE"}
CLASSES = ["1B", "2B", "3B", "HR", "BB", "K", "IPout", "ROE"]
DP_EVENTS = {"grounded_into_double_play", "double_play"}
COUNT_COLS = ["PA", "n_1B", "n_2B", "n_3B", "n_HR", "n_BB", "n_K", "n_IPout", "n_ROE", "n_IBB",
              "dp_chances", "dp", "pitches", "pitch_resid",
              "empty_PA", "empty_ob", "empty_xbh", "lead_PA", "lead_ob", "lead_xbh"]


def classify(ev):
    return "IBB" if ev == "intent_walk" else CLASS.get(ev, "IPout")


def stream(path):
    with open(path) as f:
        for r in csv.DictReader(f):
            yield r


def main():
    files = sorted(glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    if not files:
        print("Run export_all_pa.py first.", file=sys.stderr); sys.exit(1)

    # pass 1: league average pitches per result class
    psum, pn = defaultdict(float), defaultdict(int)
    for p in files:
        for r in stream(p):
            c = classify(r["event"])
            if c == "IBB":
                continue
            psum[c] += int(r["pitches"]); pn[c] += 1
    lg_pitch = {c: psum[c] / pn[c] for c in pn}
    print("League average pitches per plate appearance, by result:")
    print("  " + "   ".join(f"{c} {lg_pitch[c]:.2f}" for c in CLASSES if c in lg_pitch))

    # pass 2: per hitter x hand, per season
    names = {}
    seasons = {}
    for p in files:
        year = os.path.basename(p)[7:11]
        acc = defaultdict(lambda: defaultdict(float))
        last_game, seen_half = None, set()
        for r in stream(p):
            if r["game_pk"] != last_game:
                last_game, seen_half = r["game_pk"], set()
            half_key = (r["inning"], r["half"])
            is_lead = half_key not in seen_half
            seen_half.add(half_key)
            ev, c = r["event"], classify(r["event"])
            names[r["batter"]] = r["batter_name"]
            a = acc[(r["batter"], r["p_throws"])]
            if c == "IBB":
                a["n_IBB"] += 1
                continue
            pit = int(r["pitches"])
            a["PA"] += 1; a["n_" + c] += 1
            a["pitches"] += pit; a["pitch_resid"] += pit - lg_pitch[c]
            b, o = r["base_state"], int(r["outs"])
            if b[0] != "_" and o < 2:
                a["dp_chances"] += 1
                a["dp"] += ev in DP_EVENTS
            ob = c in ("1B", "2B", "3B", "HR", "BB")
            xbh = c in ("2B", "3B", "HR")
            if b == "___":
                a["empty_PA"] += 1; a["empty_ob"] += ob; a["empty_xbh"] += xbh
            if is_lead:
                a["lead_PA"] += 1; a["lead_ob"] += ob; a["lead_xbh"] += xbh
        seasons[year] = acc
        with open(os.path.join(OUT_DIR, f"hitter_rates_{year}.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["batter", "name", "vs"] + COUNT_COLS)
            for (bt, hand), a in sorted(acc.items(), key=lambda kv: -kv[1]["PA"]):
                w.writerow([bt, names[bt], hand] + [round(a[c], 3) for c in COUNT_COLS])
        print(f"{year}: {len(acc):,} hitter-by-hand rows written")

    pooled = defaultdict(lambda: defaultdict(float))
    for acc in seasons.values():
        for k, a in acc.items():
            for c in COUNT_COLS:
                pooled[k][c] += a[c]
    with open(os.path.join(OUT_DIR, "hitter_rates_pooled.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["batter", "name", "vs"] + COUNT_COLS)
        for (bt, hand), a in sorted(pooled.items(), key=lambda kv: -kv[1]["PA"]):
            w.writerow([bt, names[bt], hand] + [round(a[c], 3) for c in COUNT_COLS])

    # league rates by pitcher hand
    print("\nLeague rates by pitcher hand (per plate appearance):")
    print("vs   PA        K%     BB%    1B%    2B+3B%  HR%    IPout%  DP per chance")
    for hand in ("R", "L"):
        t = defaultdict(float)
        for (bt, h), a in pooled.items():
            if h == hand:
                for c in COUNT_COLS:
                    t[c] += a[c]
        n = t["PA"]
        print(f"{hand}    {n:>9,.0f}  {t['n_K']/n:.1%}  {t['n_BB']/n:.1%}  {t['n_1B']/n:.1%}  "
              f"{(t['n_2B']+t['n_3B'])/n:.1%}   {t['n_HR']/n:.1%}  {t['n_IPout']/n:.1%}   "
              f"{t['dp']/max(t['dp_chances'],1):.1%}")

    # combined-hand hitter lines
    def combine(acc):
        out = defaultdict(lambda: defaultdict(float))
        for (bt, hand), a in acc.items():
            for c in COUNT_COLS:
                out[bt][c] += a[c]
        return out

    allp = combine(pooled)

    def board(title, fn, minc, mincol, top=8, fmt="{:.3f}"):
        rows = [(fn(a), names[bt], a[mincol]) for bt, a in allp.items() if a[mincol] >= minc]
        rows.sort(reverse=True)
        print(f"\n{title} (min {minc:,.0f} {mincol})")
        for v, nm, n in rows[:top]:
            print(f"  {fmt.format(v):>8}  {nm}  ({n:,.0f})")
        print("   ...")
        for v, nm, n in rows[-3:]:
            print(f"  {fmt.format(v):>8}  {nm}  ({n:,.0f})")

    board("PITCHES PER PA", lambda a: a["pitches"] / a["PA"], 1500, "PA", fmt="{:.2f}")
    board("PITCHES ABOVE EXPECTED GIVEN RESULT, per PA", lambda a: a["pitch_resid"] / a["PA"], 1500, "PA")
    board("LEADING-OFF-AN-INNING ON-BASE RATE", lambda a: a["lead_ob"] / a["lead_PA"], 350, "lead_PA", fmt="{:.3f}")
    board("EXTRA-BASE HIT RATE LEADING OFF AN INNING", lambda a: a["lead_xbh"] / a["lead_PA"], 350, "lead_PA", fmt="{:.3f}")
    board("DOUBLE PLAYS PER CHANCE", lambda a: a["dp"] / a["dp_chances"], 150, "dp_chances", fmt="{:.3f}")

    # carryover: season y vs season y+1, hitters with enough in both
    print("\nYEAR-TO-YEAR CARRYOVER (correlation of the same hitter's rate in consecutive seasons)")
    yrs = sorted(seasons)
    metrics = [
        ("pitches per PA", lambda a: a["pitches"] / a["PA"], "PA", 300),
        ("pitches above expected per PA", lambda a: a["pitch_resid"] / a["PA"], "PA", 300),
        ("strikeout rate", lambda a: a["n_K"] / a["PA"], "PA", 300),
        ("walk rate", lambda a: a["n_BB"] / a["PA"], "PA", 300),
        ("extra-base hits per PA", lambda a: (a["n_2B"] + a["n_3B"] + a["n_HR"]) / a["PA"], "PA", 300),
        ("on-base rate leading off innings", lambda a: a["lead_ob"] / a["lead_PA"], "lead_PA", 80),
        ("double plays per chance", lambda a: a["dp"] / a["dp_chances"], "dp_chances", 60),
    ]
    print("metric                              pairs   r")
    for label, fn, mincol, minv in metrics:
        xs, ys = [], []
        for y0, y1 in zip(yrs, yrs[1:]):
            c0, c1 = combine(seasons[y0]), combine(seasons[y1])
            for bt in c0:
                if bt in c1 and c0[bt][mincol] >= minv and c1[bt][mincol] >= minv:
                    xs.append(fn(c0[bt])); ys.append(fn(c1[bt]))
        n = len(xs)
        if n < 10:
            print(f"{label:36s}{n:5d}   n/a"); continue
        mx, my = sum(xs) / n, sum(ys) / n
        sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
        r = sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else float("nan")
        print(f"{label:36s}{n:5d}   {r:.2f}")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()