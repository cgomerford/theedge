#!/usr/bin/env python3
"""
scripts/backtest_game_plan.py

INTERNAL. Replays the Game Plan Card's claims on games that have already been played and measures how often each one held, against a plain baseline. Writes docs/game-plan-backtest.md.
Nothing here is shown on the site: publishing "how accurate the cards are" needs George's decision on the framing (CLAUDE.md section 7).

For every game in the window, for each starter, and for the nine hitters who actually faced him first, each line is rebuilt using ONLY pitches from BEFORE that game's date, then scored against what
happened in the game. No hitter clusters are used (they were fitted on the whole season and would leak the answer); a line is scored only when the hitter's or pitcher's OWN sample reaches the
card's threshold. The window is the last weeks of the regular season, so every game has months of history behind it.

What is scored (same rules and thresholds as scripts/build_game_plan_cards.py):
  first pitch    the hitter's own 0-0 swing rate against that hand (n >= 50) as a probability of swinging at the first pitch; Brier score against the league 0-0 swing rate
  opener         the pitcher's most used two-pitch start against that batter side (n >= 30 plate appearances) vs the first two pitches actually thrown; baselines: the pitcher's overall most used start,
                 and the league's most used start for that hand and side
  two strikes    the pitcher's most used two-strike pitch against that side (n >= 50) vs the two-strike pitches actually thrown; baseline: the league share of that pitch type with two strikes
  damage zones   the hitter's own xwOBA on contact by zone (>= 40 balls in play vs the hand, >= 5 in the zone), level 0/1/2 by league tertiles in the zone, vs the xwOBA of his balls in play in that game,
                 measured as the gap from the league average for that zone
Usage:  python3 scripts/backtest_game_plan.py --from 2026-09-01 --to 2026-09-27 [--cache /path/pitches.pkl]
"""

from __future__ import annotations

import argparse
import datetime as dt
import math
import os
import pickle
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

from supabase import create_client

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
COLS = "id,game_pk,game_date,at_bat_number,pitch_number,pitcher_id,batter_id,pitch_type,description,events,zone,stand,p_throws,balls,strikes,estimated_woba"
WHIFFS = {"swinging_strike", "swinging_strike_blocked", "foul_tip", "missed_bunt"}
FOULS = {"foul", "foul_bunt", "bunt_foul_tip"}
MIN_PRIOR_PITCHES = 300
MIN_FIRST_PITCH, MIN_OPENER_PAS, MIN_TWO_STRIKE, MIN_DAMAGE_BIP, MIN_ZONE_BIP = 50, 30, 50, 40, 5


def load(cache):
    if cache and Path(cache).exists():
        return pd.read_pickle(cache)
    sb = create_client(URL, KEY)
    rows, last, t0 = [], 0, time.time()
    while True:
        for attempt in range(5):
            try:
                got = sb.table("pitch_events").select(COLS).gt("id", last).order("id").limit(1000).execute().data
                break
            except Exception as e:
                print(f"  retry {attempt + 1} after id {last}: {str(e)[:70]}")
                time.sleep(3)
        else:
            sys.exit("Giving up: the database kept refusing.")
        if not got:
            break
        rows.extend(got)
        last = got[-1]["id"]
        if len(rows) % 100000 < 1000:
            print(f"  read {len(rows):,} pitches ({time.time() - t0:.0f}s)")
    df = pd.DataFrame(rows)
    if cache:
        df.to_pickle(cache)
    return df


