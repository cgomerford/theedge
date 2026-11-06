#!/usr/bin/env python3
"""
export_all_pa.py: step 2. Every completed plate appearance (bases empty included)
from the cached Savant day files, with lineup slot, pitches seen and context.

Reads  data/bcaa/cache/savant/<YYYY-MM-DD>.json   (written by build_season.py)
Writes data/bcaa/all_pa_<year>.csv

Columns added beyond the raw Savant fields:
  slot              lineup slot 1-9. The n-th completed plate appearance by a team in a game
                    belongs to slot ((n-1) mod 9)+1. This is exact because a plate appearance only
                    advances the order when it is completed, and substitutes inherit the slot of the
                    player they replace.
  slot_ok           1 if this batter sits in the same slot as his other plate appearances that game
                    (flags batting out of order, double-switch oddities, bad rows)
  team_pa_n         this plate appearance's number among the team's completed plate appearances
  pitches           pitches in the plate appearance (pitch_number of the last pitch)
  prev_pitches      pitches in the team's previous completed plate appearance (blank for the first)
  prev_same_half    1 if that previous plate appearance was in the same half-inning
  sp_flag           1 if the pitcher is the first pitcher the fielding team used in the game
  tto               times through the order: this batter's plate appearance number against this pitcher
  p_pitches_before  pitches the pitcher had thrown in the game before this plate appearance
                    (sum of pitches in his earlier completed plate appearances: a close approximation)
  runs_on_play      post_bat_score - bat_score
Rows that are not completed plate appearances (caught stealing, pickoff or similar events that end
an inning mid plate appearance) are dropped and counted in the printout.

Usage (from the theedge folder):
  python3 scripts/bcaa/export_all_pa.py
"""
import csv
import glob
import json
import os
import sys
from collections import Counter, defaultdict

CACHE = "data/bcaa/cache/savant"
OUT_DIR = "data/bcaa"
INCOMPLETE_PREFIXES = ("truncated_pa", "caught_stealing", "pickoff", "stolen_base", "wild_pitch",
                       "passed_ball", "balk", "other_out")

FIELDS = ["season", "game_pk", "game_date", "at_bat_number", "inning", "half", "bat_team", "fld_team",
          "batter", "batter_name", "stand", "pitcher", "p_throws", "sp_flag", "tto", "p_pitches_before",
          "slot", "slot_ok", "team_pa_n", "outs", "base_state", "event", "bb_type", "launch_speed",
          "launch_angle", "hc_x", "hc_y", "hit_distance_sc", "hit_location", "pitches", "prev_pitches",
          "prev_same_half", "bat_score", "post_bat_score", "runs_on_play"]


def base_code(r):
    return ("1" if str(r.get("on_1b") or "").strip() else "_") + \
           ("2" if str(r.get("on_2b") or "").strip() else "_") + \
           ("3" if str(r.get("on_3b") or "").strip() else "_")


def to_int(v, default=None):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def is_incomplete(event):
    e = (event or "").strip().lower()
    return e == "" or e.startswith(INCOMPLETE_PREFIXES)


def load_year(paths):
    """Dedupe on (game, at-bat): keep the row with the highest pitch number."""
    best = {}
    for p in paths:
        with open(p) as f:
            for r in json.load(f):
                if str(r.get("game_type", "R")) not in ("R", ""):
                    continue
                k = (str(r["game_pk"]), to_int(r.get("at_bat_number")))
                if k[1] is None:
                    continue
                pn = to_int(r.get("pitch_number"), 0)
                if k not in best or pn > to_int(best[k].get("pitch_number"), 0):
                    best[k] = r
    games = defaultdict(list)
    for (pk, _), r in best.items():
        games[pk].append(r)
    return games


