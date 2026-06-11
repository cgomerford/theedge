"""
scripts/fetch_batter_hot_zones.py

Fetches Statcast pitch-by-pitch data for every active MLB batter
and aggregates into a 3x3 heatmap (9 zones) showing:
  - Where they make contact (BA per zone)
  - Where they slug (SLG per zone)
  - Where they whiff (whiff % per zone)
  - Expected wOBA per zone (xwoba)

Stores results in `batter_hot_zones` table.
Three rows per batter: 'all', 'vs_lhp', 'vs_rhp'.

Runs once a week via GitHub Actions (hot-zones.yml).

Companion to fetch_pitcher_hot_zones.py — same zone layout.
"""
import os
import sys
import time
from datetime import datetime
import pandas as pd
from pybaseball import statcast_batter, cache
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')
cache.enable()

# Support both naming conventions:
#   Local dev .env.local uses Next.js names
#   GitHub Actions secrets use shorter names
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing env vars. Need either:')
    print('  - SUPABASE_URL + SUPABASE_SERVICE_KEY (CI), OR')
    print('  - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local)')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ─── Zone normalization (same as pitcher script) ──────────────────────────────
ZONE_COLLAPSE = {11: 1, 12: 3, 13: 7, 14: 9}

ZONE_LABELS = {
    1: 'high inside',   2: 'high middle',   3: 'high outside',
    4: 'middle inside', 5: 'middle middle', 6: 'middle outside',
    7: 'low inside',    8: 'low middle',    9: 'low outside',
}


def normalize_zone(z):
    try:
        z = int(z)
    except (ValueError, TypeError):
        return None
    if 1 <= z <= 9:
        return z
    if z in ZONE_COLLAPSE:
        return ZONE_COLLAPSE[z]
    return None


def aggregate_zones(pitches_df):
    """
    For batters, aggregate per zone:
      - ba:        batting average (H / AB) in this zone
      - slg:       slugging percentage in this zone
      - xwoba:     mean estimated wOBA (from Statcast) in this zone
      - whiff_pct: whiff rate on swings in this zone
    """
    zones = {str(z): {
        'pitches': 0, 'swings': 0, 'whiffs': 0,
        'ab': 0, 'hits': 0, 'total_bases': 0,
        'xwoba_sum': 0.0, 'xwoba_count': 0,
    } for z in range(1, 10)}

    if pitches_df is None or pitches_df.empty:
        return zones, 0

    total_pitches = 0

    for _, row in pitches_df.iterrows():
        zone = normalize_zone(row.get('zone'))
        if zone is None:
            continue

        key = str(zone)
        zones[key]['pitches'] += 1
        total_pitches += 1

        desc = str(row.get('description', '')).lower()
        is_swing = desc in {
            'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip',
            'hit_into_play', 'foul_bunt', 'missed_bunt',
        }
        is_whiff = desc in {'swinging_strike', 'swinging_strike_blocked', 'swinging_pitchout'}

        if is_swing:
            zones[key]['swings'] += 1
        if is_whiff:
            zones[key]['whiffs'] += 1

        events = row.get('events')
        if events and pd.notna(events):
            events_str = str(events).lower()
            # Count as AB for batting average purposes
            if events_str in {
                'single', 'double', 'triple', 'home_run',
                'strikeout', 'strikeout_double_play',
                'field_out', 'force_out', 'grounded_into_double_play',
                'double_play', 'triple_play', 'fielders_choice',
                'fielders_choice_out', 'other_out',
            }:
                zones[key]['ab'] += 1
                if events_str == 'single':
                    zones[key]['hits'] += 1
                    zones[key]['total_bases'] += 1
                elif events_str == 'double':
                    zones[key]['hits'] += 1
                    zones[key]['total_bases'] += 2
                elif events_str == 'triple':
                    zones[key]['hits'] += 1
                    zones[key]['total_bases'] += 3
                elif events_str == 'home_run':
                    zones[key]['hits'] += 1
                    zones[key]['total_bases'] += 4

        # xwOBA — Statcast column is estimated_woba_using_speedangle
        xwoba_val = row.get('estimated_woba_using_speedangle')
        if xwoba_val is not None and pd.notna(xwoba_val):
            try:
                zones[key]['xwoba_sum'] += float(xwoba_val)
                zones[key]['xwoba_count'] += 1
            except (ValueError, TypeError):
                pass

    # Finalise per-zone rates
    out = {}
    for z, d in zones.items():
        ba    = round(d['hits'] / d['ab'], 3)           if d['ab']     > 0 else None
        slg   = round(d['total_bases'] / d['ab'], 3)    if d['ab']     > 0 else None
        xwoba = round(d['xwoba_sum'] / d['xwoba_count'], 3) if d['xwoba_count'] > 0 else None
        whiff_pct = round((d['whiffs'] / d['swings']) * 100, 1) if d['swings'] > 0 else None

        out[z] = {
            'ba':        ba,
            'slg':       slg,
            'xwoba':     xwoba,
            'whiff_pct': whiff_pct,
            'pitches':   d['pitches'],
            'swings':    d['swings'],
            'whiffs':    d['whiffs'],
            'ab':        d['ab'],
        }
    return out, total_pitches


