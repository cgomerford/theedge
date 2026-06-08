"""
Fetches team batting splits vs LHP and RHP for all 30 MLB teams.
Uses MLB Stats API sitCodes=vl (vs lefty) and sitCodes=vr (vs righty).
Writes to team_platoon_splits table in Supabase.
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

MLB_TEAMS = {
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

def fetch_split(team_id: int, sit_code: str, season: int):
    url = (
        f'{MLB_API}/teams/{team_id}/stats'
        f'?stats=season&group=hitting&season={season}&sitCodes={sit_code}'
    )
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        splits = data.get('stats', [{}])[0].get('splits', [])
        if not splits:
            return None
        return splits[0].get('stat', {})
    except Exception:
        return None

def main():
    season = 2026
    print(f'Fetching platoon splits for {len(MLB_TEAMS)} teams, {season}...')

    rows = []

    for team_id, team_name in MLB_TEAMS.items():
        vs_lhp = fetch_split(team_id, 'vl', season)
        time.sleep(0.15)
        vs_rhp = fetch_split(team_id, 'vr', season)
        time.sleep(0.15)

        if not vs_lhp and not vs_rhp:
            print(f'  {team_name}: no data')
            continue

        def safe_float(val, decimals=3):
            try:
                return round(float(val), decimals) if val not in (None, '', '-.--') else None
            except (ValueError, TypeError):
                return None

        row = {
            'team_id':   team_id,
            'team_name': team_name,
            'season':    season,
        }

        if vs_lhp:
            row['vs_lhp_ops']     = safe_float(vs_lhp.get('ops'), 3)
            row['vs_lhp_avg']     = safe_float(vs_lhp.get('avg'), 3)
            row['vs_lhp_obp']     = safe_float(vs_lhp.get('obp'), 3)
            row['vs_lhp_slg']     = safe_float(vs_lhp.get('slg'), 3)
            row['vs_lhp_hr']      = int(vs_lhp.get('homeRuns') or 0)
            row['vs_lhp_k_pct']   = safe_float(
                int(vs_lhp.get('strikeOuts') or 0) /
                max(int(vs_lhp.get('plateAppearances') or 1), 1) * 100, 1
            )
            row['vs_lhp_games']   = int(vs_lhp.get('gamesPlayed') or 0)

        if vs_rhp:
            row['vs_rhp_ops']     = safe_float(vs_rhp.get('ops'), 3)
            row['vs_rhp_avg']     = safe_float(vs_rhp.get('avg'), 3)
            row['vs_rhp_obp']     = safe_float(vs_rhp.get('obp'), 3)
            row['vs_rhp_slg']     = safe_float(vs_rhp.get('slg'), 3)
            row['vs_rhp_hr']      = int(vs_rhp.get('homeRuns') or 0)
            row['vs_rhp_k_pct']   = safe_float(
                int(vs_rhp.get('strikeOuts') or 0) /
                max(int(vs_rhp.get('plateAppearances') or 1), 1) * 100, 1
            )
            row['vs_rhp_games']   = int(vs_rhp.get('gamesPlayed') or 0)

        rows.append(row)
        print(f'  {team_name}: vs LHP {row.get("vs_lhp_ops","—")} OPS, vs RHP {row.get("vs_rhp_ops","—")} OPS')

    if rows:
        supa.table('team_platoon_splits').upsert(
            rows, on_conflict='team_id,season'
        ).execute()
        print(f'\n✓ DONE — {len(rows)} teams written to team_platoon_splits')

if __name__ == '__main__':
    main()
