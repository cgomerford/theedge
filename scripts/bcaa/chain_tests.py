#!/usr/bin/env python3
"""
chain_tests.py: step 5. The tests behind the "chain" questions, on real plate appearances 2023-2026.

Reads  data/bcaa/all_pa_<year>.csv   (export_all_pa.py)
       data/bcaa/re24_pooled.csv     (build_re24.py)
Prints four tables (nothing is written except chain_tests.txt, a copy of the printout):

 TEST A  Pitches-seen chain. Does a hitter do better (relative to his own season average) when the
         previous hitter, against the same pitcher in the same inning, saw a long plate appearance?
         Split by whether that previous plate appearance ended in an out or reached base, because
         a long walk changes the base state and a long out does not.
 TEST B  Fly-ball tag-up table. After a fly ball, line drive or pop-up that is an out with one runner
         on, how often does the runner advance, by base, outs and how far the ball was hit, and what
         is the advance worth in runs. With two outs the inning ends, so an advance is worth nothing.
 TEST C  Cash-in. With a runner on third and fewer than two outs, how often does a run score, and does
         the same hitter repeat it year to year?
 TEST D  Does pitches-above-expected predict NEXT season's production beyond this season's production?

Hitter value in tests A and D uses fixed run weights per result (from your slot_profiles output):
  1B .47, 2B .76, 3B 1.04, HR 1.40, BB/HBP .33, K -.27, other out -.27, reached on error .40
Intentional walks are excluded.

Usage (from the theedge folder):
  python3 scripts/bcaa/chain_tests.py
"""
import csv
import glob
import math
import os
import sys
from collections import defaultdict
from itertools import groupby

OUT_DIR = "data/bcaa"
VAL = {"1B": .47, "2B": .76, "3B": 1.04, "HR": 1.40, "BB": .33, "K": -.27, "IPout": -.27, "ROE": .40}
CLASS = {"single": "1B", "double": "2B", "triple": "3B", "home_run": "HR", "walk": "BB",
         "hit_by_pitch": "BB", "strikeout": "K", "strikeout_double_play": "K",
         "field_error": "ROE", "catcher_interf": "ROE"}
FLY_EVENTS = {"field_out", "sac_fly", "sac_fly_double_play"}
FLY_TYPES = {"fly_ball", "line_drive", "popup"}
LOG = []


def out(s=""):
    print(s); LOG.append(s)


def classify(ev):
    return "IBB" if ev == "intent_walk" else CLASS.get(ev, "IPout")


def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else float("nan")


def load_re():
    re = {}
    with open(os.path.join(OUT_DIR, "re24_pooled.csv")) as f:
        for r in csv.DictReader(f):
            if r["runs_rest_of_inning"] != "":
                re[(r["bases"], int(r["outs"]))] = float(r["runs_rest_of_inning"])
    return re


def depth_bucket(r):
    if r["bb_type"] == "popup":
        return "popup"
    try:
        d = float(r["hit_distance_sc"])
    except (TypeError, ValueError):
        return "unknown"
    return "short <200" if d < 200 else "medium 200-299" if d < 300 else "deep 300-349" if d < 350 else "very deep 350+"


