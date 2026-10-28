#!/usr/bin/env python3
"""
scripts/build_league_pitch_bins.py

Builds league_pitch_bins (supabase/migrations/20261030130000_league_pitch_bins.sql): every pitch of a season grouped into small cells so the Sequencing Lab's
League pitch finder can answer in milliseconds instead of scanning 728,000 pitches.

TABLE OWNERSHIP: this script is the SINGLE writer of league_pitch_bins. It rebuilds one season at a time (deletes that season's rows, then inserts the new ones).

A cell is: season, pitch type, throwing hand, batter side, zone (0 = not recorded), speed (whole mph, floor), arm-side break and induced rise (2-inch cells, floor), result.
Result: B ball, C called strike, W swinging strike, F foul, XH in play a hit, XO in play an out (same classes as src/lib/sequencing-lab/sequence.ts).
Arm-side break is positive toward the pitcher's arm side (a right-hander's is minus Statcast's pfx_x), as the Pitching Lab shows it.
Each cell stores the pitch count and the SUMS of plate x/z, release x/z, extension, speed, spin, break and rise, so averages are sum / count.

Usage:
  python3 scripts/build_league_pitch_bins.py --season 2026 [--dry-run]
Prints a 5-row sample and waits 5 seconds (Ctrl+C aborts) before writing. Run it after the nightly pitch load to refresh.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

from supabase import create_client

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

BALLS = {"ball", "blocked_ball", "pitchout", "automatic_ball", "intent_ball", "hit_by_pitch"}
STRIKES = {"swinging_strike", "swinging_strike_blocked", "foul_tip", "missed_bunt"}
FOULS = {"foul", "foul_bunt", "bunt_foul_tip"}
HITS = {"single", "double", "triple", "home_run"}
COLS = "id,pitch_type,p_throws,stand,zone,description,events,plate_x,plate_z,release_pos_x,release_pos_z,release_extension,release_speed,release_spin_rate,pfx_x,pfx_z"


def result_of(desc, ev):
    d = desc or ""
    if d in BALLS: return "B"
    if d in ("called_strike", "automatic_strike"): return "C"
    if d in STRIKES: return "W"
    if d in FOULS: return "F"
    if d.startswith("hit_into_play"): return "XH" if (ev or "") in HITS else "XO"
    return None


def f(v):
    try:
        x = float(v)
        return None if math.isnan(x) else x
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if not URL or not KEY:
        sys.exit("Missing Supabase URL / service key in .env.local")
    sb = create_client(URL, KEY)

    cells = defaultdict(lambda: [0.0] * 10)   # key -> [n, plate_x, plate_z, rel_x, rel_z, ext, speed, spin, hb, ivb] (sums)
    last, seen = 0, 0
    t0 = time.time()
    while True:
        for attempt in range(4):
            try:
                rows = (sb.table("pitch_events").select(COLS).gte("game_date", f"{a.season}-01-01").lt("game_date", f"{a.season + 1}-01-01")
                        .gt("id", last).order("id").limit(1000).execute().data)
                break
            except Exception as e:
                print(f"  retry {attempt + 1} after id {last}: {str(e)[:80]}")
                time.sleep(3)
        else:
            sys.exit("Giving up: the database kept refusing. Nothing was written.")
        if not rows:
            break
        for r in rows:
            last = r["id"]
            res = result_of(r["description"], r["events"])
            px, pz, rx, rz, ex, sp, pfx_x, pfx_z = (f(r[k]) for k in ("plate_x", "plate_z", "release_pos_x", "release_pos_z", "release_extension", "release_speed", "pfx_x", "pfx_z"))
            hand, stand = r["p_throws"], r["stand"]
            if res is None or None in (px, pz, rx, rz, ex, sp, pfx_x, pfx_z) or hand not in ("R", "L") or stand not in ("R", "L") or not r["pitch_type"]:
                continue
            hb = (-1 if hand == "R" else 1) * pfx_x * 12
            ivb = pfx_z * 12
            key = (r["pitch_type"], hand, stand, int(r["zone"] or 0), int(math.floor(sp)), int(math.floor(hb / 2) * 2), int(math.floor(ivb / 2) * 2), res)
            c = cells[key]
            c[0] += 1; c[1] += px; c[2] += pz; c[3] += rx; c[4] += rz; c[5] += ex; c[6] += sp; c[7] += f(r["release_spin_rate"]) or 0; c[8] += hb; c[9] += ivb
        seen += len(rows)
        if seen % 50000 < 1000:
            print(f"  read {seen:,} pitches, {len(cells):,} cells ({time.time() - t0:.0f}s)")

    out = [dict(season=a.season, pitch_type=k[0], hand=k[1], stand=k[2], zone=k[3], speed_bin=k[4], hb_bin=k[5], ivb_bin=k[6], result=k[7],
                n=int(v[0]), sum_plate_x=round(v[1], 3), sum_plate_z=round(v[2], 3), sum_rel_x=round(v[3], 3), sum_rel_z=round(v[4], 3),
                sum_ext=round(v[5], 3), sum_speed=round(v[6], 2), sum_spin=round(v[7], 1), sum_hb=round(v[8], 2), sum_ivb=round(v[9], 2)) for k, v in cells.items()]
    print(f"\n{seen:,} pitches read, {sum(r['n'] for r in out):,} usable, {len(out):,} cells. First 5:")
    for r in out[:5]:
        print(r)
    if a.dry_run:
        print("Dry run: nothing written.")
        return
    print("--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
    time.sleep(5)
    sb.table("league_pitch_bins").delete().eq("season", a.season).execute()
    for i in range(0, len(out), 500):
        chunk = out[i:i + 500]
        for attempt in range(4):
            try:
                sb.table("league_pitch_bins").insert(chunk).execute()
                break
            except Exception as e:
                print(f"  retry {attempt + 1}: {str(e)[:80]}")
                time.sleep(3)
        else:
            sys.exit(f"Stopped at row {i}. Re-run to rebuild this season from scratch.")
        if (i // 500) % 40 == 0:
            print(f"  inserted {min(i + 500, len(out)):,} of {len(out):,}")
    print("Done.")


if __name__ == "__main__":
    main()