def label_extremes(zones):
    """
    Returns (hot_zone_label, cold_zone_label).

    hot_zone  = highest BA (min 10 AB) — where the batter rakes
    cold_zone = lowest BA  (min 10 AB) — where pitchers should attack
    """
    candidates = [
        (int(z), d['ba'])
        for z, d in zones.items()
        if d.get('ab', 0) >= 10 and d.get('ba') is not None
    ]

    if not candidates:
        return None, None

    candidates.sort(key=lambda x: x[1], reverse=True)
    hot_zone  = ZONE_LABELS.get(candidates[0][0])
    cold_zone = ZONE_LABELS.get(candidates[-1][0])
    return hot_zone, cold_zone


# ─── Player list ──────────────────────────────────────────────────────────────
def get_active_batters():
    """
    Pull active position players from MLB roster API.
    Returns list of dicts: {id, name, team_id}
    """
    import requests

    MLB_API = 'https://statsapi.mlb.com/api/v1'
    batters = {}

    try:
        res = requests.get(f'{MLB_API}/teams?sportId=1', timeout=10)
        teams = res.json().get('teams', [])
        team_ids = [t['id'] for t in teams if t.get('active')]
    except Exception as e:
        print(f'Failed to fetch team list: {e}')
        sys.exit(1)

    # Position codes that are NOT pitchers
    BATTER_POSITIONS = {'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF', 'IF', 'UTL'}

    for team_id in team_ids:
        try:
            res = requests.get(
                f'{MLB_API}/teams/{team_id}/roster?rosterType=active',
                timeout=10,
            )
            roster = res.json().get('roster', [])
            for p in roster:
                pos = p.get('position', {}).get('abbreviation', '')
                if pos in BATTER_POSITIONS:
                    pid = p['person']['id']
                    if pid not in batters:
                        batters[pid] = {
                            'id': pid,
                            'name': p['person']['fullName'],
                            'team_id': team_id,
                        }
            time.sleep(0.1)
        except Exception as e:
            print(f'  Failed to fetch roster for team {team_id}: {e}')

    return list(batters.values())


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    season      = datetime.now().year
    today       = datetime.now().strftime('%Y-%m-%d')
    season_start = f'{season}-03-15'

    print(f'Fetching batter hot zones for {season} season')
    print(f'Date range: {season_start} to {today}')

    print('\nFetching active batter list...')
    batters = get_active_batters()
    print(f'Found {len(batters)} batters to process')

    success = 0
    skipped = 0
    failed  = 0

    for i, b in enumerate(batters):
        progress = f'[{i+1}/{len(batters)}]'
        pid     = b['id']
        name    = b['name']
        team_id = b.get('team_id')

        try:
            df = statcast_batter(season_start, today, player_id=pid)

            if df is None or df.empty or len(df) < 50:
                print(f'  {progress} {name}: skipped (insufficient data, {len(df) if df is not None else 0} pitches)')
                skipped += 1
                continue

            rows_to_upsert = []

            for split_key, split_df in [
                ('all',    df),
                ('vs_lhp', df[df['p_throws'] == 'L']),
                ('vs_rhp', df[df['p_throws'] == 'R']),
            ]:
                if split_df.empty:
                    continue

                zones, total_pitches = aggregate_zones(split_df)
                hot_zone, cold_zone  = label_extremes(zones)

                # Count plate appearances for this split
                pa_events = {
                    'single', 'double', 'triple', 'home_run',
                    'walk', 'hit_by_pitch', 'intent_walk',
                    'strikeout', 'strikeout_double_play',
                    'field_out', 'force_out', 'grounded_into_double_play',
                    'double_play', 'triple_play', 'fielders_choice',
                    'fielders_choice_out', 'sac_fly', 'sac_bunt', 'other_out',
                }
                total_pa = int(
                    split_df['events'].apply(
                        lambda e: str(e).lower() in pa_events if pd.notna(e) else False
                    ).sum()
                )

                rows_to_upsert.append({
                    'player_id':       pid,
                    'player_name':     name,
                    'team_id':         team_id,
                    'season':          season,
                    'split':           split_key,
                    'total_pitches':   total_pitches,
                    'total_pa':        total_pa,
                    'zones':           zones,
                    'hot_zone_label':  hot_zone,
                    'cold_zone_label': cold_zone,
                    'updated_at':      datetime.utcnow().isoformat(),
                })

            if rows_to_upsert:
                supabase.table('batter_hot_zones').upsert(
                    rows_to_upsert,
                    on_conflict='player_id,season,split',
                ).execute()
                print(f'  {progress} {name}: ✓ ({len(rows_to_upsert)} splits)')
                success += 1

            # Space out Statcast requests to avoid rate limiting
            time.sleep(1.5)

        except Exception as e:
            print(f'  {progress} {name}: ✗ {e}')
            failed += 1
            time.sleep(2)

    print(f'\n─── Complete ───')
    print(f'  Success: {success}')
    print(f'  Skipped: {skipped} (insufficient data)')
    print(f'  Failed:  {failed}')


if __name__ == '__main__':
    main()
