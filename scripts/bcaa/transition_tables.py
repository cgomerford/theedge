#!/usr/bin/env python3
"""
transition_tables.py: step 6. For every kind of plate-appearance result, in every base/out state,
what actually happened to the runners (and the batter), counted from 2023-2026 games.
The simulator draws from these tables instead of assuming how runners move.

Reads  data/bcaa/pa_states_<year>.csv   runner-by-runner moves on plate appearances with runners on
                                        (build_season.py; steals and wild pitches are kept out)
       data/bcaa/all_pa_<year>.csv      every plate appearance (export_all_pa.py): bases-empty
                                        plate appearances, and the check against the next base state
       data/bcaa/batter_end_<year>.csv  where the batter actually ended (add_batter_end.py); if it is
                                        missing the batter's end is assumed from the result
Writes data/bcaa/transitions.csv        class, base_state, outs, signature, count
       data/bcaa/transition_check.txt   copy of the printout

Result classes
  1B 2B 3B HR BB K ROE BUNT
  GB_DP     ground ball (or other) that ended in a double or triple play
  GB_other  every other ground-ball out, force out or fielder's choice
  POP LD    pop-up out, line-drive out
  FB_short FB_med FB_deep FB_vdeep   fly-ball out, by distance: <200, 200-299, 300-349, 350+ feet
  IP_other  anything else in play
Intentional walks are left out.

Signature, e.g. "1>3,2>4|B1": each runner's start>end base in start order (4 = scored, out = out),
then the batter's end ("B1","B2","B3","B4" = scored,"Bout"). New bases, runs and outs added are
all recoverable from it. The batter's own end base comes from the MLB feed (batter_end files);
only if that is blank is it assumed from the result.

The check against the next plate appearance skips cases where the next plate appearance had a steal,
wild pitch or similar, because those change the bases before that plate appearance finishes.

Usage (from the theedge folder):
  python3 scripts/bcaa/transition_tables.py
"""
import csv
import glob
import os
import sys
from collections import Counter, defaultdict
from itertools import groupby

OUT_DIR = "data/bcaa"
LOG = []
BATTER_END = {"single": "1", "double": "2", "triple": "3", "home_run": "4", "walk": "1",
              "hit_by_pitch": "1", "field_error": "1", "catcher_interf": "1", "force_out": "1",
              "fielders_choice": "1", "fielders_choice_out": "1"}
SIMPLE = {"single": "1B", "double": "2B", "triple": "3B", "home_run": "HR", "walk": "BB",
          "hit_by_pitch": "BB", "strikeout": "K", "strikeout_double_play": "K",
          "field_error": "ROE", "catcher_interf": "ROE"}
DP_EVENTS = {"grounded_into_double_play", "double_play", "triple_play"}
CLASSES = ["1B", "2B", "3B", "HR", "BB", "K", "ROE", "BUNT", "GB_DP", "GB_other", "POP", "LD",
           "FB_short", "FB_med", "FB_deep", "FB_vdeep", "IP_other"]


def out(s=""):
    print(s); LOG.append(s)


def klass(ev, bb, dist):
    if ev == "intent_walk":
        return None
    if ev in SIMPLE:
        return SIMPLE[ev]
    if ev.startswith("sac_bunt"):
        return "BUNT"
    if bb == "ground_ball":
        return "GB_DP" if ev in DP_EVENTS else "GB_other"
    if ev in DP_EVENTS and bb not in ("fly_ball", "line_drive", "popup"):
        return "GB_DP"
    if bb == "popup":
        return "POP"
    if bb == "line_drive":
        return "LD"
    if bb == "fly_ball":
        try:
            d = float(dist)
        except (TypeError, ValueError):
            return "FB_med"
        return "FB_short" if d < 200 else "FB_med" if d < 300 else "FB_deep" if d < 350 else "FB_vdeep"
    return "IP_other"


def batter_end(ev):
    return BATTER_END.get(ev, "out")


