"""
Fetches pitch arsenal data AND pitch movement physics for every active MLB starter.
Writes a complete profile to Supabase.
"""
import os
import sys
from datetime import datetime
import pandas as pd
from pybaseball import statcast_pitcher_arsenal_stats, cache
from pybaseball.statcast_pitcher import statcast_pitcher_pitch_movement
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')
cache.enable()

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').strip()
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def format_name(raw):
    if not raw: return None
    s = str(raw).strip()
    if ',' in s:
        last, first = s.split(',', 1)
        return f'{first.strip()} {last.strip()}'
    return s

PITCH_NAMES = {
    'FF': '4-Seam Fastball', 'SI': 'Sinker', 'FC': 'Cutter', 'SL': 'Slider',
    'ST': 'Sweeper', 'SV': 'Slurve', 'CU': 'Curveball', 'KC': 'Knuckle Curve',
    'CH': 'Changeup', 'FS': 'Splitter', 'FO': 'Forkball', 'SC': 'Screwball',
    'KN': 'Knuckleball', 'EP': 'Eephus',
}

REVERSE_NAMES = {v.upper(): k for k, v in PITCH_NAMES.items()}

def main():
    season = datetime.now().year
    print(f'Fetching data for {season}...')

    # 1. Fetch Arsenal Stats (minPA=0 gets everyone)
    df_arsenal = statcast_pitcher_arsenal_stats(year=season, minPA=0)
    
    if df_arsenal is None or df_arsenal.empty:
        print('No arsenal data returned from Statcast — exiting')
        sys.exit(0)

    # 2. Fetch Movement Stats (Bypass Savant's 1-pitch limit by looping!)
    print("Downloading physics for ALL pitch types...")
    movement_dfs = []
    savant_pitch_codes = ['FF', 'SI', 'FC', 'SL', 'CH', 'CU', 'FS', 'KC', 'ST', 'SV']
    
    for pt in savant_pitch_codes:
        try:
            df_pt = statcast_pitcher_pitch_movement(year=season, minP=0, pitch_type=pt)
            if df_pt is not None and not df_pt.empty:
                movement_dfs.append(df_pt)
        except Exception:
            pass

    if not movement_dfs:
        print(f"Movement data for {season} empty, trying {season - 1}...")
        for pt in savant_pitch_codes:
            try:
                df_pt = statcast_pitcher_pitch_movement(year=season-1, minP=0, pitch_type=pt)
                if df_pt is not None and not df_pt.empty:
                    movement_dfs.append(df_pt)
            except Exception:
                pass

    if movement_dfs:
        df_movement = pd.concat(movement_dfs, ignore_index=True)
    else:
        df_movement = pd.DataFrame()

    # --- BULLETPROOF MOVEMENT PARSING ---
    movement_dict = {}
    if not df_movement.empty:
        def get_col(df, options):
            for opt in options:
                if opt in df.columns: return opt
            return None

        v_col = get_col(df_movement, ['pitcher_break_z', 'pitch_movement_cxz', 'pitch_movement_xz'])
        h_col = get_col(df_movement, ['pitcher_break_x', 'pitch_movement_cxw', 'pitch_movement_xw'])
        
        print(f"👉 Found Movement Columns: Vertical = '{v_col}', Horizontal = '{h_col}'")

        match_count = 0
        for _, r in df_movement.iterrows():
            try:
                pid_val = r.get('pitcher_id') or r.get('player_id')
                if pd.isna(pid_val): continue
                pid = int(pid_val)
                
                pt_raw = str(r.get('pitch_type', r.get('pitch_type_name', ''))).strip().upper()
                pt = REVERSE_NAMES.get(pt_raw, pt_raw) 
                
                v_val = r.get(v_col) if v_col else None
                h_val = r.get(h_col) if h_col else None
                
                if v_val is not None and pd.notna(v_val):
                    movement_dict[(pid, pt)] = {
                        'v_break': float(v_val),
                        'h_break': float(h_val) if h_val is not None and pd.notna(h_val) else 0.0
                    }
                    match_count += 1
            except Exception:
                continue
        print(f"👉 Successfully loaded {match_count} pitch movement profiles into memory.")
    else:
        print("❌ CRITICAL: Could not find any movement data from Statcast.")

    # --- ARSENAL PARSING & MERGING ---
    def first_col(*names):
        for n in names:
            if n in df_arsenal.columns: return n
        return None

    pid_col = first_col('pitcher_id', 'player_id', 'pitcher')
    name_col = first_col('last_name, first_name', 'name', 'player_name')
    ptype_col = first_col('pitch_type', 'pitchType', 'pitch')
    usage_col = first_col('pitch_usage', 'pitch_pct', 'pct')
    speed_col = first_col('avg_speed', 'velocity', 'release_speed')
    whiff_col = first_col('whiff_percent', 'whiff_pct')
    hard_hit_col = first_col('hard_hit_percent', 'hard_hit_pct')
    est_woba_col = first_col('est_woba', 'xwoba')
    put_away_col = first_col('put_away', 'put_away_percent')
    ba_against_col = first_col('ba', 'batting_avg')
    rows = []
    successful_merges = 0

    for _, r in df_arsenal.iterrows():
        pitch_type = str(r.get(ptype_col, '')).strip().upper()
        if not pitch_type: continue

        try:
            player_id_int = int(r[pid_col])
        except (ValueError, TypeError): continue

        pitch_usage = float(r.get(usage_col, 0)) if pd.notna(r.get(usage_col)) else 0
        avg_speed = float(r.get(speed_col)) if pd.notna(r.get(speed_col)) else None

        move_data = movement_dict.get((player_id_int, pitch_type), {})
        avg_v_break = move_data.get('v_break')
        avg_h_break = move_data.get('h_break')
        
        if avg_v_break is not None:
            successful_merges += 1

        # FIX: Conditionally build the dictionary so we don't push None values
        row_data = {
            'player_id': player_id_int,
            'player_name': format_name(r.get(name_col)) if name_col else None,
            'season': season,
            'pitch_type': pitch_type,
            'pitch_name': PITCH_NAMES.get(pitch_type, pitch_type),
            'count': int(r.get('pitches', 0) or 0),
            'percentage': round(pitch_usage, 2),
        }

        if avg_speed:
            row_data['avg_velocity'] = round(avg_speed, 1)
        if avg_v_break is not None:
            row_data['avg_v_break'] = round(avg_v_break, 1)
        if avg_h_break is not None:
            row_data['avg_h_break'] = round(avg_h_break, 1)

        # New V4 columns
        whiff_val = r.get(whiff_col) if whiff_col else None
        if whiff_val is not None and pd.notna(whiff_val):
            row_data['whiff_percent'] = round(float(whiff_val), 1)

        hard_hit_val = r.get(hard_hit_col) if hard_hit_col else None
        if hard_hit_val is not None and pd.notna(hard_hit_val):
            row_data['hard_hit_percent'] = round(float(hard_hit_val), 1)

        est_woba_val = r.get(est_woba_col) if est_woba_col else None
        if est_woba_val is not None and pd.notna(est_woba_val):
            row_data['est_woba'] = round(float(est_woba_val), 3)

        put_away_val = r.get(put_away_col) if put_away_col else None
        if put_away_val is not None and pd.notna(put_away_val):
            row_data['put_away_percent'] = round(float(put_away_val), 1)

        ba_against_val = r.get(ba_against_col) if ba_against_col else None
        if ba_against_val is not None and pd.notna(ba_against_val):
            row_data['ba_against'] = round(float(ba_against_val), 3)

        rows.append(row_data)
  
    print(f'👉 Merged movement physics for {successful_merges} out of {len(rows)} total pitches.')

    if not rows:
        print('No rows to upsert — exiting cleanly')
        return

    BATCH = 500
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        supabase.table('pitch_arsenals').upsert(batch, on_conflict='player_id,season,pitch_type').execute()
    
    print(f'✓ DONE! Uploaded to Supabase.')

if __name__ == '__main__':
    main()