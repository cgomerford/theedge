"""
Compute per-position percentiles + letter grades for the player pool.
Runs after fetch_ultimate_team_pool.py.
"""
import os
import sys
from pathlib import Path
from typing import Any
from dotenv import load_dotenv
from supabase import create_client
from scipy import stats as scipy_stats  # for percentile calc
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

# Stat used to rank within each position
POSITION_RANKING_STAT = {
    # Hitters: OPS for all (composite of OBP + SLG, position-agnostic)
    'C': 'ops', '1B': 'ops', '2B': 'ops', '3B': 'ops', 'SS': 'ops',
    'LF': 'ops', 'CF': 'ops', 'RF': 'ops', 'DH': 'ops',
    # Pitchers: composite handled separately
    'SP': 'pitcher_composite', 'RP': 'pitcher_composite',
}


def pitcher_composite(p: dict) -> float:
    """Lower-is-better stats inverted to higher-is-better composite."""
    era = float(p.get('era') or 99)
    whip = float(p.get('whip') or 99)
    k_per_9 = float(p.get('k_per_9') or 0)
    # Inverted ERA + inverted WHIP * 2 + K/9 / 3 — rough composite
    return (10 - min(era, 10)) + (2.5 - min(whip, 2.5)) * 2 + k_per_9 / 3


def percentile_to_grade(pct: float) -> str:
    """0-100 percentile → letter grade.
    Top 5% = A+, top 15% = A, top 35% = B, top 65% = C, top 85% = D, rest = F
    """
    if pct >= 95: return 'A+'
    if pct >= 85: return 'A'
    if pct >= 65: return 'B'
    if pct >= 35: return 'C'
    if pct >= 15: return 'D'
    return 'F'


def main() -> None:
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Fetch all players
    result = supa.table('ultimate_team_players').select('*').execute()
    players = result.data
    
    if not players:
        print('No players in pool. Run fetch_ultimate_team_pool.py first.')
        return
    
    # Group by position
    by_position: dict[str, list[dict]] = {}
    for p in players:
        pos = p['primary_position']
        by_position.setdefault(pos, []).append(p)
    
    # For each position, compute percentile within group
    updates: list[dict] = []
    for position, group in by_position.items():
        if len(group) < 2:
            # Too few players at this position for meaningful percentile
            for p in group:
                updates.append({
                    'player_id': p['player_id'],
                    'position_percentile': 50,
                    'grade': 'C',
                })
            continue
        
        # Get the ranking stat per player
        if position in ('SP', 'RP'):
            scores = [pitcher_composite(p) for p in group]
        else:
            scores = [float(p.get('ops') or 0) for p in group]
        
        # Compute percentile rank for each player within their position
        for p, score in zip(group, scores):
            # percentileofscore gives 0-100 — higher score = higher percentile
            pct = float(scipy_stats.percentileofscore(scores, score, kind='mean'))
            updates.append({
                'player_id': p['player_id'],
                'position_percentile': round(pct, 2),
                'grade': percentile_to_grade(pct),
            })
    
# Batch update — only touch position_percentile + grade columns
    print(f'Updating {len(updates)} grades...')
    for u in updates:
        supa.table('ultimate_team_players')\
            .update({'position_percentile': u['position_percentile'], 'grade': u['grade']})\
            .eq('player_id', u['player_id'])\
            .execute()
    
    print('Done.')


if __name__ == '__main__':
    main()