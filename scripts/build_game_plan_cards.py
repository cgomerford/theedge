#!/usr/bin/env python3
"""
scripts/build_game_plan_cards.py

Builds game_plan_cards (supabase/migrations/20261030160000_second_look_game_plan.sql): one card per game and probable starter, one line per hitter in the opposing lineup, from
what has already happened in the season BEFORE the game date. The Sequencing Lab's Game Plan Card page only reads these rows.

TABLE OWNERSHIP: this script is the SINGLE writer of game_plan_cards. It upserts by (game_pk, pitcher_id); re-running a date rebuilds its cards (for example once a lineup is posted).

Inputs: the MLB schedule for the date (probable starters and posted lineups, free, no key), pitch_events (the season so far), hitter_clusters / hitter_cluster_defs,
second_look_summary, stuff_lab_pitch_grades, game_lineups (recent lineups) and league_ab_index (the at-bat file, matched here with numpy exactly as src/lib/sequencing-lab/ab-index.ts does).
Lineup: the club's posted lineup when 9 names are posted (lineup_source 'posted'); otherwise the club's most common lineup against that pitcher hand over the last 14 days
(lineup_source 'recent_vs_hand', shown as "Recent lineup vs RHP/LHP"). A card is skipped, with the reason printed, when a starter has no pitches this season or fewer than 3 recent games are usable.

Bench: up to BENCH_SIZE other hitters from the club's recent lineups get the same lines (card.bench).
Per hitter (own data when its sample reaches the threshold, otherwise his cluster's, otherwise "small sample"; the source is stored beside every figure):
  first_pitch   swing rate at 0-0 against that hand, with the number of 0-0 pitches
  opener        the pitcher's most used two-pitch start against that batter side, plain zone labels, and the league endings of at-bats that open with pitches shaped like his
  two_strikes   the pitcher's most used two-strike pitch against that side, its zone, and the whiff rate (whiffs / swings) on pitches shaped like it, two strikes, by hitters in the cluster
  damage_zones  zones 1-9 as level 0/1/2 from xwOBA on contact against that hand, by the league tertiles in the same zone; plus the worst zone in words
  second_look   his most common way of being retired against this hand and the matching second_look_summary line (batter if enough pairs, else cluster, else league)
Thresholds below mirror src/lib/min-sample.ts (gamePlan* keys). Nothing is a forecast: every line is a count of what has happened.

Usage:  python3 scripts/build_game_plan_cards.py --date 2026-10-26 [--game-pk N] [--dry-run] [--force-recent]
        python3 scripts/build_game_plan_cards.py --from 2026-09-01 --to 2026-09-27      # back-date a range (reads the season once)
A date that is already past is BACK-DATED: only what was known before that day is used (see build_for_date), and the card says so (card.backdated).
Prints one full card as JSON and a summary, then waits 5 seconds (Ctrl+C aborts) before writing.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import gzip
import json
import math
import os
import ssl
import struct
import sys
import time
import urllib.request
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
MLB = "https://statsapi.mlb.com/api/v1"

MIN_FIRST_PITCH = 50      # 0-0 pitches he has seen against the hand        (min-sample.ts gamePlanFirstPitch)
MIN_OPENER_ABS = 15       # league at-bats behind the opener line           (gamePlanOpenerAbs)
MIN_TWO_STRIKE_SWINGS = 30  # swings behind a two-strike whiff rate         (gamePlanTwoStrikeSwings)
MIN_DAMAGE_BIP = 40       # his balls in play against the hand, all zones   (gamePlanDamageBip)
MIN_ZONE_BIP = 5          # balls in play in one zone for his own cell
MIN_CLUSTER_ZONE_BIP = 15
MIN_RETIRED = 10          # his outs against the hand before his own "most common way" is used
SECOND_LOOK_MIN = 15      # second at-bats per group                        (secondLookGroup)
SPEED_WIN, MOVE_WIN = 1.5, 3.0
RECENT_DAYS = 14
EPOCH = dt.date(2020, 1, 1)
BENCH_SIZE = 6            # extra hitters stored per card for Build your own card
BALLS = {"ball", "blocked_ball", "pitchout", "automatic_ball", "intent_ball", "hit_by_pitch"}
WHIFFS = {"swinging_strike", "swinging_strike_blocked", "foul_tip", "missed_bunt"}
FOULS = {"foul", "foul_bunt", "bunt_foul_tip"}
HITS = {"single", "double", "triple", "home_run"}
OUT_EVENTS = {"field_out", "force_out", "grounded_into_double_play", "double_play", "triple_play", "fielders_choice", "fielders_choice_out", "sac_fly", "sac_bunt", "sac_fly_double_play", "sac_bunt_double_play"}
TYPES = ["FF", "SI", "FC", "SL", "ST", "SV", "CU", "KC", "CS", "CH", "FS", "FO", "EP", "KN", "SC", "?"]
OUTCOMES = ["unknown", "K", "BB", "HBP", "1B", "2B", "3B", "HR", "OUT", "OTHER"]
COLS = "id,game_pk,game_date,at_bat_number,pitch_number,pitcher_id,batter_id,pitch_type,release_speed,description,events,zone,pfx_x,pfx_z,stand,p_throws,balls,strikes,estimated_woba"


def http_json(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "x9lab-game-plan-cards"})
            try:
                import certifi          # some Python installs (python.org on macOS) have no system certificates; certifi ships with the supabase client
                ctx = ssl.create_default_context(cafile=certifi.where())
            except Exception:
                ctx = None
            with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
                return json.loads(r.read())
        except Exception as e:
            print(f"  retry {attempt + 1} ({url[:70]}): {str(e)[:60]}")
            time.sleep(3)
    return None


def with_retry(fn, what):
    for attempt in range(4):
        try:
            return fn()
        except Exception as e:
            print(f"  retry {attempt + 1} ({what}): {str(e)[:80]}")
            time.sleep(3)
    sys.exit(f"Giving up on {what}. Nothing was written.")


# ── zone words (catcher's view; the batter's side decides which column is "in") ──
def zone_label(z, stand):
    if z is None or (isinstance(z, float) and math.isnan(z)):
        return None
    z = int(z)
    inside_left = stand == "R"       # a right-handed batter stands on the left of the plate in the catcher's view
    if 1 <= z <= 9:
        row, col = (z - 1) // 3, (z - 1) % 3          # row 0 up .. 2 down; col 0 left .. 2 right (catcher's view)
        side = ("in" if inside_left else "away") if col == 0 else ("away" if inside_left else "in") if col == 2 else None
        vert = ["up", None, "low"][row]
        if side is None:
            return {0: "up", 1: "middle", 2: "low"}[row]
        return f"{vert}-{side}" if vert else side if row == 1 else side
    if z in (11, 13):                                     # outside the zone, catcher's left
        inside = inside_left
    elif z in (12, 14):
        inside = not inside_left
    else:
        return None
    if z in (11, 12):
        return "up and in" if inside else "up and away"
    return "back foot" if inside else "down-away"


def load_pitches(sb, before):
    rows, last, t0 = [], 0, time.time()
    while True:
        got = with_retry(lambda: sb.table("pitch_events").select(COLS).gte("game_date", f"{before[:4]}-01-01").lt("game_date", before).gt("id", last).order("id").limit(1000).execute().data, f"pitches after id {last}")
        if not got:
            break
        rows.extend(got)
        last = got[-1]["id"]
        if len(rows) % 100000 < 1000:
            print(f"  read {len(rows):,} pitches ({time.time() - t0:.0f}s)")
    df = pd.DataFrame(rows)
    for c in ("release_speed", "pfx_x", "pfx_z", "estimated_woba", "zone"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["hb"] = np.where(df["p_throws"] == "R", -1.0, 1.0) * df["pfx_x"] * 12
    df["ivb"] = df["pfx_z"] * 12
    d = df["description"].fillna("")
    df["whiff"] = d.isin(WHIFFS)
    df["swing"] = df["whiff"] | d.isin(FOULS) | d.str.startswith("hit_into_play")
    df["bip"] = d.str.startswith("hit_into_play")
    return df


def load_ab_index(sb, season):
    parts = with_retry(lambda: sb.table("league_ab_index").select("part,data").eq("season", season).order("part").execute().data, "ab index")
    if not parts:
        return None
    blob = gzip.decompress(base64.b64decode("".join(p["data"] for p in parts)))
    hl = struct.unpack("<I", blob[4:8])[0]
    h = json.loads(blob[8:8 + hl])
    n, m, o = h["nPitches"], h["nAbs"], 8 + hl
    take = lambda dtype, c: np.frombuffer(blob, dtype, c, o)
    ix = {}
    for name, dtype, cnt in [("type", np.uint8, n), ("speed2", np.uint8, n), ("hb2", np.int8, n), ("ivb2", np.int8, n), ("zone", np.uint8, n), ("res", np.uint8, n)]:
        ix[name] = take(dtype, cnt); o += cnt * np.dtype(dtype).itemsize
    for name, dtype in [("start", "<u4"), ("pitcher", "<u4"), ("batter", "<u4"), ("gamepk", "<u4"), ("date", "<u2"), ("len", np.uint8), ("hand", np.uint8), ("stand", np.uint8), ("outcome", np.uint8)]:
        ix[name] = take(dtype, m); o += m * np.dtype(dtype).itemsize
    ix["meta"] = h
    return ix


def open_stack_endings(ix, hand, stand, shapes, cutoff=None):
    """At-bats that open with pitches shaped like `shapes` (list of (type, speed, hb, ivb)): same windows as the Sequencing Lab matcher. Returns (n, k, hit)."""
    if ix is None or len(shapes) < 1:
        return 0, 0, 0
    mask = (ix["hand"] == (1 if hand == "L" else 0)) & (ix["stand"] == (1 if stand == "L" else 0)) & (ix["len"] >= len(shapes))
    if cutoff is not None:
        mask &= ix["date"] < cutoff          # only at-bats from BEFORE this day (days since 2020-01-01), so a back-dated card never sees the future
    for j, (t, sp, hb, ivb) in enumerate(shapes):
        ti = ix["meta"]["types"].index(t) if t in ix["meta"]["types"] else -1
        p = ix["start"] + j
        ok = (ix["type"][np.minimum(p, len(ix["type"]) - 1)] == ti)
        s2, h2, v2 = ix["speed2"][np.minimum(p, len(ix["type"]) - 1)].astype(float), ix["hb2"][np.minimum(p, len(ix["type"]) - 1)].astype(float), ix["ivb2"][np.minimum(p, len(ix["type"]) - 1)].astype(float)
        ok &= (s2 > 0) & (s2 >= (sp - SPEED_WIN) * 2) & (s2 <= (sp + SPEED_WIN) * 2) & (h2 != -128) & (h2 >= (hb - MOVE_WIN) * 2) & (h2 <= (hb + MOVE_WIN) * 2) & (v2 != -128) & (v2 >= (ivb - MOVE_WIN) * 2) & (v2 <= (ivb + MOVE_WIN) * 2)
        mask &= ok
    oc = ix["outcome"][mask]
    names = ix["meta"]["outcomes"]
    c = Counter(names[i] for i in oc)
    return int(mask.sum()), c.get("K", 0), sum(c.get(k, 0) for k in ("1B", "2B", "3B", "HR"))


def pct(a, b):
    return round(100 * a / b, 1) if b else None


def second_look_before(sb, cache, scope, sid, hand, stand, cls, pitch, before):
    """The second-look counts from league_pa_pairs using ONLY games before `before` (a back-dated card must not see later games). Same shape as a second_look_summary row, or []."""
    key = (scope, sid, hand, stand, cls, pitch, before)
    if key in cache:
        return cache[key]
    def page(off):
        q = (sb.table("league_pa_pairs").select("ab2_opened_same,ab2_first_pitch_type").eq("p_throws", hand).eq("stand", stand)
             .eq("ab1_result_class", cls).eq("ab1_final_pitch_type", pitch).lt("game_date", before))
        if scope == "batter":
            q = q.eq("batter_id", sid)
        return q.order("game_pk").order("batter_id").order("ab1_at_bat_number").range(off, off + 999).execute().data
    rows, off = [], 0
    while True:
        got = with_retry(lambda: page(off), "pairs before the date")
        rows += got
        if len(got) < 1000:
            break
        off += 1000
    n = len(rows)
    same = sum(1 for r in rows if r["ab2_opened_same"])
    out = [{"n_pairs": n, "n_opened_same": same, "n_opened_other": n - same, "first_pitch_mix": dict(Counter(r["ab2_first_pitch_type"] for r in rows))}] if n else []
    cache[key] = out
    return out


def build_for_date(a, sb, df_all, ix, cl, defs, members, season, backdated):
    """The cards for every game on a.date. Uses only pitches before that date. When `backdated` (the date is already past) nothing from after it is used: the hitter groups are off
    (they were fitted on the whole season), the league endings and second-look counts are cut at the date, and the end-of-season Stuff grade is left off."""
    target = dt.date.fromisoformat(a.date)
    sched = http_json(f"{MLB}/schedule?sportId=1&date={a.date}&hydrate=probablePitcher,lineups,team,venue")
    games = [g for d in (sched or {}).get("dates", []) for g in d.get("games", [])]
    if a.game_pk:
        games = [g for g in games if g["gamePk"] == a.game_pk]
    print(f"{len(games)} games on {a.date}.")
    if not games:
        return [], []
    df = df_all[df_all["game_date"] < a.date]
    cutoff = (target - EPOCH).days
    sl_cache = {}

    def get_sl(scope, sid, hand, st, kcls, kpitch):
        if backdated:
            return second_look_before(sb, sl_cache, scope, sid, hand, st, kcls, kpitch, a.date)
        return with_retry(lambda: sb.table("second_look_summary").select("n_pairs,n_opened_same,n_opened_other,first_pitch_mix").eq("season", season).eq("scope_type", scope).eq("scope_id", sid)
                          .eq("p_throws", hand).eq("stand", st).eq("look_number", 0).eq("ab1_result_class", kcls).eq("ab1_final_pitch_type", kpitch).limit(1).execute().data, "second look")

    # league tertiles of xwOBA on contact per zone and pitcher hand (cells with enough balls in play)
    bip = df[df["bip"] & df["estimated_woba"].notna() & df["zone"].between(1, 9)]
    tert = {}
    for (h, z), g in bip.groupby(["p_throws", "zone"]):
        cells = g.groupby("batter_id")["estimated_woba"].agg(["count", "mean"])
        cells = cells[cells["count"] >= MIN_ZONE_BIP]["mean"]
        if len(cells) >= 30:
            tert[(h, int(z))] = (float(cells.quantile(1 / 3)), float(cells.quantile(2 / 3)))

    cards, skipped = [], []
    for g in games:
        gp = g["gamePk"]
        away, home = g["teams"]["away"], g["teams"]["home"]
        for side, opp_side in (("home", "away"), ("away", "home")):
            tm, opp = g["teams"][side], g["teams"][opp_side]
            pp = tm.get("probablePitcher")
            if not pp:
                skipped.append((gp, side, "no probable starter"))
                continue
            pid = pp["id"]
            mine = df[df["pitcher_id"] == pid]
            if mine.empty:
                skipped.append((gp, side, f"{pp.get('fullName')}: no pitches before {a.date}"))
                continue
            hand = mine["p_throws"].mode().iloc[0]
            # lineup
            posted = (g.get("lineups") or {}).get("homePlayers" if opp_side == "home" else "awayPlayers") or []
            abbr = opp["team"].get("abbreviation")
            recent = df[(df["game_date"] >= str(target - dt.timedelta(days=RECENT_DAYS))) & (df["game_date"] < a.date)]["game_pk"].unique().tolist()
            rows = []
            for off in range(0, len(recent), 100):
                rows += with_retry(lambda: sb.table("game_lineups").select("game_pk,batting_order,player_id,player_name").eq("team_abbr", abbr).in_("game_pk", recent[off:off + 100]).execute().data, "lineups")
            if len(posted) == 9 and not a.force_recent:
                lineup = [{"id": p["id"], "name": p["fullName"], "slot": i + 1} for i, p in enumerate(posted)]
                source = "posted"
            else:
                by_game = defaultdict(list)
                for r in rows:
                    by_game[r["game_pk"]].append(r)
                used = []
                for gk, lr in by_game.items():
                    ids = {r["player_id"] for r in lr}
                    sub = df[(df["game_pk"] == gk) & df["batter_id"].isin(ids)].sort_values(["at_bat_number", "pitch_number"])
                    if not sub.empty and sub.iloc[0]["p_throws"] == hand and len(lr) >= 9:
                        used.append(lr)
                if len(used) < 3:
                    skipped.append((gp, side, f"{pp.get('fullName')}: only {len(used)} recent games for {abbr} against {hand}HP, so no recent lineup"))
                    continue
                cnt, slot, name = Counter(), defaultdict(list), {}
                for lr in used:
                    for r in lr:
                        cnt[r["player_id"]] += 1; slot[r["player_id"]].append(r["batting_order"]); name[r["player_id"]] = r["player_name"]
                top = sorted(cnt, key=lambda i: (-cnt[i], np.mean(slot[i])))[:9]
                top = sorted(top, key=lambda i: np.mean(slot[i]))
                lineup = [{"id": i, "name": name[i], "slot": k + 1} for k, i in enumerate(top)]
                source = "recent_vs_hand"
            # arsenal
            tot = len(mine)
            arsenal = []
            stuff = {} if backdated else {r["pitch_type"]: r["stuff_grade"] for r in with_retry(lambda: sb.table("stuff_lab_pitch_grades").select("pitch_type,stuff_grade").eq("pitcher_id", pid).eq("season", season).execute().data, "stuff")}
            for t, gg in mine.groupby("pitch_type"):
                arsenal.append({"type": t, "n": int(len(gg)), "usage": round(100 * len(gg) / tot, 1), "speed": round(float(gg["release_speed"].mean()), 1) if gg["release_speed"].notna().any() else None,
                                "ivb": round(float(gg["ivb"].mean()), 1) if gg["ivb"].notna().any() else None, "hb": round(float(gg["hb"].mean()), 1) if gg["hb"].notna().any() else None,
                                "stuff": round(float(stuff[t]), 0) if stuff.get(t) is not None else None})
            arsenal.sort(key=lambda r: -r["usage"])
            shape = {r["type"]: (r["speed"], r["hb"], r["ivb"]) for r in arsenal}

            def stand_stats(s):
                """The pitcher's own opener and two-strike lines against batters hitting from side s."""
                m = mine[mine["stand"] == s]
                first = m[m["pitch_number"] <= 2].sort_values(["game_pk", "at_bat_number", "pitch_number"])
                pairs = Counter(); zones = defaultdict(list)
                for (_, _), pp_ in first.groupby(["game_pk", "at_bat_number"]):
                    if len(pp_) == 2 and pp_["pitch_type"].notna().all():
                        k = tuple(pp_["pitch_type"]); pairs[k] += 1
                        zones[k].append(tuple(pp_["zone"]))
                opener = None
                if pairs:
                    k, n_ = pairs.most_common(1)[0]
                    zz = [zone_label(Counter(z[i] for z in zones[k] if not math.isnan(z[i])).most_common(1)[0][0], s) if any(not math.isnan(z[i]) for z in zones[k]) else None for i in (0, 1)]
                    shapes = [(t, *shape[t]) for t in k if t in shape and None not in shape[t]]
                    n_l, k_l, h_l = open_stack_endings(ix, hand, s, shapes, cutoff) if len(shapes) == 2 else (0, 0, 0)
                    opener = {"pitches": list(k), "zones": zz, "pitcher_n": int(n_), "league_n": n_l, "k_pct": pct(k_l, n_l) if n_l >= MIN_OPENER_ABS else None, "hit_pct": pct(h_l, n_l) if n_l >= MIN_OPENER_ABS else None}
                two = m[m["strikes"] == 2]
                ts = None
                if len(two):
                    t = two["pitch_type"].value_counts().index[0]
                    zt = two[two["pitch_type"] == t]["zone"].dropna()
                    ts = {"type": t, "zone": zone_label(zt.mode().iloc[0], s) if len(zt) else None, "pitcher_n": int((two["pitch_type"] == t).sum())}
                return opener, ts
            side_stats = {s: stand_stats(s) for s in ("L", "R")}

            def build_hitter(h):
                b = h["id"]
                bm = df[df["batter_id"] == b]
                vs = bm[bm["p_throws"] == hand]
                st = (vs["stand"].mode().iloc[0] if len(vs) else (bm["stand"].mode().iloc[0] if len(bm) else None))
                c = cl.get((b, hand))
                label = defs.get(("vs RHP" if hand == "R" else "vs LHP", c)) if c is not None else None
                cmem = members.get((hand, c), set()) if c is not None else set()
                # first pitch
                z00 = vs[(vs["balls"] == 0) & (vs["strikes"] == 0)]
                fp = {"value": None, "n": int(len(z00)), "source": None}
                if len(z00) >= MIN_FIRST_PITCH:
                    fp.update(value=pct(int(z00["swing"].sum()), len(z00)), source="own")
                elif cmem:
                    cz = df[df["batter_id"].isin(cmem) & (df["p_throws"] == hand) & (df["balls"] == 0) & (df["strikes"] == 0)]
                    if len(cz) >= MIN_FIRST_PITCH:
                        fp.update(value=pct(int(cz["swing"].sum()), len(cz)), n=int(len(cz)), source="cluster")
                opener, ts = side_stats.get(st, (None, None)) if st else (None, None)
                twos = None
                if ts:
                    sp, hb, ivb = shape.get(ts["type"], (None, None, None))
                    twos = dict(ts, whiff_pct=None, swings=0, source=None)
                    if sp is not None and hb is not None and ivb is not None:
                        lg = df[(df["p_throws"] == hand) & (df["pitch_type"] == ts["type"]) & (df["strikes"] == 2) & df["release_speed"].between(sp - SPEED_WIN, sp + SPEED_WIN) & df["hb"].between(hb - MOVE_WIN, hb + MOVE_WIN) & df["ivb"].between(ivb - MOVE_WIN, ivb + MOVE_WIN)]
                        own = lg[lg["batter_id"] == b]
                        if own["swing"].sum() >= MIN_TWO_STRIKE_SWINGS:
                            twos.update(whiff_pct=pct(int(own["whiff"].sum()), int(own["swing"].sum())), swings=int(own["swing"].sum()), source="own")
                        elif cmem:
                            cg = lg[lg["batter_id"].isin(cmem)]
                            if cg["swing"].sum() >= MIN_TWO_STRIKE_SWINGS:
                                twos.update(whiff_pct=pct(int(cg["whiff"].sum()), int(cg["swing"].sum())), swings=int(cg["swing"].sum()), source="cluster")
                # damage zones
                ob = vs[vs["bip"] & vs["estimated_woba"].notna() & vs["zone"].between(1, 9)]
                use_own = len(ob) >= MIN_DAMAGE_BIP
                src = "own" if use_own else ("cluster" if cmem else None)
                pool = ob if use_own else (bip[bip["batter_id"].isin(cmem) & (bip["p_throws"] == hand)] if cmem else None)
                levels, worst, wx = [None] * 9, None, -1
                if pool is not None:
                    for z in range(1, 10):
                        cell = pool[pool["zone"] == z]["estimated_woba"]
                        if len(cell) >= (MIN_ZONE_BIP if use_own else MIN_CLUSTER_ZONE_BIP) and (hand, z) in tert:
                            t1, t2 = tert[(hand, z)]
                            v = float(cell.mean())
                            levels[z - 1] = 0 if v <= t1 else 1 if v <= t2 else 2
                            if levels[z - 1] == 2 and v > wx:
                                worst, wx = z, v
                dz = {"levels": levels, "worst": zone_label(worst, st) if worst else None, "source": src if any(l is not None for l in levels) else None, "n": int(len(pool)) if pool is not None else 0}
                # second look
                ended = vs[vs["events"].notna()]
                cls = Counter()
                for _, r in ended.iterrows() if len(ended) <= 400 else ended.sample(400, random_state=1).iterrows():
                    e = r["events"]
                    k_ = "K" if str(e).startswith("strikeout") else "OUT_IN_PLAY" if e in OUT_EVENTS else None
                    if k_:
                        cls[(k_, r["pitch_type"])] += 1
                sl, seen_n = None, None
                if sum(cls.values()) >= MIN_RETIRED:
                    (kcls, kpitch), _n = cls.most_common(1)[0]
                    for scope, sid in (("batter", b), ("cluster", c), ("league", 0)):
                        if sid is None or st is None:
                            continue
                        rr = get_sl(scope, sid, hand, st, kcls, kpitch)
                        if rr and seen_n is None:
                            seen_n = rr[0]["n_pairs"]
                        if rr and rr[0]["n_opened_same"] >= SECOND_LOOK_MIN and rr[0]["n_opened_other"] >= SECOND_LOOK_MIN:
                            r0 = rr[0]
                            mixc = Counter(r0["first_pitch_mix"]); other = [(t, n_) for t, n_ in mixc.most_common() if t != kpitch]
                            sl = {"ended_class": kcls, "ended_pitch": kpitch, "n": r0["n_pairs"], "opened_same_pct": pct(r0["n_opened_same"], r0["n_pairs"]), "top_other": other[0][0] if other else None,
                                  "top_other_pct": pct(other[0][1], r0["n_pairs"]) if other else None, "source": scope}
                            break
                    if sl is None and seen_n is not None:
                        sl = {"small": True, "ended_class": kcls, "ended_pitch": kpitch, "n": seen_n, "opened_same_pct": None, "top_other": None, "top_other_pct": None, "source": "batter"}
                return {"slot": h["slot"], "id": b, "name": h["name"], "bats": st, "cluster": {"id": int(c), "label": label} if c is not None else None,
                        "first_pitch": fp, "opener": opener, "two_strikes": twos, "damage_zones": dz, "second_look": sl}

            hitters = [build_hitter(h) for h in lineup]
            # Bench: other hitters from this club's recent lineups (most games first), with the same lines, so "Build your own card" can swap them in.
            in_lineup = {h["id"] for h in lineup}
            seen, names = Counter(), {}
            for r in rows:
                if r["player_id"] not in in_lineup:
                    seen[r["player_id"]] += 1; names[r["player_id"]] = r["player_name"]
            bench = [build_hitter({"id": i, "name": names[i], "slot": None}) for i, _ in seen.most_common(BENCH_SIZE)]
            card = {"meta": {"gamePk": gp, "date": a.date, "firstPitchUtc": g.get("gameDate"), "venue": (g.get("venue") or {}).get("name"),
                             "away": {"id": away["team"]["id"], "name": away["team"]["name"], "abbr": away["team"].get("abbreviation")}, "home": {"id": home["team"]["id"], "name": home["team"]["name"], "abbr": home["team"].get("abbreviation")}},
                    "starter": {"id": pid, "name": pp["fullName"], "hand": hand, "team": tm["team"]["name"]},
                    "batting": {"id": opp["team"]["id"], "name": opp["team"]["name"], "abbr": opp["team"].get("abbreviation")},
                    "lineup_source": source, "pitches_before": a.date, "backdated": backdated, "arsenal": arsenal[:6], "hitters": hitters, "bench": bench}
            cards.append({"game_pk": gp, "game_date": a.date, "pitcher_id": pid, "opponent_team_id": opp["team"]["id"], "lineup_source": source, "card": card})

    return cards, skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="one game date, YYYY-MM-DD; only pitches BEFORE this date are used")
    ap.add_argument("--from", dest="d0", help="first date of a range to back-date, YYYY-MM-DD")
    ap.add_argument("--to", dest="d1", help="last date of the range (default: the same as --from)")
    ap.add_argument("--game-pk", type=int)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force-recent", action="store_true", help="ignore a posted lineup and use the recent-lineup rule (for testing that branch)")
    a = ap.parse_args()
    if not URL or not KEY:
        sys.exit("Missing Supabase URL / service key in .env.local")
    if not a.date and not a.d0:
        sys.exit("Give --date YYYY-MM-DD, or --from and --to for a range.")
    first, last = (a.date, a.date) if a.date else (a.d0, a.d1 or a.d0)
    d0, d1 = dt.date.fromisoformat(first), dt.date.fromisoformat(last)
    if d1 < d0 or d0.year != d1.year:
        sys.exit("The range must run forwards inside one season.")
    dates = [(d0 + dt.timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
    sb = create_client(URL, KEY)
    season = d0.year
    try:
        from zoneinfo import ZoneInfo
        today = dt.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    except Exception:
        today = dt.date.today().isoformat()

    print("Loading the season's pitches once (each date then uses only the pitches before it)...")
    df_all = load_pitches(sb, (d1).isoformat())
    print(f"{len(df_all):,} pitches.")
    ix = load_ab_index(sb, season)
    print("At-bat index:", "loaded" if ix else "MISSING (opener endings will be small sample)")
    cl = {}
    for off in range(0, 20000, 1000):
        got = with_retry(lambda: sb.table("hitter_clusters").select("batter_id,stand_vs,cluster_id").eq("season", season).order("batter_id").order("stand_vs").range(off, off + 999).execute().data, "clusters")
        for r in got:
            cl[(r["batter_id"], "R" if r["stand_vs"] == "vs RHP" else "L")] = r["cluster_id"]
        if len(got) < 1000:
            break
    defs = {(r["stand_vs"], r["cluster_id"]): r["label"] for r in with_retry(lambda: sb.table("hitter_cluster_defs").select("stand_vs,cluster_id,label").eq("season", season).execute().data, "cluster defs")}
    members = defaultdict(set)
    for (b, h), c in cl.items():
        members[(h, c)].add(b)
    print(f"{len(cl):,} hitter cluster rows (used only for dates that are not yet past).")

    wrote_any, total = False, 0
    for D in dates:
        a.date = D
        backdated = D < today
        cards, skipped = build_for_date(a, sb, df_all, ix, {} if backdated else cl, {} if backdated else defs, defaultdict(set) if backdated else members, season, backdated)
        print(f"{D}: {len(cards)} cards built{' (back-dated: nothing from after the date is used)' if backdated else ''}.")
        for s_ in skipped:
            print("  skipped:", s_)
        if cards and len(dates) == 1:
            print("\nOne full card:")
            print(json.dumps(cards[0]["card"], indent=1)[:6000])
        if a.dry_run or not cards:
            continue
        if not wrote_any:
            print("--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
            time.sleep(5)
            wrote_any = True
        for c in cards:
            with_retry(lambda: sb.table("game_plan_cards").upsert({**c, "built_at": dt.datetime.now(dt.timezone.utc).isoformat()}, on_conflict="game_pk,pitcher_id").execute(), f"card {c['game_pk']}")
        total += len(cards)
    print("Dry run: nothing written." if a.dry_run else f"Done. {total} cards written.")


if __name__ == "__main__":
    main()
