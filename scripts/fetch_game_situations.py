#!/usr/bin/env python3
"""
scripts/fetch_game_situations.py

One pass over each final game's live feed that writes BOTH:
  - abs_challenge_log  (same rows as fetch_abs_challenge_log.py, plus the
                        situation each challenged pitch was thrown in:
                        balls/strikes BEFORE the pitch, outs, base state at the
                        start of the PA, and the batting team's score margin)
  - sb_attempt_log     (one row per stolen-base attempt: who, steal of which base,
                        success, the COUNT when the runner went, outs, inning,
                        the running team's score margin, and the BATTER at the plate)
  - sb_opportunity_log (one row per game per batter: the plate appearances that began
                        with a runner on first and second base open — the chances to
                        steal second while he was up. It is the denominator that makes
                        "he was up for 9 of their steals" mean something: how many
                        chances did they have with him up?)

  - late_inning_log    (one row per game per pitcher who faced a batter in the 7th inning
                        or later: which late innings he worked, his line there, and the
                        score margin when he came in. Feeds Scout §11 "who pitches past
                        the 7th" and what each bullpen has done against tonight's opponent.)

Table ownership: this script is the only writer of abs_challenge_log's situation
columns, sb_attempt_log, sb_opportunity_log and late_inning_log.

Run scripts/sql/add_game_situations.sql in Supabase first. Both tables are
upserted on a natural key, so re-running a date range is idempotent.

Where each field comes from (confirmed against real 2026 feeds):
  - a steal is a runner entry on the play whose details.eventType is
    stolen_base_2b/3b/home or caught_stealing_2b/3b/home. Its playIndex points at
    either the PITCH the runner went on (e.g. a strike three with a runner going)
    or an "action" event right after that pitch. Either way, the count when he went
    is the count BEFORE that pitch (the previous event's count, or 0-0), and the
    outs are the outs before it. Pickoff caught-stealings (eventType starting
    "pickoff_") are NOT counted.
  - a challenge is a pitch event with reviewDetails.reviewType == "MJ". The count
    is taken from the previous pitch event (its post-pitch count), or 0-0 for the
    first pitch, because that is the count the challenged call was made in.
  - base state = the previous play's post-play runners (matchup.postOnFirst/...),
    if it was the same half-inning, else empty.

Usage:
    python3 scripts/fetch_game_situations.py                       # yesterday
    python3 scripts/fetch_game_situations.py --start-date 2026-03-25 --end-date 2026-09-17
    python3 scripts/fetch_game_situations.py --dry-run --start-date 2026-09-13 --end-date 2026-09-13
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

MLB_API = "https://statsapi.mlb.com/api/v1"
MLB_API_V11 = "https://statsapi.mlb.com/api/v1.1"
BATCH_SIZE = 500
HIT_TYPES = {"single", "double", "triple", "home_run"}
WALK_TYPES = {"walk", "intent_walk"}
STEAL_TYPES = {
    "stolen_base_2b": ("2B", True), "stolen_base_3b": ("3B", True), "stolen_base_home": ("HOME", True),
    "caught_stealing_2b": ("2B", False), "caught_stealing_3b": ("3B", False), "caught_stealing_home": ("HOME", False),
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fetch ABS-challenge and stolen-base situations into Supabase.")
    p.add_argument("--start-date", type=str, default=None)
    p.add_argument("--end-date", type=str, default=None)
    p.add_argument("--dry-run", action="store_true", help="Print what would be written, skip Supabase")
    return p.parse_args()


def daterange(start: str, end: str):
    d, d1 = date.fromisoformat(start), date.fromisoformat(end)
    while d <= d1:
        yield d.isoformat()
        d += timedelta(days=1)


def get_final_game_pks(game_date: str) -> list[int]:
    try:
        r = requests.get(f"{MLB_API}/schedule?sportId=1&date={game_date}", timeout=20)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  schedule fetch failed for {game_date}: {e}")
        return []
    games = data.get("dates", [{}])[0].get("games", []) if data.get("dates") else []
    return [g["gamePk"] for g in games if g.get("status", {}).get("abstractGameState") == "Final"]


def bases_string(matchup: dict) -> str:
    return "".join("1" if matchup.get(k) else "0" for k in ("postOnFirst", "postOnSecond", "postOnThird"))


def extract(feed: dict) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    game_pk = feed.get("gamePk")
    gd = feed.get("gameData", {})
    game_date = gd.get("datetime", {}).get("officialDate")
    home_id = gd.get("teams", {}).get("home", {}).get("id")
    away_id = gd.get("teams", {}).get("away", {}).get("id")
    if not (game_pk and game_date and home_id and away_id):
        return [], [], [], []

    challenges: list[dict] = []
    steals: list[dict] = []
    opps: dict = {}   # batter_id -> opportunity row for this game
    late: dict = {}   # pitcher_id -> late-inning (7th+) line for this game
    plays = feed.get("liveData", {}).get("plays", {}).get("allPlays", [])

    prev = None
    away_score = home_score = 0

    for play in plays:
        about = play.get("about", {})
        inning, is_top = about.get("inning"), about.get("isTopInning")
        if inning is None or is_top is None:
            prev = play
            continue
        bat_id = away_id if is_top else home_id
        fld_id = home_id if is_top else away_id
        matchup = play.get("matchup", {})

        pa = prev.get("about", {}) if prev else {}
        same_half = prev is not None and pa.get("inning") == inning and pa.get("isTopInning") == is_top
        base_state = bases_string(prev.get("matchup", {})) if same_half else "000"
        bat_diff = (away_score - home_score) if is_top else (home_score - away_score)

        # steal-of-second chance: the PA began with a runner on 1st and 2nd open
        batter = matchup.get("batter") or {}
        if batter.get("id") and base_state[0] == "1" and base_state[1] == "0":
            o = opps.setdefault(batter["id"], {
                "game_pk": game_pk, "game_date": game_date, "batting_team_id": bat_id,
                "batter_id": batter["id"], "batter_name": batter.get("fullName"), "opps": 0,
            })
            o["opps"] += 1

        events = play.get("playEvents", [])
        by_index = {e.get("index"): e for e in events}
        start_outs = (prev.get("count") or {}).get("outs", 0) if same_half else 0
        balls, strikes, outs_now = 0, 0, start_outs
        # count/outs BEFORE each event, keyed by event index (used to place steals)
        before: dict = {}

        # A challenge on the pitch that ENDS the PA (called strike three, ball four) is recorded on the play
        # (allPlays[].reviewDetails), not the pitch — same rule as fetch_abs_challenge_log.py (see its note).
        pitch_events = [e for e in events if e.get("isPitch")]
        last_pitch = pitch_events[-1] if pitch_events else None
        play_review = play.get("reviewDetails") or {}

        for e in events:
            before[e.get("index")] = (balls, strikes, outs_now)
            c = e.get("count") or {}
            if not e.get("isPitch"):
                outs_now = c.get("outs", outs_now)
                continue
            review = e.get("reviewDetails")
            if (not review or review.get("reviewType") != "MJ") and e is last_pitch and play_review.get("reviewType") == "MJ":
                review = play_review
            if review and review.get("reviewType") == "MJ" and e.get("playId"):
                ch_id = review.get("challengeTeamId")
                who = review.get("player") or {}
                challenges.append({
                    "play_id": e["playId"], "game_pk": game_pk, "game_date": game_date, "inning": inning,
                    "half_inning": "top" if is_top else "bottom",
                    "batting_team_id": bat_id, "fielding_team_id": fld_id, "challenging_team_id": ch_id,
                    "challenge_side": "batting" if ch_id == bat_id else "fielding",
                    "challenger_player_id": who.get("id"), "challenger_player_name": who.get("fullName"),
                    "is_overturned": bool(review.get("isOverturned")),
                    "pitch_type": e.get("details", {}).get("type", {}).get("code"),
                    "batter_id": matchup.get("batter", {}).get("id"), "pitcher_id": matchup.get("pitcher", {}).get("id"),
                    "balls": balls, "strikes": strikes, "outs": outs_now,
                    "base_state": base_state, "bat_diff": bat_diff,
                })
            balls, strikes, outs_now = c.get("balls", balls), c.get("strikes", strikes), c.get("outs", outs_now)

        for r in play.get("runners", []):
            det = r.get("details", {})
            et = det.get("eventType") or ""
            if et not in STEAL_TYPES:
                continue   # pickoff_caught_stealing_* etc. are not steal attempts
            steal_of, success = STEAL_TYPES[et]
            runner = det.get("runner") or {}
            pidx = det.get("playIndex")
            ev = by_index.get(pidx) or {}
            # the pitch he went on: the event itself if it is a pitch, else the last pitch before it
            if not ev.get("isPitch"):
                prior = [e.get("index") for e in events if e.get("isPitch") and e.get("index") is not None and pidx is not None and e["index"] < pidx]
                pidx = prior[-1] if prior else None
            b0, s0, o0 = before.get(pidx, (0, 0, start_outs)) if pidx is not None else (0, 0, start_outs)
            evd = ev.get("details") or {}
            a_sc, h_sc = evd.get("awayScore"), evd.get("homeScore")
            if a_sc is None or h_sc is None:
                a_sc, h_sc = away_score, home_score
            run_diff = (a_sc - h_sc) if is_top else (h_sc - a_sc)
            steals.append({
                "attempt_id": f"{game_pk}:{about.get('atBatIndex')}:{det.get('playIndex')}:{runner.get('id')}",
                "game_pk": game_pk, "game_date": game_date, "inning": inning,
                "half_inning": "top" if is_top else "bottom",
                "running_team_id": bat_id, "fielding_team_id": fld_id,
                "runner_id": runner.get("id"), "runner_name": runner.get("fullName"),
                "pitcher_id": matchup.get("pitcher", {}).get("id"),
                "batter_id": batter.get("id"), "batter_name": batter.get("fullName"),
                "steal_of": steal_of, "success": success,
                "balls": b0, "strikes": s0, "outs": o0,
                "run_diff": run_diff,
            })

        res = play.get("result", {})

        # 7th inning or later: charge the play to the pitcher on the mound
        pit = matchup.get("pitcher") or {}
        if inning >= 7 and pit.get("id"):
            post_a, post_h = res.get("awayScore"), res.get("homeScore")
            post_outs = (play.get("count") or {}).get("outs")
            L = late.setdefault(pit["id"], {
                "game_pk": game_pk, "game_date": game_date, "pitcher_id": pit["id"], "pitcher_name": pit.get("fullName"),
                "pitching_team_id": fld_id, "batting_team_id": bat_id,
                "entry_inning": inning, "entry_margin": -bat_diff,   # pitching side's lead when he first faced a batter in 7th+
                "inn7": 0, "inn8": 0, "inn9": 0, "inn10p": 0,
                "bf": 0, "outs": 0, "hits": 0, "bb": 0, "k": 0, "hr": 0, "runs": 0, "_seen": set(),
            })
            if inning not in L["_seen"]:
                L["_seen"].add(inning)
                L["inn7" if inning == 7 else "inn8" if inning == 8 else "inn9" if inning == 9 else "inn10p"] = 1
            et = res.get("eventType") or ""
            L["bf"] += 1
            if post_outs is not None:
                L["outs"] += max(0, post_outs - start_outs)
            if post_a is not None and post_h is not None:
                L["runs"] += max(0, (post_a - away_score) + (post_h - home_score))   # runs while he was on the mound (includes inherited runners)
            if et in HIT_TYPES:
                L["hits"] += 1
            if et == "home_run":
                L["hr"] += 1
            if et in WALK_TYPES or et == "hit_by_pitch":
                L["bb"] += 1
            if et.startswith("strikeout"):
                L["k"] += 1

        if res.get("awayScore") is not None and res.get("homeScore") is not None:
            away_score, home_score = res["awayScore"], res["homeScore"]
        prev = play

    late_rows = []
    for L in late.values():
        L.pop("_seen", None)
        late_rows.append(L)
    return challenges, steals, list(opps.values()), late_rows


def fetch_game(game_pk: int) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    try:
        r = requests.get(f"{MLB_API_V11}/game/{game_pk}/feed/live", timeout=40)
        r.raise_for_status()
        return extract(r.json())
    except Exception as e:
        print(f"    game {game_pk} feed failed: {e}")
        return [], [], [], []


def upsert(client, table: str, rows: list[dict], key: str) -> None:
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        try:
            client.table(table).upsert(batch, on_conflict=key).execute()
        except Exception as e:
            print(f"    ERROR writing {table} rows {i + 1}-{i + len(batch)}: {e}")


def main() -> None:
    args = parse_args()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    start, end = args.start_date or yesterday, args.end_date or yesterday

    client = None
    if not args.dry_run:
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("ERROR: missing Supabase credentials.")
            sys.exit(1)
        from supabase import create_client
        client = create_client(SUPABASE_URL, SUPABASE_KEY)

    print(f"=== Game situations: {start} to {end} {'(dry run)' if args.dry_run else ''} ===")
    n_ch = n_sb = n_op = n_late = 0
    for d in daterange(start, end):
        pks = get_final_game_pks(d)
        if not pks:
            print(f"{d}: no final games")
            continue
        ch_rows: list[dict] = []
        sb_rows: list[dict] = []
        op_rows: list[dict] = []
        late_rows: list[dict] = []
        for pk in pks:
            c, s, o, lt = fetch_game(pk)
            ch_rows += c
            sb_rows += s
            op_rows += o
            late_rows += lt
        print(f"{d}: {len(pks)} games · {len(ch_rows)} challenges · {len(sb_rows)} steal attempts · {len(op_rows)} batter opportunity rows · {len(late_rows)} late-inning pitcher rows")
        n_late += len(late_rows)
        n_ch += len(ch_rows)
        n_sb += len(sb_rows)
        n_op += len(op_rows)
        if args.dry_run:
            for row in ch_rows[:2]:
                print("   ABS", row)
            for row in sb_rows[:3]:
                print("   SB ", row)
            for row in op_rows[:3]:
                print("   OPP", row)
            for row in late_rows[:5]:
                print("   LATE", row)
        else:
            if ch_rows:
                upsert(client, "abs_challenge_log", ch_rows, "play_id")
            if sb_rows:
                upsert(client, "sb_attempt_log", sb_rows, "attempt_id")
            if op_rows:
                upsert(client, "sb_opportunity_log", op_rows, "game_pk,batter_id")
            if late_rows:
                upsert(client, "late_inning_log", late_rows, "game_pk,pitcher_id")
        time.sleep(0.5)

    print(f"\nDone. {n_ch} challenge rows, {n_sb} steal-attempt rows, {n_op} opportunity rows and {n_late} late-inning pitcher rows {'would be written' if args.dry_run else 'written'}.")


if __name__ == "__main__":
    main()
