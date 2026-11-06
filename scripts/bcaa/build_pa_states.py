#!/usr/bin/env python3
"""
build_pa_states.py — BCAA step 1 (test run on a few games)

For every plate appearance with runners on base, joins:
  - Savant terminal pitch row  -> start state, outs, batted-ball data, runs on play
  - Stats API runner movements -> where each existing runner ended up on the batter's event

Fields verified from live responses (Nov 2026):
  Savant CSV:  game_pk, at_bat_number, pitch_number, events, player_name, batter,
               on_1b/on_2b/on_3b (blank when empty), outs_when_up, inning, inning_topbot,
               bb_type, launch_speed, launch_angle, hc_x, hc_y, hit_distance_sc,
               bat_score, post_bat_score
  Stats API:   liveData.plays.allPlays[].atBatIndex  (0-based: at_bat_number = atBatIndex + 1)
               runners[].movement.{originBase, start, end, isOut}
               runners[].details.{runner.id, movementReason, playIndex}
               end values seen: '1B', '2B', '3B', 'score', None
               batter's own entry has originBase = None

Usage (Python 3.9):
  python3 scripts/bcaa/build_pa_states.py 849841:2026-09-30 849845:2026-09-29

Output: data/bcaa/pa_states_test.csv  (no Supabase writes yet — schema not locked)
"""
import csv
import io
import json
import os
import sys
import ssl
import urllib.request
from collections import Counter
from typing import Dict, List, Optional

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    print("[ssl] certifi not installed — run: pip3 install certifi", file=sys.stderr)
    SSL_CTX = None

BASE_NUM = {"1B": 1, "2B": 2, "3B": 3, "score": 4}
SAVANT_URL = ("https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details"
              "&player_type=batter&game_date_gt={d}&game_date_lt={d}")
FEED_URL = "https://statsapi.mlb.com/api/v1.1/game/{pk}/feed/live"
OUT_PATH = "data/bcaa/pa_states_test.csv"

# Reasons seen in the 849841 verification run. Anything else is counted and printed.
KNOWN_REASONS = {None, "r_adv_play", "r_adv_force", "r_force_out", "r_rundown",
                 "r_stolen_base_2b", "r_stolen_base_3b"}
# Savant terminal events that are not the batter's doing (prefix match).
NON_BATTER_EVENTS = ("caught_stealing", "pickoff", "stolen_base", "wild_pitch",
                     "passed_ball", "other_advance", "truncated_pa")

unknown_reasons: Counter = Counter()
skipped: Counter = Counter()
_savant_cache: Dict[str, bytes] = {}


def fetch(url: str) -> Optional[bytes]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "theedge-bcaa/0.1"})
        with urllib.request.urlopen(req, timeout=90, context=SSL_CTX) as r:
            return r.read()
    except Exception as e:
        print(f"[fetch] FAILED {url}: {e}", file=sys.stderr)
        return None


def to_id(v: Optional[str]) -> Optional[int]:
    v = (v or "").strip()
    if not v:
        return None
    try:
        return int(float(v))
    except ValueError:
        print(f"[to_id] unreadable id '{v}'", file=sys.stderr)
        return None


def savant_terminal_rows(game_pk: int, date: str) -> Dict[int, dict]:
    """at_bat_number -> terminal pitch row (the row with an event, highest pitch_number)."""
    if date not in _savant_cache:
        raw = fetch(SAVANT_URL.format(d=date))
        if raw is None:
            return {}
        _savant_cache[date] = raw
    rows: Dict[int, dict] = {}
    for r in csv.DictReader(io.StringIO(_savant_cache[date].decode("utf-8-sig"))):
        if r.get("game_pk") != str(game_pk) or not r.get("events"):
            continue
        ab = int(r["at_bat_number"])
        if ab not in rows or int(r["pitch_number"]) > int(rows[ab]["pitch_number"]):
            rows[ab] = r
    if not rows:
        print(f"[savant] no terminal rows for game {game_pk} on {date}", file=sys.stderr)
    return rows


def feed_plays(game_pk: int) -> Dict[int, dict]:
    """at_bat_number (1-based) -> Stats API play."""
    raw = fetch(FEED_URL.format(pk=game_pk))
    if raw is None:
        return {}
    try:
        plays = json.loads(raw)["liveData"]["plays"]["allPlays"]
    except (KeyError, ValueError) as e:
        print(f"[feed] bad structure for {game_pk}: {e}", file=sys.stderr)
        return {}
    return {p["atBatIndex"] + 1: p for p in plays}


def event_play_index(play: dict) -> Optional[int]:
    """playIndex of the batter's own event (his runners[] entry has originBase None)."""
    for r in play.get("runners", []):
        if r["movement"].get("originBase") is None:
            return r["details"].get("playIndex")
    return None


