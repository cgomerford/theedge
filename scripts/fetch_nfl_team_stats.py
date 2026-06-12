#!/usr/bin/env python3
"""
scripts/fetch_nfl_team_stats.py
Fetches NFL team stats from ESPN Core API for all 32 teams.
Writes to nfl_team_stats table in Supabase.
Run:
  python3 scripts/fetch_nfl_team_stats.py --season 2025
  python3 scripts/fetch_nfl_team_stats.py --debug --season 2025   # to inspect available stat keys
"""
import os
import sys
import time
import argparse
import requests
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'

# ESPN ID → abbreviation (32 teams)
NFL_TEAMS = {
    '1': 'ATL', '2': 'BUF', '3': 'CHI', '4': 'CIN', '5': 'CLE',
    '6': 'DAL', '7': 'DEN', '8': 'DET', '9': 'GB', '10': 'TEN',
    '11': 'IND', '12': 'KC', '13': 'LV', '14': 'LAR', '15': 'MIA',
    '16': 'MIN', '17': 'NE', '18': 'NO', '19': 'NYG', '20': 'NYJ',
    '21': 'PHI', '22': 'PIT', '23': 'ARI', '24': 'LAC', '25': 'SF',
    '26': 'SEA', '27': 'TB', '28': 'WSH', '29': 'CAR', '30': 'HOU',
    '33': 'BAL', '34': 'JAX',
}


def parse_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(str(val).replace(',', ''))
    except (ValueError, TypeError):
        return None


def fetch_team_info(team_id: str) -> dict:
    """Fetch basic team info + record from ESPN."""
    url = f"{ESPN}/teams/{team_id}"
    try:
        r = requests.get(url, timeout=10)
        if not r.ok:
            return {}
        data = r.json().get('team', {})

        # Record
        record_items = data.get('record', {}).get('items', [{}])
        record_stats = {}
        for s in record_items[0].get('stats', []):
            record_stats[s.get('name', '')] = s.get('value')

        return {
            'abbreviation': data.get('abbreviation', ''),
            'name': data.get('displayName', ''),
            'wins': int(record_stats.get('wins', 0) or 0),
            'losses': int(record_stats.get('losses', 0) or 0),
            'ties': int(record_stats.get('ties', 0) or 0),
            'points_for': parse_float(record_stats.get('pointsFor')),
            'points_against': parse_float(record_stats.get('pointsAgainst')),
            'win_pct': parse_float(record_stats.get('winPercent')),
        }
    except Exception:
        return {}


