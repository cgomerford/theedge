#!/usr/bin/env python3
"""
backtest_lineups.py: step 8. The credibility test.

For every team-game in 2024, 2025 and 2026 it takes the lineup the team really used (its first nine
batters, in order), looks up what each hitter had done in EARLIER seasons only, runs the lineup
through the engine, and compares the predicted runs with the runs the team really scored.
Hitters with no earlier season (rookies) are treated as league average. 2023 has no earlier season,
so it is only used to build hitter profiles.

Only the FIRST EIGHT INNINGS are compared. Every team bats eight innings in every game, so the test cannot
know who won. (How many innings a team bats after that depends on the score: a home team that is ahead
does not bat in the ninth, a tie goes to extras. Scaling by innings batted would build the result into the
prediction.)

Predictors compared (all judged after a straight-line calibration, so only ranking power counts):
  engine        full model: result rates, left/right split, ball-in-play mix, double-play tendency,
                actual batting order, starter handedness plus a bullpen mix
  engine, no DP same, but every hitter gets the league-average double-play tendency
  engine, no platoon  same, but the starter's handedness is ignored (every game gets the same 30% lefty mix)
  plain         add up the nine hitters' linear-weight value per plate appearance; no order, no
                runner movement, no double plays

Also printed: what share of a team's runs score on batter results versus on steals, wild pitches and
the like (which the engine does not model), and a calibration table by predicted-runs decile.

Reads  data/bcaa/all_pa_<year>.csv and transitions.csv; imports sim_engine.py
Usage (from the theedge folder):
  python3 scripts/bcaa/backtest_lineups.py            main test
  python3 scripts/bcaa/backtest_lineups.py --tune     also tries stronger pulls toward league average
"""
import csv
import glob
import math
import os
import sys
import time
from collections import Counter, defaultdict
from itertools import groupby

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_engine as se

OUT_DIR = "data/bcaa"
W = {"1B": .47, "2B": .76, "3B": 1.04, "HR": 1.40, "BB": .33, "K": -.27, "IPOUT": -.27, "ROE": .40}
K0 = 200
PL_STARTER = 0.6


def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs); syy = sum((y - my) ** 2 for y in ys)
    return sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else float("nan")


