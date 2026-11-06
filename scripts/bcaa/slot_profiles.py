#!/usr/bin/env python3
"""
slot_profiles.py: step 3. What each lineup slot actually faces, and what each batting event is
worth in each slot, from every completed plate appearance 2023-2026.

Reads  data/bcaa/all_pa_<year>.csv   (export_all_pa.py)
       data/bcaa/re24_pooled.csv     (build_re24.py)
Writes data/bcaa/slot_profiles.csv       one row per slot: the opportunity mix
       data/bcaa/slot_event_values.csv   run value of each event class, by slot

Run value of a plate appearance (standard linear weights):
  rv = runs scored on the play + RE(state after) - RE(state before)
  RE(state after) is the next plate appearance's base/out state in the same half-inning, or 0 if
  the half-inning ended. The bottom of a game's last inning is excluded from run values
  (walk-offs cut innings short), as in build_re24.py.
Games where any batter's slot does not hold all game (slot_ok = 0) are dropped entirely.

Out cost = RE(state) - RE(state with one more out and no runner movement); with two outs the
whole RE(state) is lost. It is the cost of making an out in that spot (The Book's idea).

Usage (from the theedge folder):
  python3 scripts/bcaa/slot_profiles.py
"""
import csv
import glob
import os
import sys
from collections import defaultdict

OUT_DIR = "data/bcaa"
CLASSES = ["1B", "2B", "3B", "HR", "BB", "K", "IPout"]
MAP = {"single": "1B", "double": "2B", "triple": "3B", "home_run": "HR",
       "walk": "BB", "intent_walk": "BB", "hit_by_pitch": "BB",
       "strikeout": "K", "strikeout_double_play": "K"}
OTHER = {"catcher_interf", "field_error"}      # kept out of the class table


def load_re():
    re = {}
    with open(os.path.join(OUT_DIR, "re24_pooled.csv")) as f:
        for r in csv.DictReader(f):
            if r["runs_rest_of_inning"] != "":
                re[(r["bases"], int(r["outs"]))] = float(r["runs_rest_of_inning"])
    return re


def event_class(e):
    e = (e or "").strip()
    if e in MAP:
        return MAP[e]
    if e in OTHER or e == "":
        return None
    return "IPout"          # field_out, force_out, double plays, sac fly/bunt, fielder's choice, etc.


def main():
    files = sorted(glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    if not files or not os.path.exists(os.path.join(OUT_DIR, "re24_pooled.csv")):
        print("Need all_pa_<year>.csv (export_all_pa.py) and re24_pooled.csv (build_re24.py).", file=sys.stderr)
        sys.exit(1)
    RE = load_re()

    n = defaultdict(int)                       # PA per slot
    team_games = defaultdict(int)
    flags = defaultdict(lambda: defaultdict(float))
    cls_n = defaultdict(lambda: defaultdict(int))
    cls_rv = defaultdict(lambda: defaultdict(float))
    games_used = games_dropped = 0

    for path in files:
        by_game = defaultdict(list)
        with open(path) as f:
            for r in csv.DictReader(f):
                by_game[r["game_pk"]].append(r)
        for pk, rows in by_game.items():
            if any(r["slot_ok"] != "1" for r in rows):
                games_dropped += 1
                continue
            games_used += 1
            rows.sort(key=lambda r: int(r["at_bat_number"]))
            halves = defaultdict(list)
            for r in rows:
                halves[(int(r["inning"]), 1 if r["half"] == "Bot" else 0)].append(r)
            last = max(halves)
            for key, hr in halves.items():
                walkoff_half = (key == last and key[1] == 1)
                for i, r in enumerate(hr):
                    s = int(r["slot"])
                    b, o = r["base_state"], int(r["outs"])
                    n[s] += 1
                    fl = flags[s]
                    fl["empty"] += b == "___"
                    fl["risp"] += (b[1] != "_" or b[2] != "_")
                    fl["on1st"] += b[0] != "_"
                    fl["outs0"] += o == 0
                    fl["outs1"] += o == 1
                    fl["outs2"] += o == 2
                    fl["empty_2out"] += (b == "___" and o == 2)
                    fl["dp_chance"] += (b[0] != "_" and o < 2)
                    fl["inning_leadoff"] += (i == 0)
                    cur = RE.get((b, o))
                    if cur is None:
                        continue
                    fl["re_sum"] += cur
                    fl["re_n"] += 1
                    fl["out_cost"] += cur - (RE.get((b, o + 1), 0.0) if o < 2 else 0.0)
                    if walkoff_half:
                        continue
                    if i + 1 < len(hr):
                        nx = hr[i + 1]
                        after = RE.get((nx["base_state"], int(nx["outs"])))
                    else:
                        after = 0.0
                    if after is None or r["runs_on_play"] == "":
                        continue
                    rv = int(r["runs_on_play"]) + after - cur
                    fl["rv_sum"] += rv
                    fl["rv_n"] += 1
                    c = event_class(r["event"])
                    if c:
                        cls_n[s][c] += 1
                        cls_rv[s][c] += rv
            # team-games: each game contributes two batting teams
            for s in range(1, 10):
                team_games[s] += 2

    print(f"Games used: {games_used:,}; dropped for slot drift: {games_dropped:,}\n")
    cols = ["slot", "pa_per_team_game", "bases_empty", "risp", "runner_on_1st", "two_out_none_on",
            "dp_chance", "inning_leadoff", "avg_RE_faced", "out_cost", "avg_rv_per_pa"]
    prof = []
    for s in range(1, 10):
        N = max(n[s], 1)
        fl = flags[s]
        prof.append([s, round(n[s] / team_games[s], 2), round(fl["empty"] / N, 4),
                     round(fl["risp"] / N, 4), round(fl["on1st"] / N, 4),
                     round(fl["empty_2out"] / N, 4), round(fl["dp_chance"] / N, 4),
                     round(fl["inning_leadoff"] / N, 4),
                     round(fl["re_sum"] / max(fl["re_n"], 1), 4),
                     round(fl["out_cost"] / max(fl["re_n"], 1), 4),
                     round(fl["rv_sum"] / max(fl["rv_n"], 1), 4)])
    with open(os.path.join(OUT_DIR, "slot_profiles.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(cols); w.writerows(prof)

    print("OPPORTUNITY MIX BY SLOT (share of that slot's plate appearances)")
    print("slot  PA/gm  empty  RISP   on1st  2out-none  DPchance  inn-leadoff  avgRE   outcost  rv/PA")
    for p in prof:
        print(f" {p[0]}    {p[1]:.2f}  {p[2]:.1%}  {p[3]:.1%}  {p[4]:.1%}  {p[5]:.1%}     {p[6]:.1%}     "
              f"{p[7]:.1%}      {p[8]:.3f}   {p[9]:.3f}   {p[10]:+.4f}")

    with open(os.path.join(OUT_DIR, "slot_event_values.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["slot"] + [f"{c}_rv" for c in CLASSES] + [f"{c}_n" for c in CLASSES])
        for s in range(1, 10):
            w.writerow([s] + [round(cls_rv[s][c] / max(cls_n[s][c], 1), 4) for c in CLASSES] +
                       [cls_n[s][c] for c in CLASSES])
    print("\nRUN VALUE OF EACH EVENT BY SLOT (runs; walk includes HBP)")
    print("slot    1B      2B      3B      HR      BB       K     inplay-out")
    for s in range(1, 10):
        print(f" {s}   " + "  ".join(f"{cls_rv[s][c] / max(cls_n[s][c], 1):+.3f}" for c in CLASSES))
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()