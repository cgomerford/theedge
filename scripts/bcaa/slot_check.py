#!/usr/bin/env python3
"""
slot_check.py: step 8c. Does the engine reproduce what each lineup slot actually faces?

The slot effects (how many plate appearances a slot gets, and how often they come with the bases
empty, a runner in scoring position, two outs and nobody on, or a double-play chance) are what a
"what is this hitter worth in this slot" answer rests on. This script runs every real lineup from the
latest season through the engine, using that season's own hitter rates, and compares the engine's
expected slot mix with the mix that actually happened. Same team-games, first eight innings.

Pass bar (set before running): plate appearances per game within 0.05; each share within 2 points.

Reads  data/bcaa/all_pa_<year>.csv and transitions.csv; imports sim_engine.py
Usage (from the theedge folder):
  python3 scripts/bcaa/slot_check.py
"""
import csv
import glob
import os
import sys
import time
from collections import Counter, defaultdict
from itertools import groupby

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_engine as se

OUT_DIR = "data/bcaa"
PL_STARTER = 0.6


def visits_for(Ts):
    """V[b] = expected plate appearances by (batter, state) in an inning started by batter b."""
    V = []
    N = [[0.0] * 9 for _ in range(9)]
    for b in range(9):
        vis = [0.0] * 216
        cur = {b * 24: 1.0}
        for _ in range(60):
            new = defaultdict(float)
            for idx, pr in cur.items():
                vis[idx] += pr
                k, s = divmod(idx, 24)
                k2 = k + 1 if k < 8 else 0
                for q, m2, o2, ru in Ts[k][s]:
                    w = pr * q
                    if o2 >= 3:
                        N[b][k2] += w
                    else:
                        new[k2 * 24 + o2 * 8 + m2] += w
            cur = new
            if sum(cur.values()) < 1e-8:
                break
        V.append(vis)
        tot = sum(N[b])
        if tot > 0:
            N[b] = [x / tot for x in N[b]]
    return V, N


def game_visits(M, order, hand, innings=8):
    V, N = visits_for([M.table(h, hand) for h in order])
    S = [1.0] + [0.0] * 8
    out = [0.0] * 216
    for _ in range(innings):
        for b in range(9):
            if S[b]:
                vb, sb = V[b], S[b]
                for i in range(216):
                    out[i] += sb * vb[i]
        S = [sum(S[b] * N[b][j] for b in range(9)) for j in range(9)]
    return out


def classify_state(o, m):
    return {"empty": m == 0, "risp": bool(m & 6), "on1st": bool(m & 1),
            "two_out_none": o == 2 and m == 0, "dp": bool(m & 1) and o < 2}


KEYS = ["empty", "risp", "on1st", "two_out_none", "dp"]


def main():
    years = sorted(int(os.path.basename(p)[7:11]) for p in glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    Y = years[-1]
    bp_left = 0.0
    n = l = 0
    with open(os.path.join(OUT_DIR, f"all_pa_{Y}.csv")) as f:
        for r in csv.DictReader(f):
            if r["sp_flag"] == "0":
                n += 1; l += r["p_throws"] == "L"
    bp_left = l / max(n, 1)
    M = se.Model(seasons=[Y], verbose=False)
    t0 = time.time()

    act = {s: Counter() for s in range(1, 10)}
    games = 0
    jobs = Counter()                                  # (lineup tuple, pL) -> number of team-games
    with open(os.path.join(OUT_DIR, f"all_pa_{Y}.csv")) as f:
        for pk, grp in groupby(csv.DictReader(f), key=lambda r: r["game_pk"]):
            by_team = defaultdict(list)
            for r in grp:
                by_team[r["bat_team"]].append(r)
            for team, rows in by_team.items():
                rows.sort(key=lambda r: int(r["team_pa_n"]))
                first9 = [r["batter"] for r in rows[:9]]
                if len(rows) < 9 or len(set(first9)) < 9:
                    continue
                if len({int(r["inning"]) for r in rows if int(r["inning"]) <= 8}) < 8:
                    continue
                games += 1
                pL = round(PL_STARTER * (rows[0]["p_throws"] == "L") + (1 - PL_STARTER) * bp_left, 3)
                jobs[(tuple(first9), pL)] += 1
                for r in rows:
                    if int(r["inning"]) > 8:
                        continue
                    s = int(r["slot"])
                    m = se.mask_of(r["base_state"]); o = int(r["outs"])
                    a = act[s]
                    a["pa"] += 1
                    for k, v in classify_state(o, m).items():
                        a[k] += v
    print(f"{Y}: {games:,} team-games, {len(jobs):,} distinct lineup-and-pitcher mixes ({time.time() - t0:.0f}s so far)")

    total = [0.0] * 216
    for i, ((order, pL), cnt) in enumerate(jobs.items()):
        vR = game_visits(M, list(order), "R")
        vL = game_visits(M, list(order), "L") if pL > 0 else [0.0] * 216
        for j in range(216):
            total[j] += cnt * ((1 - pL) * vR[j] + pL * vL[j])
        if (i + 1) % 1000 == 0:
            print(f"  {i + 1:,} of {len(jobs):,} ({time.time() - t0:.0f}s)")

    eng = {s: Counter() for s in range(1, 10)}
    for k in range(9):
        for s in range(24):
            v = total[k * 24 + s]
            o, m = divmod(s, 8)
            e = eng[k + 1]
            e["pa"] += v
            for key, flag in classify_state(o, m).items():
                e[key] += v * flag

    print("\nPLATE APPEARANCES PER TEAM-GAME (first eight innings) AND SHARE OF EACH SLOT'S PLATE APPEARANCES")
    print("          PA/game        bases empty      RISP             two out, none on  double-play chance")
    print("slot    eng    act      eng    act       eng    act       eng    act        eng    act")
    worst = [0.0, 0.0]
    for s in range(1, 10):
        e, a = eng[s], act[s]
        row = f" {s}    {e['pa'] / games:5.2f}  {a['pa'] / games:5.2f}"
        worst[0] = max(worst[0], abs(e["pa"] / games - a["pa"] / games))
        for key in ("empty", "risp", "two_out_none", "dp"):
            es, as_ = e[key] / e["pa"], a[key] / a["pa"]
            worst[1] = max(worst[1], abs(es - as_))
            row += f"     {es:5.1%} {as_:5.1%}"
        print(row)
    print(f"\nLargest gap: {worst[0]:.3f} plate appearances per game, {worst[1] * 100:.1f} points on a share")
    print("Pass bar: 0.05 plate appearances, 2.0 points")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()