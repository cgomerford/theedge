"""
Fetches pitcher H2H stats vs each opponent by scanning game logs
across the last 3 seasons. Aggregates wins, losses, ERA, IP.
Writes to pitcher_h2h table in Supabase.
"""
import os
import sys
import time
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').strip()
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
MLB_API = 'https://statsapi.mlb.com/api/v1'
SEASONS = [2026, 2025, 2024]

TEAM_ID_TO_NAME = {
    108: 'Los Angeles Angels', 109: 'Arizona Diamondbacks',
    110: 'Baltimore Orioles', 111: 'Boston Red Sox',
    112: 'Chicago Cubs', 113: 'Cincinnati Reds',
    114: 'Cleveland Guardians', 115: 'Colorado Rockies',
    116: 'Detroit Tigers', 117: 'Houston Astros',
    118: 'Kansas City Royals', 119: 'Los Angeles Dodgers',
    120: 'Washington Nationals', 121: 'New York Mets',
    133: 'Athletics', 134: 'Pittsburgh Pirates',
    135: 'San Diego Padres', 136: 'Seattle Mariners',
    137: 'San Francisco Giants', 138: 'St. Louis Cardinals',
    139: 'Tampa Bay Rays', 140: 'Texas Rangers',
    141: 'Toronto Blue Jays', 142: 'Minnesota Twins',
    143: 'Philadelphia Phillies', 144: 'Atlanta Braves',
    145: 'Chicago White Sox', 146: 'Miami Marlins',
    147: 'New York Yankees', 158: 'Milwaukee Brewers',
}

def fetch_game_log(player_id: int, season: int) -> list:
    url = f'{MLB_API}/people/{player_id}/stats?stats=gameLog&group=pitching&sportId=1&season={season}'
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        return data.get('stats', [{}])[0].get('splits', [])
    except Exception:
        return []

def ip_to_float(ip_str) -> float:
    """Convert '6.1' IP notation to decimal innings (6.333...)"""
    try:
        parts = str(ip_str).split('.')
        full = int(parts[0])
        thirds = int(parts[1]) if len(parts) > 1 else 0
        return round(full + thirds / 3, 2)
    except Exception:
        return 0.0

def aggregate_h2h(player_id: int) -> dict:
    """Scan last 3 seasons of game logs, aggregate stats vs each opponent."""
    by_team: dict[int, dict] = {}

    for season in SEASONS:
        splits = fetch_game_log(player_id, season)
        time.sleep(0.15)

        for game in splits:
            opp = game.get('opponent', {})
            opp_id = opp.get('id')
            if not opp_id:
                continue
            opp_id = int(opp_id)

            stat = game.get('stat', {})
            ip = ip_to_float(stat.get('inningsPitched', 0))
            er = int(stat.get('earnedRuns') or 0)
            wins = int(stat.get('wins') or 0)
            losses = int(stat.get('losses') or 0)
            ks = int(stat.get('strikeOuts') or 0)
            bb = int(stat.get('baseOnBalls') or 0)
            hits = int(stat.get('hits') or 0)

            if opp_id not in by_team:
                by_team[opp_id] = {
                    'games': 0, 'wins': 0, 'losses': 0,
                    'total_ip': 0.0, 'total_er': 0,
                    'strikeouts': 0, 'walks': 0, 'hits': 0,
                }
            by_team[opp_id]['games'] += 1
            by_team[opp_id]['wins'] += wins
            by_team[opp_id]['losses'] += losses
            by_team[opp_id]['total_ip'] += ip
            by_team[opp_id]['total_er'] += er
            by_team[opp_id]['strikeouts'] += ks
            by_team[opp_id]['walks'] += bb
            by_team[opp_id]['hits'] += hits

    return by_team

def main():
    result = supa.table('pitcher_stats').select('player_id,player_name').execute()
    pitchers = result.data or []
    print(f'Processing {len(pitchers)} pitchers across {SEASONS} seasons')

    rows = []
    processed = 0
    found = 0

    for pitcher in pitchers:
        player_id = pitcher['player_id']
        player_name = pitcher.get('player_name', str(player_id))

        by_team = aggregate_h2h(player_id)

        for opp_id, stats in by_team.items():
            if stats['games'] == 0:
                continue
            ip = stats['total_ip']
            er = stats['total_er']
            era = round((er * 9 / ip), 2) if ip > 0 else None

            rows.append({
                'player_id':          player_id,
                'opponent_team_id':   opp_id,
                'opponent_team_name': TEAM_ID_TO_NAME.get(opp_id, str(opp_id)),
                'season':             9999,  # 9999 = career aggregate
                'games':              stats['games'],
                'wins':               stats['wins'],
                'losses':             stats['losses'],
                'era':                era,
                'innings_pitched':    round(ip, 1),
                'strikeouts':         stats['strikeouts'],
                'walks':              stats['walks'],
                'hits':               stats['hits'],
            })
            found += 1

        processed += 1
        if processed % 20 == 0:
            print(f'  {processed}/{len(pitchers)} pitchers, {found} H2H records so far')

        if len(rows) >= 500:
            supa.table('pitcher_h2h').upsert(
                rows, on_conflict='player_id,opponent_team_id,season'
            ).execute()
            print(f'  Upserted {len(rows)} rows to Supabase')
            rows = []

    if rows:
        supa.table('pitcher_h2h').upsert(
            rows, on_conflict='player_id,opponent_team_id,season'
        ).execute()
        print(f'  Upserted final {len(rows)} rows')

    print(f'✓ DONE — {processed} pitchers, {found} H2H records written')

if __name__ == '__main__':
    main()
