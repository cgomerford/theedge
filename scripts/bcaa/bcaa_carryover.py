#!/usr/bin/env python3
"""
bcaa_carryover.py: rebuild BCAA for every hitter-season and measure how much it carries over.

BCAA (bases converted above average): for every runner on base when a hitter bats, the bases that
runner gained (a runner put out counts as minus his starting base, except an out on a single or double
which counts as a normal advance, because the runner's own decision is not the batter's doing) minus
what the average hitter produced for a runner in the same situation: same starting base, same
base/out state, same kind of result. The kind of result pools every ground-ball out together (so a double
play counts against the hitter), and a runner's sprint speed is removed using a slope fitted within
each result type and starting base.

The test that matters: does a hitter's BCAA per opportunity repeat from one season to the next?
Run it on seasons the stat was built on, then add seasons it has never seen (2021, 2022) and read the
new pairs separately. If the earlier seasons' ~0.4 carryover is real and not an artefact of choices
made while looking at them, the unseen pairs should land near it.

Reads  data/bcaa/pa_states_<year>.csv           (build_season.py)
       data/bcaa/sprint_speed_<year>.csv        (fetch_sprint_speed.py; optional, speed is not removed without it)
       and the same two kinds of file from any folder named with --extra, so seasons built somewhere else
       (the 2021-22 confirmation, kept out of the main data folder) can be added.
Usage (from the theedge folder):
  python3 scripts/bcaa/bcaa_carryover.py
  python3 scripts/bcaa/bcaa_carryover.py --extra confirm/data/bcaa
"""
import csv
import glob
import math
import os
import sys
from collections import defaultdict

OUT_DIR = "data/bcaa"
MIN_OPPS = (100, 150, 200)
FLY = {"fly_ball", "line_drive", "popup"}


def kind(event, bb):
    if event == "single": return "1B"
    if event == "double": return "2B"
    if event == "triple": return "3B"
    if event == "home_run": return "HR"
    if event in ("walk", "hit_by_pitch", "intent_walk"): return "BB"
    if event in ("strikeout", "strikeout_double_play"): return "K"
    if event.startswith("sac_bunt") or event in ("catcher_interf", "field_error"): return "OTH"
    if bb == "ground_ball" or event in ("grounded_into_double_play", "force_out", "fielders_choice",
                                         "fielders_choice_out", "double_play", "triple_play"):
        return "GB"
    if bb in FLY: return "AIR"
    return "OTH"


def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else float("nan")