def calibrated_rmse(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx if sxx else 0.0
    a = my - b * mx
    return math.sqrt(sum((y - (a + b * x)) ** 2 for x, y in zip(xs, ys)) / n), b


def read_team_games(year, bp_left):
    """One record per team-game: lineup, starter hand, actual runs in innings 1-8, runs on batter results."""
    recs = []
    with open(os.path.join(OUT_DIR, f"all_pa_{year}.csv")) as f:
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
                    continue                        # shortened game
                early = [r for r in rows if int(r["inning"]) <= 8]
                try:
                    actual = max(int(r["post_bat_score"]) for r in early)
                    pa_runs = sum(int(r["runs_on_play"]) for r in early)
                except ValueError:
                    continue
                recs.append({"year": year, "game": pk, "team": team, "lineup": first9,
                             "starter_left": rows[0]["p_throws"] == "L",
                             "actual": actual, "pa_runs": pa_runs})
    return recs


def runs_n(M, order, hand, n=8):
    """Expected runs over the first n innings (the engine's own solver, n innings instead of 9)."""
    Ts = [M.table(h, hand) for h in order]
    R, N = M._inning(Ts)
    S = [1.0] + [0.0] * 8
    total = 0.0
    for _ in range(n):
        total += sum(S[b] * R[b] for b in range(9))
        S = [sum(S[b] * N[b][j] for b in range(9)) for j in range(9)]
    return total


def mix_runs(M, order, pL, cache):
    k = (tuple(order), round(pL, 3))
    if k not in cache:
        v = (1 - pL) * runs_n(M, order, "R")
        if pL > 0:
            v += pL * runs_n(M, order, "L")
        cache[k] = v
    return cache[k]


def bullpen_left_share(years):
    n = l = 0
    for y in years:
        with open(os.path.join(OUT_DIR, f"all_pa_{y}.csv")) as f:
            for r in csv.DictReader(f):
                if r["sp_flag"] == "0":
                    n += 1; l += r["p_throws"] == "L"
    return l / max(n, 1)


def plain_value(M, h):
    d = M.H.get(h)
    if not d or not sum(d["n"].values()):
        return 0.0
    n = d["n"]; pa = sum(n.values())
    tot = sum(W[c] * n[c] for c in W)
    lg_mean = 0.0   # league mean of the weights is close to zero by construction of the run values
    return (tot + K0 * lg_mean) / (pa + K0)


BASE_K = dict(se.K_RATE)


def score_all(years, bp_left, kscale=1.0, extras=True):
    """Score every team-game 2nd..last season using only earlier seasons for the hitters."""
    se.K_RATE = {c: v * kscale for c, v in BASE_K.items()}
    allrows = []
    t0 = time.time()
    for Y in years[1:]:
        prior = [y for y in years if y < Y]
        M = se.Model(seasons=prior, verbose=False)
        recs = read_team_games(Y, bp_left)
        cache = {}
        pv = {h: plain_value(M, h) for h in {h for r in recs for h in r["lineup"]}}
        for r in recs:
            pL = PL_STARTER * r["starter_left"] + (1 - PL_STARTER) * bp_left
            r["engine"] = mix_runs(M, r["lineup"], pL, cache)
            r["plain"] = sum(pv[h] for h in r["lineup"]) / 9 * 38.0 * 8 / 9
        if extras:
            for r in recs:
                r["noplat"] = mix_runs(M, r["lineup"], 0.3, cache)
            saved = se.K_DP
            se.K_DP = 1e12
            M2 = se.Model(seasons=prior, verbose=False)
            cache2 = {}
            for r in recs:
                pL = PL_STARTER * r["starter_left"] + (1 - PL_STARTER) * bp_left
                r["nodp"] = mix_runs(M2, r["lineup"], pL, cache2)
            se.K_DP = saved
        allrows += recs
        print(f"  {Y}: {len(recs):,} team-games scored using seasons {prior} ({time.time() - t0:.0f}s)")
    se.K_RATE = dict(BASE_K)
    return allrows


def team_seasons(allrows):
    ts = defaultdict(list)
    for r in allrows:
        ts[(r["year"], r["team"])].append(r)
    return ts


def main():
    years = sorted(int(os.path.basename(p)[7:11]) for p in glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    if len(years) < 2:
        print("Need at least two seasons of all_pa files.", file=sys.stderr); sys.exit(1)
    bp_left = bullpen_left_share(years)
    print(f"Bullpen left-handed share of plate appearances: {bp_left:.1%}; starter weight {PL_STARTER:.0%}")
    allrows = score_all(years, bp_left)

    N = len(allrows)
    print(f"\nTeam-games: {N:,}")
    act = sum(r["actual"] for r in allrows) / N
    par = sum(r["pa_runs"] for r in allrows) / N
    eng = sum(r["engine"] for r in allrows) / N
    print("\nRUNS PER TEAM-GAME, FIRST EIGHT INNINGS")
    print(f"  actual runs scored:                      {act:.3f}")
    print(f"  of which scored on batter results:       {par:.3f}   (the rest, {act - par:.3f}, came on steals, wild pitches, balks and similar)")
    print(f"  engine prediction (average):             {eng:.3f}")
    print(f"  engine minus batter-result runs:         {eng - par:+.3f}")

    print("\nHOW WELL EACH PREDICTOR RANKS TEAMS (higher r is better; RMSE after straight-line calibration)")
    names = [("engine", "engine"), ("nodp", "engine, no double-play info"),
             ("noplat", "engine, no platoon info"), ("plain", "plain linear-weight sum")]
    ts = team_seasons(allrows)
    print("                                   team-season (n=%d)         single game (n=%d)" % (len(ts), N))
    print("                                   r      RMSE   slope       r      RMSE")
    for key, label in names:
        tx = [sum(g[key] for g in v) / len(v) for v in ts.values()]
        ty = [sum(g["actual"] for g in v) / len(v) for v in ts.values()]
        gx = [g[key] for g in allrows]; gy = [g["actual"] for g in allrows]
        r1 = pearson(tx, ty); e1, b1 = calibrated_rmse(tx, ty)
        r2 = pearson(gx, gy); e2, _ = calibrated_rmse(gx, gy)
        print(f"  {label:30s}  {r1:5.2f}  {e1:6.3f}  {b1:5.2f}     {r2:5.3f}  {e2:6.3f}")
    print("  (slope near 1.0 means the model's spread of team quality is about right)")

    print("\nCALIBRATION BY PREDICTED-RUNS DECILE (single games; engine)")
    srt = sorted(allrows, key=lambda r: r["engine"])
    print("  decile   predicted   actual   difference")
    for d in range(10):
        chunk = srt[d * N // 10:(d + 1) * N // 10]
        p = sum(g["engine"] for g in chunk) / len(chunk); a = sum(g["actual"] for g in chunk) / len(chunk)
        print(f"    {d + 1:2d}       {p:6.2f}     {a:6.2f}    {a - p:+6.2f}")

    print("\nBY SEASON (team-season r, engine)")
    for Y in years[1:]:
        v = {k: x for k, x in ts.items() if k[0] == Y}
        tx = [sum(g["engine"] for g in x) / len(x) for x in v.values()]
        ty = [sum(g["actual"] for g in x) / len(x) for x in v.values()]
        print(f"  {Y}: r = {pearson(tx, ty):.2f} over {len(v)} teams")
    if "--tune" in sys.argv:
        print("\nSTRONGER PULL TOWARD LEAGUE AVERAGE (multiplies every regression constant; engine only)")
        print("  scale   team-season r   slope   RMSE     single-game RMSE")
        for ks in (1.0, 2.0, 3.0, 5.0):
            rows = allrows if ks == 1.0 else score_all(years, bp_left, kscale=ks, extras=False)
            v = team_seasons(rows)
            tx = [sum(g["engine"] for g in x) / len(x) for x in v.values()]
            ty = [sum(g["actual"] for g in x) / len(x) for x in v.values()]
            e1, b1 = calibrated_rmse(tx, ty)
            e2, _ = calibrated_rmse([g["engine"] for g in rows], [g["actual"] for g in rows])
            print(f"  {ks:4.1f}      {pearson(tx, ty):5.2f}        {b1:5.2f}   {e1:6.3f}      {e2:6.3f}")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()