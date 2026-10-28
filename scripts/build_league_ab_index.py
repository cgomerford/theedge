#!/usr/bin/env python3
"""
scripts/build_league_ab_index.py

Builds league_ab_index (supabase/migrations/20261030140000_league_ab_index.sql): every at-bat of a season as one compact binary file (gzip, base64, cut into text parts).
The Sequencing Lab's "stack the at-bat" feature loads it on the server and finds the real at-bats whose pitches match a stack of pitches.

TABLE OWNERSHIP: this script is the SINGLE writer of league_ab_index. It rebuilds one season (deletes that season's parts, writes the new ones).

File layout (little endian), read by src/lib/sequencing-lab/ab-index.ts, which must be kept in step with this:
  4 bytes  'X9AB'
  4 bytes  length H of the JSON header, then H bytes of JSON: {season, builtAt, nPitches, nAbs, types[], outcomes[]}
  pitch arrays (N = nPitches, each N bytes, pitches in thrown order, at-bats back to back):
     type u8 (index into types[]), speed2 u8 (speed x 2; 0 = missing), hb2 i8 (arm-side break x 2, positive toward the arm side; -128 = missing),
     ivb2 i8 (induced rise x 2; -128 = missing), zone u8 (Statcast zone, 0 = none), res u8 (0 none, 1 ball, 2 called strike, 3 swinging strike, 4 foul, 5 in play a hit, 6 in play an out)
  at-bat arrays (M = nAbs): start u32 (index of its first pitch), pitcher u32, batter u32, gamepk u32, date u16 (days since 2020-01-01), len u8 (pitches),
     hand u8 (0 R, 1 L), stand u8 (0 R, 1 L), outcome u8 (index into outcomes[])
Usage:  python3 scripts/build_league_ab_index.py --season 2026 [--dry-run] [--out file]
Prints a 5-row sample and waits 5 seconds (Ctrl+C aborts) before writing. Re-run after new pitches load.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import gzip
import json
import math
import os
import struct
import sys
import time
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

from supabase import create_client

URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")

TYPES = ["FF", "SI", "FC", "SL", "ST", "SV", "CU", "KC", "CS", "CH", "FS", "FO", "EP", "KN", "SC", "?"]
OUTCOMES = ["unknown", "K", "BB", "HBP", "1B", "2B", "3B", "HR", "OUT", "OTHER"]
BALLS = {"ball", "blocked_ball", "pitchout", "automatic_ball", "intent_ball", "hit_by_pitch"}
STRIKES = {"swinging_strike", "swinging_strike_blocked", "foul_tip", "missed_bunt"}
FOULS = {"foul", "foul_bunt", "bunt_foul_tip"}
HITS = {"single", "double", "triple", "home_run"}
COLS = "id,game_pk,game_date,at_bat_number,pitch_number,pitcher_id,batter_id,pitch_type,release_speed,description,events,zone,pfx_x,pfx_z,stand,p_throws"
EPOCH = dt.date(2020, 1, 1)


def result_of(desc, ev):
    d = desc or ""
    if d in BALLS: return 1
    if d in ("called_strike", "automatic_strike"): return 2
    if d in STRIKES: return 3
    if d in FOULS: return 4
    if d.startswith("hit_into_play"): return 5 if (ev or "") in HITS else 6
    return 0


def outcome_of(ev):
    if not ev: return 0
    if ev.startswith("strikeout"): return 1
    if ev in ("walk", "intent_walk"): return 2
    if ev == "hit_by_pitch": return 3
    if ev == "single": return 4
    if ev == "double": return 5
    if ev == "triple": return 6
    if ev == "home_run": return 7
    if ev in ("field_out", "force_out", "grounded_into_double_play", "double_play", "triple_play", "fielders_choice", "fielders_choice_out", "sac_fly", "sac_bunt", "sac_fly_double_play", "sac_bunt_double_play", "field_error"):
        return 8
    return 9


def num(v):
    try:
        x = float(v)
        return None if math.isnan(x) else x
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", help="also write the raw (uncompressed) file here, for local testing; writes nothing to Supabase")
    a = ap.parse_args()
    if not URL or not KEY:
        sys.exit("Missing Supabase URL / service key in .env.local")
    sb = create_client(URL, KEY)

    rows, last = [], 0
    t0 = time.time()
    while True:
        for attempt in range(4):
            try:
                got = (sb.table("pitch_events").select(COLS).gte("game_date", f"{a.season}-01-01").lt("game_date", f"{a.season + 1}-01-01")
                       .gt("id", last).order("id").limit(1000).execute().data)
                break
            except Exception as e:
                print(f"  retry {attempt + 1} after id {last}: {str(e)[:80]}")
                time.sleep(3)
        else:
            sys.exit("Giving up: the database kept refusing. Nothing was written.")
        if not got:
            break
        rows.extend(got)
        last = got[-1]["id"]
        if len(rows) % 100000 < 1000:
            print(f"  read {len(rows):,} pitches ({time.time() - t0:.0f}s)")
    print(f"{len(rows):,} pitches read. Sorting into at-bats...")

    rows = [r for r in rows if r["pitch_type"] and r["pitcher_id"] and r["batter_id"]]
    rows.sort(key=lambda r: (r["game_pk"], r["at_bat_number"], r["pitch_number"]))
    n = len(rows)
    type_a = np.zeros(n, np.uint8); speed_a = np.zeros(n, np.uint8); hb_a = np.full(n, -128, np.int8); ivb_a = np.full(n, -128, np.int8)
    zone_a = np.zeros(n, np.uint8); res_a = np.zeros(n, np.uint8)
    starts, pit, bat, gpk, date, ln, hand, stand, outc = [], [], [], [], [], [], [], [], []
    cur = None
    for i, r in enumerate(rows):
        t = r["pitch_type"]
        type_a[i] = TYPES.index(t) if t in TYPES else len(TYPES) - 1
        sp = num(r["release_speed"])
        if sp is not None: speed_a[i] = int(min(255, max(1, round(sp * 2))))
        px, pz = num(r["pfx_x"]), num(r["pfx_z"])
        h = r["p_throws"] if r["p_throws"] in ("R", "L") else None
        if px is not None and h: hb_a[i] = int(max(-127, min(127, round((-1 if h == "R" else 1) * px * 12 * 2))))
        if pz is not None: ivb_a[i] = int(max(-127, min(127, round(pz * 12 * 2))))
        zone_a[i] = int(r["zone"] or 0) if (r["zone"] or 0) <= 14 else 0
        res_a[i] = result_of(r["description"], r["events"])
        key = (r["game_pk"], r["at_bat_number"])
        if key != cur:
            cur = key
            starts.append(i); pit.append(r["pitcher_id"]); bat.append(r["batter_id"]); gpk.append(r["game_pk"])
            date.append((dt.date.fromisoformat(r["game_date"]) - EPOCH).days)
            hand.append(0 if h != "L" else 1); stand.append(0 if r["stand"] != "L" else 1); ln.append(0); outc.append(0)
        ln[-1] += 1
        if r["events"]:
            outc[-1] = outcome_of(r["events"])
    m = len(starts)
    header = json.dumps({"season": a.season, "builtAt": dt.datetime.now(dt.timezone.utc).isoformat(), "nPitches": n, "nAbs": m, "types": TYPES, "outcomes": OUTCOMES}).encode()
    blob = b"X9AB" + struct.pack("<I", len(header)) + header
    for arr in (type_a, speed_a, hb_a, ivb_a, zone_a, res_a):
        blob += arr.tobytes()
    blob += np.array(starts, "<u4").tobytes() + np.array(pit, "<u4").tobytes() + np.array(bat, "<u4").tobytes() + np.array(gpk, "<u4").tobytes()
    blob += np.array(date, "<u2").tobytes() + np.array(ln, np.uint8).tobytes() + np.array(hand, np.uint8).tobytes() + np.array(stand, np.uint8).tobytes() + np.array(outc, np.uint8).tobytes()
    text = base64.b64encode(gzip.compress(blob, 9)).decode()
    CH = 400_000
    parts = [text[i:i + CH] for i in range(0, len(text), CH)]
    print(f"{n:,} pitches, {m:,} at-bats, {len(blob) / 1e6:.1f} MB raw, {len(text) / 1e6:.1f} MB compressed, {len(parts)} parts. First 5 at-bats:")
    for k in range(5):
        s = starts[k]
        print({"game": gpk[k], "pitcher": pit[k], "batter": bat[k], "pitches": ln[k], "types": [TYPES[t] for t in type_a[s:s + ln[k]]], "outcome": OUTCOMES[outc[k]]})
    if a.out:
        Path(a.out).write_bytes(blob)
        print(f"Wrote {a.out}. Nothing written to Supabase.")
        return
    if a.dry_run:
        print("Dry run: nothing written.")
        return
    print("--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
    time.sleep(5)
    sb.table("league_ab_index").delete().eq("season", a.season).execute()
    for i, p in enumerate(parts):
        for attempt in range(4):
            try:
                sb.table("league_ab_index").insert({"season": a.season, "part": i, "parts": len(parts), "data": p}).execute()
                break
            except Exception as e:
                print(f"  retry {attempt + 1}: {str(e)[:80]}")
                time.sleep(3)
        else:
            sys.exit(f"Stopped at part {i}. Re-run to rebuild this season.")
    print("Done.")


if __name__ == "__main__":
    main()