def fetch_team_stats(team_id: str, season: int) -> dict:
    """
    Fetch season stats from ESPN Core API.
    Structure: splits.categories[n].stats[] with name + displayValue + value
    Mappings updated based on actual 2025 KC stats output.
    """
    url = f"{ESPN_CORE}/seasons/{season}/types/2/teams/{team_id}/statistics"
    try:
        r = requests.get(url, timeout=15)
        if not r.ok:
            return {}
        data = r.json()

        # Flatten all stats into one dict keyed by stat name (and cat.name to avoid collisions)
        flat = {}
        for cat in data.get('splits', {}).get('categories', []):
            cat_name = cat.get('name', '')
            for stat in cat.get('stats', []):
                name = stat.get('name', '')
                display = stat.get('displayValue', '')
                value = stat.get('value')
                flat[f"{cat_name}.{name}"] = {'display': display, 'value': value}
                flat[name] = {'display': display, 'value': value}

        def flt(key: str) -> Optional[float]:
            """Get float value by stat name (bare or cat.name)."""
            entry = flat.get(key) or {}
            v = entry.get('value')
            if v is not None:
                return parse_float(v)
            d = entry.get('display', '')
            if d:
                return parse_float(d)
            return None

        def flt_cat(cat: str, key: str) -> Optional[float]:
            """Get float value by category.stat."""
            return flt(f"{cat}.{key}")

        # Return mapped stats using ACTUAL keys from ESPN 2025 response
        return {
            # Passing offense
            'pass_yards_per_game': flt_cat('passing', 'netPassingYardsPerGame') or flt_cat('passing', 'passingYardsPerGame'),
            'pass_yards_total': flt_cat('passing', 'netPassingYards') or flt_cat('passing', 'passingYards'),
            'pass_tds': flt_cat('passing', 'passingTouchdowns') or flt_cat('scoring', 'passingTouchdowns'),
            'pass_ints': flt_cat('passing', 'interceptions'),
            'completion_pct': flt_cat('passing', 'completionPct'),
            'pass_yards_per_attempt': flt_cat('passing', 'yardsPerPassAttempt') or flt_cat('passing', 'netYardsPerPassAttempt'),
            'pass_sacks_allowed': flt_cat('passing', 'sacks'),

            # Rushing offense
            'rush_yards_per_game': flt_cat('rushing', 'rushingYardsPerGame'),
            'rush_yards_total': flt_cat('rushing', 'rushingYards'),
            'rush_tds': flt_cat('rushing', 'rushingTouchdowns') or flt_cat('scoring', 'rushingTouchdowns'),
            'rush_yards_per_carry': flt_cat('rushing', 'yardsPerRushAttempt'),

            # Scoring & situational offense (from miscellaneous/scoring categories)
            'points_per_game': flt_cat('scoring', 'totalPointsPerGame') or flt('totalPointsPerGame'),
            'red_zone_pct': flt_cat('miscellaneous', 'redzoneEfficiencyPct'),
            'third_down_pct': flt_cat('miscellaneous', 'thirdDownConvPct'),

            # Defense (production stats available; "allowed" stats are mostly 0/unavailable in this endpoint)
            'def_points_allowed_per_game': flt_cat('defensive', 'pointsAllowed'),
            'def_pass_yards_allowed': None,
            'def_rush_yards_allowed': None,
            'def_total_yards_allowed': flt_cat('defensive', 'yardsAllowed'),
            'def_sacks': flt_cat('defensive', 'sacks'),
            'def_interceptions': flt_cat('defensiveInterceptions', 'interceptions'),
            'def_turnovers_forced': flt_cat('miscellaneous', 'totalTakeaways'),
            'def_third_down_pct_allowed': None,
            'def_red_zone_pct_allowed': None,
        }
    except Exception as e:
        print(f" stats error: {e}")
        return {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--season', type=int, default=2025)
    parser.add_argument('--debug', action='store_true', help='Print all stat keys for first team (KC) and exit')
    args = parser.parse_args()

    season = args.season

    if not SUPABASE_URL or not SUPABASE_KEY:
        print('✗ Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
        sys.exit(1)

    supa = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Debug mode — print all stat keys for KC to help with mapping
    if args.debug:
        url = f"{ESPN_CORE}/seasons/{season}/types/2/teams/12/statistics"
        try:
            r = requests.get(url, timeout=15)
            if not r.ok:
                print(f"Debug request failed: {r.status_code}")
                return
            data = r.json()
            print('\nAll stat keys for KC:')
            for cat in data.get('splits', {}).get('categories', []):
                print(f'\n  [{cat.get("name")}]')
                for stat in cat.get('stats', []):
                    print(f'    {stat.get("name")}: {stat.get("displayValue")}')
        except Exception as e:
            print(f"Debug error: {e}")
        return

    print(f'─── Fetching NFL team stats — {season} season ───')
    success = 0
    failed = 0

    for team_id, abbr in sorted(NFL_TEAMS.items(), key=lambda x: x[1]):
        print(f' {abbr:4}...', end=' ', flush=True)

        info = fetch_team_info(team_id)
        stats = fetch_team_stats(team_id, season)

        if not info and not stats:
            print('✗ no data')
            failed += 1
            continue

        row = {
            'team_id': team_id,
            'season': season,
            'abbreviation': info.get('abbreviation', abbr),
            'name': info.get('name', ''),
            'wins': info.get('wins', 0),
            'losses': info.get('losses', 0),
            'ties': info.get('ties', 0),
            'win_pct': info.get('win_pct'),
            'points_for': info.get('points_for'),
            'points_against': info.get('points_against'),
            **stats,
            'updated_at': 'now()',
        }

        try:
            result = supa.table('nfl_team_stats').upsert(
                row, on_conflict='team_id,season'
            ).execute()

            if result.data:
                w = info.get('wins', '?')
                l = info.get('losses', '?')
                ppg = stats.get('points_per_game')
                ppg_str = f" | {ppg:.1f} PPG" if ppg else ""
                pass_ypg = stats.get('pass_yards_per_game')
                pass_str = f" | {pass_ypg:.0f} pass YPG" if pass_ypg else ""
                print(f'✓ {w}-{l}{ppg_str}{pass_str}')
                success += 1
            else:
                print('✗ upsert failed (no data returned)')
                failed += 1
        except Exception as e:
            print(f'✗ upsert error: {e}')
            failed += 1

        time.sleep(0.4)

    print(f'\n─── Complete ───')
    print(f' Success: {success}')
    print(f' Failed: {failed}')

    if failed > 0:
        print(f'\n Tip: run with --debug --season {season} to inspect available stat keys')


if __name__ == '__main__':
    main()
