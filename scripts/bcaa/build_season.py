#!/usr/bin/env python3
"""
build_season.py — BCAA step 2: season-long runners-on PA table

Runs the verified logic in build_pa_states.py (must sit in the same folder) over a date range:
  - one Savant CSV per day  -> terminal pitch row per PA (regular season only, game_type == 'R')
  - one Stats API feed per game -> runner movements
Both are cached on disk in slimmed form, so a re-run (or a crash) resumes instead of re-downloading.

Usage (from the theedge folder):
  python3 scripts/bcaa/build_season.py 2026-03-20 2026-10-05
  python3 scripts/bcaa/build_season.py 2026-09-29 2026-09-30 --max-games 5     # quick trial

First full run is ~2,400 sequential feed requests (throttled): expect 30-60+ minutes.
Output: data/bcaa/pa_states_<year of start date>.csv  (override with --out)
        data/bcaa/season_failures_<year>.txt
        (no Supabase writes — schema not locked yet)
"""
import argparse
import csv
import io
import json
import os
import sys
import time
from datetime import date, timedelta
from typing import Dict, List, Optional

from build_pa_states import build_pa, fetch, skipped, unknown_reasons

SAVANT_DAY_URL = ("https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details"
                  "&player_type=batter&game_date_gt={d}&game_date_lt={d}")
FEED_URL = "https://statsapi.mlb.com/api/v1.1/game/{pk}/feed/live"
CACHE_DIR = "data/bcaa/cache"
OUT_DIR = "data/bcaa"

# Savant columns kept per terminal row (all verified in the live CSV header)
KEEP = ["game_pk", "game_date", "game_type", "at_bat_number", "pitch_number", "events",
        "player_name", "batter", "pitcher", "stand", "p_throws", "home_team", "away_team",
        "on_1b", "on_2b", "on_3b", "outs_when_up", "inning", "inning_topbot",
        "bb_type", "launch_speed", "launch_angle", "hc_x", "hc_y", "hit_distance_sc",
        "bat_score", "post_bat_score", "hit_location", "fielder_7", "fielder_8", "fielder_9"]

THROTTLE_SAVANT = 1.0
THROTTLE_FEED = 0.25


def fetch_retry(url: str, tries: int = 3) -> Optional[bytes]:
    for i in range(tries):
        raw = fetch(url)
        if raw is not None:
            return raw
        time.sleep(2 * (i + 1))
    return None


def cache_path(kind: str, key: str) -> str:
    d = os.path.join(CACHE_DIR, kind)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, key + ".json")


def parse_day(raw: bytes) -> Optional[List[dict]]:
    """Terminal-pitch rows for regular-season games. None if the response isn't a Savant CSV."""
    text = raw.decode("utf-8-sig")
    if not text.strip():
        return []  # no games that day
    if "pitch_type" not in text.split("\n", 1)[0]:
        print("[savant] response does not look like the CSV (header missing)", file=sys.stderr)
        return None
    best: Dict[tuple, dict] = {}
    for r in csv.DictReader(io.StringIO(text)):
        if r.get("game_type") != "R" or not r.get("events"):
            continue
        key = (r["game_pk"], int(r["at_bat_number"]))
        if key not in best or int(r["pitch_number"]) > int(best[key]["pitch_number"]):
            best[key] = r
    return [{k: r.get(k, "") for k in KEEP} for r in best.values()]


def day_rows(d: str) -> Optional[List[dict]]:
    p = cache_path("savant", d)
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    raw = fetch_retry(SAVANT_DAY_URL.format(d=d))
    time.sleep(THROTTLE_SAVANT)
    if raw is None:
        return None
    rows = parse_day(raw)
    if rows is None:
        return None
    with open(p, "w") as f:
        json.dump(rows, f)
    return rows


def slim_feed(raw: bytes) -> Optional[Dict[str, dict]]:
    """at_bat_number (1-based, as str) -> minimal play: runner movements + event text."""
    try:
        plays = json.loads(raw)["liveData"]["plays"]["allPlays"]
    except (KeyError, ValueError) as e:
        print(f"[feed] bad structure: {e}", file=sys.stderr)
        return None
    out = {}
    for p in plays:
        out[str(p["atBatIndex"] + 1)] = {
            "event": p["result"].get("event"),
            "description": p["result"].get("description"),
            "runners": [{
                "movement": r["movement"],
                "details": {
                    "runner": {"id": r["details"]["runner"]["id"]},
                    "movementReason": r["details"].get("movementReason"),
                    "playIndex": r["details"].get("playIndex"),
                },
            } for r in p.get("runners", [])],
        }
    return out


