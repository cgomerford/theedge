"""
scripts/nfl/compute_nfl_postgame.py

Precomputes the play-by-play half of the NFL Postgame page into nfl_game_postgame:
one jsonb payload per FINAL game, so /nfl/[slug]/postgame reads one cached row and never
touches play-by-play at render time (CLAUDE.md: precompute is the architecture).

TABLE OWNERSHIP: this script is the ONLY writer of nfl_game_postgame. Schema:
scripts/sql/create_nfl_game_postgame.sql

Payload keys (all derived from load_pbp for that game_id):
  linescore        -- points by quarter (+ OT), from score-at-start-of-play deltas
  wp_series        -- [[elapsed_seconds, home_win_prob], ...] nflfastR model, one point per play
  inflections      -- the 5 biggest win-probability swings, in game order
  scoring_drives   -- every drive that ended in a TD, FG or defensive TD
  turnovers        -- interceptions and lost fumbles
  penalties        -- accepted penalties per team + the three costliest
  team_box         -- per-team yards / EPA / success / explosive / 3rd down / red zone
  qb_night         -- each team's lead passer (most dropbacks) line and EPA per dropback

Things NOT here on purpose: player top-performers and snap leaders (read from
nfl_player_stats_weekly / nfl_snap_counts at render, both small), season baselines
(read from nfl_team_week_splits), and any odds data (spread_line / total_line /
vegas_wp are never selected).

The win-probability model is nflfastR's. It is shown on the postgame page as a
description of how the game swung, never as a forward-looking number.

Run: after nflverse has loaded the finished games (Mon/Tue). Idempotent upsert.
Depends on: nothing else; reads nflverse directly.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import time

import nflreadpy as nfl
import polars as pl
from dotenv import load_dotenv
from supabase import Client, create_client

_here = os.path.dirname(os.path.abspath(__file__))
for _d in (os.getcwd(), _here, os.path.dirname(_here), os.path.dirname(os.path.dirname(_here))):
    _p = os.path.join(_d, ".env.local")
    if os.path.exists(_p):
        load_dotenv(_p)
        break

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

TEAM_ALIASES = {"LA": "LAR"}


def tm(v):
    return TEAM_ALIASES.get(v, v) if v else v


def num(v, nd=3):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return round(float(v), nd)


def elapsed_seconds(qtr: float, qsr: float) -> int:
    """Seconds since kickoff. Regulation quarters are 900s; OT is measured from 3600."""
    q = int(qtr)
    if q <= 4:
        return int((q - 1) * 900 + (900 - qsr))
    return int(3600 + (600 - qsr))


def classify(r: dict) -> str:
    if r.get("touchdown") == 1:
        return "TD"
    if r.get("interception") == 1 or r.get("fumble_lost") == 1:
        return "Turnover"
    if r.get("field_goal_result") is not None:
        return "Field goal"
    if r.get("down") == 4:
        return "4th down"
    return "Key play"


def build_payload(g: pl.DataFrame, home: str, away: str, home_final: int, away_final: int) -> dict:
    g = g.sort(["qtr", "quarter_seconds_remaining"], descending=[False, True], maintain_order=True)
    # Preserve true play order rather than a re-sort: play_id is monotonic within a game.
    g = g.sort("play_id")
    rows = g.to_dicts()
    for r in rows:
        r["posteam"], r["defteam"] = tm(r.get("posteam")), tm(r.get("defteam"))

    # --- linescore: score at START of the first play of the next period = end of this one ---
    end_score: dict[int, tuple[int, int]] = {}
    qtrs = sorted({int(r["qtr"]) for r in rows if r.get("qtr") is not None})
    for q in qtrs:
        nxt = next((r for r in rows if r.get("qtr") is not None and int(r["qtr"]) == q + 1 and r.get("total_home_score") is not None), None)
        end_score[q] = (int(nxt["total_home_score"]), int(nxt["total_away_score"])) if nxt else (home_final, away_final)
    line: list[dict] = []
    prev_h = prev_a = 0
    for q in qtrs:
        h, a = end_score[q]
        line.append({"q": "OT" if q >= 5 else f"Q{q}", "home": h - prev_h, "away": a - prev_a})
        prev_h, prev_a = h, a

    # --- win probability + inflections ---
    wp = [
        [elapsed_seconds(r["qtr"], r["quarter_seconds_remaining"]), num(r["home_wp"], 4)]
        for r in rows
        if r.get("home_wp") is not None and r.get("qtr") is not None and r.get("quarter_seconds_remaining") is not None
    ]
    swings = []
    for r in rows:
        if r.get("wpa") is None or r.get("posteam") is None or r.get("home_wp") is None or r.get("qtr") is None:
            continue
        if r.get("play_type") in ("extra_point", "kickoff", "no_play"):
            continue  # the touchdown / return itself is the story, not the PAT that follows it
        w = r["wpa"] if r["posteam"] == home else -r["wpa"]
        swings.append((abs(w), w, r))
    top = sorted(swings, key=lambda x: -x[0])[:5]
    inflections = []
    for _, w, r in sorted(top, key=lambda x: x[2]["play_id"]):
        inflections.append(
            {
                "kind": classify(r), "q": int(r["qtr"]), "clock": r.get("time"), "team": r["posteam"],
                "desc": (r.get("desc") or "")[:170], "home_wp_before": num(r["home_wp"], 4),
                "home_wp_after": num(r["home_wp"] + w, 4), "t": elapsed_seconds(r["qtr"], r["quarter_seconds_remaining"]),
            }
        )

    # --- scrimmage plays (same filter as compute_team_week_splits.py) ---
    scr = [
        r for r in rows
        if r.get("posteam") and r.get("epa") is not None
        and (r.get("pass") == 1 or r.get("rush") == 1)
        and r.get("play_type") not in ("qb_kneel", "qb_spike") and r.get("two_point_attempt") != 1
    ]

    # --- scoring drives ---
    drives: dict[tuple, dict] = {}
    for r in rows:
        if r.get("fixed_drive") is None or r.get("posteam") is None:
            continue
        key = (r["posteam"], r["fixed_drive"])
        d = drives.setdefault(key, {"team": r["posteam"], "opp": r["defteam"], "q": int(r["qtr"]) if r.get("qtr") is not None else None,
                                    "clock": r.get("time"), "result": r.get("fixed_drive_result"), "start": r.get("drive_start_yard_line"),
                                    "top": r.get("drive_time_of_possession"), "plays": 0, "yards": 0, "order": r["play_id"]})
        d["result"] = r.get("fixed_drive_result") or d["result"]
        if r in scr:
            d["plays"] += 1
            d["yards"] += int(r.get("yards_gained") or 0)
    scoring = []
    for d in sorted(drives.values(), key=lambda x: x["order"]):
        if d["result"] in ("Touchdown", "Field goal"):
            scoring.append({"team": d["team"], "result": d["result"], "q": d["q"], "clock": d["clock"], "start": d["start"], "plays": d["plays"], "yards": d["yards"], "top": d["top"]})
        elif d["result"] == "Opp touchdown":
            scoring.append({"team": d["opp"], "result": "Defensive TD", "q": d["q"], "clock": d["clock"], "start": None, "plays": 0, "yards": 0, "top": None})

    # --- turnovers ---
    turnovers = [
        {"team": r["posteam"], "kind": "Interception" if r.get("interception") == 1 else "Fumble lost", "q": int(r["qtr"]), "clock": r.get("time"), "desc": (r.get("desc") or "")[:170]}
        for r in rows if r.get("posteam") and (r.get("interception") == 1 or r.get("fumble_lost") == 1) and r.get("qtr") is not None
    ]

    # --- penalties (accepted) ---
    pen = [r for r in rows if r.get("penalty") == 1 and r.get("penalty_team")]
    pen_by: dict[str, dict] = {}
    for r in pen:
        t = tm(r["penalty_team"])
        p = pen_by.setdefault(t, {"count": 0, "yards": 0})
        p["count"] += 1
        p["yards"] += int(r.get("penalty_yards") or 0)
    costly = sorted(pen, key=lambda r: -(r.get("penalty_yards") or 0))[:3]
    penalties = {
        "by_team": pen_by,
        "costliest": [{"team": tm(r["penalty_team"]), "type": r.get("penalty_type"), "yards": int(r.get("penalty_yards") or 0), "q": int(r["qtr"]), "clock": r.get("time")} for r in costly],
    }

    # --- team box + QB night ---
    def box_for(team: str) -> dict:
        mine = [r for r in scr if r["posteam"] == team]
        att = [r for r in mine if r.get("pass") == 1 and r.get("sack") != 1]
        rush = [r for r in mine if r.get("rush") == 1]
        thirds = [r for r in mine if r.get("down") == 3]
        my_drives = [d for (t, _), d in drives.items() if t == team]
        rz_keys = {(r["posteam"], r["fixed_drive"]) for r in mine if r.get("yardline_100") is not None and r["yardline_100"] <= 20 and r.get("fixed_drive") is not None}
        rz_td = sum(1 for k in rz_keys if drives.get(k, {}).get("result") == "Touchdown")
        n = len(mine)
        return {
            "plays": n, "total_yds": sum(int(r.get("yards_gained") or 0) for r in mine),
            "pass_yds": sum(int(r.get("yards_gained") or 0) for r in att), "rush_yds": sum(int(r.get("yards_gained") or 0) for r in rush),
            "pass_att": len(att), "rushes": len(rush),
            "epa_per_play": num(sum(r["epa"] for r in mine) / n) if n else None,
            "success_rate": num(sum((r.get("success") or 0) for r in mine) / n) if n else None,
            "explosive": sum(1 for r in att if (r.get("yards_gained") or 0) >= 20) + sum(1 for r in rush if (r.get("yards_gained") or 0) >= 10),
            "third_conv": sum(int(r.get("third_down_converted") or 0) for r in thirds), "third_att": len(thirds),
            "rz_trips": len(rz_keys), "rz_td": rz_td,
            "turnovers": sum(1 for r in mine if r.get("interception") == 1 or r.get("fumble_lost") == 1),
            "sacks_taken": sum(1 for r in mine if r.get("sack") == 1),
            "first_downs": sum(int(r.get("first_down") or 0) for r in mine),
            "drives": len(my_drives),
        }

    def qb_for(team: str) -> dict | None:
        db = [r for r in scr if r["posteam"] == team and r.get("qb_dropback") == 1 and r.get("passer_player_id")]
        if not db:
            return None
        counts: dict[str, int] = {}
        for r in db:
            counts[r["passer_player_id"]] = counts.get(r["passer_player_id"], 0) + 1
        pid = max(counts, key=lambda k: counts[k])
        mine = [r for r in db if r["passer_player_id"] == pid]
        att = [r for r in mine if r.get("sack") != 1]
        cp = [r["cpoe"] for r in att if r.get("cpoe") is not None]
        return {
            "player_id": pid, "name": mine[0].get("passer_player_name"), "dropbacks": len(mine), "att": len(att),
            "cmp": sum(int(r.get("complete_pass") or 0) for r in att), "yds": sum(int(r.get("yards_gained") or 0) for r in att),
            "td": sum(int(r.get("pass_touchdown") or 0) for r in att), "int": sum(int(r.get("interception") or 0) for r in att),
            "sacks": sum(1 for r in mine if r.get("sack") == 1),
            "epa_per_dropback": num(sum(r["epa"] for r in mine) / len(mine)), "cpoe": num(sum(cp) / len(cp), 2) if cp else None,
        }

    return {
        "home": home, "away": away, "home_score": home_final, "away_score": away_final,
        "linescore": line, "wp_series": wp, "inflections": inflections, "scoring_drives": scoring,
        "turnovers": turnovers, "penalties": penalties,
        "team_box": {home: box_for(home), away: box_for(away)},
        "qb_night": {home: qb_for(home), away: qb_for(away)},
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--week", type=int, default=None, help="limit to one week (default: every final game so far)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
        sys.exit(1)

    sched = nfl.load_schedules([args.season]).filter(pl.col("home_score").is_not_null())
    if args.week is not None:
        sched = sched.filter(pl.col("week") == args.week)
    print(f"{sched.height} final games in {args.season}. Loading play-by-play...")
    pbp = nfl.load_pbp([args.season])

    out: list[dict] = []
    for s in sched.to_dicts():
        g = pbp.filter(pl.col("game_id") == s["game_id"])
        if g.height == 0:
            continue
        payload = build_payload(g, tm(s["home_team"]), tm(s["away_team"]), int(s["home_score"]), int(s["away_score"]))
        out.append({"game_id": s["game_id"], "season": args.season, "week": int(s["week"]), "payload": payload})

    print(f"Built {len(out)} payloads.\n=== SANITY CHECK: first 5 games ===")
    for r in out[:5]:
        p = r["payload"]
        print(f"  {r['game_id']}: {p['away']} {p['away_score']} @ {p['home']} {p['home_score']} | linescore {[(x['q'], x['away'], x['home']) for x in p['linescore']]} | "
              f"{len(p['wp_series'])} wp pts, {len(p['scoring_drives'])} scoring drives, {len(p['turnovers'])} TO, qb {(p['qb_night'][p['home']] or {}).get('name')}")
        for inf in p["inflections"][:2]:
            print(f"      swing: Q{inf['q']} {inf['clock']} {inf['team']} {inf['kind']}: {inf['desc'][:70]}")
    if args.dry_run or not out:
        print("--dry-run: nothing written." if args.dry_run else "Nothing to write.")
        return

    print(f"\nAbout to upsert {len(out)} rows into nfl_game_postgame. Ctrl+C within 5 seconds to abort...")
    time.sleep(5)
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    for i in range(0, len(out), 20):
        batch = out[i : i + 20]
        supabase.table("nfl_game_postgame").upsert(batch, on_conflict="game_id", returning="minimal").execute()
        print(f"  Upserted batch {i // 20 + 1}: {len(batch)} rows")
    print(f"\nDone. Upserted {len(out)} rows into nfl_game_postgame.")


if __name__ == "__main__":
    main()
