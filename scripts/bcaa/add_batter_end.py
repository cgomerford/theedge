#!/usr/bin/env python3
"""
add_batter_end.py: step 6a. Where did the BATTER end up on every plate appearance?

transition_tables.py had to assume the batter's end base from the result (a single = first base).
That misses a batter who takes second on the throw, reaches on a fielder's choice, is thrown out
stretching a hit, and so on. The cached MLB game feeds record the batter's own movement, so this
script reads it directly.

Reads  data/bcaa/all_pa_<year>.csv            (export_all_pa.py)
       data/bcaa/cache/feeds/<game_pk>.json   (cached by build_season.py)
Writes data/bcaa/batter_end_<year>.csv        game_pk, at_bat_number, bend
       bend = 1, 2, 3 (reached that base), 4 (scored), out (put out), or blank (feed has no entry)

Prints how the batter's end varies by result, which is also the check that the feed is being read right.

Usage (from the theedge folder):
  python3 scripts/bcaa/add_batter_end.py
"""
import csv
import glob
import json
import os
import sys
from collections import Counter, defaultdict
from itertools import groupby

OUT_DIR = "data/bcaa"
FEEDS = os.path.join(OUT_DIR, "cache", "feeds")
BASE_NUM = {"1B": "1", "2B": "2", "3B": "3", "score": "4"}


def batter_end(play, batter_id):
    segs = [x for x in play.get("runners", [])
            if str(x.get("details", {}).get("runner", {}).get("id")) == batter_id]
    if not segs:
        return ""
    if any(x.get("movement", {}).get("isOut") for x in segs):
        return "out"
    return BASE_NUM.get(segs[-1].get("movement", {}).get("end"), "")


def main():
    files = sorted(glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    if not files or not os.path.isdir(FEEDS):
        print(f"Need all_pa_<year>.csv and the feed cache at {FEEDS}.", file=sys.stderr); sys.exit(1)
    by_event = defaultdict(Counter)
    total = blank = missing_games = 0
    for p in files:
        year = os.path.basename(p)[7:11]
        rows_out = []
        with open(p) as f:
            for pk, grp in groupby(csv.DictReader(f), key=lambda r: r["game_pk"]):
                fp = os.path.join(FEEDS, f"{pk}.json")
                rows = list(grp)
                if not os.path.exists(fp):
                    missing_games += 1
                    for r in rows:
                        rows_out.append((pk, r["at_bat_number"], ""))
                        total += 1; blank += 1
                    continue
                with open(fp) as g:
                    slim = json.load(g)
                for r in rows:
                    play = slim.get(str(r["at_bat_number"]))
                    be = batter_end(play, r["batter"]) if play else ""
                    rows_out.append((pk, r["at_bat_number"], be))
                    total += 1
                    blank += be == ""
                    by_event[r["event"]][be or "blank"] += 1
        with open(os.path.join(OUT_DIR, f"batter_end_{year}.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["game_pk", "at_bat_number", "bend"])
            w.writerows(rows_out)
        print(f"{year}: {len(rows_out):,} plate appearances written")
    print(f"\nTotal {total:,}; no batter entry in the feed for {blank:,} ({blank / max(total, 1):.2%}); "
          f"games with no cached feed: {missing_games:,}")
    print("\nWHERE THE BATTER ENDED, BY RESULT (share of that result's plate appearances)")
    print("event                      N       1st     2nd     3rd    scored    out    blank")
    for ev, c in sorted(by_event.items(), key=lambda kv: -sum(kv[1].values()))[:14]:
        n = sum(c.values())
        print(f"{ev:24s}{n:>8,}   " + "  ".join(f"{c[k] / n:6.1%}" for k in ("1", "2", "3", "4", "out", "blank")))
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()