def derive(base_state, moves, ev, be=""):
    """Returns (runs, outs_added, new_bases string, signature) or None if the moves are unusable."""
    ends, ordered = [], []
    for m in moves:
        rid_s, rest = m.split(":")
        s, e = rest.split(">")
        ordered.append((int(s), e))
    ordered.sort()
    runs = sum(1 for _, e in ordered if e == "4")
    outs = sum(1 for _, e in ordered if e == "out")
    occ = set(e for _, e in ordered if e in ("1", "2", "3"))
    be = be or batter_end(ev)
    if be == "4":
        runs += 1
    elif be == "out":
        outs += 1
    elif be in occ:
        return None
    else:
        occ.add(be)
    nb = "".join(str(b) if str(b) in occ else "_" for b in (1, 2, 3))
    sig = ",".join(f"{s}>{e}" for s, e in ordered) + "|B" + be
    return runs, outs, nb, sig


def main():
    ps_files = sorted(glob.glob(os.path.join(OUT_DIR, "pa_states_20*.csv")))
    pa_files = sorted(glob.glob(os.path.join(OUT_DIR, "all_pa_*.csv")))
    if not ps_files:
        print("Need pa_states_<year>.csv files.", file=sys.stderr); sys.exit(1)
    have_all = bool(pa_files)
    if not have_all:
        out("(all_pa files not found: bases-empty rows and the next-state check are skipped)")

    bend = {}
    for p in sorted(glob.glob(os.path.join(OUT_DIR, "batter_end_*.csv"))):
        with open(p) as f:
            for r in csv.DictReader(f):
                if r["bend"]:
                    bend[(r["game_pk"], r["at_bat_number"])] = r["bend"]
    out(f"Batter end bases loaded from the MLB feed: {len(bend):,}" if bend else
        "(no batter_end files found: the batter's end base is assumed from the result)")
    moved = set()
    for p in ps_files:
        with open(p) as f:
            for r in csv.DictReader(f):
                if r["other_moves_in_pa"]:
                    moved.add((r["game_pk"], r["at_bat_number"]))

    # next-state lookup for validation: (game, at_bat) -> (outs_next, bases_next) in the same half-inning
    nxt = {}
    empty_rows = []
    for p in pa_files:
        with open(p) as f:
            for pk, grp in groupby(csv.DictReader(f), key=lambda r: r["game_pk"]):
                rows = list(grp)
                halves = defaultdict(list)
                for r in rows:
                    halves[(r["inning"], r["half"])].append(r)
                for hr in halves.values():
                    for i, r in enumerate(hr):
                        if r["base_state"] == "___":
                            k = klass(r["event"], r["bb_type"], r["hit_distance_sc"])
                            if k:
                                empty_rows.append((k, r["outs"], "|B" + (bend.get((r["game_pk"], r["at_bat_number"])) or batter_end(r["event"])), r["event"]))
                        if i + 1 < len(hr):
                            nxt[(r["game_pk"], r["at_bat_number"])] = (hr[i + 1]["outs"], hr[i + 1]["base_state"],
                                                                        hr[i + 1]["at_bat_number"])

    table = Counter()
    n_rows = bad = 0
    runs_ok = runs_n = 0
    state_ok = state_n = 0
    outs_ok = outs_n = 0
    miss_by_event = Counter(); tot_by_event = Counter(); chk_by_event = Counter()
    for p in ps_files:
        with open(p) as f:
            for r in csv.DictReader(f):
                if r["valid"] != "True":
                    continue
                ev = r["event"]
                k = klass(ev, r["bb_type"], r["hit_distance_sc"])
                if k is None:
                    continue
                moves = r["runner_moves"].split()
                d = derive(r["base_state"], moves, ev, bend.get((r["game_pk"], r["at_bat_number"]), ""))
                n_rows += 1
                if d is None:
                    bad += 1
                    continue
                runs, outs_added, nb, sig = d
                table[(k, r["base_state"], r["outs_before"], sig)] += 1
                tot_by_event[ev] += 1
                try:
                    runs_n += 1
                    runs_ok += runs == int(r["runs_on_play"])
                except ValueError:
                    runs_n -= 1
                nx = nxt.get((r["game_pk"], r["at_bat_number"]))
                if nx and not r["other_moves_in_pa"] and (r["game_pk"], nx[2]) not in moved:
                    chk_by_event[ev] += 1
                    state_n += 1
                    outs_n += 1
                    good_o = int(nx[0]) == int(r["outs_before"]) + outs_added
                    good_s = nx[1] == nb
                    outs_ok += good_o
                    state_ok += good_o and good_s
                    if not (good_o and good_s):
                        miss_by_event[ev] += 1
    for k, o, sig, ev in empty_rows:
        table[(k, "___", o, sig)] += 1

    with open(os.path.join(OUT_DIR, "transitions.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["class", "base_state", "outs", "signature", "count"])
        for (k, b, o, sig), c in sorted(table.items()):
            w.writerow([k, b, o, sig, c])

    out(f"Runner-on plate appearances read: {n_rows:,} ({bad:,} unusable and skipped); "
        f"bases-empty plate appearances added: {len(empty_rows):,}")
    out("\nCHECKS AGAINST WHAT ACTUALLY HAPPENED")
    out(f"  Derived runs equal runs on the play:           {runs_ok / max(runs_n, 1):.2%} of {runs_n:,}")
    if state_n:
        out(f"  Derived outs match the next plate appearance:  {outs_ok / state_n:.2%} of {state_n:,} (next plate appearance had no steal or wild pitch)")
        out(f"  Derived outs AND bases match the next PA:      {state_ok / state_n:.2%}")
        worst = [(e, miss_by_event[e] / chk_by_event[e], chk_by_event[e]) for e in miss_by_event if chk_by_event[e] >= 300]
        worst.sort(key=lambda x: -x[1])
        out("  Results with the most mismatches (event, mismatch rate, count): " +
            "; ".join(f"{e} {m:.1%} ({n:,})" for e, m, n in worst[:5]))

    cnt = Counter()
    for (k, b, o, sig), c in table.items():
        cnt[k] += c
    out("\nPLATE APPEARANCES BY RESULT CLASS")
    out("  " + "   ".join(f"{k} {cnt[k]:,}" for k in CLASSES))

    def share(k, b, o, pred):
        tot = sum(c for (kk, bb, oo, sig), c in table.items() if kk == k and bb == b and oo == o)
        hit = sum(c for (kk, bb, oo, sig), c in table.items() if kk == k and bb == b and oo == o and pred(sig))
        return hit / tot if tot else float("nan"), tot

    out("\nSINGLE WITH A RUNNER ON FIRST ONLY: where does the runner end up?")
    out("  outs   to 2nd    to 3rd    scores    out      N")
    for o in "012":
        row = [share("1B", "1__", o, lambda s, e=e: s.startswith(f"1>{e}")) for e in ("2", "3", "4", "out")]
        out(f"   {o}    " + "   ".join(f"{v[0]:6.1%}" for v in row) + f"   {row[0][1]:,}")
    out("\nGROUND-BALL OUTS WITH A RUNNER ON FIRST ONLY: how often is it a double play?")
    for o in "01":
        a = sum(c for (k, b, oo, s), c in table.items() if k == "GB_DP" and b == "1__" and oo == o)
        b_ = sum(c for (k, b, oo, s), c in table.items() if k == "GB_other" and b == "1__" and oo == o)
        out(f"  {o} outs: {a / max(a + b_, 1):.1%} of {a + b_:,}")
    out("\nRUNNER ON THIRD ONLY, FEWER THAN TWO OUTS: how often does the runner score?")
    out("  result       0 outs      1 out")
    for k in ("GB_other", "FB_short", "FB_med", "FB_deep", "FB_vdeep", "LD", "POP", "K"):
        v = [share(k, "__3", o, lambda s: s.startswith("3>4")) for o in "01"]
        out(f"  {k:9s}   {v[0][0]:6.1%} ({v[0][1]:,})   {v[1][0]:6.1%} ({v[1][1]:,})")
    with open(os.path.join(OUT_DIR, "transition_check.txt"), "w") as f:
        f.write("\n".join(LOG))
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()