#!/usr/bin/env python3
"""
scripts/build_second_look_summary.py

Builds second_look_summary and second_look_baseline (supabase/migrations/20261030160000_second_look_game_plan.sql) from league_pa_pairs, so the Second Look page reads small
indexed rows and never counts live.

TABLE OWNERSHIP: this script is the SINGLE writer of second_look_summary and second_look_baseline. It rebuilds one season at a time.
Run AFTER build_league_pa_pairs.py (and after build_hitter_clusters.py if you want the cluster scope).

A cell is: scope (league id 0 | pitcher id | batter id | hitter cluster id), pitcher hand, batter side, look number (league only: 0 both, 2, 3; the other scopes store 0 = both),
how the first plate appearance ended (K, BB, HIT, OUT_IN_PLAY, OTHER) and the type of the pitch that ended it. Values: pairs, how many second looks opened with that same pitch and
how many with something else, the second look's first-pitch mix (counts by type), and how the second look ended for each group (counts by event).
The cluster scope uses the batter's cluster for the pitcher's hand (vs RHP / vs LHP) from hitter_clusters; if that table is empty the scope is skipped and the script says so.
The baseline is the first-pitch mix of EVERY plate appearance by pitcher hand and batter side (the "0-0" pitch the page sets the second look against).

Usage:  python3 scripts/build_second_look_summary.py --season 2026 [--dry-run]
Prints the totals and 5 sample rows, then waits 5 seconds (Ctrl+C aborts) before writing.
"""

from __future__ import annotations

import argparse
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
PAIR_COLS = "game_pk,batter_id,ab1_at_bat_number,ab2_at_bat_number,pitcher_id,p_throws,stand,look_number,ab1_result_class,ab1_final_pitch_type,ab2_first_pitch_type,ab2_opened_same,ab2_event"


def with_retry(fn, what):
    for attempt in range(4):
        try:
            return fn()
        except Exception as e:
            print(f"  retry {attempt + 1} ({what}): {str(e)[:80]}")
            time.sleep(3)
    sys.exit(f"Giving up on {what}. Nothing was written.")


def read_pairs(sb, season):
    rows, off = [], 0
    while True:
        got = with_retry(lambda: sb.table("league_pa_pairs").select(PAIR_COLS).eq("season", season)
                         .order("game_pk").order("batter_id").order("ab1_at_bat_number").order("ab2_at_bat_number").range(off, off + 999).execute().data, f"pairs at {off}")
        rows.extend(got)
        if len(got) < 1000:
            return rows
        off += 1000


