#!/usr/bin/env python3
"""
projection_upgrades.py: do ballpark effects and aging explain why last season's numbers predicted
team scoring poorly (team-season r 0.35, slope 0.44 in backtest_lineups.py)?

  PART A  Park factors. For each team, its home games against its own road games (same hitters,
          same pitchers, so team quality cancels): runs per plate appearance and home runs per
          plate appearance. Regressed 20% toward 1.0, because four seasons of 81 home games is still a
          noisy ratio. Written to park_factors.csv.
  PART B  Aging. Season-to-season change in each hitter's run value per plate appearance, by age,
          after removing the regression-to-the-mean pull (hitters who were great last year tend to slip,
          at any age). Ages come from the sprint-speed files (age during that season).
  PART C  The projection backtest again, with each adjustment added alone and both together, scored
          the same way as before: only earlier seasons feed each hitter, first eight innings, team-season r,
          slope and RMSE. Park: a game is scaled by its park's factor over the average park exposure the
          hitters' earlier numbers carried (half their plate appearances at their home park).
          Aging: each lineup hitter's expected age change, times about 3.8 plate appearances a game.

Reads  data/bcaa/all_pa_<year>.csv, sprint_speed_<year>.csv, transitions.csv; imports sim_engine.py
       and backtest_lineups.py
Usage (from the theedge folder):
  python3 scripts/bcaa/projection_upgrades.py
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
import backtest_lineups as bt

OUT_DIR = "data/bcaa"
PF_REGRESS = 0.8
PA_PER_HITTER_GAME = 3.8
VALUE = {"single": .47, "double": .76, "triple": 1.04, "home_run": 1.40, "walk": .33, "hit_by_pitch": .33,
         "strikeout": -.27, "strikeout_double_play": -.27, "field_error": .40, "catcher_interf": .40}
AGE_BINS = [(0, 24, "24 and under"), (25, 26, "25-26"), (27, 28, "27-28"), (29, 30, "29-30"),
            (31, 32, "31-32"), (33, 34, "33-34"), (35, 99, "35 and over")]


def years_present():
    return sorted(int(os.path.basename(p)[7:11]) for p in glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))


def load_ages():
    ages = {}
    for p in glob.glob(os.path.join(OUT_DIR, "sprint_speed_20*.csv")):
        y = int(os.path.basename(p)[13:17])
        with open(p) as f:
            for r in csv.DictReader(f):
                try:
                    ages[(y, r["player_id"])] = int(float(r["age"]))
                except (ValueError, KeyError):
                    pass
    return ages


def age_of(ages, y, h):
    if (y, h) in ages:
        return ages[(y, h)]
    if (y - 1, h) in ages:
        return ages[(y - 1, h)] + 1
    return None


# ------------------------------------------------------------------ part A
def park_factors(years):
    home = defaultdict(lambda: [0, 0, 0]); road = defaultdict(lambda: [0, 0, 0])
    for y in years:
        with open(os.path.join(OUT_DIR, f"all_pa_{y}.csv")) as f:
            for r in csv.DictReader(f):
                h = r["bat_team"] if r["half"] == "Bot" else r["fld_team"]
                try:
                    runs = int(r["runs_on_play"])
                except ValueError:
                    continue
                hr = 1 if r["event"] == "home_run" else 0
                for t in (r["bat_team"], r["fld_team"]):
                    a = (home if t == h else road)[t]
                    a[0] += 1; a[1] += runs; a[2] += hr
    pf = {}
    rows = []
    for t in home:
        h, rd = home[t], road[t]
        if h[0] == 0 or rd[0] == 0 or rd[1] == 0 or rd[2] == 0:
            continue
        raw_r = (h[1] / h[0]) / (rd[1] / rd[0])
        raw_h = (h[2] / h[0]) / (rd[2] / rd[0])
        pf[t] = 1 + PF_REGRESS * (raw_r - 1)
        rows.append((t, raw_r, pf[t], 1 + PF_REGRESS * (raw_h - 1), h[0]))
    with open(os.path.join(OUT_DIR, "park_factors.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["team", "run_factor_raw", "run_factor", "hr_factor", "home_pa"])
        for t, a, b, c, n in sorted(rows):
            w.writerow([t, round(a, 4), round(b, 4), round(c, 4), n])
    print("PART A: PARK FACTORS (runs per plate appearance, home games vs the same team's road games)")
    srt = sorted(rows, key=lambda x: -x[2])
    print("  highest: " + ", ".join(f"{t} {b:.3f}" for t, a, b, c, n in srt[:5]))
    print("  lowest:  " + ", ".join(f"{t} {b:.3f}" for t, a, b, c, n in srt[-5:]))
    print(f"  spread across {len(rows)} parks: one standard deviation {math.sqrt(sum((x[2] - 1) ** 2 for x in rows) / len(rows)):.3f} (regressed)")
    return pf


# ------------------------------------------------------------------ part B
def aging(years, ages):
    acc = defaultdict(lambda: [0, 0.0])
    for y in years:
        with open(os.path.join(OUT_DIR, f"all_pa_{y}.csv")) as f:
            for r in csv.DictReader(f):
                if r["event"] == "intent_walk":
                    continue
                a = acc[(y, r["batter"])]
                a[0] += 1; a[1] += VALUE.get(r["event"], -.27)
    val = {k: v[1] / v[0] for k, v in acc.items() if v[0] >= 300}
    pairs = []
    for y0, y1 in zip(years, years[1:]):
        mean0 = sum(v for (y, b), v in val.items() if y == y0) / max(sum(1 for (y, b) in val if y == y0), 1)
        for (y, b), v0 in val.items():
            if y != y0 or (y1, b) not in val:
                continue
            ag = age_of(ages, y1, b)
            if ag is None:
                continue
            pairs.append((ag, v0 - mean0, val[(y1, b)] - v0))
    n = len(pairs)
    if n < 50:
        print("PART B: not enough hitter pairs with ages."); return lambda age: 0.0
    mx = sum(p[1] for p in pairs) / n; my = sum(p[2] for p in pairs) / n
    b = sum((p[1] - mx) * (p[2] - my) for p in pairs) / sum((p[1] - mx) ** 2 for p in pairs)
    print(f"\nPART B: AGING ({n:,} hitter pairs, 300+ plate appearances in both seasons)")
    print(f"  regression to the mean: each 0.01 runs per PA above average last year is followed by {b * 0.01:+.4f} next year")
    bin_mean = {}
    print("  age (next season)   pairs   change per 650 PA, after removing regression to the mean")
    for lo, hi, label in AGE_BINS:
        res = [p[2] - b * p[1] for p in pairs if lo <= p[0] <= hi]
        if len(res) < 15:
            continue
        m = sum(res) / len(res)
        sd = math.sqrt(sum((x - m) ** 2 for x in res) / (len(res) - 1))
        bin_mean[(lo, hi)] = m
        print(f"  {label:18s}  {len(res):5d}   {650 * m:+7.1f} runs  (+/- {650 * sd / math.sqrt(len(res)):.1f})")

    def delta(age):
        if age is None:
            return 0.0
        for (lo, hi), m in bin_mean.items():
            if lo <= age <= hi:
                return m
        return 0.0
    return delta


# ------------------------------------------------------------------ part C
def read_games(year):
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
                    continue
                early = [r for r in rows if int(r["inning"]) <= 8]
                try:
                    actual = max(int(r["post_bat_score"]) for r in early)
                except ValueError:
                    continue
                is_home = rows[0]["half"] == "Bot"
                recs.append({"year": year, "team": team, "lineup": first9, "actual": actual,
                             "starter_left": rows[0]["p_throws"] == "L",
                             "park": team if is_home else rows[0]["fld_team"]})
    return recs


def main():
    years = years_present()
    ages = load_ages()
    pf = park_factors(years)
    delta = aging(years, ages)
    bp_left = bt.bullpen_left_share(years)

    print("\nPART C: PROJECTION BACKTEST WITH ADJUSTMENTS (only earlier seasons feed each hitter)")
    allrows = []
    t0 = time.time()
    for Y in years[1:]:
        prior = [y for y in years if y < Y]
        M = se.Model(seasons=prior, verbose=False)
        cache = {}
        for r in read_games(Y):
            pL = bt.PL_STARTER * r["starter_left"] + (1 - bt.PL_STARTER) * bp_left
            base = bt.mix_runs(M, r["lineup"], pL, cache)
            exposure = (pf.get(r["team"], 1.0) + 1.0) / 2
            parkmult = pf.get(r["park"], 1.0) / exposure
            ag = sum(delta(age_of(ages, Y, h)) for h in r["lineup"]) * PA_PER_HITTER_GAME
            r["base"] = base
            r["parkadj"] = base * parkmult
            r["ageadj"] = base + ag
            r["both"] = base * parkmult + ag
            allrows.append(r)
        print(f"  {Y} scored ({time.time() - t0:.0f}s)")

    ts = bt.team_seasons(allrows)
    N = len(allrows)
    print(f"\nTEAM-SEASON RANKING ({len(ts)} team-seasons) AND SINGLE-GAME (n={N:,})")
    print("                              team-season                  single game")
    print("                              r      RMSE   slope           r")
    for key, label in (("base", "engine as before"), ("parkadj", "+ park factors"),
                       ("ageadj", "+ aging"), ("both", "+ park and aging")):
        tx = [sum(g[key] for g in v) / len(v) for v in ts.values()]
        ty = [sum(g["actual"] for g in v) / len(v) for v in ts.values()]
        e1, b1 = bt.calibrated_rmse(tx, ty)
        r2 = bt.pearson([g[key] for g in allrows], [g["actual"] for g in allrows])
        print(f"  {label:26s}  {bt.pearson(tx, ty):5.2f}  {e1:6.3f}  {b1:5.2f}          {r2:.3f}")
    print("  (same bar as before: team-season r about 0.5 or more, slope 0.7 to 1.3)")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()