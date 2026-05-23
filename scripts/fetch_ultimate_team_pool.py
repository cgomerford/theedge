"""
Fetch top 200 MLB players (by recent performance) + season stats.
...
"""

import os
import sys
from typing import Any
import requests             
from dotenv import load_dotenv
from supabase import create_client

# Find .env.local relative to this script — works from any cwd
from pathlib import Path
ENV_PATH = Path(__file__).parent.parent / '.env.local'
load_dotenv(ENV_PATH)

# Support both naming conventions:
#   Local dev .env.local uses Next.js names (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
#   GitHub Actions secrets use SUPABASE_URL, SUPABASE_SERVICE_KEY
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing env vars. Need either:')
    print('  - SUPABASE_URL + SUPABASE_SERVICE_KEY (CI), OR')
    print('  - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local)')
    sys.exit(1)
MLB_API = 'https://statsapi.mlb.com/api/v1'

# Position mapping from MLB API codes
POSITION_CODES = {
    '1': 'SP',   # Pitchers — code '1' in MLB API. Reclassified to RP in reclassify_pitcher()
    '2': 'C', '3': '1B', '4': '2B', '5': '3B', '6': 'SS',
    '7': 'LF', '8': 'CF', '9': 'RF', '10': 'DH',
    'C': 'C', '1B': '1B', '2B': '2B', '3B': '3B', 'SS': 'SS',
    'LF': 'LF', 'CF': 'CF', 'RF': 'RF', 'DH': 'DH',
    'P': 'SP', 'SP': 'SP', 'RP': 'RP',
    'TWP': 'SP',  # Two-way player — classify as pitcher initially
    'Y': 'SP',    # Shohei-style two-way (legacy code)
}


def fetch_team_rosters() -> list[dict[str, Any]]:
    """Get every active MLB roster — 30 teams × ~26 players = ~780 players."""
    teams_url = f'{MLB_API}/teams?sportId=1&activeStatus=Y'
    teams = requests.get(teams_url).json().get('teams', [])
    
    all_players = []
    for team in teams:
        team_id = team['id']
        team_short = team.get('abbreviation', team.get('teamCode', ''))
        roster_url = f'{MLB_API}/teams/{team_id}/roster?rosterType=active'
        roster = requests.get(roster_url).json().get('roster', [])
        
        for entry in roster:
            player_id = entry['person']['id']
            full_name = entry['person']['fullName']
            position_code = entry.get('position', {}).get('code', 'P')
            primary_position = POSITION_CODES.get(position_code, 'DH')
            player_type = 'pitcher' if primary_position in ('SP', 'RP', 'P') else 'hitter'
            
            all_players.append({
                'player_id': player_id,
                'full_name': full_name,
                'team_id': team_id,
                'team_short': team_short,
                'primary_position': primary_position,
                'player_type': player_type,
            })
    
    print(f'Found {len(all_players)} active players across all rosters')
    return all_players


def fetch_player_stats(player_id: int, player_type: str) -> dict[str, Any]:
    """Fetch season stats for one player. Returns dict of stat keys."""
    group = 'pitching' if player_type == 'pitcher' else 'hitting'
    url = f'{MLB_API}/people/{player_id}/stats?stats=season&group={group}&season=2026'
    
    try:
        r = requests.get(url, timeout=10)
        if not r.ok:
            return {}
        data = r.json()
        stats_blocks = data.get('stats', [])
        if not stats_blocks:
            return {}
        splits = stats_blocks[0].get('splits', [])
        if not splits:
            return {}
        return splits[0].get('stat', {})
    except Exception as e:
        print(f'  Stats fetch failed for {player_id}: {e}', file=sys.stderr)
        return {}


def reclassify_pitcher(stats: dict, default_position: str) -> str:
    """If a pitcher has more saves than wins, classify as RP. Otherwise SP."""
    if default_position not in ('SP', 'P', 'RP'):
        return default_position
    saves = int(stats.get('saves', 0) or 0)
    games_started = int(stats.get('gamesStarted', 0) or 0)
    games_played = int(stats.get('gamesPlayed', 0) or 0)
    # Heuristic: if more than half their games were starts, SP. Otherwise RP.
    if games_played > 0 and games_started / games_played >= 0.5:
        return 'SP'
    return 'RP'


