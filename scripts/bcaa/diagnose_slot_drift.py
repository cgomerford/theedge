#!/usr/bin/env python3
"""
diagnose_slot_drift.py: why do ~11% of games fail the slot check?

Reads data/bcaa/all_pa_<year>.csv (export_all_pa.py). Read-only: changes nothing.
For every game with any slot_ok = 0 it finds the batting team where the order breaks and reports:
  - how many games per season, and whether extra-inning games are over-represented
  - what happened in the plate appearance just before the first bad row (events and innings)
  - a window of plate appearances around the break for five sample games, so we can see by eye
    whether a plate appearance is missing, doubled, or a batter appears out of order

Usage (from the theedge folder):
  python3 scripts/bcaa/diagnose_slot_drift.py
"""
import csv
import glob
import os
import random
from collections import Counter, defaultdict

OUT_DIR = "data/bcaa"


def main():
    files = sorted(glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    tot = Counter(); bad = Counter()
    extras_all = extras_bad = 0
    prev_event = Counter(); all_event = Counter()
    first_inning = Counter()
    team_seq_len_bad = []
    samples = []
    nbad_rows = Counter()
    for path in files:
        year = os.path.basename(path)[7:11]
        by_game = defaultdict(list)
        with open(path) as f:
            for r in csv.DictReader(f):
                by_game[r["game_pk"]].append(r)
        for pk, rows in by_game.items():
            tot[year] += 1
            rows.sort(key=lambda r: int(r["at_bat_number"]))
            went_extras = max(int(r["inning"]) for r in rows) > 9
            extras_all += went_extras
            for r in rows:
                all_event[r["event"]] += 1
            bad_rows = [r for r in rows if r["slot_ok"] != "1"]
            if not bad_rows:
                continue
            bad[year] += 1
            extras_bad += went_extras
            nbad_rows[min(len(bad_rows), 10)] += 1
            team = bad_rows[0]["bat_team"]
            seq = [r for r in rows if r["bat_team"] == team]
            idx = next(i for i, r in enumerate(seq) if r["slot_ok"] != "1")
            team_seq_len_bad.append(len(seq))
            if idx > 0:
                prev_event[seq[idx - 1]["event"]] += 1
            first_inning[int(seq[idx]["inning"])] += 1
            samples.append((year, pk, team, seq, idx))

    print("GAMES WITH A BAD SLOT, BY SEASON")
    for y in sorted(tot):
        print(f"  {y}: {bad[y]:,} of {tot[y]:,} ({bad[y] / tot[y]:.1%})")
    nb, nt = sum(bad.values()), sum(tot.values())
    print(f"\nExtra-inning games: {extras_all / nt:.1%} of all games, {extras_bad / max(nb, 1):.1%} of bad games")
    print("\nBad rows per bad game (10 = ten or more):", dict(sorted(nbad_rows.items())))
    print("\nInning in which the first bad row appears:", dict(sorted(first_inning.items())))
    tot_ev = sum(all_event.values())
    print("\nEvent in the plate appearance just BEFORE the first bad row (share of bad games vs share of all PAs):")
    for e, c in prev_event.most_common(8):
        print(f"  {e:28s} {c / max(nb, 1):6.1%}   (all PAs: {all_event[e] / tot_ev:.1%})")
    print(f"\nAverage plate appearances by the affected team in a bad game: "
          f"{sum(team_seq_len_bad) / max(len(team_seq_len_bad), 1):.1f}")

    random.seed(7)
    print("\nFIVE SAMPLE BAD GAMES (the affected team only; * marks the first bad row)")
    for year, pk, team, seq, idx in random.sample(samples, min(5, len(samples))):
        print(f"\n{year} game {pk}, batting team {team}")
        print("   n  slot  ok  inn  batter                     event")
        last_bad = max(i for i, r in enumerate(seq) if r["slot_ok"] != "1")
        for i in range(max(0, idx - 4), min(len(seq), last_bad + 2, idx + 24)):
            r = seq[i]
            star = "*" if i == idx else " "
            print(f" {star}{r['team_pa_n']:>3}  {r['slot']:>3}   {r['slot_ok']}   {r['inning']:>2}  "
                  f"{(r['batter_name'] or r['batter'])[:24]:24s}   {r['event']}")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()