def process_game(year, pk, rows, stats):
    rows.sort(key=lambda r: to_int(r["at_bat_number"]))
    first_pitcher = {}
    pit_pitches = defaultdict(int)           # (fld_team, pitcher) -> pitches so far
    faced = Counter()                        # (batter, pitcher) -> count
    team_n = Counter()
    prev = {}                                # bat_team -> (pitches, inning, half)
    out_rows = []
    for r in rows:
        half = r.get("inning_topbot", "")
        bat_team = r.get("away_team") if half == "Top" else r.get("home_team")
        fld_team = r.get("home_team") if half == "Top" else r.get("away_team")
        pitcher = r.get("pitcher")
        first_pitcher.setdefault(fld_team, pitcher)
        if is_incomplete(r.get("events")):
            stats["incomplete"] += 1
            continue
        pitches = to_int(r.get("pitch_number"), 0)
        team_n[bat_team] += 1
        n = team_n[bat_team]
        slot = (n - 1) % 9 + 1
        faced[(r["batter"], pitcher)] += 1
        inn = to_int(r.get("inning"))
        pv = prev.get(bat_team)
        prev_p = pv[0] if pv else ""
        prev_same = (1 if (pv[1] == inn and pv[2] == half) else 0) if pv else ""
        prev[bat_team] = (pitches, inn, half)
        bs, pbs = to_int(r.get("bat_score")), to_int(r.get("post_bat_score"))
        out_rows.append({
            "season": year, "game_pk": pk, "game_date": r.get("game_date"),
            "at_bat_number": r["at_bat_number"], "inning": inn, "half": half,
            "bat_team": bat_team, "fld_team": fld_team,
            "batter": r["batter"], "batter_name": r.get("player_name"),
            "stand": r.get("stand"), "pitcher": pitcher, "p_throws": r.get("p_throws"),
            "sp_flag": 1 if first_pitcher[fld_team] == pitcher else 0,
            "tto": faced[(r["batter"], pitcher)],
            "p_pitches_before": pit_pitches[(fld_team, pitcher)],
            "slot": slot, "slot_ok": 1, "team_pa_n": n,
            "outs": r.get("outs_when_up"), "base_state": base_code(r), "event": r.get("events"),
            "bb_type": r.get("bb_type"), "launch_speed": r.get("launch_speed"),
            "launch_angle": r.get("launch_angle"), "hc_x": r.get("hc_x"), "hc_y": r.get("hc_y"),
            "hit_distance_sc": r.get("hit_distance_sc"), "hit_location": r.get("hit_location"),
            "pitches": pitches, "prev_pitches": prev_p, "prev_same_half": prev_same,
            "bat_score": bs, "post_bat_score": pbs,
            "runs_on_play": (pbs - bs) if (bs is not None and pbs is not None) else "",
        })
        pit_pitches[(fld_team, pitcher)] += pitches
    # slot_ok: each batter should hold one slot all game (his modal slot)
    per_batter = defaultdict(Counter)
    for o in out_rows:
        per_batter[(o["bat_team"], o["batter"])][o["slot"]] += 1
    for o in out_rows:
        modal = per_batter[(o["bat_team"], o["batter"])].most_common(1)[0][0]
        o["slot_ok"] = 1 if o["slot"] == modal else 0
    return out_rows


def main():
    files = sorted(glob.glob(os.path.join(CACHE, "*.json")))
    if not files:
        print(f"No cached Savant files in {CACHE}. Run build_season.py first.", file=sys.stderr)
        sys.exit(1)
    by_year = defaultdict(list)
    for p in files:
        by_year[os.path.basename(p)[:4]].append(p)
    for year, paths in sorted(by_year.items()):
        stats = Counter()
        games = load_year(paths)
        n_pa, slot_n, slot_games = 0, Counter(), Counter()
        empty = Counter()
        out_path = os.path.join(OUT_DIR, f"all_pa_{year}.csv")
        with open(out_path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()
            for pk, rows in games.items():
                out = process_game(year, pk, rows, stats)
                teams_in_game = {o["bat_team"] for o in out}
                for t in teams_in_game:
                    for s in range(1, 10):
                        slot_games[s] += 1
                for o in out:
                    w.writerow(o)
                    n_pa += 1
                    slot_n[o["slot"]] += 1
                    stats["slot_bad"] += 1 - o["slot_ok"]
                    if o["base_state"] == "___":
                        empty[o["slot"]] += 1
        print(f"\n{year}: {len(games):,} games, {n_pa:,} completed plate appearances -> {out_path}")
        print(f"  dropped as incomplete (mid-PA caught stealing etc.): {stats['incomplete']:,}")
        print(f"  slot_ok = 0 on {stats['slot_bad']:,} rows ({stats['slot_bad'] / max(n_pa, 1):.2%})")
        print("  slot   PA per team-game   share with bases empty")
        for s in range(1, 10):
            per_game = slot_n[s] / max(slot_games[s], 1)
            print(f"   {s}        {per_game:5.2f}              {empty[s] / max(slot_n[s], 1):.1%}")
    print("\nPaste this whole output back.")


if __name__ == "__main__":
    main()