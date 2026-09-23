#!/usr/bin/env python3
"""
scripts/fetch_abs_challenge_leaderboard.py

Season-aggregate ABS (Automated Ball-Strike) challenge counts, per team,
split by who challenges (batter vs. pitcher/catcher). Feeds the "Who's
challenging" and "Leaderboards" boxes on /mlb/abs (src/lib/abs-challenges.ts).

Until Sept 2026 those boxes fetched Baseball Savant's abs-challenges
leaderboard live, at request time, via its CSV export (?csv=true). That
export started 500ing that month regardless of query params (curl-verified:
every parameter combination tried, including a bare `?csv=true`, returns
HTTP 500 — this is a Savant-side regression, not a bad param on our end).

Workaround, also curl-verified: the leaderboard's plain HTML page (no
csv=true) still returns 200, and the full per-team dataset is embedded
directly in that HTML as `const absData = [...]` — a client-hydration
blob, not something rendered into <table> markup, which is why a naive
BeautifulSoup table-scrape would find nothing. We parse that blob directly
with json.loads instead of the broken CSV path.

Two curl-verified team-level categories (same two curls the old
request-time code used):
  challengeType=batting-team  — challenges initiated by this team's batters
  challengeType=catching-team — challenges initiated by this team's pitcher/catcher
Each row's numeric `id` field is MLB's own team id (e.g. 121 = NYM) — same
ids as MLB_TEAMS in src/lib/mlb-assets.ts. We key on that id, NOT Savant's
own `team_abbr` string, because Savant's abbreviation for a couple of teams
(e.g. "AZ" for Arizona) doesn't match this codebase's convention ("ARI");
the numeric id has no such ambiguity.

TABLE OWNERSHIP: this script is the SINGLE writer of
abs_challenge_team_leaderboard (schema: scripts/sql/create_abs_challenge_team_leaderboard.sql).

Run: python3 scripts/fetch_abs_challenge_leaderboard.py
Cron: daily — season-cumulative data, no upstream dependency on other crons.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

SEASON = datetime.now().year

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,*/*',
    'Referer': 'https://baseballsavant.mlb.com/',
}

LEADERBOARD_URL = 'https://baseballsavant.mlb.com/leaderboard/abs-challenges'

ABS_DATA_MARKER = 'const absData = '


def fetch_challenge_type(challenge_type: str) -> dict:
    """Returns {team_id: raw_row} for one challengeType ('batting-team' or
    'catching-team'). Empty dict on any failure — never raises, so one bad
    pull doesn't block the other side."""
    params = {
        'season[]': SEASON,
        'gameType[]': 'R',
        'challengeType': challenge_type,
        'level': 'mlb',
        'minChal': 0,
        'minOppChal': 0,
        'sort': 'n_challenges',
        'sortDir': 'desc',
        'page': 0,
        'pageSize': 50,
    }
    try:
        res = requests.get(LEADERBOARD_URL, params=params, headers=HEADERS, timeout=30)
    except Exception as e:
        print('  [{}] request failed: {}'.format(challenge_type, e))
        return {}

    if res.status_code != 200:
        print('  [{}] HTTP {}'.format(challenge_type, res.status_code))
        return {}

    marker_idx = res.text.find(ABS_DATA_MARKER)
    if marker_idx == -1:
        print('  [{}] absData blob not found in page — Savant may have changed the page structure'.format(challenge_type))
        return {}

    array_start = marker_idx + len(ABS_DATA_MARKER)
    try:
        data, _ = json.JSONDecoder().raw_decode(res.text, array_start)
    except json.JSONDecodeError as e:
        print('  [{}] failed to parse absData JSON: {}'.format(challenge_type, e))
        return {}

    by_team_id = {}
    for row in data:
        team_id = row.get('id')
        if team_id is None:
            continue
        by_team_id[team_id] = row
    return by_team_id


def build_records(batting_by_team: dict, catching_by_team: dict) -> list:
    team_ids = set(batting_by_team) | set(catching_by_team)
    records = []
    for team_id in sorted(team_ids):
        b = batting_by_team.get(team_id, {})
        c = catching_by_team.get(team_id, {})

        batting_challenges = int(b.get('n_challenges') or 0)
        batting_overturns = int(b.get('n_overturns') or 0)
        batting_confirms = int(b.get('n_fails') or 0)
        pitching_challenges = int(c.get('n_challenges') or 0)
        pitching_overturns = int(c.get('n_overturns') or 0)
        pitching_confirms = int(c.get('n_fails') or 0)

        total_challenges = batting_challenges + pitching_challenges
        total_overturns = batting_overturns + pitching_overturns

        records.append({
            'team_id': team_id,
            'season': SEASON,
            'batting_challenges': batting_challenges,
            'batting_overturns': batting_overturns,
            'batting_confirms': batting_confirms,
            'batting_success_rate': round(b['rate_overturns'], 4) if b.get('rate_overturns') is not None else None,
            'pitching_challenges': pitching_challenges,
            'pitching_overturns': pitching_overturns,
            'pitching_confirms': pitching_confirms,
            'pitching_success_rate': round(c['rate_overturns'], 4) if c.get('rate_overturns') is not None else None,
            'total_challenges': total_challenges,
            'total_overturns': total_overturns,
            'total_success_rate': round(total_overturns / total_challenges, 4) if total_challenges > 0 else None,
        })
    return records


def upsert_rows(rows: list) -> int:
    try:
        supa.table('abs_challenge_team_leaderboard').upsert(rows, on_conflict='team_id,season').execute()
        return len(rows)
    except Exception as e:
        print('  Upsert failed: {}'.format(e))
        return 0


def main():
    print('Fetching batting-team challenges (batter-initiated)...')
    batting_by_team = fetch_challenge_type('batting-team')
    print('  {} teams'.format(len(batting_by_team)))

    time.sleep(1)  # be polite between the two pulls

    print('Fetching catching-team challenges (pitcher/catcher-initiated)...')
    catching_by_team = fetch_challenge_type('catching-team')
    print('  {} teams'.format(len(catching_by_team)))

    if not batting_by_team and not catching_by_team:
        print('Both pulls returned nothing — aborting before touching the table.')
        sys.exit(1)

    records = build_records(batting_by_team, catching_by_team)
    if not records:
        print('No records built — aborting before touching the table.')
        sys.exit(1)

    print('\nSample rows (verify these look sane before confirming):')
    for r in records[:5]:
        print(' ', r)

    print('\nAbout to upsert {} rows into abs_challenge_team_leaderboard. Ctrl-C now to abort.'.format(len(records)))
    time.sleep(3)

    saved = upsert_rows(records)
    print('\nDone — {} rows saved.'.format(saved))


if __name__ == '__main__':
    main()