def score_player(stats: dict, player_type: str) -> float:
    """Composite 'recent performance' score for ranking the pool.
    
    Hitters: OPS-driven with games_played floor
    Pitchers: ERA + WHIP inverted (lower is better)
    """
    if player_type == 'hitter':
        ops = float(stats.get('ops', 0) or 0)
        games = int(stats.get('gamesPlayed', 0) or 0)
        if games < 10:  # Floor: must have played meaningfully
            return 0
        # OPS weighted by sqrt(games) so a .900 OPS in 80 games beats .950 in 20
        return ops * (games ** 0.5)
    else:
        era = float(stats.get('era', 99.0) or 99.0)
        whip = float(stats.get('whip', 99.0) or 99.0)
        innings = float(stats.get('inningsPitched', 0) or 0)
        if innings < 10:
            return 0
        # Lower ERA + WHIP = higher score. Inverted with floor.
        # Subtract from 10 (ERA floor) and 2.5 (WHIP floor), multiply by sqrt(innings)
        return ((10 - min(era, 10)) + (2.5 - min(whip, 2.5)) * 2) * (innings ** 0.4)


def build_row(player: dict, stats: dict) -> dict[str, Any]:
    """Transform raw API data into a DB row."""
    player_type = player['player_type']
    position = (
        reclassify_pitcher(stats, player['primary_position'])
        if player_type == 'pitcher'
        else player['primary_position']
    )
    
    row: dict[str, Any] = {
        'player_id': player['player_id'],
        'full_name': player['full_name'],
        'team_id': player['team_id'],
        'team_short': player['team_short'],
        'primary_position': position,
        'player_type': player_type,
        'games_played': int(stats.get('gamesPlayed', 0) or 0),
    }
    
    if player_type == 'hitter':
        row.update({
            'avg': float(stats.get('avg', 0) or 0),
            'obp': float(stats.get('obp', 0) or 0),
            'slg': float(stats.get('slg', 0) or 0),
            'ops': float(stats.get('ops', 0) or 0),
            'home_runs': int(stats.get('homeRuns', 0) or 0),
            'rbi': int(stats.get('rbi', 0) or 0),
            'stolen_bases': int(stats.get('stolenBases', 0) or 0),
        })
    else:
        row.update({
            'era': float(stats.get('era', 99.0) or 99.0),
            'whip': float(stats.get('whip', 99.0) or 99.0),
            'k_per_9': float(stats.get('strikeoutsPer9Inn', 0) or 0),
            'wins': int(stats.get('wins', 0) or 0),
            'saves': int(stats.get('saves', 0) or 0),
            'innings_pitched': float(stats.get('inningsPitched', 0) or 0),
        })
    
    return row


def main() -> None:
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 1. Get all rosters
    all_players = fetch_team_rosters()
    
    # 2. Fetch stats for each (this is the slow part — ~780 API calls)
    print(f'Fetching season stats for {len(all_players)} players...')
    enriched: list[dict] = []
    for i, p in enumerate(all_players):
        if (i + 1) % 50 == 0:
            print(f'  {i + 1}/{len(all_players)}...')
        stats = fetch_player_stats(p['player_id'], p['player_type'])
        if not stats:
            continue
        enriched.append({
            'player': p,
            'stats': stats,
            'score': score_player(stats, p['player_type']),
        })
    
  # 3. Split hitters vs pitchers, take top of each
    hitters = [e for e in enriched if e['player']['player_type'] == 'hitter']
    pitchers = [e for e in enriched if e['player']['player_type'] == 'pitcher']
    
    # Debug: how many of each type made it through?
    print(f'\nEnriched breakdown: {len(hitters)} hitters, {len(pitchers)} pitchers')
    
    # Debug: show top 5 pitcher scores (or lack thereof)
    pitchers.sort(key=lambda x: x['score'], reverse=True)
    print(f'Top 5 pitcher scores:')
    for p in pitchers[:5]:
        print(f'  {p["player"]["full_name"]} ({p["player"]["primary_position"]}) — score: {p["score"]:.2f}')
    if not pitchers:
        # Check: how many pitchers were in the raw roster?
        all_pitcher_count = sum(1 for p in all_players if p['player_type'] == 'pitcher')
        print(f'  WARNING: 0 pitchers in enriched pool. {all_pitcher_count} pitchers in raw roster.')
        print(f'  This means fetch_player_stats returned empty for all pitchers.')
    
    hitters.sort(key=lambda x: x['score'], reverse=True)
    
    top_hitters = hitters[:130]
    top_pitchers = pitchers[:70]
    top_200 = top_hitters + top_pitchers
    
    print(f'\nSelected top 200: {len(top_hitters)} hitters + {len(top_pitchers)} pitchers')
    
    # 4. Build DB rows
    rows = [build_row(e['player'], e['stats']) for e in top_200]
    
    # 5. Upsert in batches
    print('Upserting to Supabase...')
    BATCH = 50
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        supa.table('ultimate_team_players').upsert(batch, on_conflict='player_id').execute()
    
    print(f'Done. {len(rows)} players in pool.')


if __name__ == '__main__':
    main()