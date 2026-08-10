"""
scripts/fetch_pitch_velocity_range.py

Fetches Statcast pitch-by-pitch data for every active MLB pitcher and
computes MIN/MAX/AVG velocity per pitch type — the piece no Savant
leaderboard CSV exposes (pitch-arsenal-stats and pitch-movement both only
give season averages, confirmed by inspecting the pitch-movement column
picker directly: no min/max option exists there).

Uses pybaseball.statcast_pitcher(), the SAME function and library already
used in fetch_pitcher_hot_zones.py — 'release_speed' is a standard,
already-proven Statcast column in this codebase, not a new guess.

Stores results in `pitch_velocity_range`. One row per (player_id, season,
pitch_type). Companion table to pitch_arsenals — deliberately NOT added as
columns on pitch_arsenals itself, since that table already has a single
owner script (fetch_pitch_arsenals.py) and this data comes from a
completely different pull (raw pitch-level Statcast, not the arsenal-stats
leaderboard CSV). Same "one column, one writer" discipline as everywhere
else in this pipeline.

Runs once a week via GitHub Actions, same cadence as fetch_pitcher_hot_zones.py
— this is a per-pitcher API call loop, not a single fast CSV pull.

USAGE
  python3 scripts/fetch_pitch_velocity_range.py --season 2026
"""
import os
import sys
import time
import argparse
from datetime import datetime

import pandas as pd
from pybaseball import statcast_pitcher, cache
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')
cache.enable()

SUPABASE_URL = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip()
SUPABASE_SERVICE_KEY = (os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# A pitch type needs at least this many tracked pitches this season before
# its velocity range is trustworthy enough to store — a 3-pitch sample
# min/max is noise, not signal.
MIN_PITCHES_FOR_RANGE = 15

PITCH_NAME = {
    'FF': '4-seam',   'SI': 'Sinker',    'FC': 'Cutter',
    'SL': 'Slider',   'ST': 'Sweeper',   'SV': 'Slurve',
    'CU': 'Curveball','KC': 'Knuckle-curve', 'CS': 'Slow curve',
    'CH': 'Changeup', 'FS': 'Splitter',  'FO': 'Forkball',
    'EP': 'Eephus',   'KN': 'Knuckleball','SC': 'Screwball',
}


def clear_season(year: int) -> bool:
    """Same pattern as fetch_player_form.py's clear_today() — clear before
    writing so a pitcher who stops throwing a pitch type doesn't leave a
    stale row behind forever."""
    try:
        supabase.table('pitch_velocity_range').delete().eq('season', year).execute()
        return True
    except Exception as e:
        print('WARNING: failed to clear existing season {} rows: {}'.format(year, e))
        return False


def fetch_active_pitcher_ids() -> list:
    """
    Pool = every pitcher on a current 40-man roster. Reuses the same MLB
    Stats API roster-scan approach as the rest of this pipeline rather than
    introducing a new discovery method.
    """
    import requests
    ids = set()
    try:
        teams_res = requests.get('https://statsapi.mlb.com/api/v1/teams?sportId=1', timeout=10)
        teams_res.raise_for_status()
        team_ids = [t['id'] for t in teams_res.json().get('teams', [])]
    except Exception as e:
        print('Failed to fetch team list: {}'.format(e))
        return []

    for team_id in team_ids:
        try:
            roster_res = requests.get(
                'https://statsapi.mlb.com/api/v1/teams/{}/roster?rosterType=40Man'.format(team_id),
                timeout=10,
            )
            roster_res.raise_for_status()
            for p in roster_res.json().get('roster', []):
                if p.get('position', {}).get('type') == 'Pitcher':
                    ids.add(p['person']['id'])
        except Exception as e:
            print('  Roster fetch failed for team {}: {}'.format(team_id, e))
            continue
        time.sleep(0.2)  # be polite to the Stats API

    return sorted(ids)


def compute_velocity_ranges(player_id: int, season: int) -> list:
    """
    Pulls this pitcher's full-season pitch-by-pitch log and computes
    min/max/avg release_speed per pitch type. Returns [] on any fetch
    failure or empty result — never raises, so one bad pitcher doesn't
    kill the whole run.
    """
    start_dt = '{}-01-01'.format(season)
    end_dt = '{}-12-31'.format(season)
    try:
        df = statcast_pitcher(start_dt, end_dt, player_id)
    except Exception as e:
        print('  statcast_pitcher failed for {}: {}'.format(player_id, e))
        return []

    if df is None or df.empty or 'pitch_type' not in df.columns or 'release_speed' not in df.columns:
        return []

    df = df.dropna(subset=['pitch_type', 'release_speed'])
    if df.empty:
        return []

    rows = []
    for pitch_type, group in df.groupby('pitch_type'):
        n = len(group)
        if n < MIN_PITCHES_FOR_RANGE:
            continue
        rows.append({
            'player_id': player_id,
            'season': season,
            'pitch_type': pitch_type,
            'pitch_name': PITCH_NAME.get(pitch_type, pitch_type),
            'pitch_count': n,
            'velo_min': round(float(group['release_speed'].min()), 1),
            'velo_max': round(float(group['release_speed'].max()), 1),
            'velo_avg': round(float(group['release_speed'].mean()), 1),
        })
    return rows


def upsert_rows(rows: list, batch_size: int = 500) -> int:
    upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            supabase.table('pitch_velocity_range').upsert(
                batch, on_conflict='player_id,season,pitch_type',
            ).execute()
            upserted += len(batch)
            print('  Upserted {}/{}...'.format(upserted, len(rows)))
        except Exception as e:
            print('  Batch upsert failed: {}'.format(e))
    return upserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--season', type=int, default=datetime.now().year)
    parser.add_argument('--limit', type=int, default=None, help='Cap pitchers processed, for testing')
    args = parser.parse_args()

    print('Fetching active pitcher pool...')
    pitcher_ids = fetch_active_pitcher_ids()
    if args.limit:
        pitcher_ids = pitcher_ids[:args.limit]
    print('  {} pitchers in pool'.format(len(pitcher_ids)))

    all_rows = []
    for i, pid in enumerate(pitcher_ids):
        if (i + 1) % 25 == 0:
            print('  {}/{}...'.format(i + 1, len(pitcher_ids)))
        rows = compute_velocity_ranges(pid, args.season)
        all_rows.extend(rows)
        time.sleep(0.5)  # pybaseball hits Savant directly — stay polite

    if not all_rows:
        print('No rows computed — aborting before touching the table.')
        sys.exit(1)

    print('\nSample rows (verify these look sane before confirming):')
    for r in all_rows[:5]:
        print(' ', r)

    print('\nAbout to clear season {} and upsert {} rows. Ctrl-C now to abort.'.format(args.season, len(all_rows)))
    time.sleep(3)

    clear_season(args.season)
    saved = upsert_rows(all_rows)
    print('\nDone — {} rows saved.'.format(saved))


if __name__ == '__main__':
    main() 