def game_plays(pk: str) -> Optional[Dict[int, dict]]:
    p = cache_path("feeds", pk)
    if os.path.exists(p):
        with open(p) as f:
            slim = json.load(f)
    else:
        raw = fetch_retry(FEED_URL.format(pk=pk))
        time.sleep(THROTTLE_FEED)
        if raw is None:
            return None
        slim = slim_feed(raw)
        if slim is None:
            return None
        with open(p, "w") as f:
            json.dump(slim, f)
    return {int(k): v for k, v in slim.items()}


def daterange(start: str, end: str):
    d, e = date.fromisoformat(start), date.fromisoformat(end)
    while d <= e:
        yield d.isoformat()
        d += timedelta(days=1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("start")
    ap.add_argument("end")
    ap.add_argument("--max-games", type=int, default=0, help="stop after N games (trial run)")
    ap.add_argument("--out", default="", help="output CSV path (default data/bcaa/pa_states_<year>.csv)")
    a = ap.parse_args()
    year = a.start[:4]
    out_path = a.out or os.path.join(OUT_DIR, f"pa_states_{year}.csv")
    fail_path = os.path.join(OUT_DIR, f"season_failures_{year}.txt")

    out: List[dict] = []
    failures: List[str] = []
    runner_out_samples: List[str] = []
    games_done = 0

    for d in daterange(a.start, a.end):
        rows = day_rows(d)
        if rows is None:
            failures.append(f"savant day {d}")
            print(f"{d}: SAVANT FAILED", flush=True)
            continue
        by_game: Dict[str, List[dict]] = {}
        for r in rows:
            by_game.setdefault(r["game_pk"], []).append(r)
        day_pas = 0
        for pk, grows in sorted(by_game.items()):
            if a.max_games and games_done >= a.max_games:
                break
            plays = game_plays(pk)
            if plays is None:
                failures.append(f"feed game {pk} ({d})")
                continue
            games_done += 1
            for sv in sorted(grows, key=lambda r: int(r["at_bat_number"])):
                ab = int(sv["at_bat_number"])
                play = plays.get(ab)
                if play is None:
                    skipped["no_matching_play"] += 1
                    continue
                row = build_pa(int(pk), ab, sv, play)
                if row is None:
                    continue
                has_ro = any(r["details"].get("movementReason") == "r_runner_out"
                             for r in play["runners"])
                row["game_date"] = d
                row["has_runner_out_reason"] = has_ro
                row["bat_team"] = sv["home_team"] if sv["inning_topbot"] == "Bot" else sv["away_team"]
                row["home_team"] = sv["home_team"]
                row["stand"] = sv["stand"]
                row["pitcher"] = sv["pitcher"]
                row["p_throws"] = sv["p_throws"]
                row["hit_location"] = sv["hit_location"]
                row["fielder_7"] = sv["fielder_7"]
                row["fielder_8"] = sv["fielder_8"]
                row["fielder_9"] = sv["fielder_9"]
                out.append(row)
                day_pas += 1
                if has_ro and len(runner_out_samples) < 8:
                    runner_out_samples.append(
                        f"  {pk} ab{ab} {row['batter_name']}: {play.get('event')} | "
                        f"{play.get('description')} | bases {row['base_state']} -> {row['runner_moves']}")
        if rows:
            print(f"{d}: {len(by_game)} games, {day_pas} runners-on PAs (total {len(out)})", flush=True)
        if a.max_games and games_done >= a.max_games:
            break

    if not out:
        print("[main] no rows built", file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    with open(fail_path, "w") as f:
        f.write("\n".join(failures))

    print(f"\nGames processed: {games_done}")
    print(f"Runners-on PAs written: {len(out)} -> {out_path}")
    print(f"Invalid rows: {sum(1 for r in out if not r['valid'])}")
    print(f"Skipped: {dict(skipped)}")
    print(f"Unknown movementReasons: {dict(unknown_reasons)}")
    print(f"Failures (re-run to retry; cached work is kept): {len(failures)} -> {fail_path}")
    print(f"\nPAs containing r_runner_out: {sum(1 for r in out if r['has_runner_out_reason'])}")
    for s in runner_out_samples:
        print(s)


if __name__ == "__main__":
    main()