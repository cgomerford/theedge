"""
scripts/fetch_pitcher_hot_zones.py

Fetches Statcast pitch-by-pitch data for every active MLB pitcher
and aggregates into a 3x3 heatmap (9 zones) showing:
  - Where they live (usage % per zone)
  - Where they get hit (BA against per zone)
  - Where they get whiffs (whiff % per zone)

Stores results in `pitcher_hot_zones` table.
Three rows per pitcher: 'all', 'vs_lhb', 'vs_rhb'.

Runs once a week via GitHub Actions.

Companion to fetch_batter_hot_zones.py — same zone layout.
"""
import os
import sys
import time
from datetime import datetime
import pandas as pd
from pybaseball import statcast_pitcher, cache
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')
cache.enable()

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ─── Zone normalization (same as batter script) ──────────────────────────────
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
    For pitchers, aggregate per zone:
      - usage_pct: % of all pitches thrown in this zone
      - ba_against: batting average on balls put in play from this zone
      - whiff_pct: whiff rate on swings in this zone
    """
    zones = {str(z): {
        'pitches': 0, 'swings': 0, 'whiffs': 0,
        'ab': 0, 'hits': 0,
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
            zones[key]['ab'] += 1
            if events_str in {'single', 'double', 'triple', 'home_run'}:
                zones[key]['hits'] += 1

    # Finalize per-zone rates
    out = {}
    for z, d in zones.items():
        usage_pct  = round((d['pitches'] / total_pitches) * 100, 1) if total_pitches > 0 else 0
        ba_against = round(d['hits'] / d['ab'], 3) if d['ab']     > 0 else None
        whiff_pct  = round((d['whiffs'] / d['swings']) * 100, 1) if d['swings'] > 0 else None
        out[z] = {
            'usage_pct':  usage_pct,
            'ba_against': ba_against,
            'whiff_pct':  whiff_pct,
            'pitches':    d['pitches'],
            'swings':     d['swings'],
            'whiffs':     d['whiffs'],
            'ab':         d['ab'],
        }
    return out, total_pitches


def label_extremes(zones):
    """
    Returns (go_to_zone_label, weak_zone_label).

    go_to_zone = highest usage_pct (where the pitcher lives)
    weak_zone  = highest ba_against (where they get hit hardest, min 15 ABs)
    """
    # Go-to zone (usage)
    usage_candidates = [
        (int(z), d['usage_pct'])
        for z, d in zones.items()
        if d['pitches'] >= 30
    ]
    usage_candidates.sort(key=lambda x: x[1], reverse=True)
    go_to_zone = ZONE_LABELS.get(usage_candidates[0][0]) if usage_candidates else None

    # Weak zone (BA against)
    weak_candidates = [
        (int(z), d['ba_against'])
        for z, d in zones.items()
        if d.get('ab', 0) >= 15 and d.get('ba_against') is not None
    ]
    weak_candidates.sort(key=lambda x: x[1], reverse=True)
    weak_zone = ZONE_LABELS.get(weak_candidates[0][0]) if weak_candidates else None

    return go_to_zone, weak_zone


# ─── Player list ──────────────────────────────────────────────────────────────
def get_active_pitchers():
    """
    Pull active pitchers we already have arsenal data for.
    Falls back to MLB roster API if pitch_arsenals is empty.
    """
    season = datetime.now().year

    # Try pitch_arsenals first — these are pitchers we know throw enough to matter
    response = supabase.table('pitch_arsenals')\
        .select('player_id, player_name')\
        .eq('season', season)\
        .execute()

    if response.data:
        seen = {}
        for row in response.data:
            pid = row['player_id']
            if pid not in seen:
                seen[pid] = {
                    'id': pid,
                    'name': row.get('player_name', 'Unknown'),
                    'team_id': None,  # we don't track team in pitch_arsenals
                }
        return list(seen.values())

    # Fallback to roster API
    print('No pitch_arsenals data — falling back to roster API')
    import requests
    teams_url = f'https://statsapi.mlb.com/api/v1/teams?sportId=1&season={season}'
    r = requests.get(teams_url, timeout=10)
    teams = r.json().get('teams', [])

    pitchers = {}
    for team in teams:
        team_id = team['id']
        roster_url = f'https://statsapi.mlb.com/api/v1/teams/{team_id}/roster?rosterType=Active'
        try:
            rr = requests.get(roster_url, timeout=10)
            for p in rr.json().get('roster', []):
                pos = p.get('position', {}).get('abbreviation', '')
                if pos != 'P':
                    continue
                pid = p['person']['id']
                if pid not in pitchers:
                    pitchers[pid] = {
                        'id':     pid,
                        'name':   p['person']['fullName'],
                        'team_id': team_id,
                    }
            time.sleep(0.1)
        except Exception as e:
            print(f'  Failed to fetch roster for team {team_id}: {e}')
    return list(pitchers.values())


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    season = datetime.now().year
    today = datetime.now().strftime('%Y-%m-%d')
    season_start = f'{season}-03-15'

    print(f'Fetching pitcher hot zones for {season} season')
    print(f'Date range: {season_start} to {today}')

    print('\nFetching active pitcher list...')
    pitchers = get_active_pitchers()
    print(f'Found {len(pitchers)} pitchers to process')

    success = 0
    skipped = 0
    failed  = 0

    for i, p in enumerate(pitchers):
        progress = f'[{i+1}/{len(pitchers)}]'
        pid  = p['id']
        name = p['name']
        team_id = p.get('team_id')

        try:
            df = statcast_pitcher(season_start, today, player_id=pid)

            if df is None or df.empty or len(df) < 50:
                print(f'  {progress} {name}: skipped (insufficient data, {len(df) if df is not None else 0} pitches)')
                skipped += 1
                continue

            rows_to_upsert = []
            for split_key, split_filter in [
                ('all',    df),
                ('vs_lhb', df[df['stand'] == 'L']),
                ('vs_rhb', df[df['stand'] == 'R']),
            ]:
                zones, total_pitches = aggregate_zones(split_filter)
                if total_pitches < 30:
                    continue
                go_to_label, weak_label = label_extremes(zones)
                rows_to_upsert.append({
                    'player_id':         pid,
                    'player_name':       name,
                    'team_id':           team_id,
                    'season':            season,
                    'split':             split_key,
                    'total_pitches':     total_pitches,
                    'zones':             zones,
                    'go_to_zone_label':  go_to_label,
                    'weak_zone_label':   weak_label,
                    'updated_at':        datetime.utcnow().isoformat(),
                })

            if rows_to_upsert:
                supabase.table('pitcher_hot_zones').upsert(
                    rows_to_upsert,
                    on_conflict='player_id,season,split',
                ).execute()
                success += 1
                print(f'  {progress} {name}: {len(rows_to_upsert)} splits saved')
            else:
                skipped += 1
                print(f'  {progress} {name}: skipped (no valid splits)')

            time.sleep(0.6)

        except Exception as e:
            print(f'  {progress} {name}: ERROR — {str(e)[:120]}')
            failed += 1
            time.sleep(1.5)

    print(f'\n=== DONE ===')
    print(f'  Success: {success}')
    print(f'  Skipped: {skipped}')
    print(f'  Failed:  {failed}')


if __name__ == '__main__':
    main()