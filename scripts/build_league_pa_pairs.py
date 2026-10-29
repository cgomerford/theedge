#!/usr/bin/env python3
"""
scripts/build_league_pa_pairs.py

Builds league_pa_pairs (supabase/migrations/20261030160000_second_look_game_plan.sql): every pair of CONSECUTIVE plate appearances by the same batter against the same
pitcher in the same game, for the Sequencing Lab's Second Look page and the Game Plan Card.

TABLE OWNERSHIP: this script is the SINGLE writer of league_pa_pairs. It rebuilds one season at a time (deletes that season's rows, then inserts the new ones).

Rules (each is counted and printed so nothing is dropped silently):
  - A plate appearance (PA) is valid only if its pitches are numbered 1..n with no gap, every pitch has a type, and exactly the last pitch carries the result (events).
  - Pairs are consecutive in the batter's own PAs for the game and both are against the same pitcher. look_number = how many PAs that batter has had against that pitcher
    so far in the game (2 = first to second, 3 = second to third); fourth looks and later are not stored.
  - The batter's side must be the same in both PAs (a switch hitter who changed sides between them is skipped, and counted).
  - ab2_run_value = sum of delta_run_exp over the second PA's pitches; null when any pitch lacks it. Needs the battery columns (migration 20261030150000 plus the 2026 reload).
Result classes: K strikeout, BB walk or hit by pitch, HIT single to home run, OUT_IN_PLAY ball in play that is an out (sacrifices included), OTHER anything else
(reaching on an error, interference, no result recorded).

Usage:  python3 scripts/build_league_pa_pairs.py --season 2026 [--dry-run]
Prints the totals and 5 sample rows, then waits 5 seconds (Ctrl+C aborts) before writing. Re-running is safe: it rebuilds the season.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

from dotenv import load_dotenv

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

from supabase import create_client

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

COLS = "id,game_pk,game_date,at_bat_number,pitch_number,pitcher_id,batter_id,pitch_type,description,events,zone,stand,p_throws,delta_run_exp"
BALLS = {"ball", "blocked_ball", "pitchout", "automatic_ball", "intent_ball", "hit_by_pitch"}
WHIFFS = {"swinging_strike", "swinging_strike_blocked", "foul_tip", "missed_bunt"}
FOULS = {"foul", "foul_bunt", "bunt_foul_tip"}
HITS = {"single", "double", "triple", "home_run"}
OUTS_IN_PLAY = {"field_out", "force_out", "grounded_into_double_play", "double_play", "triple_play", "fielders_choice", "fielders_choice_out",
                "sac_fly", "sac_bunt", "sac_fly_double_play", "sac_bunt_double_play"}


def pitch_result(desc, ev):
    d = desc or ""
    if d in BALLS: return "ball"
    if d in ("called_strike", "automatic_strike"): return "called"
    if d in WHIFFS: return "whiff"
    if d in FOULS: return "foul"
    if d.startswith("hit_into_play"): return "hit" if (ev or "") in HITS else "out"
    return None


def event_of(ev):
    """(result_class, ab_event) for the pair tables."""
    e = ev or ""
    if e.startswith("strikeout"): return "K", "strikeout"
    if e in ("walk", "intent_walk"): return "BB", "walk"
    if e == "hit_by_pitch": return "BB", "hit_by_pitch"
    if e in HITS: return "HIT", e
    if e in OUTS_IN_PLAY: return "OUT_IN_PLAY", "out_in_play"
    return "OTHER", "other"


def read_season(sb, season):
    rows, last = [], 0
    t0 = time.time()
    while True:
        for attempt in range(4):
            try:
                got = (sb.table("pitch_events").select(COLS).gte("game_date", f"{season}-01-01").lt("game_date", f"{season + 1}-01-01")
                       .gt("id", last).order("id").limit(1000).execute().data)
                break
            except Exception as e:
                print(f"  retry {attempt + 1} after id {last}: {str(e)[:80]}")
                time.sleep(3)
        else:
            sys.exit("Giving up: the database kept refusing. Nothing was written.")
        if not got:
            return rows
        rows.extend(got)
        last = got[-1]["id"]
        if len(rows) % 100000 < 1000:
            print(f"  read {len(rows):,} pitches ({time.time() - t0:.0f}s)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not URL or not KEY:
        sys.exit("Missing Supabase URL / service key in .env.local")
    sb = create_client(URL, KEY)

    rows = read_season(sb, a.season)
    print(f"{len(rows):,} pitches read. Grouping into plate appearances...")
    by_pa = defaultdict(list)
    for r in rows:
        by_pa[(r["game_pk"], r["at_bat_number"])].append(r)

    skipped = Counter()
    pas = {}   # (game, ab) -> dict
    for key, ps in by_pa.items():
        ps.sort(key=lambda x: x["pitch_number"])
        if [p["pitch_number"] for p in ps] != list(range(1, len(ps) + 1)):
            skipped["pa_pitch_gap"] += 1; continue
        if any(not p["pitch_type"] or not p["pitcher_id"] or not p["batter_id"] for p in ps):
            skipped["pa_missing_type_or_id"] += 1; continue
        ev_rows = [i for i, p in enumerate(ps) if p["events"]]
        if len(ev_rows) != 1 or ev_rows[0] != len(ps) - 1:
            skipped["pa_no_single_final_event"] += 1; continue
        if len({(p["pitcher_id"], p["batter_id"]) for p in ps}) != 1 or ps[0]["stand"] not in ("L", "R") or ps[0]["p_throws"] not in ("L", "R"):
            skipped["pa_mixed_or_no_hand"] += 1; continue
        pas[key] = ps
    print(f"{len(pas):,} valid plate appearances of {len(by_pa):,}. Skipped: {dict(skipped)}")

    per_batter = defaultdict(list)
    for key in pas:
        per_batter[(key[0], pas[key][0]["batter_id"])].append(key)
    out, pair_skips = [], Counter()
    for (game, batter), keys in per_batter.items():
        keys.sort(key=lambda k: k[1])
        seen_vs = Counter()
        for i, k in enumerate(keys):
            p1 = pas[k][0]["pitcher_id"]
            seen_vs[p1] += 1
            if i + 1 >= len(keys):
                continue
            k2 = keys[i + 1]
            a1, a2 = pas[k], pas[k2]
            if a2[0]["pitcher_id"] != p1:
                continue
            look = seen_vs[p1] + 1          # the second PA's number against this pitcher
            if look not in (2, 3):
                pair_skips["look_4_plus"] += 1; continue
            if a1[0]["stand"] != a2[0]["stand"]:
                pair_skips["side_changed"] += 1; continue
            cls1, _ = event_of(a1[-1]["events"]); cls2, ev2 = event_of(a2[-1]["events"])
            rv = [p["delta_run_exp"] for p in a2]
            out.append({
                "game_pk": game, "game_date": a1[0]["game_date"], "season": a.season, "pitcher_id": p1, "batter_id": batter,
                "p_throws": a1[0]["p_throws"], "stand": a1[0]["stand"], "look_number": look,
                "ab1_at_bat_number": k[1], "ab2_at_bat_number": k2[1],
                "ab1_result_class": cls1, "ab1_event": a1[-1]["events"], "ab1_final_pitch_type": a1[-1]["pitch_type"], "ab1_final_pitch_desc": a1[-1]["description"],
                "ab1_pitches": [{"t": p["pitch_type"], "z": p["zone"], "r": pitch_result(p["description"], p["events"])} for p in a1],
                "ab2_first_pitch_type": a2[0]["pitch_type"],
                "ab2_opened_same": a2[0]["pitch_type"] == a1[-1]["pitch_type"],
                "ab2_threw_same_any": any(p["pitch_type"] == a1[-1]["pitch_type"] for p in a2),
                "ab2_result_class": cls2, "ab2_event": ev2,
                "ab2_pitches": [{"t": p["pitch_type"], "z": p["zone"], "r": pitch_result(p["description"], p["events"])} for p in a2],
                "ab2_run_value": None if any(v is None for v in rv) else round(sum(float(v) for v in rv), 3),
            })
    print(f"\n{len(out):,} pairs. Skipped pairs: {dict(pair_skips)}")
    print("  by look:", dict(Counter(r["look_number"] for r in out)))
    print("  first PA result:", dict(Counter(r["ab1_result_class"] for r in out)))
    print("  second PA event:", dict(Counter(r["ab2_event"] for r in out)))
    print(f"  opened with the same pitch: {sum(r['ab2_opened_same'] for r in out):,}  threw it at some point: {sum(r['ab2_threw_same_any'] for r in out):,}")
    print(f"  second-PA run value present on {sum(r['ab2_run_value'] is not None for r in out):,} pairs")
    print("First 5 rows:")
    for r in out[:5]:
        print({k: v for k, v in r.items() if k not in ("ab1_pitches", "ab2_pitches")}, "| ab1:", [p["t"] for p in r["ab1_pitches"]], "ab2:", [p["t"] for p in r["ab2_pitches"]])
    if a.dry_run:
        print("Dry run: nothing written.")
        return
    print("--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
    time.sleep(5)
    sb.table("league_pa_pairs").delete().eq("season", a.season).execute()
    for i in range(0, len(out), 500):
        chunk = out[i:i + 500]
        for attempt in range(4):
            try:
                sb.table("league_pa_pairs").insert(chunk).execute()
                break
            except Exception as e:
                print(f"  retry {attempt + 1}: {str(e)[:80]}")
                time.sleep(3)
        else:
            sys.exit(f"Stopped at row {i}. Re-run to rebuild this season from scratch.")
        if (i // 500) % 20 == 0:
            print(f"  inserted {min(i + 500, len(out)):,} of {len(out):,}")
    print("Done.")


if __name__ == "__main__":
    main()
