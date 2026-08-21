"""
scripts/fetch_batter_hot_zones.py

Fetches Statcast pitch-by-pitch data for every active MLB batter
and aggregates into:
  1. A heatmap (BA/SLG/xwOBA/whiff by zone) -> batter_hot_zones
  2. NEW 2026-08-20: a per-pitch-type zone breakdown -> batter_zone_arsenal
     — the batter-side mirror of pitcher_zone_arsenal (fetch_pitcher_
     hot_zones.py). Answers "how should a pitcher attack this specific
     batter" — e.g. this batter hits sliders fine middle-middle but is
     dead against them low-and-away — which (1) alone can't show, since
     it collapses every pitch type into one blended zone grid.

Stores results in `batter_hot_zones` / `batter_zone_arsenal`.
Three rows per batter per table: 'all', 'vs_lhp', 'vs_rhp'.

2026-08-20: zones 11-14 (Statcast's four out-of-zone "chase" quadrants)
are now stored as their OWN zone keys instead of being collapsed into
their nearest in-zone corner — same fix already applied to
fetch_pitcher_hot_zones.py, same reasoning: the collapse was silently
discarding "does this batter do damage when he chases" as a distinct
signal from "does he do damage on a real corner strike." hot_zone_label/
cold_zone_label stay scoped to the 1-9 core zones only, same as the
pitcher script's go_to/weak zone labels.

Runs once a week via GitHub Actions (hot-zones.yml).

Companion to fetch_pitcher_hot_zones.py — same zone layout, same
per-pitch-type-arsenal pattern, now on both sides.
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

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing env vars. Need either:')
    print('  - SUPABASE_URL + SUPABASE_SERVICE_KEY (CI), OR')
    print('  - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local)')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


CORE_ZONES = list(range(1, 10))
CHASE_ZONES = [11, 12, 13, 14]
ALL_ZONES = CORE_ZONES + CHASE_ZONES

ZONE_LABELS = {
    1: 'high inside',   2: 'high middle',   3: 'high outside',
    4: 'middle inside', 5: 'middle middle', 6: 'middle outside',
    7: 'low inside',    8: 'low middle',    9: 'low outside',
    11: 'chase up/in',  12: 'chase up/away',
    13: 'chase down/in', 14: 'chase down/away',
}

PITCH_NAME = {
    'FF': '4-seam',   'SI': 'Sinker',    'FC': 'Cutter',
    'SL': 'Slider',   'ST': 'Sweeper',   'SV': 'Slurve',
    'CU': 'Curveball','KC': 'Knuckle-curve', 'CS': 'Slow curve',
    'CH': 'Changeup', 'FS': 'Splitter',  'FO': 'Forkball',
    'EP': 'Eephus',   'KN': 'Knuckleball','SC': 'Screwball',
}

MIN_PITCHES_PER_TYPE = 30
MIN_PITCHES_PER_ZONE = 10


def normalize_zone(z):
    try:
        z = int(z)
    except (ValueError, TypeError):
        return None
    if z in ALL_ZONES:
        return z
    return None


AB_EVENTS = {
    'single', 'double', 'triple', 'home_run',
    'strikeout', 'strikeout_double_play',
    'field_out', 'force_out', 'grounded_into_double_play',
    'double_play', 'triple_play', 'fielders_choice',
    'fielders_choice_out', 'other_out',
}
TOTAL_BASES = {'single': 1, 'double': 2, 'triple': 3, 'home_run': 4}


def aggregate_zones(pitches_df):
    zones = {str(z): {
        'pitches': 0, 'swings': 0, 'whiffs': 0,
        'ab': 0, 'hits': 0, 'total_bases': 0,
        'xwoba_sum': 0.0, 'xwoba_count': 0,
    } for z in ALL_ZONES}

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
            if events_str in AB_EVENTS:
                zones[key]['ab'] += 1
                if events_str in TOTAL_BASES:
                    zones[key]['hits'] += 1
                    zones[key]['total_bases'] += TOTAL_BASES[events_str]

        xwoba_val = row.get('estimated_woba_using_speedangle')
        if xwoba_val is not None and pd.notna(xwoba_val):
            try:
                zones[key]['xwoba_sum'] += float(xwoba_val)
                zones[key]['xwoba_count'] += 1
            except (ValueError, TypeError):
                pass

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


def aggregate_batter_zone_arsenal(pitches_df):
    """
    NEW 2026-08-20 — per pitch type, a 13-zone grid mirroring
    aggregate_zones but scoped to that one pitch type. The "how should a
    pitcher attack this batter" table. Returns { pitch_code: {pitch_name,
    total_pitches, ba, slg, xwoba, whiff_pct (overall for this pitch
    type), zones:{...}} }, keeping only pitch types that clear
    MIN_PITCHES_PER_TYPE.
    """
    if pitches_df is None or pitches_df.empty:
        return {}

    by_pitch = {}

    for _, row in pitches_df.iterrows():
        zone = normalize_zone(row.get('zone'))
        if zone is None:
            continue

        ptype = row.get('pitch_type')
        if ptype is None or pd.isna(ptype) or str(ptype).strip() == '':
            continue
        ptype = str(ptype).strip().upper()

        if ptype not in by_pitch:
            by_pitch[ptype] = {
                'pitches': 0, 'swings': 0, 'whiffs': 0,
                'ab': 0, 'hits': 0, 'total_bases': 0,
                'xwoba_sum': 0.0, 'xwoba_count': 0,
                'zones': {str(z): {
                    'pitches': 0, 'swings': 0, 'whiffs': 0,
                    'ab': 0, 'hits': 0, 'total_bases': 0,
                    'xwoba_sum': 0.0, 'xwoba_count': 0,
                } for z in ALL_ZONES},
            }

        bucket = by_pitch[ptype]
        key = str(zone)
        bucket['pitches'] += 1
        bucket['zones'][key]['pitches'] += 1

        desc = str(row.get('description', '')).lower()
        is_swing = desc in {
            'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip',
            'hit_into_play', 'foul_bunt', 'missed_bunt',
        }
        is_whiff = desc in {'swinging_strike', 'swinging_strike_blocked', 'swinging_pitchout'}

        if is_swing:
            bucket['swings'] += 1
            bucket['zones'][key]['swings'] += 1
        if is_whiff:
            bucket['whiffs'] += 1
            bucket['zones'][key]['whiffs'] += 1

        events = row.get('events')
        if events and pd.notna(events):
            events_str = str(events).lower()
            if events_str in AB_EVENTS:
                bucket['ab'] += 1
                bucket['zones'][key]['ab'] += 1
                if events_str in TOTAL_BASES:
                    tb = TOTAL_BASES[events_str]
                    bucket['hits'] += 1
                    bucket['total_bases'] += tb
                    bucket['zones'][key]['hits'] += 1
                    bucket['zones'][key]['total_bases'] += tb

        xwoba_val = row.get('estimated_woba_using_speedangle')
        if xwoba_val is not None and pd.notna(xwoba_val):
            try:
                v = float(xwoba_val)
                bucket['xwoba_sum'] += v
                bucket['xwoba_count'] += 1
                bucket['zones'][key]['xwoba_sum'] += v
                bucket['zones'][key]['xwoba_count'] += 1
            except (ValueError, TypeError):
                pass

    out = {}
    for ptype, b in by_pitch.items():
        if b['pitches'] < MIN_PITCHES_PER_TYPE:
            continue

        zones_out = {}
        for z, d in b['zones'].items():
            zones_out[z] = {
                'ba':        round(d['hits'] / d['ab'], 3) if d['ab'] > 0 else None,
                'slg':       round(d['total_bases'] / d['ab'], 3) if d['ab'] > 0 else None,
                'xwoba':     round(d['xwoba_sum'] / d['xwoba_count'], 3) if d['xwoba_count'] > 0 else None,
                'whiff_pct': round((d['whiffs'] / d['swings']) * 100, 1) if d['swings'] > 0 else None,
                'pitches':   d['pitches'],
                'swings':    d['swings'],
                'whiffs':    d['whiffs'],
                'ab':        d['ab'],
                'low_sample': d['pitches'] < MIN_PITCHES_PER_ZONE,
            }

        out[ptype] = {
            'pitch_name':    PITCH_NAME.get(ptype, ptype),
            'total_pitches': b['pitches'],
            'ba':            round(b['hits'] / b['ab'], 3) if b['ab'] > 0 else None,
            'slg':           round(b['total_bases'] / b['ab'], 3) if b['ab'] > 0 else None,
            'xwoba':         round(b['xwoba_sum'] / b['xwoba_count'], 3) if b['xwoba_count'] > 0 else None,
            'whiff_pct':     round((b['whiffs'] / b['swings']) * 100, 1) if b['swings'] > 0 else None,
            'zones':         zones_out,
        }
    return out


def label_extremes(zones):
    core_keys = {str(z) for z in CORE_ZONES}

    candidates = [
        (int(z), d['ba'])
        for z, d in zones.items()
        if z in core_keys and d.get('ab', 0) >= 10 and d.get('ba') is not None
    ]

    if not candidates:
        return None, None

    candidates.sort(key=lambda x: x[1], reverse=True)
    hot_zone  = ZONE_LABELS.get(candidates[0][0])
    cold_zone = ZONE_LABELS.get(candidates[-1][0])
    return hot_zone, cold_zone


def get_active_batters():
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


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('player_ids', nargs='*', type=int, help='Test mode: only process these player IDs')
    args = parser.parse_args()

    season      = datetime.now().year
    today       = datetime.now().strftime('%Y-%m-%d')
    season_start = f'{season}-03-15'

    print(f'Fetching batter hot zones + zone arsenal for {season} season')
    print(f'Date range: {season_start} to {today}')
    print('13-zone mode: 9 core + 4 chase quadrants (11-14)')

    print('\nFetching active batter list...')
    batters = get_active_batters()

    if args.player_ids:
        wanted = set(args.player_ids)
        batters = [b for b in batters if b['id'] in wanted]
        print(f'TEST MODE: running against {len(batters)} batter(s) only: {[b["name"] for b in batters]}')

    print(f'Found {len(batters)} batters to process')

    success = 0
    skipped = 0
    failed  = 0
    arsenal_saved = 0

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
            arsenal_rows = []

            for split_key, split_df in [
                ('all',    df),
                ('vs_lhp', df[df['p_throws'] == 'L']),
                ('vs_rhp', df[df['p_throws'] == 'R']),
            ]:
                if split_df.empty:
                    continue

                zones, total_pitches = aggregate_zones(split_df)
                hot_zone, cold_zone  = label_extremes(zones)

                pa_events = AB_EVENTS | {'walk', 'hit_by_pitch', 'intent_walk', 'sac_fly', 'sac_bunt'}
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

                arsenal = aggregate_batter_zone_arsenal(split_df)
                if arsenal:
                    arsenal_rows.append({
                        'player_id':     pid,
                        'player_name':   name,
                        'team_id':       team_id,
                        'season':        season,
                        'split':         split_key,
                        'total_pitches': total_pitches,
                        'arsenal':       arsenal,
                        'updated_at':    datetime.utcnow().isoformat(),
                    })

            if arsenal_rows:
                supabase.table('batter_zone_arsenal').upsert(
                    arsenal_rows, on_conflict='player_id,season,split',
                ).execute()
                arsenal_saved += 1

            if rows_to_upsert:
                supabase.table('batter_hot_zones').upsert(
                    rows_to_upsert,
                    on_conflict='player_id,season,split',
                ).execute()
                print(f'  {progress} {name}: ✓ ({len(rows_to_upsert)} splits, arsenal={len(arsenal_rows)})')
                success += 1

            time.sleep(1.5)

        except Exception as e:
            print(f'  {progress} {name}: ✗ {e}')
            failed += 1
            time.sleep(2)

    print(f'\n─── Complete ───')
    print(f'  Success:  {success}')
    print(f'  Arsenal:  {arsenal_saved}')
    print(f'  Skipped:  {skipped} (insufficient data)')
    print(f'  Failed:   {failed}')


if __name__ == '__main__':
    main()