def ci_prop(k, n):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    h = 1.96 * math.sqrt(max(p * (1 - p), 1e-9) / n)
    return (max(0, p - h), min(1, p + h))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="d0", default="2026-09-01")
    ap.add_argument("--to", dest="d1", default="2026-09-27")
    ap.add_argument("--cache")
    ap.add_argument("--out", default="docs/game-plan-backtest.md")
    a = ap.parse_args()
    if not a.cache and (not URL or not KEY):
        sys.exit("Missing Supabase URL / service key in .env.local")
    df = load(a.cache)
    df = df[df["pitch_type"].notna() & df["pitcher_id"].notna() & df["batter_id"].notna()].copy()
    df = df.sort_values(["game_date", "game_pk", "at_bat_number", "pitch_number"]).reset_index(drop=True)
    print(f"{len(df):,} pitches.")
    epoch = pd.Timestamp("2020-01-01")
    day = (pd.to_datetime(df["game_date"]) - epoch).dt.days.to_numpy()
    d0, d1 = (pd.Timestamp(a.d0) - epoch).days, (pd.Timestamp(a.d1) - epoch).days
    desc = df["description"].fillna("")
    whiff = desc.isin(WHIFFS).to_numpy()
    swing = (desc.isin(WHIFFS) | desc.isin(FOULS) | desc.str.startswith("hit_into_play")).to_numpy()
    bip = desc.str.startswith("hit_into_play").to_numpy()
    zz = ((df["balls"] == 0) & (df["strikes"] == 0)).to_numpy()
    two = (df["strikes"] == 2).to_numpy()
    hand = df["p_throws"].map({"R": 1, "L": 0}).fillna(-1).to_numpy().astype(int)
    stand = df["stand"].map({"R": 1, "L": 0}).fillna(-1).to_numpy().astype(int)
    zone = pd.to_numeric(df["zone"], errors="coerce").to_numpy()
    xw = pd.to_numeric(df["estimated_woba"], errors="coerce").to_numpy()
    ptype = df["pitch_type"].to_numpy()
    pit = df["pitcher_id"].to_numpy().astype(int)
    bat = df["batter_id"].to_numpy().astype(int)
    gpk = df["game_pk"].to_numpy().astype(int)
    pit_pos = {k: v for k, v in df.groupby("pitcher_id").indices.items()}
    bat_pos = {k: v for k, v in df.groupby("batter_id").indices.items()}
    game_pos = {k: v for k, v in df.groupby("game_pk").indices.items()}

    # plate appearances: first two pitches, in order
    first = df[df["pitch_number"] == 1][["game_pk", "at_bat_number", "game_date", "pitcher_id", "batter_id", "stand", "p_throws", "pitch_type"]].rename(columns={"pitch_type": "t1"})
    second = df[df["pitch_number"] == 2][["game_pk", "at_bat_number", "pitch_type"]].rename(columns={"pitch_type": "t2"})
    pa = first.merge(second, on=["game_pk", "at_bat_number"], how="left")
    pa["day"] = (pd.to_datetime(pa["game_date"]) - epoch).dt.days
    pa = pa.sort_values(["day", "game_pk", "at_bat_number"]).reset_index(drop=True)
    pa_by_pitcher = {k: v for k, v in pa.groupby("pitcher_id").indices.items()}
    pa_day = pa["day"].to_numpy()

    # league baselines from BEFORE the window
    pre = day < d0
    lg_pairs = {}
    pre_pa = pa[(pa["day"] < d0) & pa["t2"].notna()]
    for (h, s), g in pre_pa.groupby(["p_throws", "stand"]):
        lg_pairs[(h, s)] = Counter(zip(g["t1"], g["t2"])).most_common(1)[0][0]
    lg_two = defaultdict(Counter)
    m = pre & two & (hand >= 0) & (stand >= 0)
    for h, s, t in zip(hand[m], stand[m], ptype[m]):
        lg_two[(h, s)][t] += 1
    cum_n = {h: np.cumsum(zz & (hand == h)) for h in (0, 1)}
    cum_sw = {h: np.cumsum(zz & (hand == h) & swing) for h in (0, 1)}
    # league tertiles of xwOBA on contact by zone and hand (batter-zone cells with enough balls in play), and league zone means
    mb = pre & bip & ~np.isnan(xw) & (zone >= 1) & (zone <= 9) & (hand >= 0)
    cells = pd.DataFrame({"b": bat[mb], "h": hand[mb], "z": zone[mb].astype(int), "x": xw[mb]})
    tert, zmean = {}, {}
    for (h, z), g in cells.groupby(["h", "z"]):
        c = g.groupby("b")["x"].agg(["count", "mean"])
        c = c[c["count"] >= MIN_ZONE_BIP]["mean"]
        zmean[(h, z)] = float(g["x"].mean())
        if len(c) >= 30:
            tert[(h, z)] = (float(c.quantile(1 / 3)), float(c.quantile(2 / 3)))

    # games and starters: the first PA's pitcher, and the first different pitcher after him
    starters = []
    for gk, g in pa[(pa["day"] >= d0) & (pa["day"] <= d1)].groupby("game_pk"):
        g = g.sort_values("at_bat_number")
        p1 = int(g.iloc[0]["pitcher_id"])
        rest = g[g["pitcher_id"] != p1]
        if rest.empty:
            continue
        starters.append((int(gk), int(g.iloc[0]["day"]), p1))
        starters.append((int(gk), int(g.iloc[0]["day"]), int(rest.iloc[0]["pitcher_id"])))
    print(f"{len(starters)} starter-games in the window.")

    fp_y, fp_card, fp_base = [], [], []
    op = Counter()
    ts = {"pitches": 0, "card_hits": 0, "lg_expected": 0.0, "naive_hits": 0, "top_is_gametop": 0, "starts": 0, "naive_top_is_gametop": 0}
    dmg = defaultdict(list)           # level -> residuals vs league zone mean
    dmg_raw = defaultdict(list)
    used = Counter()

    for gk, D, S in starters:
        k = np.searchsorted(pit_pos[S], np.searchsorted(day, D, "left")) if S in pit_pos else 0
        # pit_pos holds positions; those before the game date are the ones with position < first position of day D
        cut = int(np.searchsorted(day, D, "left"))
        idxP = pit_pos[S][pit_pos[S] < cut]
        if len(idxP) < MIN_PRIOR_PITCHES:
            used["skip_starter_few_pitches"] += 1
            continue
        H = int(pd.Series(hand[idxP]).mode().iloc[0])
        if H < 0:
            continue
        gidx = game_pos[gk]
        gS = gidx[pit[gidx] == S]
        lineup = list(dict.fromkeys(bat[gS].tolist()))[:9]
        used["starter_games"] += 1
        # the pitcher's own PAs before D
        pp = pa_by_pitcher.get(S, np.array([], dtype=int))
        pp = pp[pa_day[pp] < D]
        pas_p = pa.iloc[pp]
        overall = Counter(zip(pas_p["t1"], pas_p["t2"])) if len(pas_p) else Counter()
        overall = Counter({k_: v for k_, v in overall.items() if isinstance(k_[1], str)})
        naive_pair = overall.most_common(1)[0][0] if overall else None
        two_all = Counter(ptype[idxP][two[idxP]])
        naive_two = two_all.most_common(1)[0][0] if two_all else None

        for s in (0, 1):
            sub = pas_p[(pas_p["stand"] == ("R" if s else "L")) & pas_p["t2"].notna()]
            card_pair = None
            if len(sub) >= MIN_OPENER_PAS:
                card_pair = Counter(zip(sub["t1"], sub["t2"])).most_common(1)[0][0]
            # actual PAs in this game against this side
            gpa = pa[(pa["game_pk"] == gk) & (pa["pitcher_id"] == S) & (pa["stand"] == ("R" if s else "L")) & pa["t2"].notna()]
            if card_pair and len(gpa):
                lgp = lg_pairs.get((("R" if H else "L"), ("R" if s else "L")))
                op["pas"] += len(gpa)
                op["card_pair"] += int(((gpa["t1"] == card_pair[0]) & (gpa["t2"] == card_pair[1])).sum())
                op["card_first"] += int((gpa["t1"] == card_pair[0]).sum())
                if naive_pair:
                    op["naive_pair"] += int(((gpa["t1"] == naive_pair[0]) & (gpa["t2"] == naive_pair[1])).sum())
                    op["naive_first"] += int((gpa["t1"] == naive_pair[0]).sum())
                if lgp:
                    op["lg_pair"] += int(((gpa["t1"] == lgp[0]) & (gpa["t2"] == lgp[1])).sum())
                    op["lg_first"] += int((gpa["t1"] == lgp[0]).sum())
            # two strikes
            m2 = two[idxP] & (stand[idxP] == s)
            cnt = Counter(ptype[idxP][m2])
            if sum(cnt.values()) >= MIN_TWO_STRIKE:
                top = cnt.most_common(1)[0][0]
                gm = gS[two[gS] & (stand[gS] == s)]
                if len(gm):
                    n_g = len(gm)
                    ts["pitches"] += n_g
                    ts["card_hits"] += int((ptype[gm] == top).sum())
                    lgc = lg_two[(H, s)]
                    tot = sum(lgc.values())
                    ts["lg_expected"] += n_g * (lgc.get(top, 0) / tot if tot else 0)
                    if naive_two:
                        ts["naive_hits"] += int((ptype[gm] == naive_two).sum())
                    ts["starts"] += 1
                    ts["top_is_gametop"] += int(Counter(ptype[gm]).most_common(1)[0][0] == top)
                    ts["naive_top_is_gametop"] += int(naive_two is not None and Counter(ptype[gm]).most_common(1)[0][0] == naive_two)

        for b in lineup:
            bp = bat_pos.get(b)
            if bp is None:
                continue
            idxB = bp[bp < cut]
            gB = gS[bat[gS] == b]
            # first pitch
            mH = (hand[idxB] == H) & zz[idxB]
            n0 = int(mH.sum())
            if n0 >= MIN_FIRST_PITCH:
                p_card = float(swing[idxB][mH].sum()) / n0
                lgn, lgs = cum_n[H][cut - 1], cum_sw[H][cut - 1]
                p_lg = lgs / lgn if lgn else float("nan")
                for i in gB[zz[gB]]:
                    fp_y.append(int(swing[i])); fp_card.append(p_card); fp_base.append(p_lg)
            # damage zones
            ob = idxB[(hand[idxB] == H) & bip[idxB] & ~np.isnan(xw[idxB]) & (zone[idxB] >= 1) & (zone[idxB] <= 9)]
            if len(ob) >= MIN_DAMAGE_BIP:
                zc = zone[ob].astype(int); xc = xw[ob]
                level = {}
                for z in range(1, 10):
                    c = xc[zc == z]
                    if len(c) >= MIN_ZONE_BIP and (H, z) in tert:
                        t1, t2 = tert[(H, z)]
                        v = float(c.mean())
                        level[z] = 0 if v <= t1 else 1 if v <= t2 else 2
                for i in gB[bip[gB] & ~np.isnan(xw[gB]) & (zone[gB] >= 1) & (zone[gB] <= 9)]:
                    z = int(zone[i])
                    if z in level and (H, z) in zmean:
                        dmg[level[z]].append(float(xw[i]) - zmean[(H, z)])
                        dmg_raw[level[z]].append(float(xw[i]))

    # ── results ──
    y, pc, pb = np.array(fp_y, float), np.array(fp_card, float), np.array(fp_base, float)
    ok = ~np.isnan(pb)
    y, pc, pb = y[ok], pc[ok], pb[ok]
    brier_c, brier_b = float(np.mean((pc - y) ** 2)), float(np.mean((pb - y) ** 2))
    corr = float(np.corrcoef(pc, y)[0, 1]) if len(y) > 2 else float("nan")
    qs = np.quantile(pc, [0, .25, .5, .75, 1.0])
    bins = []
    for lo, hi in zip(qs[:-1], qs[1:]):
        mk = (pc >= lo) & (pc <= hi) if hi == qs[-1] else (pc >= lo) & (pc < hi)
        if mk.sum():
            bins.append((float(pc[mk].mean()), float(y[mk].mean()), int(mk.sum())))
    rng = np.random.default_rng(3)

    def boot_diff(a_, b_):
        if len(a_) < 5 or len(b_) < 5:
            return (float("nan"),) * 3
        A, B = np.array(a_), np.array(b_)
        d = [rng.choice(A, len(A)).mean() - rng.choice(B, len(B)).mean() for _ in range(1000)]
        return (float(A.mean() - B.mean()), float(np.quantile(d, .025)), float(np.quantile(d, .975)))

    gap = boot_diff(dmg[2], dmg[0])
    pct = lambda k_, n_: f"{100 * k_ / n_:.1f}%" if n_ else "n/a"
    ci = lambda k_, n_: (lambda c_: f"{100 * c_[0]:.1f}–{100 * c_[1]:.1f}%")(ci_prop(k_, n_))

    L = []
    L.append("# Game Plan Card backtest\n")
    L.append(f"Internal. Written {dt.date.today()} by `scripts/backtest_game_plan.py`. **Not for publication:** how accurate the cards are needs your decision on the framing first (CLAUDE.md section 7).\n")
    L.append(f"**Window:** games from {a.d0} to {a.d1} (the last weeks of the regular season). **{used['starter_games']} starter-games** scored ({used['skip_starter_few_pitches']} skipped for fewer than {MIN_PRIOR_PITCHES} earlier pitches). For each, the nine hitters who actually faced the starter first.\n")
    L.append("**Method:** every line is rebuilt from pitches **before the game date only**, using the card's own thresholds, then scored on that one game. Hitter groups (\"hitters like him\") are not used, because they were fitted on the whole season and would leak the answer; a line is scored only when the hitter's or pitcher's own history reaches the threshold. Each is set against a plain baseline, because a hit rate on its own says little.\n")
    L.append("## 1. First pitch: does a hitter's own 0-0 swing rate tell you anything?\n")
    L.append(f"{len(y):,} first pitches. Score = Brier score (lower is better; it rewards getting the probability right, not just the call). Card (his own rate, n >= {MIN_FIRST_PITCH} at 0-0): **{brier_c:.4f}**. Baseline (league 0-0 swing rate for that hand): **{brier_b:.4f}**. Skill over the baseline: **{100 * (1 - brier_c / brier_b):+.1f}%**. Correlation between the card's rate and swinging: **{corr:.3f}**.\n")
    L.append("| Card said (average) | Actually swung | First pitches |\n|---|---|---|")
    for m_, a_, n_ in bins:
        L.append(f"| {100 * m_:.0f}% | {100 * a_:.0f}% | {n_:,} |")
    L.append("")
    L.append("## 2. Opener: did he open with the two pitches the card named?\n")
    n_ = op["pas"]
    L.append(f"{n_:,} plate appearances where the card had an opener (the pitcher's own start against that side, n >= {MIN_OPENER_PAS}).\n")
    L.append("| | Both pitches matched | 95% range | First pitch matched |\n|---|---|---|---|")
    L.append(f"| **Card** (his most used start against that side) | **{pct(op['card_pair'], n_)}** | {ci(op['card_pair'], n_)} | {pct(op['card_first'], n_)} |")
    L.append(f"| Baseline: his most used start overall | {pct(op['naive_pair'], n_)} | {ci(op['naive_pair'], n_)} | {pct(op['naive_first'], n_)} |")
    L.append(f"| Baseline: the league's most used start for that hand and side | {pct(op['lg_pair'], n_)} | {ci(op['lg_pair'], n_)} | {pct(op['lg_first'], n_)} |")
    L.append("")
    L.append("## 3. Two strikes: was the card's two-strike pitch the one he threw?\n")
    P = ts["pitches"]
    L.append(f"{P:,} two-strike pitches across {ts['starts']} starter-sides where the card had a pitch (his most used two-strike pitch against that side, n >= {MIN_TWO_STRIKE}).\n")
    L.append("| | Share of his two-strike pitches that were that type | 95% range |\n|---|---|---|")
    L.append(f"| **Card's pitch** | **{pct(ts['card_hits'], P)}** | {ci(ts['card_hits'], P)} |")
    L.append(f"| Baseline: how often the league throws that pitch with two strikes | {100 * ts['lg_expected'] / P:.1f}% | |")
    L.append(f"| Baseline: his most used two-strike pitch overall | {pct(ts['naive_hits'], P)} | {ci(ts['naive_hits'], P)} |")
    L.append(f"\nThe card's pitch was his most thrown two-strike pitch in the game in **{ts['top_is_gametop']} of {ts['starts']}** starter-sides ({pct(ts['top_is_gametop'], ts['starts'])}); the overall-habit baseline in {ts['naive_top_is_gametop']} ({pct(ts['naive_top_is_gametop'], ts['starts'])}).\n")
    L.append("## 4. Damage zones: do the hot zones hold up?\n")
    L.append("Balls in play in the game, grouped by the card's level for that zone (0 little, 1 some, 2 most damage). Shown as xwOBA and as the gap from the league average for that same zone, so a middle-middle ball is not compared with a ball on the edge.\n")
    L.append("| Card's level | Balls in play | Mean xwOBA | Gap from league average for the zone |\n|---|---|---|---|")
    for lv, nm in ((0, "Little damage"), (1, "Some damage"), (2, "Most damage")):
        r = dmg[lv]
        L.append(f"| {nm} | {len(r):,} | {np.mean(dmg_raw[lv]):.3f} | {np.mean(r):+.3f} |" if r else f"| {nm} | 0 | n/a | n/a |")
    L.append(f"\nMost damage minus little damage: **{gap[0]:+.3f} xwOBA** (95% range {gap[1]:+.3f} to {gap[2]:+.3f}, by resampling).\n")
    L.append("## How to read this\n")
    L.append("- These are descriptions that held or did not, not forecasts. A card line is a count of what has happened; this checks whether the same patterns showed up the next night.")
    L.append("- A line that only matches its baseline is telling you what the baseline already says. The useful number is the gap over the baseline, with its range.")
    L.append("- One game per hitter is a small sample, so single-game results are noisy; the figures above pool every game in the window.")
    L.append("- Not scored: the second-look line (its counts were built from the whole season), the hitter-group fallbacks, and the league endings on the opener (they describe at-bats, not the opener itself).")
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
