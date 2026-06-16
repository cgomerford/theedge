#!/usr/bin/env python3
"""
fetch_bullpen_availability.py

Fetches pitch counts for each team's bullpen over the last 3 calendar days
using the MLB Stats API. Upserts results into the bullpen_availability table.

Run daily before the generate-narratives cron (e.g. 09:30 UTC).
Compatible with Python 3.9.
"""

import os
import sys
import json
import datetime
import requests
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client

from pathlib import Path
load_dotenv(Path(__file__).parent.parent / '.env.local')
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

MLB_API = 'https://statsapi.mlb.com/api/v1'

# Role classification by jersey number ranges is unreliable —
# we use games_started vs appearances to infer relievers.
RELIEVER_START_RATIO = 0.3   # if starts/apps < this, treat as reliever
MIN_APPEARANCES = 3          # ignore pitchers with fewer appearances (small sample)

# ── Helpers ──────────────────────────────────────────────────────────────────

def today_str() -> str:
    return datetime.date.today().isoformat()

def date_label(offset_days: int) -> str:
    """Short label for bar chart: e.g. 'Jun 14'"""
    d = datetime.date.today() - datetime.timedelta(days=offset_days)
    return d.strftime('%b %-d')

def date_iso(offset_days: int) -> str:
    d = datetime.date.today() - datetime.timedelta(days=offset_days)
    return d.isoformat()

def get_today_games() -> list:
    """Fetch today's schedule to get team IDs for all games."""
    url = f"{MLB_API}/schedule?sportId=1&date={today_str()}&hydrate=team"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    data = r.json()
    games = data.get('dates', [{}])[0].get('games', [])
    return games

def get_team_roster_pitchers(team_id: int) -> list:
    """
    Returns list of pitcher dicts: {player_id, full_name, position}
    Uses the 40-man roster endpoint — includes all active arms.
    """
    url = f"{MLB_API}/teams/{team_id}/roster?rosterType=active"
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    roster = r.json().get('roster', [])
    pitchers = []
    for p in roster:
        pos = p.get('position', {}).get('abbreviation', '')
        if pos == 'P':
            pitchers.append({
                'player_id': p['person']['id'],
                'name':      p['person']['fullName'],
            })
    return pitchers

def get_pitcher_season_stats(player_id: int) -> Optional[dict]:
    """
    Returns season totals to classify starter vs reliever:
    {games, games_started, era, innings_pitched}
    """
    url = (
        f"{MLB_API}/people/{player_id}/stats"
        f"?stats=season&group=pitching&season=2026"
    )
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    splits = r.json().get('stats', [{}])[0].get('splits', [])
    if not splits:
        return None
    s = splits[0].get('stat', {})
    return {
        'games':         int(s.get('gamesPlayed', 0)),
        'games_started': int(s.get('gamesStarted', 0)),
        'era':           float(s.get('era', 0)) if s.get('era') not in (None, '-.--', '') else None,
        'ip':            float(s.get('inningsPitched', 0) or 0),
    }

def get_pitcher_game_log(player_id: int) -> list:
    """
    Returns last 5 game log entries for this pitcher this season.
    Each entry: {game_date, numberOfPitches}
    """
    url = (
        f"{MLB_API}/people/{player_id}/stats"
        f"?stats=gameLog&group=pitching&season=2026"
    )
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    splits = r.json().get('stats', [{}])[0].get('splits', [])
    entries = []
    for sp in splits[-5:]:   # last 5 appearances
        stat = sp.get('stat', {})
        entries.append({
            'game_date':      sp.get('date', ''),
            'pitches':        int(stat.get('numberOfPitches', 0) or 0),
        })
    return entries

def pitches_on_date(game_log: list, date_iso_str: str) -> int:
    """Sum pitches thrown on a specific date."""
    return sum(g['pitches'] for g in game_log if g['game_date'] == date_iso_str)

def classify_role(season_stats: dict) -> str:
    games   = season_stats['games']
    started = season_stats['games_started']
    if games == 0:
        return 'Middle Relief'
    ratio = started / games
    if ratio >= 0.7:
        return 'Starter'       # shouldn't appear but safety net
    if started == 0 and games >= 5:
        # rough role from ERA / usage — could refine with order data later
        return 'Closer' if (season_stats.get('era') or 99) < 2.5 else 'Setup' if (season_stats.get('era') or 99) < 3.5 else 'Middle Relief'
    return 'Middle Relief'

def is_reliever(season_stats: dict) -> bool:
    games   = season_stats['games']
    started = season_stats['games_started']
    if games < MIN_APPEARANCES:
        return False
    ratio = started / games if games > 0 else 0
    return ratio < RELIEVER_START_RATIO

# ── Main ─────────────────────────────────────────────────────────────────────

def process_team(team_id: int, team_name: str, game_date: str) -> int:
    """
    Fetches bullpen data for one team and upserts to Supabase.
    Returns number of arms written.
    """
    print(f"  Processing {team_name} (id={team_id})")
    pitchers = get_team_roster_pitchers(team_id)
    print(f"    {len(pitchers)} pitchers on active roster")

    arms_written = 0
    rows = []

    for p in pitchers:
        try:
            season = get_pitcher_season_stats(p['player_id'])
            if not season:
                continue
            if not is_reliever(season):
                continue

            game_log = get_pitcher_game_log(p['player_id'])

            # Pitches per day for last 3 calendar days (offset 2, 1, 0)
            days = []
            for offset in [2, 1, 0]:
                d = date_iso(offset)
                days.append({
                    'date':    date_label(offset),
                    'pitches': pitches_on_date(game_log, d),
                })

            pitches_today     = days[2]['pitches']   # offset=0
            pitches_yesterday = days[1]['pitches']   # offset=1
            pitches_3d        = sum(d['pitches'] for d in days)

            role = classify_role(season)

            rows.append({
                'game_date':         game_date,
                'team_id':           team_id,
                'team_name':         team_name,
                'player_id':         p['player_id'],
                'player_name':       p['name'],
                'role':              role,
                'era':               season['era'],
                'pitches_3d':        pitches_3d,
                'pitches_yesterday': pitches_yesterday,
                'pitches_today':     pitches_today,
                # Store full day breakdown as JSONB
                'days_json':         json.dumps(days),
            })
            arms_written += 1

        except Exception as e:
            print(f"    WARN: {p['name']} ({p['player_id']}) — {e}")
            continue

    if rows:
        # Upsert: unique on (game_date, player_id)
        supa.table('bullpen_availability').upsert(
            rows,
            on_conflict='game_date,player_id'
        ).execute()
        print(f"    Upserted {len(rows)} relievers")

    return arms_written

def main():
    today = today_str()
    print(f"=== fetch_bullpen_availability.py — {today} ===")

    games = get_today_games()
    if not games:
        print("No games today — exiting.")
        return

    # Collect unique team IDs from today's slate
    teams_seen = set()
    teams = []
    for g in games:
        for side in ['home', 'away']:
            tid  = g['teams'][side]['team']['id']
            tname = g['teams'][side]['team']['name']
            if tid not in teams_seen:
                teams_seen.add(tid)
                teams.append({'id': tid, 'name': tname})

    print(f"Found {len(games)} games — processing {len(teams)} teams")

    total = 0
    for t in teams:
        try:
            n = process_team(t['id'], t['name'], today)
            total += n
        except Exception as e:
            print(f"  ERROR: {t['name']} — {e}")

    print(f"\nDone. {total} reliever rows upserted for {today}.")

if __name__ == '__main__':
    main()
