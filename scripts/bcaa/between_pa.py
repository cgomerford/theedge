#!/usr/bin/env python3
"""
between_pa.py: what happens BETWEEN plate appearances.

The engine only moves runners when a batter's plate appearance ends. Steals, caught stealing,
pickoffs, wild pitches, passed balls and balks happen in between, and they change which bases are
occupied by the time the next hitter finishes his plate appearance. They also score some runs
(about 0.07 per team-game) and end some innings. This script measures them.

For every plate appearance it works out the base/out state right after the batter's own result
(from the runner-by-runner moves and the batter's real end base), then looks at what the next
plate appearance in the same half-inning actually started with, and the runs scored in between.
The difference is the between-plate-appearance event. If the half-inning ended with fewer than three
outs and no next plate appearance, an out on the bases ended it (counted as 'inning over').
The bottom of a game's last inning is left out (walk-offs).

Reads  data/bcaa/all_pa_<year>.csv, pa_states_<year>.csv, batter_end_<year>.csv
Writes data/bcaa/between.csv   post_mask, post_outs, next_mask, next_outs, runs, count
       (mask: 1 = runner on first, 2 = second, 4 = third; next_outs 3 = the inning ended on the bases)
sim_engine.py applies it automatically once the file exists (after patch_sim_engine.py).

Usage (from the theedge folder):
  python3 scripts/bcaa/between_pa.py
"""
import csv
import glob
import os
import sys
from collections import Counter, defaultdict
from itertools import groupby

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from transition_tables import derive, batter_end as default_batter_end

OUT_DIR = "data/bcaa"


def mask_of(bs):
    return (1 if bs[0] != "_" else 0) | (2 if bs[1] != "_" else 0) | (4 if bs[2] != "_" else 0)


def mask_of_str(nb):
    return mask_of(nb)


def main():
    pa_files = sorted(glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    ps_files = sorted(glob.glob(os.path.join(OUT_DIR, "pa_states_20*.csv")))
    if not pa_files or not ps_files:
        print("Need all_pa_<year>.csv and pa_states_<year>.csv.", file=sys.stderr); sys.exit(1)
    bend = {}
    for p in glob.glob(os.path.join(OUT_DIR, "batter_end_*.csv")):
        with open(p) as f:
            for r in csv.DictReader(f):
                if r["bend"]:
                    bend[(r["game_pk"], r["at_bat_number"])] = r["bend"]
    post = {}
    for p in ps_files:
        with open(p) as f:
            for r in csv.DictReader(f):
                if r["valid"] != "True":
                    continue
                key = (r["game_pk"], r["at_bat_number"])
                d = derive(r["base_state"], r["runner_moves"].split(), r["event"], bend.get(key, ""))
                if d:
                    post[key] = (mask_of_str(d[2]), d[1])         # new bases, outs added
    table = defaultdict(Counter)
    n_pa = 0
    for p in pa_files:
        with open(p) as f:
            for pk, grp in groupby(csv.DictReader(f), key=lambda r: r["game_pk"]):
                halves = defaultdict(list)
                for r in grp:
                    halves[(int(r["inning"]), 1 if r["half"] == "Bot" else 0)].append(r)
                last = max(halves)
                for key_h, hr in halves.items():
                    if key_h == last and key_h[1] == 1:
                        continue                                  # walk-off half
                    for i, r in enumerate(hr):
                        key = (r["game_pk"], r["at_bat_number"])
                        if r["base_state"] == "___":
                            be = bend.get(key) or default_batter_end(r["event"])
                            pm = {"1": 1, "2": 2, "3": 4}.get(be, 0)
                            oa = 1 if be == "out" else 0
                        elif key in post:
                            pm, oa = post[key]
                        else:
                            continue
                        po = int(r["outs"]) + oa
                        if po >= 3:
                            continue
                        if i + 1 < len(hr):
                            nx = hr[i + 1]
                            try:
                                rb = int(nx["bat_score"]) - int(r["post_bat_score"])
                            except ValueError:
                                continue
                            if rb < 0:
                                continue
                            out_key = (mask_of(nx["base_state"]), int(nx["outs"]), rb)
                        else:
                            out_key = (0, 3, 0)                   # inning ended on the bases
                        table[(pm, po)][out_key] += 1
                        n_pa += 1
    with open(os.path.join(OUT_DIR, "between.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["post_mask", "post_outs", "next_mask", "next_outs", "runs", "count"])
        for (pm, po), c in sorted(table.items()):
            for (nm, no, ru), n in sorted(c.items()):
                w.writerow([pm, po, nm, no, ru, n])

    tot = ident = runs = ended = 0
    for (pm, po), c in table.items():
        for (nm, no, ru), n in c.items():
            tot += n
            runs += ru * n
            ended += n if no == 3 else 0
            ident += n if (nm == pm and no == po and ru == 0) else 0
    print(f"Plate appearances with a following state to compare: {tot:,}")
    print(f"  nothing happened in between:                         {ident / tot:.2%}")
    print(f"  something changed the bases, outs or score:          {1 - ident / tot:.2%}")
    print(f"  runs scored in between, per 1,000 plate appearances: {1000 * runs / tot:.2f}")
    print(f"  innings ended by an out on the bases, per 1,000 PAs: {1000 * ended / tot:.2f}")
    print("\nBy the state after the batter's result (share where something happened in between):")
    print("  runners        0 outs     1 out      2 outs     (count)")
    names = {0: "none", 1: "1st", 2: "2nd", 3: "1st+2nd", 4: "3rd", 5: "1st+3rd", 6: "2nd+3rd", 7: "loaded"}
    for pm in range(8):
        row = f"  {names[pm]:9s}"
        cnt = 0
        for po in (0, 1, 2):
            c = table.get((pm, po), {})
            n = sum(c.values())
            cnt += n
            moved = n - c.get((pm, po, 0), 0) if n else 0
            row += f"   {moved / n:6.1%}  " if n else "      n/a   "
        print(row + f"   {cnt:,}")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()