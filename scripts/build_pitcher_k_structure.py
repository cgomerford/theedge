#!/usr/bin/env python3
"""
scripts/build_pitcher_k_structure.py

Builds pitcher_k_structure (supabase/migrations/20261030180000_pitcher_k_structure.sql): for every pitcher, plate appearances and strikeouts the first, second and third-or-later time he
faced the same hitter in a game, and how the strikeouts were built (the pitch that ended them, the pitch they opened with, swinging or looking, pitches in the at-bat). pitcher_id 0 = the league.

TABLE OWNERSHIP: this script is the SINGLE writer of pitcher_k_structure. It rebuilds one season at a time.
Source: league_ab_index (the at-bat file written by scripts/build_league_ab_index.py), so run that first when new pitches have loaded. No pitch_events scan.
The look is how many plate appearances that hitter has had against THAT pitcher in that game so far (1 = the first time he faced him). A strikeout is an at-bat whose result is a strikeout
(swinging: the last pitch was a swing and miss or foul tip; looking: a called strike).

Usage:  python3 scripts/build_pitcher_k_structure.py --season 2026 [--dry-run]
Prints the league line and one pitcher's lines, then waits 5 seconds (Ctrl+C aborts) before writing.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import os
import struct
import sys
import time
from collections import Counter, defaultdict
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


def load_index(sb, season):
    for attempt in range(4):
        try:
            parts = sb.table("league_ab_index").select("part,data").eq("season", season).order("part").execute().data
            break
        except Exception as e:
            print(f"  retry {attempt + 1}: {str(e)[:70]}")
            time.sleep(3)
    else:
        sys.exit("Could not read the at-bat index.")
    if not parts:
        sys.exit("league_ab_index is empty for this season: run build_league_ab_index.py first.")
    blob = gzip.decompress(base64.b64decode("".join(p["data"] for p in parts)))
    hl = struct.unpack("<I", blob[4:8])[0]
    h = json.loads(blob[8:8 + hl])
    n, m, o = h["nPitches"], h["nAbs"], 8 + hl
    ix = {}
    for name, dtype in [("type", np.uint8), ("speed2", np.uint8), ("hb2", np.int8), ("ivb2", np.int8), ("zone", np.uint8), ("res", np.uint8)]:
        ix[name] = np.frombuffer(blob, dtype, n, o); o += n
    for name, dtype, size in [("start", "<u4", 4), ("pitcher", "<u4", 4), ("batter", "<u4", 4), ("gamepk", "<u4", 4), ("date", "<u2", 2), ("len", np.uint8, 1), ("hand", np.uint8, 1), ("stand", np.uint8, 1), ("outcome", np.uint8, 1)]:
        ix[name] = np.frombuffer(blob, dtype, m, o); o += m * size
    ix["meta"] = h
    return ix


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--show", type=int, help="print this pitcher's rows (and the league's) as JSON, for checking a screen")
    a = ap.parse_args()
    if not URL or not KEY:
        sys.exit("Missing Supabase URL / service key in .env.local")
    sb = create_client(URL, KEY)
    ix = load_index(sb, a.season)
    types, outcomes = ix["meta"]["types"], ix["meta"]["outcomes"]
    K = outcomes.index("K")
    m = int(ix["meta"]["nAbs"])
    seen = Counter()
    cells = defaultdict(lambda: {"pas": 0, "ks": 0, "sw": 0, "lk": 0, "kp": 0, "fin": Counter(), "opn": Counter()})
    for a_ in range(m):
        pit, bat, g = int(ix["pitcher"][a_]), int(ix["batter"][a_]), int(ix["gamepk"][a_])
        seen[(g, pit, bat)] += 1
        look = min(seen[(g, pit, bat)], 3)
        s, L = int(ix["start"][a_]), int(ix["len"][a_])
        k = ix["outcome"][a_] == K
        for who in (pit, 0):
            c = cells[(who, look)]
            c["pas"] += 1
            if k:
                c["ks"] += 1
                last = s + L - 1
                r = int(ix["res"][last])
                c["sw"] += r == 3
                c["lk"] += r == 2
                c["kp"] += L
                c["fin"][types[ix["type"][last]]] += 1
                c["opn"][types[ix["type"][s]]] += 1
    rows = [{"season": a.season, "pitcher_id": p, "look": look, "pas": c["pas"], "ks": c["ks"], "swinging_ks": int(c["sw"]), "looking_ks": int(c["lk"]), "k_pitches": int(c["kp"]),
             "finishers": dict(c["fin"]), "openers": dict(c["opn"])} for (p, look), c in cells.items()]
    print(f"{len(rows):,} rows for {len({r['pitcher_id'] for r in rows}) - 1:,} pitchers (+ league).")
    for look in (1, 2, 3):
        c = cells[(0, look)]
        top = ", ".join(f"{t} {100 * n / c['ks']:.0f}%" for t, n in c["fin"].most_common(3))
        print(f"League, time {look}: {c['pas']:,} PAs, {c['ks']:,} Ks ({100 * c['ks'] / c['pas']:.1f}%), swinging {100 * c['sw'] / c['ks']:.0f}%, {c['kp'] / c['ks']:.2f} pitches per K; finished on {top}")
    pitchers = sorted({p for (p, _) in list(cells) if p})
    pas_of = lambda p, l: cells[(p, l)]["pas"] if (p, l) in cells else 0
    big = max(pitchers, key=lambda p: pas_of(p, 1) + pas_of(p, 2))
    print(f"\nBusiest pitcher in the index: {big}")
    for look in (1, 2, 3):
        c = cells.get((big, look))
        if c and c["pas"]:
            print(f"  time {look}: {c['pas']} PAs, {c['ks']} Ks ({100 * c['ks'] / c['pas']:.1f}%), finishers {dict(c['fin'].most_common(3))}, openers {dict(c['opn'].most_common(3))}")
    if a.show:
        print("SHOW_JSON " + json.dumps([r for r in rows if r["pitcher_id"] in (a.show, 0)]))
    if a.dry_run:
        print("Dry run: nothing written.")
        return
    try:
        sb.table("pitcher_k_structure").select("season").limit(1).execute()
    except Exception:
        sys.exit("The table pitcher_k_structure does not exist yet: run supabase/migrations/20261030180000_pitcher_k_structure.sql in the SQL Editor first. Nothing was written.")
    print("--- Writing to Supabase in 5 seconds. Ctrl+C to abort. ---")
    time.sleep(5)
    sb.table("pitcher_k_structure").delete().eq("season", a.season).execute()
    for i in range(0, len(rows), 500):
        for attempt in range(4):
            try:
                sb.table("pitcher_k_structure").insert(rows[i:i + 500]).execute()
                break
            except Exception as e:
                print(f"  retry {attempt + 1}: {str(e)[:70]}")
                time.sleep(3)
        else:
            sys.exit(f"Stopped at row {i}. Re-run to rebuild this season.")
    print("Done.")


if __name__ == "__main__":
    main()
