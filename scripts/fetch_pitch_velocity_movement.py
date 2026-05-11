"""
Fetches pitch-by-pitch velocity and movement data for every active MLB pitcher
who has rows in pitch_arsenals. Aggregates per pitch type and updates rows.

Runs after fetch_pitch_arsenals.py (which provides the player_id list).
"""
import os
import sys
import time
from datetime import datetime, timedelta
import pandas as pd
from pybaseball import statcast_pitcher, cache
from supabase import create_client
from dotenv import load_dotenv

# Load .env.local file
load_dotenv('.env.local')

cache.enable()

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def main():
    season = datetime.now().year
    
    # Date range: full season so far
    season_start = f'{season}-03-15'  # Spring training rough start
    season_end = datetime.now().strftime('%Y-%m-%d')
    
    print(f'Fetching velocity/movement for {season} season ({season_start} to {season_end})')
    
    # Step 1: Get all unique player_ids from pitch_arsenals
    print('\nFetching pitcher list from pitch_arsenals...')
    response = supabase.table('pitch_arsenals')\
        .select('player_id, player_name')\
        .eq('season', season)\
        .execute()
    
    if not response.data:
        print('No pitchers found in pitch_arsenals — run fetch_pitch_arsenals.py first')
        sys.exit(1)
    
    # Dedupe player_ids
    pitchers = {}
    for row in response.data:
        pid = row['player_id']
        if pid not in pitchers:
            pitchers[pid] = row.get('player_name', 'Unknown')
    
    pitcher_ids = list(pitchers.keys())
    total = len(pitcher_ids)
    print(f'Found {total} unique pitchers to process')
    
    # Step 2: For each pitcher, fetch raw pitches and aggregate
    success_count = 0
    skip_count = 0
    fail_count = 0
    
    for i, player_id in enumerate(pitcher_ids):
        name = pitchers[player_id]
        progress = f'[{i+1}/{total}]'
        
        try:
            df = statcast_pitcher(season_start, season_end, player_id)
            
            if df is None or df.empty:
                print(f'  {progress} {name}: no data — skip')
                skip_count += 1
                continue
            
            # Filter to valid pitch types
            df = df[df['pitch_type'].notna() & (df['pitch_type'] != '')]
            
            if df.empty:
                skip_count += 1
                continue
            
            # Aggregate by pitch type
            agg = df.groupby('pitch_type').agg(
                avg_velocity=('release_speed', 'mean'),
                avg_h_break=('pfx_x', 'mean'),  # horizontal break (inches)
                avg_v_break=('pfx_z', 'mean'),  # vertical break (inches)
                pitch_count=('release_speed', 'count'),
            ).reset_index()
            
            # Filter to pitches with at least 10 samples (data quality)
            agg = agg[agg['pitch_count'] >= 10]
            
            # Note: pfx_x/pfx_z are in feet — multiply by 12 for inches
            # Also they're from CATCHER's perspective so velocity sign is flipped
            updates = 0
            for _, row in agg.iterrows():
                pitch_type = row['pitch_type']
                avg_velo = round(float(row['avg_velocity']), 1) if pd.notna(row['avg_velocity']) else None
                avg_hb = round(float(row['avg_h_break']) * 12, 1) if pd.notna(row['avg_h_break']) else None
                avg_vb = round(float(row['avg_v_break']) * 12, 1) if pd.notna(row['avg_v_break']) else None
                
                # Update the existing pitch_arsenals row
                update_data = {}
                if avg_velo is not None:
                    update_data['avg_velocity'] = avg_velo
                if avg_hb is not None:
                    update_data['avg_h_break'] = avg_hb
                if avg_vb is not None:
                    update_data['avg_v_break'] = avg_vb
                
                if update_data:
                    supabase.table('pitch_arsenals')\
                        .update(update_data)\
                        .eq('player_id', player_id)\
                        .eq('season', season)\
                        .eq('pitch_type', pitch_type)\
                        .execute()
                    updates += 1
            
            success_count += 1
            print(f'  {progress} {name}: {updates} pitch types updated')
            
            # Be polite to Statcast — 0.5s between requests
            time.sleep(0.5)
            
        except Exception as e:
            print(f'  {progress} {name}: ERROR — {str(e)[:80]}')
            fail_count += 1
            time.sleep(1)  # Longer pause after error
    
    print(f'\n=== DONE ===')
    print(f'  Success: {success_count}')
    print(f'  Skipped: {skip_count}')
    print(f'  Failed:  {fail_count}')

if __name__ == '__main__':
    main()