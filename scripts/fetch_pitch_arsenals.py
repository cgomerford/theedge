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

    df = statcast_pitcher_arsenal_stats(year=season, minPA=5)

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
    whiff_col = first_col('whiff_percent', 'whiff_pct')
    k_col = first_col('k_percent', 'k_pct')
    ba_col = first_col('ba', 'opponent_ba', 'avg_against')
    xwoba_col = first_col('est_woba', 'xwoba', 'expected_woba')
    hardhit_col = first_col('hard_hit_percent', 'hard_hit_pct')

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

        # Handle pitch_usage NaN
        try:
            pitch_usage = float(r.get(usage_col, 0) or 0) if usage_col else 0
            if pd.isna(pitch_usage):
                pitch_usage = 0
        except (ValueError, TypeError):
            pitch_usage = 0

        # Handle avg_speed NaN
        avg_speed = r.get(speed_col) if speed_col else None
        try:
            avg_speed = float(avg_speed) if avg_speed not in (None, '') else None
            if avg_speed is not None and pd.isna(avg_speed):
                avg_speed = None
        except (ValueError, TypeError):
            avg_speed = None

        try:
            player_id_int = int(r[pid_col])
        except (ValueError, TypeError):
            continue

        def safe_pct(col):
            if not col:
                return None
            v = r.get(col)
            try:
                f = float(v) if v not in (None, '') else None
                if f is None or pd.isna(f):
                    return None
                return round(f, 2)
            except (ValueError, TypeError):
                return None

        def safe_avg(col):
            if not col:
                return None
            v = r.get(col)
            try:
                f = float(v) if v not in (None, '') else None
                if f is None or pd.isna(f):
                    return None
                return round(f, 3)
            except (ValueError, TypeError):
                return None

        rows.append({
            'player_id': player_id_int,
            'player_name': format_name(r.get(name_col)) if name_col else None,
            'season': season,
            'pitch_type': pitch_type,
            'pitch_name': PITCH_NAMES.get(pitch_type, pitch_type),
            'count': pitches,
            'percentage': round(pitch_usage, 2),
            'avg_velocity': round(avg_speed, 1) if avg_speed else None,
            'whiff_percent': safe_pct(whiff_col),
            'k_percent': safe_pct(k_col),
            'ba_against': safe_avg(ba_col),
            'est_woba': safe_avg(xwoba_col),
            'hard_hit_percent': safe_pct(hardhit_col),
        })
  
        print(f'Prepared {len(rows)} rows to upsert')

    if not rows:
        print('No rows to upsert — exiting cleanly')
        return

    # Upsert preserves columns we don't write (avg_velocity, avg_h_break, avg_v_break)
    # These come from fetch_pitch_velocity_movement.py running later in the workflow
    BATCH = 500
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        supabase.table('pitch_arsenals')\
            .upsert(batch, on_conflict='player_id,season,pitch_type')\
            .execute()
        print(f'  Upserted batch {i//BATCH + 1} ({len(batch)} rows)')

    # Optional: clean up rows for pitchers no longer in current arsenal
    # (e.g. retired, traded to minors, hasn't pitched enough)
    current_keys = {(r['player_id'], r['pitch_type']) for r in rows}
    response = supabase.table('pitch_arsenals')\
        .select('id, player_id, pitch_type')\
        .eq('season', season)\
        .execute()
    
    stale_ids = [
        row['id'] for row in (response.data or [])
        if (row['player_id'], row['pitch_type']) not in current_keys
    ]
    
    if stale_ids:
        # Delete in batches to avoid URL length limits
        for i in range(0, len(stale_ids), 100):
            chunk = stale_ids[i:i+100]
            supabase.table('pitch_arsenals').delete().in_('id', chunk).execute()
        print(f'  Cleaned up {len(stale_ids)} stale rows (pitchers no longer active)')

    print(f'✓ Done — {len(rows)} pitch arsenal records updated for {season}')

if __name__ == '__main__':
    main()