def read_baseline(sb, season):
    mix = defaultdict(Counter)
    last, n = 0, 0
    while True:
        got = with_retry(lambda: sb.table("pitch_events").select("id,pitch_type,p_throws,stand").eq("pitch_number", 1).gte("game_date", f"{season}-01-01")
                         .lt("game_date", f"{season + 1}-01-01").gt("id", last).order("id").limit(1000).execute().data, f"baseline after id {last}")
        if not got:
            return mix
        last = got[-1]["id"]
        for r in got:
            if r["pitch_type"] and r["p_throws"] in ("L", "R") and r["stand"] in ("L", "R"):
                mix[(r["p_throws"], r["stand"])][r["pitch_type"]] += 1
                n += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not URL or not KEY:
        sys.exit("Missing Supabase URL / service key in .env.local")
    sb = create_client(URL, KEY)

    pairs = read_pairs(sb, a.season)
    print(f"{len(pairs):,} pairs read.")
    if not pairs:
        sys.exit("league_pa_pairs is empty for this season: run build_league_pa_pairs.py first.")
    clusters = {}
    for off in range(0, 100000, 1000):
        got = with_retry(lambda: sb.table("hitter_clusters").select("batter_id,stand_vs,cluster_id").eq("season", a.season).order("batter_id").order("stand_vs").range(off, off + 999).execute().data, "clusters")
        for r in got:
            clusters[(r["batter_id"], r["stand_vs"])] = r["cluster_id"]
        if len(got) < 1000:
            break
    print(f"{len(clusters):,} hitter cluster rows" + ("" if clusters else " (empty: the cluster scope is skipped)"))

    cells = {}

    def add(key, p):
        c = cells.setdefault(key, {"n": 0, "same": 0, "other": 0, "mix": Counter(), "end_same": Counter(), "end_other": Counter()})
        c["n"] += 1
        c["mix"][p["ab2_first_pitch_type"]] += 1
        if p["ab2_opened_same"]:
            c["same"] += 1; c["end_same"][p["ab2_event"]] += 1
        else:
            c["other"] += 1; c["end_other"][p["ab2_event"]] += 1

    for p in pairs:
        tail = (p["p_throws"], p["stand"])
        end = (p["ab1_result_class"], p["ab1_final_pitch_type"])
        add(("league", 0) + tail + (0,) + end, p)
        add(("league", 0) + tail + (p["look_number"],) + end, p)
        add(("pitcher", p["pitcher_id"]) + tail + (0,) + end, p)
        add(("batter", p["batter_id"]) + tail + (0,) + end, p)
        cid = clusters.get((p["batter_id"], "vs RHP" if p["p_throws"] == "R" else "vs LHP"))
        if cid is not None:
            add(("cluster", cid) + tail + (0,) + end, p)

    out = [{"season": a.season, "scope_type": k[0], "scope_id": int(k[1]), "p_throws": k[2], "stand": k[3], "look_number": k[4], "ab1_result_class": k[5], "ab1_final_pitch_type": k[6],
            "n_pairs": v["n"], "n_opened_same": v["same"], "n_opened_other": v["other"], "first_pitch_mix": dict(v["mix"]), "endings_same": dict(v["end_same"]), "endings_other": dict(v["end_other"])}
           for k, v in cells.items()]
    base = read_baseline(sb, a.season)
    base_rows = [{"season": a.season, "p_throws": k[0], "stand": k[1], "n_pitches": sum(c.values()), "first_pitch_mix": dict(c)} for k, c in base.items()]

    print(f"\n{len(out):,} summary rows:", dict(Counter(r["scope_type"] for r in out)), f"| {len(base_rows)} baseline rows")
    print("First 5 rows:")
    for r in out[:5]:
        print(r)
    print("\nSanity table: RHP vs LHB, first plate appearance ended in a strikeout, league, both looks")
    print(f"  {'final pitch':<12}{'pairs':>7}{'opened same':>13}{'%':>6}   endings when same / other (strikeout %)")
    for r in sorted([r for r in out if r["scope_type"] == "league" and r["look_number"] == 0 and r["p_throws"] == "R" and r["stand"] == "L" and r["ab1_result_class"] == "K"], key=lambda r: -r["n_pairs"]):
        ks = r["endings_same"].get("strikeout", 0) / r["n_opened_same"] * 100 if r["n_opened_same"] else float("nan")
        ko = r["endings_other"].get("strikeout", 0) / r["n_opened_other"] * 100 if r["n_opened_other"] else float("nan")
        print(f"  {r['ab1_final_pitch_type']:<12}{r['n_pairs']:>7}{r['n_opened_same']:>13}{r['n_opened_same'] / r['n_pairs'] * 100:>6.0f}   K {ks:.0f}% (n {r['n_opened_same']}) / K {ko:.0f}% (n {r['n_opened_other']})")
    if a.dry_run:
        print("Dry run: nothing written.")
        return
    print("--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
    time.sleep(5)
    sb.table("second_look_summary").delete().eq("season", a.season).execute()
    sb.table("second_look_baseline").delete().eq("season", a.season).execute()
    sb.table("second_look_baseline").insert(base_rows).execute()
    for i in range(0, len(out), 500):
        with_retry(lambda: sb.table("second_look_summary").insert(out[i:i + 500]).execute(), f"summary rows {i}")
        if (i // 500) % 40 == 0:
            print(f"  inserted {min(i + 500, len(out)):,} of {len(out):,}")
    print("Done.")


if __name__ == "__main__":
    main()
