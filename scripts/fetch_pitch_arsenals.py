"""
Fetches pitch arsenal data for every active MLB starter and writes to Supabase.
Runs once daily via GitHub Actions.
"""
import os
import sys
from datetime import datetime
import pandas as pd
from pybaseball import statcast_pitcher_arsenal_stats, cache
from supabase import create_client

# Enable pybaseball caching to be polite to Statcast
cache.enable()

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Pitch type code -> friendly name
PITCH_NAMES = {
    'FF': '4-Seam Fastball',
    'SI': 'Sinker',
    'FC': 'Cutter',
    'SL': 'Slider',
    'ST': 'Sweeper',
    'SV': 'Slurve',
    'CU': 'Curveball',
    'KC': 'Knuckle Curve',
    'CH': 'Changeup',
    'FS': 'Splitter',
    'FO': 'Forkball',
    'SC': 'Screwball',
    'KN': 'Knuckleball',
    'EP': 'Eephus',
}

def main():
    season = datetime.now().year
    print(f'Fetching pitch arsenal stats for {season}...')

    # Get arsenal stats for every pitcher with at least 50 pitches thrown
    df = statcast_pitcher_arsenal_stats(year=season, minPA=50)

    if df is None or df.empty:
        print('No data returned from Statcast — exiting cleanly')
        sys.exit(0)

    print(f'Got {len(df)} pitcher-pitch rows from Statcast')

    # The dataframe has one row per (pitcher, pitch_type) combo
    # Columns include: pitcher_id, name, pitch_type, pitches, pitch_usage, avg_speed, etc.
    rows = []
    for _, r in df.iterrows():
        pitch_type = str(r.get('pitch_type', '')).strip()
        if not pitch_type:
            continue

        pitches = int(r.get('pitches', 0))
        if pitches < 5:
            continue  # skip noise

        pitch_usage = float(r.get('pitch_usage', 0) or 0)
        avg_speed = r.get('avg_speed')
        try:
            avg_speed = float(avg_speed) if avg_speed else None
        except (ValueError, TypeError):
            avg_speed = None

        rows.append({
            'player_id': int(r['pitcher_id']),
            'player_name': str(r.get('name', '')).strip() or None,
            'season': season,
            'pitch_type': pitch_type,
            'pitch_name': PITCH_NAMES.get(pitch_type, pitch_type),
            'count': pitches,
            'percentage': round(pitch_usage, 2),
            'avg_velocity': round(avg_speed, 1) if avg_speed else None,
        })

    print(f'Prepared {len(rows)} rows to upsert')

    # Wipe season's data and re-insert (simpler than upserts on composite keys)
    supabase.table('pitch_arsenals').delete().eq('season', season).execute()
    print(f'Cleared existing {season} rows')

    # Insert in batches of 500
    BATCH = 500
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        supabase.table('pitch_arsenals').insert(batch).execute()
        print(f'  Inserted batch {i//BATCH + 1} ({len(batch)} rows)')

    print(f'✓ Done — {len(rows)} pitch arsenal records updated for {season}')

if __name__ == '__main__':
    main()