"""
scripts/nhl/backfill.py

Ingests every regular-season (gameType 2) game with gameState 'OFF' and
ingest_status != 'ingested' for the given season, using client.py's token
bucket (NHL_REQS_PER_SEC, default 1.0) -- run sync_schedule.py first so
nhl_games has rows to select from.

--through-yesterday restricts to games up to yesterday: the deliberately
cautious mode for the initial manual historical catch-up (the build spec's
"backfill up to yesterday, REQS_PER_SEC=1.0"). Without it (the default), every
uningested OFF game is picked up regardless of date -- what nhl-sync.yml's
nightly sweep and game-night window actually need, since a cutoff of
"yesterday" would wrongly skip a game that finished earlier TODAY during the
game-night window.

Usage: python3 scripts/nhl/backfill.py --season 20262027 [--through-yesterday]
"""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from client import NHLClient
from ingest_game import ingest_game


def run_backfill(client: NHLClient, supabase, season: int, through_yesterday: bool = False) -> dict[str, int]:
    query = (
        supabase.table("nhl_games")
        .select("game_id,ingest_status")
        .eq("season", season)
        .eq("game_type", 2)
        .eq("game_state", "OFF")
        .neq("ingest_status", "ingested")
    )
    if through_yesterday:
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        query = query.lte("game_date", yesterday)
    rows = query.execute()
    game_ids = [r["game_id"] for r in rows.data]
    reqs_per_sec = os.environ.get("NHL_REQS_PER_SEC", "1.0")
    print(f"[backfill] {len(game_ids)} games to ingest for season {season} (REQS_PER_SEC={reqs_per_sec})")

    counts = {"ingested": 0, "failed": 0}
    for i, game_id in enumerate(game_ids, 1):
        ingest_game(client, supabase, game_id)
        status = supabase.table("nhl_games").select("ingest_status").eq("game_id", game_id).execute().data
        if status and status[0]["ingest_status"] == "ingested":
            counts["ingested"] += 1
        else:
            counts["failed"] += 1
        if i % 10 == 0:
            print(f"[backfill] progress: {i}/{len(game_ids)}")

    print(f"[backfill] done: {counts['ingested']} ingested, {counts['failed']} failed")
    return counts


if __name__ == "__main__":
    import argparse

    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv(".env.local")
    SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing Supabase credentials (checked both env var naming conventions).")
        sys.exit(1)

    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=20262027)
    parser.add_argument("--through-yesterday", action="store_true")
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    run_backfill(NHLClient(), sb, args.season, through_yesterday=args.through_yesterday)