def build_pa(game_pk: int, ab: int, sv: dict, play: dict) -> Optional[dict]:
    event = sv["events"]
    if event.startswith(NON_BATTER_EVENTS):
        skipped[f"non_batter_event:{event}"] += 1
        return None

    start = {1: to_id(sv["on_1b"]), 2: to_id(sv["on_2b"]), 3: to_id(sv["on_3b"])}
    occupied = {b: pid for b, pid in start.items() if pid}
    if not occupied:
        return None  # no runners on: not a BCAA opportunity

    ev_idx = event_play_index(play)
    if ev_idx is None:
        skipped["no_batter_entry"] += 1
        print(f"[pa] {game_pk} ab {ab}: no batter entry in runners[]", file=sys.stderr)
        return None

    # Group runner segments that happened on the batter's event; log the rest (steals, WP, etc.)
    segs: Dict[int, List[dict]] = {}
    other_moves: List[str] = []
    for r in play.get("runners", []):
        m, d = r["movement"], r["details"]
        if m.get("originBase") is None:
            continue  # the batter himself — excluded from BCAA by design
        reason = d.get("movementReason")
        if reason not in KNOWN_REASONS:
            unknown_reasons[reason] += 1
        rid = d["runner"]["id"]
        if d.get("playIndex") == ev_idx:
            segs.setdefault(rid, []).append(m)
        else:
            other_moves.append(f"{rid}:{reason}")

    issues: List[str] = []
    moves: List[str] = []
    bases_gained = 0
    for base, rid in sorted(occupied.items()):
        s = segs.pop(rid, None)
        if not s:
            end = base  # not listed on the event = held
        else:
            api_start = BASE_NUM.get(s[0].get("start"))
            if api_start != base:
                issues.append(f"{rid} start savant={base} api={s[0].get('start')}")
            if any(x.get("isOut") for x in s):
                end = 0  # erased: gained = -start
            else:
                end = BASE_NUM.get(s[-1].get("end"))
                if end is None:
                    issues.append(f"{rid} unreadable end {s[-1].get('end')}")
                    continue
        bases_gained += end - base
        moves.append(f"{rid}:{base}>{'out' if end == 0 else end}")
    for rid in segs:
        issues.append(f"{rid} in api event but not on base in savant")

    def num(k: str) -> str:
        return sv.get(k, "") or ""

    return {
        "game_pk": game_pk,
        "at_bat_number": ab,
        "inning": sv["inning"],
        "half": sv["inning_topbot"],
        "batter": sv["batter"],
        "batter_name": sv["player_name"],
        "event": event,
        "outs_before": sv["outs_when_up"],
        "base_state": "".join(str(b) if start[b] else "_" for b in (1, 2, 3)),
        "runner_moves": " ".join(moves),
        "bases_gained": bases_gained if not issues else "",
        "runs_on_play": int(sv["post_bat_score"]) - int(sv["bat_score"]),
        "bb_type": num("bb_type"),
        "launch_speed": num("launch_speed"),
        "launch_angle": num("launch_angle"),
        "hc_x": num("hc_x"),
        "hc_y": num("hc_y"),
        "hit_distance_sc": num("hit_distance_sc"),
        "other_moves_in_pa": " ".join(other_moves),
        "valid": not issues,
        "issues": "; ".join(issues),
    }


def main(args: List[str]) -> None:
    if not args:
        print(__doc__)
        sys.exit(1)
    out: List[dict] = []
    for arg in args:
        try:
            pk_s, date = arg.split(":")
            pk = int(pk_s)
        except ValueError:
            print(f"[main] bad arg '{arg}', expected game_pk:YYYY-MM-DD", file=sys.stderr)
            continue
        sv_rows, plays = savant_terminal_rows(pk, date), feed_plays(pk)
        if not sv_rows or not plays:
            continue
        for ab, sv in sorted(sv_rows.items()):
            play = plays.get(ab)
            if play is None:
                skipped["no_matching_play"] += 1
                print(f"[main] {pk} ab {ab}: no Stats API play", file=sys.stderr)
                continue
            row = build_pa(pk, ab, sv, play)
            if row:
                out.append(row)

    if not out:
        print("[main] no rows built", file=sys.stderr)
        sys.exit(1)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    print(f"Wrote {len(out)} runners-on PAs -> {OUT_PATH}")
    print(f"Invalid rows: {sum(1 for r in out if not r['valid'])}")
    print(f"Skipped: {dict(skipped)}")
    print(f"Unknown movementReasons: {dict(unknown_reasons)}")
    print("\nBohm (664761) / Harper (547180) as batter:")
    for r in out:
        if r["batter"] in ("664761", "547180"):
            print(f"  {r['game_pk']} ab{r['at_bat_number']} {r['batter_name']}: {r['event']}, "
                  f"{r['outs_before']} out, bases {r['base_state']} -> {r['runner_moves']} "
                  f"| A={r['bases_gained']} valid={r['valid']} {r['issues']}")


if __name__ == "__main__":
    main(sys.argv[1:])