def main():
    files = sorted(glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    if not files or not os.path.exists(os.path.join(OUT_DIR, "re24_pooled.csv")):
        print("Need all_pa_<year>.csv and re24_pooled.csv first.", file=sys.stderr); sys.exit(1)
    RE = load_re()

    # ---------- pass 0: league pitches per class; per hitter-season sums ----------
    psum, pn = defaultdict(float), defaultdict(int)
    hs = defaultdict(lambda: {"n": 0, "val": 0.0, "ob": 0, "pitch": 0, "cls": defaultdict(int)})
    for p in files:
        year = os.path.basename(p)[7:11]
        with open(p) as f:
            for r in csv.DictReader(f):
                c = classify(r["event"])
                if c == "IBB":
                    continue
                pit = int(r["pitches"])
                psum[c] += pit; pn[c] += 1
                h = hs[(year, r["batter"])]
                h["n"] += 1; h["val"] += VAL[c]; h["pitch"] += pit; h["cls"][c] += 1
                h["ob"] += c in ("1B", "2B", "3B", "HR", "BB")
    lg = {c: psum[c] / pn[c] for c in pn}
    for h in hs.values():
        h["resid"] = h["pitch"] - sum(k * lg[c] for c, k in h["cls"].items())

    # ---------- pass 1: games ----------
    A = defaultdict(lambda: [0, 0.0, 0.0, 0.0])          # (prevtype, bin) -> n, sum res, sumsq res, sum ob res
    S = defaultdict(lambda: [0, 0.0, 0.0, 0.0, 0.0])     # prevtype -> n, sx, sy, sxx, sxy ; plus syy below
    SYY = defaultdict(float)
    B = defaultdict(lambda: [0, 0, 0, 0.0])              # (state, outs, depth) -> n, stay, adv, sum tagvalue
    C = defaultdict(lambda: [0, 0])                      # (year, batter) -> n, scored
    Cl = defaultdict(lambda: [0, 0])                     # outs -> n, scored
    for p in files:
        year = os.path.basename(p)[7:11]
        with open(p) as f:
            for pk, grp in groupby(csv.DictReader(f), key=lambda r: r["game_pk"]):
                rows = list(grp)
                last = {}
                for r in rows:                                         # TEST A
                    team = r["bat_team"]
                    pv = last.get(team)
                    c = classify(r["event"])
                    last[team] = (r["pitcher"], c, int(r["pitches"]), r["inning"], r["half"])
                    if c == "IBB" or pv is None or pv[1] == "IBB":
                        continue
                    if pv[0] != r["pitcher"] or pv[3] != r["inning"] or pv[4] != r["half"]:
                        continue
                    h = hs[(year, r["batter"])]
                    if h["n"] < 100:
                        continue
                    v = VAL[c]
                    ob = 1.0 if c in ("1B", "2B", "3B", "HR", "BB") else 0.0
                    res = v - (h["val"] - v) / (h["n"] - 1)
                    obres = ob - (h["ob"] - ob) / (h["n"] - 1)
                    ptype = "out" if pv[1] in ("K", "IPout") else "reach"
                    pit = pv[2]
                    b = "1-2" if pit <= 2 else str(pit) if pit <= 6 else "7+"
                    a = A[(ptype, b)]
                    a[0] += 1; a[1] += res; a[2] += res * res; a[3] += obres
                    for key in (ptype, "all"):
                        s = S[key]; x = min(pit, 10)
                        s[0] += 1; s[1] += x; s[2] += res; s[3] += x * x; s[4] += x * res
                        SYY[key] += res * res
                halves = defaultdict(list)
                for r in rows:
                    halves[(int(r["inning"]), r["half"])].append(r)
                for hr in halves.values():
                    for i, r in enumerate(hr):
                        b, o = r["base_state"], int(r["outs"])
                        if b[2] == "3" and o < 2 and r["runs_on_play"] != "":      # TEST C
                            sc = 1 if int(r["runs_on_play"]) >= 1 else 0
                            cc = C[(year, r["batter"])]; cc[0] += 1; cc[1] += sc
                            cl = Cl[o]; cl[0] += 1; cl[1] += sc
                        if (r["event"] in FLY_EVENTS and r["bb_type"] in FLY_TYPES
                                and b in ("1__", "_2_", "__3") and o < 2 and r["runs_on_play"] != ""):   # TEST B
                            if i + 1 >= len(hr):
                                continue
                            nx = hr[i + 1]
                            nb, no, runs = nx["base_state"], int(nx["outs"]), int(r["runs_on_play"])
                            if no != o + 1:
                                continue
                            if b == "1__":
                                stay, adv = nb == "1__", nb in ("_2_", "__3") or runs > 0
                            elif b == "_2_":
                                stay, adv = nb == "_2_", nb == "__3" or runs > 0
                            else:
                                stay, adv = nb == "__3" and runs == 0, runs > 0
                            if (nb, no) not in RE:
                                continue
                            rv = runs + RE[(nb, no)] - RE[(b, o)]
                            base = RE[(b, o + 1)] - RE[(b, o)]
                            a = B[(b, o, depth_bucket(r))]
                            a[0] += 1; a[1] += stay; a[2] += adv; a[3] += rv - base

    # ---------- TEST A ----------
    out("TEST A: DOES THE NEXT HITTER DO BETTER AFTER A LONG PLATE APPEARANCE?")
    out("Residual = his result minus his own season average (hitters with 100+ PA). Same pitcher, same inning.")
    out("Runs per 100 PA (+/- standard error); on-base in points. Zero means no effect.\n")
    for ptype, label in (("out", "PREVIOUS HITTER MADE AN OUT (base state unchanged by him)"),
                         ("reach", "PREVIOUS HITTER REACHED BASE (base state changed)")):
        out(label)
        out("  pitches seen by previous hitter      N     runs/100PA        on-base pts")
        for b in ("1-2", "3", "4", "5", "6", "7+"):
            n, sr, ssq, so = A[(ptype, b)]
            if n < 30:
                continue
            m = sr / n
            se = math.sqrt(max(ssq / n - m * m, 0) / n)
            out(f"  {b:>10}                       {n:>7,}   {100*m:+6.2f} +/- {100*se:4.2f}    {1000*so/n:+6.1f}")
        n, sx, sy, sxx, sxy = S[ptype]
        if n > 50:
            cx = sxx - sx * sx / n
            slope = (sxy - sx * sy / n) / cx
            resid_ss = SYY[ptype] - sy * sy / n - slope * (sxy - sx * sy / n)
            se = math.sqrt(max(resid_ss, 0) / (n - 2) / cx)
            out(f"  Slope: {100*slope:+.3f} runs/100PA per extra pitch (+/- {100*se:.3f}) over {n:,} plate appearances\n")

    # ---------- TEST B ----------
    out("\nTEST B: FLY-BALL TAG-UPS (fly ball, line drive or pop-up that is an out, one runner on)")
    out("Worth of the advance in runs (from your run-expectancy table), by outs BEFORE the play:")
    out("  runner on   0 outs before   1 out before   2 outs before")
    for name, st, adv in (("1st -> 2nd", "1__", "_2_"), ("2nd -> 3rd", "_2_", "__3")):
        v = [RE[(adv, o + 1)] - RE[(st, o + 1)] for o in (0, 1)]
        out(f"  {name}     {v[0]:+.3f}          {v[1]:+.3f}          0.000 (inning over)")
    v3 = [1 + RE[("___", o + 1)] - RE[("__3", o + 1)] for o in (0, 1)]
    out(f"  3rd -> home   {v3[0]:+.3f}          {v3[1]:+.3f}          0.000 (inning over)\n")
    out("How often it actually happens, by how far the ball was hit:")
    out("  runner  outs  depth             N    stayed  advanced   runs gained vs staying, per fly out")
    for key in sorted(B):
        n, stay, adv, tv = B[key]
        if n < 50:
            continue
        st, o, d = key
        nm = {"1__": "1st", "_2_": "2nd", "__3": "3rd"}[st]
        out(f"  {nm}     {o}     {d:<15} {n:>6,}   {stay/n:6.1%}   {adv/n:6.1%}    {tv/n:+.3f}")

    # ---------- TEST C ----------
    out("\nTEST C: CASH-IN, RUNNER ON THIRD WITH FEWER THAN TWO OUTS")
    for o in (0, 1):
        n, s = Cl[o]
        out(f"  {o} outs: a run scores on {s/max(n,1):.1%} of {n:,} plate appearances")
    yrs = sorted({k[0] for k in C})
    xs, ys = [], []
    for y0, y1 in zip(yrs, yrs[1:]):
        for (yy, bt), (n0, s0) in list(C.items()):
            if yy != y0:
                continue
            c1 = C.get((y1, bt))
            if c1 and n0 >= 25 and c1[0] >= 25:
                xs.append(s0 / n0); ys.append(c1[1] / c1[0])
    if len(xs) >= 10:
        out(f"  Year-to-year carryover of a hitter's cash-in rate: r = {pearson(xs, ys):.2f} over {len(xs)} pairs (25+ chances each year)")

    # ---------- TEST D ----------
    out("\nTEST D: DOES PITCHES-ABOVE-EXPECTED PREDICT NEXT SEASON, BEYOND THIS SEASON'S PRODUCTION?")
    ys_, x1, x2 = [], [], []
    for y0, y1 in zip(yrs, yrs[1:]):
        for (yy, bt), h in hs.items():
            if yy != y0 or h["n"] < 300:
                continue
            h1 = hs.get((y1, bt))
            if h1 and h1["n"] >= 300:
                ys_.append(h1["val"] / h1["n"]); x1.append(h["val"] / h["n"]); x2.append(h["resid"] / h["n"])
    n = len(ys_)
    if n >= 30:
        r1, r2, r12 = pearson(ys_, x1), pearson(ys_, x2), pearson(x1, x2)
        beta = (r2 - r1 * r12) / (1 - r12 ** 2)
        R2 = (r1 ** 2 + r2 ** 2 - 2 * r1 * r2 * r12) / (1 - r12 ** 2)
        se = math.sqrt((1 - R2) / ((n - 3) * (1 - r12 ** 2)))
        out(f"  Hitter-seasons paired: {n}")
        out(f"  next-year production vs this-year production:        r = {r1:.2f}")
        out(f"  next-year production vs this-year pitches above exp: r = {r2:.2f}")
        out(f"  this-year production vs pitches above expected:      r = {r12:.2f}")
        out(f"  Pitches above expected, controlling for production: standardized effect {beta:+.3f}  (t = {beta/se:+.1f})")
        out("  A t-value near 0 means it adds nothing beyond production; beyond about +/-2 it adds something.")
    with open(os.path.join(OUT_DIR, "chain_tests.txt"), "w") as f:
        f.write("\n".join(LOG))
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()