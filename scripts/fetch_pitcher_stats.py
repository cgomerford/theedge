"""
Fetches aggregate season stats (including ERA, K/9, BB/9) for pitchers.
Bypasses scrapers by using the official MLB Stats API directly.
Calculates FIP accurately using the live season FIP constant.
Updates the pitcher_stats table in Supabase.
"""
import os
import sys
from datetime import datetime
import requests
from supabase import create_client
from dotenv import load_dotenv

# Load .env.local file
load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def convert_ip(ip_str):
    """Converts MLB innings pitched string (e.g. '5.1') to a decimal (5.333)"""
    if not ip_str: return 0.0
    try:
        ip_val = float(ip_str)
        whole = int(ip_val)
        frac = round(ip_val - whole, 1)
        if frac == 0.1: return whole + 1/3.0
        if frac == 0.2: return whole + 2/3.0
        return float(whole)
    except ValueError:
        return 0.0

def safe_float(val):
    try:
        return float(val)
    except (ValueError, TypeError):
        return None

def main():
    season = datetime.now().year
    print(f'Fetching aggregate pitching stats for {season} season from MLB Stats API...')
    
    url = "https://statsapi.mlb.com/api/v1/stats"
    params = {
        "stats": "season",
        "group": "pitching",
        "playerPool": "ALL",
        "season": season,
        "sportId": 1,        
        "gameType": "R",
        "limit": 10000       # <-- NEW: Overrides the default 50-player limit
    }
    
    response = requests.get(url, params=params)
    
    if response.status_code != 200:
        print(f"Error fetching stats from MLB API: {response.status_code}")
        print(f"Response: {response.text}")
        sys.exit(1)
        
    data = response.json()
    if 'stats' not in data or not data['stats']:
        print("No stats returned.")
        sys.exit(0)
        
    splits = data['stats'][0].get('splits', [])
    if not splits:
        print("No splits returned.")
        sys.exit(0)

    # --- Step 1: Calculate League FIP Constant ---
    lg_hr = lg_bb = lg_hbp = lg_k = lg_er = 0
    lg_ip = 0.0
    
    for row in splits:
        stat = row.get('stat', {})
        lg_hr += stat.get('homeRuns', 0)
        lg_bb += stat.get('baseOnBalls', 0)
        lg_hbp += stat.get('hitBatsmen', stat.get('hitByPitch', 0))
        lg_k += stat.get('strikeOuts', 0)
        lg_er += stat.get('earnedRuns', 0)
        lg_ip += convert_ip(stat.get('inningsPitched', '0'))

    if lg_ip > 0:
        lg_era = (lg_er / lg_ip) * 9
        fip_constant = lg_era - (((13 * lg_hr) + (3 * (lg_bb + lg_hbp)) - (2 * lg_k)) / lg_ip)
    else:
        fip_constant = 3.15
        
    print(f"Calculated {season} League FIP Constant: {round(fip_constant, 3)}")

    # --- Step 2: Calculate FIP & Parse Player Stats ---
    rows_to_upsert = []
    
    for row in splits:
        try:
            player_id = int(row['player']['id'])
            player_name = row['player'].get('fullName') # Safely get the name string
            stat = row['stat']
            
            ip_dec = convert_ip(stat.get('inningsPitched', '0'))
            hr = stat.get('homeRuns', 0)
            bb = stat.get('baseOnBalls', 0)
            hbp = stat.get('hitBatsmen', stat.get('hitByPitch', 0))
            k = stat.get('strikeOuts', 0)
            
            fip = None
            if ip_dec > 0:
                fip = round((((13 * hr) + (3 * (bb + hbp)) - (2 * k)) / ip_dec) + fip_constant, 2)
                
            rows_to_upsert.append({
                'player_id': player_id,
                'player_name': player_name, # Added to fulfill database NOT NULL constraint
                'season': season,
                'fip': fip,
                'era': safe_float(stat.get('era')),
                'k_per_9': safe_float(stat.get('strikeoutsPer9Inn')),
                'bb_per_9': safe_float(stat.get('walksPer9Inn'))
            })
        except Exception:
            continue

    if not rows_to_upsert:
        print('No rows to upsert.')
        return

    # Upsert in batches to Supabase
    BATCH = 500
    print(f'Pushing {len(rows_to_upsert)} pitcher profiles to pitcher_stats...')
    
    for i in range(0, len(rows_to_upsert), BATCH):
        batch = rows_to_upsert[i:i+BATCH]
        supabase.table('pitcher_stats').upsert(
            batch, 
            on_conflict='player_id,season'
        ).execute()
        
    print('=== DONE ===')

if __name__ == '__main__':
    main()