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
def format_name(raw):
    """Convert 'Pérez, Eury' to 'Eury Pérez'"""
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if ',' in s:
        last, first = s.split(',', 1)
        return f'{first.strip()} {last.strip()}'
    return s
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

    df = statcast_pitcher_arsenal_stats(year=season, minPA=50)

    if df is None or df.empty:
        print('No data returned from Statcast — exiting cleanly')
        sys.exit(0)

    print(f'Got {len(df)} pitcher-pitch rows from Statcast')
    print(f'DataFrame columns: {list(df.columns)}')

    # Helper to find the right column name (pybaseball varies by version)
    def first_col(*names):
        for n in names:
            if n in df.columns:
                return n
        return None

    pid_col = first_col('pitcher_id', 'player_id', 'pitcher', 'mlbam_id')
    name_col = first_col('last_name, first_name', 'name', 'player_name', 'first_last_name', 'last_first_name')
    ptype_col = first_col('pitch_type', 'pitchType', 'pitch')
    pitches_col = first_col('pitches', 'n', 'count')
    usage_col = first_col('pitch_usage', 'pitch_pct', 'pct', 'percentage')
    speed_col = first_col('avg_speed', 'velocity', 'release_speed')

    if not pid_col or not ptype_col:
        print(f'ERROR: Required columns not found. Available: {list(df.columns)}')
        sys.exit(1)
# Print first row sample so we can debug values
    if not df.empty:
        first_row = df.iloc[0].to_dict()
        print(f'Sample row: {first_row}')
    print(f'Using columns: id={pid_col}, name={name_col}, type={ptype_col}, count={pitches_col}, usage={usage_col}, speed={speed_col}')

    rows = []
    for _, r in df.iterrows():
        pitch_type = str(r.get(ptype_col, '')).strip()
        if not pitch_type:
            continue

        pitches = int(r.get(pitches_col, 0) or 0) if pitches_col else 0
        if pitches < 1:
            continue  # only filter rows with literally zero

        pitch_usage = float(r.get(usage_col, 0) or 0) if usage_col else 0
        avg_speed = r.get(speed_col) if speed_col else None
        try:
            avg_speed = float(avg_speed) if avg_speed not in (None, '') else None
        except (ValueError, TypeError):
            avg_speed = None

        try:
            player_id_int = int(r[pid_col])
        except (ValueError, TypeError):
            continue

        rows.append({
            'player_id': player_id_int,
            'player_name': format_name(r.get(name_col)) if name_col else None,
            'season': season,
            'pitch_type': pitch_type,
            'pitch_name': PITCH_NAMES.get(pitch_type, pitch_type),
            'count': pitches,
            'percentage': round(pitch_usage, 2),
            'avg_velocity': round(avg_speed, 1) if avg_speed else None,
        })

    print(f'Prepared {len(rows)} rows to upsert')

    if not rows:
        print('No rows to insert — exiting cleanly')
        return

    # Wipe season's data and re-insert
    supabase.table('pitch_arsenals').delete().eq('season', season).execute()
    print(f'Cleared existing {season} rows')

    BATCH = 500
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        supabase.table('pitch_arsenals').insert(batch).execute()
        print(f'  Inserted batch {i//BATCH + 1} ({len(batch)} rows)')

    print(f'✓ Done — {len(rows)} pitch arsenal records updated for {season}')

if __name__ == '__main__':
    main()