def main():
    dirs = [OUT_DIR]
    for i, a in enumerate(sys.argv):
        if a == "--extra" and i + 1 < len(sys.argv):
            dirs.append(sys.argv[i + 1])
    files = sorted((f for d in dirs for f in glob.glob(os.path.join(d, "pa_states_20[0-9][0-9].csv"))),
                   key=lambda p: os.path.basename(p))
    if not files:
        print("No pa_states_<year>.csv files.", file=sys.stderr); sys.exit(1)
    speed = {}
    for p in (f for d in dirs for f in glob.glob(os.path.join(d, "sprint_speed_20*.csv"))):
        y = os.path.basename(p)[13:17]
        with open(p) as f:
            for r in csv.DictReader(f):
                try:
                    speed[(y, r["player_id"])] = float(r["sprint_speed"])
                except (ValueError, KeyError):
                    pass
    sp_mean = sum(speed.values()) / len(speed) if speed else 27.4
    print(f"Sprint speeds loaded: {len(speed):,} player-seasons (league mean {sp_mean:.2f} ft/s)")

    ev = []          # runner events: year, batter, kind, start, state, outs, gain, speed deviation
    pas = defaultdict(lambda: [0, 0])      # (year, batter) -> [PA with runners on, hits]
    for p in files:
        y = os.path.basename(p)[10:14]
        with open(p) as f:
            for r in csv.DictReader(f):
                if r["valid"] != "True" or r["event"] == "intent_walk":
                    continue
                k = kind(r["event"], r["bb_type"])
                pas[(y, r["batter"])][0] += 1
                pas[(y, r["batter"])][1] += r["event"] in ("single", "double", "triple", "home_run")
                for m in r["runner_moves"].split():
                    rid, rest = m.split(":")
                    s, e = rest.split(">")
                    s = int(s)
                    if e == "out":
                        if r["event"] == "single": gain = 1
                        elif r["event"] == "double": gain = 2
                        else: gain = -s
                    elif e == "4":
                        gain = 4 - s
                    else:
                        gain = int(e) - s
                    sd = speed.get((y, rid))
                    ev.append((y, r["batter"], k, s, r["base_state"], int(r["outs_before"]), gain,
                               (sd - sp_mean) if sd is not None else 0.0))
    print(f"Runner opportunities: {len(ev):,} across {len(files)} seasons")

    # expected gain for the situation: cell mean with a fallback when a cell is thin
    cell, cell2 = defaultdict(lambda: [0.0, 0]), defaultdict(lambda: [0.0, 0])
    for y, b, k, s, st, o, g, d in ev:
        c = cell[(k, s, st, o)]; c[0] += g; c[1] += 1
        c = cell2[(k, s, st)]; c[0] += g; c[1] += 1

    def expected(k, s, st, o):
        c = cell[(k, s, st, o)]
        if c[1] >= 50:
            return c[0] / c[1]
        c = cell2[(k, s, st)]
        return c[0] / c[1]

    # runner speed slope within each result type and starting base
    acc = defaultdict(lambda: [0.0, 0.0, 0])
    for y, b, k, s, st, o, g, d in ev:
        r = g - expected(k, s, st, o)
        a = acc[(k, s)]; a[0] += d * r; a[1] += d * d; a[2] += 1
    slope = {key: (a[0] / a[1] if a[1] > 0 else 0.0) for key, a in acc.items()}

    agg = defaultdict(lambda: [0.0, 0])
    for y, b, k, s, st, o, g, d in ev:
        resid = g - expected(k, s, st, o) - slope[(k, s)] * d
        a = agg[(y, b)]; a[0] += resid; a[1] += 1

    years = sorted({k[0] for k in agg})
    print(f"Seasons: {', '.join(years)}")
    print("\nYEAR-TO-YEAR CARRYOVER (correlation of the same hitter's value per opportunity)")
    print("                      BCAA per opportunity            hit rate in the same plate appearances")
    for mn in MIN_OPPS:
        print(f"  minimum {mn} runner opportunities in each season")
        tot_b, tot_h = ([], []), ([], [])
        for y0, y1 in zip(years, years[1:]):
            xs, ys, hx, hy = [], [], [], []
            for (yy, b), (sr, n) in agg.items():
                if yy != y0 or n < mn:
                    continue
                o = agg.get((y1, b))
                if not o or o[1] < mn:
                    continue
                xs.append(sr / n); ys.append(o[0] / o[1])
                p0, p1 = pas[(y0, b)], pas[(y1, b)]
                hx.append(p0[1] / p0[0]); hy.append(p1[1] / p1[0])
            if len(xs) >= 10:
                print(f"    {y0} -> {y1}: BCAA r = {pearson(xs, ys):.2f}   hit rate r = {pearson(hx, hy):.2f}   ({len(xs)} hitters)")
                tot_b[0].extend(xs); tot_b[1].extend(ys); tot_h[0].extend(hx); tot_h[1].extend(hy)
        if len(tot_b[0]) >= 10:
            print(f"    all pairs together: BCAA r = {pearson(*tot_b):.2f}   hit rate r = {pearson(*tot_h):.2f}   ({len(tot_b[0])} pairs)")

    rows = [(sr / n, pas[k][1] / pas[k][0]) for k, (sr, n) in agg.items() if n >= 150]
    if len(rows) > 10:
        print(f"\nBCAA per opportunity vs hit rate in the same season (150+ opportunities): r = {pearson(*zip(*rows)):.2f}")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()