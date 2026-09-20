#!/usr/bin/env python3
"""
scripts/fetch_abs_challenge_log.py

Per-pitch ABS (Automated Ball-Strike) challenge log — replaces the
speculative build_abs_challenge_log.py now that the real shape is
confirmed. Live-probed against a real 2026 game (game_pk 824226,
2026-09-09): MLB's live feed marks a genuine ABS challenge as a
playEvent with isPitch=true and reviewDetails.reviewType == "MJ". Other
reviewType codes (e.g. "MA") cover pre-ABS replay reviews on other play
types (pickoffs, tag plays) and are deliberately excluded — mixing them
in would inflate the count with non-ABS reviews.

reviewDetails on a real MJ event looks like:
    {
      "isOverturned": true,
      "reviewType": "MJ",
      "challengeTeamId": 142,
      "player": { "id": 605170, "fullName": "Victor Caratini" }
    }

`player` is the actual person who called the challenge — a catcher (or
occasionally the pitcher) when the fielding team challenges, the batter
when the batting team does. challenge_side is derived by comparing
challengeTeamId to who was on offense that at-bat (about.isTopInning +
the game's home/away team ids), not by guessing from the player's
fielding position — cheaper and doesn't need a roster lookup.

The same event also carries pitchData (verified on game_pk 824226): coordinates.pX / pZ (feet, plate
crossing), strikeZoneTop / strikeZoneBottom (feet), strikeZoneWidth (17 inches) and details.call.code -
the call AFTER review ('C' called strike, 'B' ball). We store those RAW so the "how close was the pitch to
the edge" score is computed in the app and can be refined later without another backfill. The location
is used to ESTIMATE the miss distance: on 122 challenges (2026-09-08..10) a 1.45in-ball-radius rule
reproduced MLB's final call 84% of the time (side-to-side edges 55/57, top/bottom 48/65 - the feed's
zone top/bottom is not exactly the ABS zone), so treat distances as approximate near the top/bottom edges.

TABLE OWNERSHIP: this script is the SINGLE writer of abs_challenge_log.

Writes one row per challenge to abs_challenge_log (schema:
scripts/sql/create_abs_challenge_log.sql — run that in Supabase before
this script's writes will succeed). Upsert key is play_id, MLB's own
per-pitch UUID, so re-running a date range is idempotent.

Usage:
    python3 scripts/fetch_abs_challenge_log.py                     # yesterday only
    python3 scripts/fetch_abs_challenge_log.py --start-date 2026-03-26 --end-date 2026-09-11
    python3 scripts/fetch_abs_challenge_log.py --dry-run --start-date 2026-09-09 --end-date 2026-09-09
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv
import os

for env_file in (".env.local", ".env"):
    if Path(env_file).exists():
        load_dotenv(env_file)
        break

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

MLB_API = "https://statsapi.mlb.com/api/v1"
MLB_API_V11 = "https://statsapi.mlb.com/api/v1.1"
BATCH_SIZE = 500


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Fetch per-pitch ABS challenge events into Supabase.")
    p.add_argument("--start-date", type=str, default=None, help="YYYY-MM-DD, defaults to yesterday")
    p.add_argument("--end-date", type=str, default=None, help="YYYY-MM-DD, defaults to yesterday")
    p.add_argument("--dry-run", action="store_true", help="Print what would be written, skip Supabase")
    return p.parse_args()


def resolve_date_range(args: argparse.Namespace) -> tuple[str, str]:
    if args.start_date and args.end_date:
        return args.start_date, args.end_date
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    return yesterday, yesterday


def daterange(start: str, end: str):
    d0 = date.fromisoformat(start)
    d1 = date.fromisoformat(end)
    d = d0
    while d <= d1:
        yield d.isoformat()
        d += timedelta(days=1)


def get_final_game_pks(game_date: str) -> list[int]:
    url = f"{MLB_API}/schedule?sportId=1&date={game_date}"
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  schedule fetch failed for {game_date}: {e}")
        return []

    games = data.get("dates", [{}])[0].get("games", []) if data.get("dates") else []
    return [
        g["gamePk"] for g in games
        if g.get("status", {}).get("abstractGameState") == "Final"
    ]


def extract_challenges(feed: dict) -> list[dict]:
    game_pk = feed.get("gamePk")
    game_data = feed.get("gameData", {})
    game_date = game_data.get("datetime", {}).get("officialDate")
    home_id = game_data.get("teams", {}).get("home", {}).get("id")
    away_id = game_data.get("teams", {}).get("away", {}).get("id")
    if not (game_pk and game_date and home_id and away_id):
        return []

    plays = feed.get("liveData", {}).get("plays", {}).get("allPlays", [])
    rows: list[dict] = []

    for play in plays:
        about = play.get("about", {})
        inning = about.get("inning")
        is_top = about.get("isTopInning")
        if inning is None or is_top is None:
            continue

        batting_team_id = away_id if is_top else home_id
        fielding_team_id = home_id if is_top else away_id
        matchup = play.get("matchup", {})

        for event in play.get("playEvents", []):
            if not event.get("isPitch"):
                continue
            review = event.get("reviewDetails")
            if not review or review.get("reviewType") != "MJ":
                continue

            play_id = event.get("playId")
            if not play_id:
                continue  # no stable key to upsert on — skip rather than risk dupes

            challenging_team_id = review.get("challengeTeamId")
            challenger = review.get("player") or {}
            pitch_data = event.get("pitchData") or {}
            coords = pitch_data.get("coordinates") or {}

            rows.append({
                "play_id": play_id,
                "game_pk": game_pk,
                "game_date": game_date,
                "inning": inning,
                "half_inning": "top" if is_top else "bottom",
                "batting_team_id": batting_team_id,
                "fielding_team_id": fielding_team_id,
                "challenging_team_id": challenging_team_id,
                "challenge_side": "batting" if challenging_team_id == batting_team_id else "fielding",
                "challenger_player_id": challenger.get("id"),
                "challenger_player_name": challenger.get("fullName"),
                "is_overturned": bool(review.get("isOverturned")),
                "pitch_type": event.get("details", {}).get("type", {}).get("code"),
                "batter_id": matchup.get("batter", {}).get("id"),
                "pitcher_id": matchup.get("pitcher", {}).get("id"),
                # Raw location - None when the feed has no tracking for the pitch (never default to 0 = middle of the zone).
                "plate_x": coords.get("pX"),
                "plate_z": coords.get("pZ"),
                "sz_top": pitch_data.get("strikeZoneTop"),
                "sz_bot": pitch_data.get("strikeZoneBottom"),
                "sz_width_in": pitch_data.get("strikeZoneWidth"),
                "final_call": event.get("details", {}).get("call", {}).get("code"),  # call AFTER review: 'C' | 'B'
            })

    return rows


def fetch_game_challenges(game_pk: int) -> list[dict]:
    url = f"{MLB_API_V11}/game/{game_pk}/feed/live"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        feed = r.json()
    except Exception as e:
        print(f"    game {game_pk} feed fetch failed: {e}")
        return []
    return extract_challenges(feed)


def upsert_batched(supabase_client, rows: list[dict]) -> None:
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        try:
            supabase_client.table("abs_challenge_log").upsert(batch, on_conflict="play_id").execute()
            print(f"    upserted rows {i + 1}-{min(i + BATCH_SIZE, total)} of {total}")
        except Exception as e:
            print(f"    ERROR on batch {i + 1}-{min(i + BATCH_SIZE, total)}: {e}")


def main() -> None:
    args = parse_args()
    start_date, end_date = resolve_date_range(args)

    if not args.dry_run:
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("ERROR: Missing Supabase credentials (SUPABASE_URL/SUPABASE_SERVICE_KEY or "
                  "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).")
            sys.exit(1)
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    else:
        supabase_client = None

    print(f"=== ABS challenge log: {start_date} to {end_date} {'(dry run)' if args.dry_run else ''} ===")

    total_rows = 0
    for game_date in daterange(start_date, end_date):
        game_pks = get_final_game_pks(game_date)
        if not game_pks:
            print(f"{game_date}: no final games")
            continue

        print(f"{game_date}: {len(game_pks)} final games")
        day_rows: list[dict] = []
        for game_pk in game_pks:
            day_rows.extend(fetch_game_challenges(game_pk))

        print(f"  {len(day_rows)} challenges found")
        total_rows += len(day_rows)

        if day_rows:
            if args.dry_run:
                for row in day_rows[:3]:
                    print("   ", row)
            else:
                upsert_batched(supabase_client, day_rows)

        time.sleep(0.5)  # light courtesy pause between days, matches backfill_statcast.sh's spirit

    print(f"\nDone. {total_rows} challenge rows {'would be written' if args.dry_run else 'written'} total.")


if __name__ == "__main__":
    main()
