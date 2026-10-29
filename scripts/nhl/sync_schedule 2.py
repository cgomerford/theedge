"""
scripts/nhl/sync_schedule.py

Sole writer of nhl_games (ingest_game.py only updates ingest_status/ingest_error/
ingested_at on rows this script creates). Syncs the season to date plus the next
14 days from the daily schedule endpoint, upserting on game_id -- scores and
gameState fill in as games go final, so re-running is cheap and idempotent.

Only gameType 2 (regular season) and 3 (playoff) games are ingested, per the
politeness/scope lock. gameState 'OFF' means final; 'FUT' and 'PRE' games get
ingest_status left at 'pending' until they're actually over.
"""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from client import NHLClient

INGESTABLE_GAME_TYPES = {2, 3}


def current_season_start(today: date) -> date:
    """NHL seasons start in October; a season's games before October belong to
    the previous season's schedule year in our own book-keeping only -- the API
    labels each game's `season` field itself (e.g. 20262027), which is what's
    actually stored, this is just where to start pulling daily schedule pages."""
    year = today.year if today.month >= 7 else today.year - 1
    return date(year, 10, 1)


def fetch_schedule_rows(client: NHLClient, start: date, end: date) -> list[dict]:
    rows: list[dict] = []
    seen_ids: set[int] = set()
    cursor = start
    while cursor <= end:
        payload = client.schedule(cursor.isoformat())
        for week in payload.get("gameWeek", []):
            for game in week.get("games", []):
                if game["id"] in seen_ids:
                    continue
                if game["gameType"] not in INGESTABLE_GAME_TYPES:
                    continue
                seen_ids.add(game["id"])
                rows.append(_to_row(game))
        # Each response covers the current week; jump to the next distinct week
        # start the payload names rather than stepping a day at a time.
        next_date = payload.get("nextStartDate")
        if not next_date or date.fromisoformat(next_date) <= cursor:
            cursor = cursor + timedelta(days=7)
        else:
            cursor = date.fromisoformat(next_date)
    return rows


def _to_row(game: dict) -> dict:
    away = game["awayTeam"]
    home = game["homeTeam"]
    outcome = game.get("gameOutcome", {})
    state = game["gameState"]
    return {
        "game_id": game["id"],
        "season": game["season"],
        "game_type": game["gameType"],
        "game_date": game["startTimeUTC"][:10],
        "start_time_utc": game["startTimeUTC"],
        "venue": game.get("venue", {}).get("default"),
        "venue_tz": game.get("venueTimezone"),
        "home_team_id": home["id"],
        "away_team_id": away["id"],
        "home_score": home.get("score"),
        "away_score": away.get("score"),
        "game_state": state,
        "last_period_type": outcome.get("lastPeriodType"),
        # home_coach/away_coach and ingest_status/ingest_error/ingested_at are
        # deliberately omitted here: ingest_game.py owns them (see its module
        # docstring), and Supabase upsert only touches columns present in the
        # payload -- a new row still gets ingest_status='pending' from the
        # column DEFAULT, and re-syncing an already-ingested row never resets it.
    }


def sync_schedule(client: NHLClient, supabase) -> int:
    today = date.today()
    start = current_season_start(today)
    end = today + timedelta(days=14)
    rows = fetch_schedule_rows(client, start, end)

    if rows:
        supabase.table("nhl_games").upsert(rows).execute()

    print(f"[sync_schedule] upserted {len(rows)} games in range {start}..{end}")
    return len(rows)


if __name__ == "__main__":
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(".env.local")
    SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
        sys.exit(1)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    sync_schedule(NHLClient(), sb)
