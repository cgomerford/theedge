"""
scripts/fetch_pitcher_full_profile.py

Single consolidated pitcher-data pull, replacing:
  - fetch_pitch_arsenals.py
  - fetch_pitch_velocity_movement.py
  - fetch_pitcher_tto_splits.py

Why consolidate: those three scripts each called pybaseball separately,
meaning pitch_arsenals and pitcher_stats could be built from data pulled
at different times, with different date windows, and drift out of sync
with each other — likely why the pitching page's numbers were unreliable.
This script pulls ONE raw pitch-by-pitch dataset per pitcher (full season)
and computes usage/velo/movement/whiff for pitch_arsenals AND
TTO/two-strike/first-pitch for pitcher_stats from that same dataset.

Deliberately NOT computing hard_hit%/est_woba/put_away%/run_value here —
those are pulled live, per-page-load, from Savant's pitch-arsenal-stats
CSV endpoint (confirmed accurate 2026-07-13, see /api/pitcher-arsenal).
Duplicating that computation in Python risks reintroducing the exact
accuracy drift this consolidation is meant to fix. Division of labor:
this script owns what can ONLY come from a season-long cron (TTO,
movement physics), the live endpoint owns outcome stats that benefit
from being always-current.
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
load_dotenv('../.env.local')
cache.enable()

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

PITCH_NAMES = {
    'FF': '4-Seam Fastball', 'SI': 'Sinker', 'FC': 'Cutter', 'SL': 'Slider',
    'ST': 'Sweeper', 'SV': 'Slurve', 'CU': 'Curveball', 'KC': 'Knuckle Curve',
    'CH': 'Changeup', 'FS': 'Splitter', 'FO': 'Forkball', 'SC': 'Screwball',
    'KN': 'Knuckleball', 'EP': 'Eephus',
}

SWING_DESCS = {'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'missed_bunt', 'foul_bunt'}
WHIFF_DESCS = {'swinging_strike', 'swinging_strike_blocked', 'missed_bunt'}
PA_EVENTS = {
    'single', 'double', 'triple', 'home_run', 'walk', 'intent_walk', 'hit_by_pitch',
    'strikeout', 'strikeout_double_play', 'field_out', 'force_out',
    'grounded_into_double_play', 'double_play', 'triple_play',
    'fielders_choice', 'fielders_choice_out', 'sac_fly', 'sac_bunt', 'other_out',
}


def compute_arsenal(df: pd.DataFrame) -> 'list[dict]':
    """Usage%, avg velo, avg movement, whiff% per pitch type — for pitch_arsenals."""
    rows = []
    df = df[df['pitch_type'].notna() & (df['pitch_type'] != '')]
    total = len(df)
    if total == 0:
        return rows

    swings = df[df['description'].isin(SWING_DESCS)]
    whiffs = df[df['description'].isin(WHIFF_DESCS)]
    swing_counts = swings.groupby('pitch_type').size()
    whiff_counts = whiffs.groupby('pitch_type').size()

    for pitch_type, group in df.groupby('pitch_type'):
        count = len(group)
        pct = round((count / total) * 100, 1)
        avg_velo = group['release_speed'].mean()
        avg_h = group['pfx_x'].mean()
        avg_v = group['pfx_z'].mean()
        n_swings = swing_counts.get(pitch_type, 0)
        n_whiffs = whiff_counts.get(pitch_type, 0)
        whiff_rate = round((n_whiffs / n_swings) * 100, 1) if n_swings > 0 else None

        rows.append({
            'pitch_type': pitch_type,
            'pitch_name': PITCH_NAMES.get(pitch_type, pitch_type),
            'count': count,
            'percentage': pct,
            'avg_velocity': round(float(avg_velo), 1) if pd.notna(avg_velo) else None,
            'avg_h_break': round(float(avg_h) * 12, 1) if pd.notna(avg_h) else None,
            'avg_v_break': round(float(avg_v) * 12, 1) if pd.notna(avg_v) else None,
            'whiff_rate': whiff_rate,
        })
    return rows


def compute_tto(df: pd.DataFrame) -> 'dict | None':
    """xwOBA/K%/BB% per times-through-the-order bucket — for pitcher_stats."""
    needed = {'game_pk', 'batter', 'at_bat_number', 'events'}
    if not needed.issubset(df.columns):
        return None

    buckets = {1: {'xwoba_sum': 0.0, 'xwoba_n': 0, 'pa': 0, 'k': 0, 'bb': 0},
               2: {'xwoba_sum': 0.0, 'xwoba_n': 0, 'pa': 0, 'k': 0, 'bb': 0},
               3: {'xwoba_sum': 0.0, 'xwoba_n': 0, 'pa': 0, 'k': 0, 'bb': 0}}

    for game_pk, game_df in df.groupby('game_pk'):
        batter_seen = {}
        ab_df = game_df.sort_values('at_bat_number').drop_duplicates('at_bat_number', keep='last')
        for _, row in ab_df.iterrows():
            events = str(row.get('events', '')).lower()
            if events not in PA_EVENTS:
                continue
            batter = row.get('batter')
            if pd.isna(batter):
                continue
            batter = int(batter)
            count = batter_seen.get(batter, 0) + 1
            batter_seen[batter] = count
            bucket = min(count, 3)
            buckets[bucket]['pa'] += 1
            if events in {'strikeout', 'strikeout_double_play'}:
                buckets[bucket]['k'] += 1
            if events in {'walk', 'intent_walk'}:
                buckets[bucket]['bb'] += 1
            if 'estimated_woba_using_speedangle' in df.columns:
                xw = row.get('estimated_woba_using_speedangle')
                if pd.notna(xw):
                    buckets[bucket]['xwoba_sum'] += float(xw)
                    buckets[bucket]['xwoba_n'] += 1

    result = {}
    for t, d in buckets.items():
        if d['pa'] < 10:
            result[t] = None
            continue
        result[t] = {
            'pa': d['pa'],
            'xwoba': round(d['xwoba_sum'] / d['xwoba_n'], 3) if d['xwoba_n'] > 0 else None,
        }
    return result

def compute_two_strike_mix(df: pd.DataFrame) -> 'dict | None':
    df = df[df['pitch_type'].notna() & (df['pitch_type'] != '')]
    total_all = len(df)
    if total_all == 0:
        return None
    all_counts = df['pitch_type'].value_counts()
    two_k_df = df[df['strikes'] == 2]
    if len(two_k_df) < 50:
        return None
    two_k_counts = two_k_df['pitch_type'].value_counts()

    result = {}
    for pt in all_counts.index:
        all_pct = round((all_counts.get(pt, 0) / total_all) * 100, 1)
        if all_pct < 3:
            continue
        two_k_pct = round((two_k_counts.get(pt, 0) / len(two_k_df)) * 100, 1)
        result[pt] = {
            'name': PITCH_NAMES.get(pt, pt),
            'all_pct': all_pct,
            'two_strike_pct': two_k_pct,
            'delta': round(two_k_pct - all_pct, 1),
        }
    return result if result else None


def compute_first_pitch(df: pd.DataFrame) -> tuple:
    needed = {'pitch_number', 'pitch_type', 'description'}
    if not needed.issubset(df.columns):
        return None, None
    first = df[df['pitch_number'] == 1]
    if len(first) < 50:
        return None, None
    strike_descs = {'called_strike', 'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt'}
    strikes = first['description'].isin(strike_descs).sum()
    strike_pct = round((strikes / len(first)) * 100, 1)

    mix = {}
    for pt, count in first['pitch_type'].value_counts().items():
        if pd.isna(pt) or str(pt) == '':
            continue
        pct = round((count / len(first)) * 100, 1)
        if pct >= 3:
            mix[str(pt)] = {'name': PITCH_NAMES.get(str(pt), str(pt)), 'pct': pct}
    return strike_pct, (mix if mix else None)


def main():
    season = datetime.now().year
    season_start = f'{season}-03-15'
    today = datetime.now().strftime('%Y-%m-%d')

    result = supa.table('pitcher_stats').select('player_id, player_name, starts').execute()
    pitchers = [p for p in (result.data or []) if (p.get('starts') or 0) >= 1]
    print(f'Processing {len(pitchers)} pitchers, {season_start} to {today}')

    for i, p in enumerate(pitchers):
        player_id = p['player_id']
        name = p.get('player_name', str(player_id))
        progress = f'[{i+1}/{len(pitchers)}]'

        try:
         df = statcast_pitcher(season_start, today, player_id=player_id)
            if df is None or df.empty or len(df) < 100:
                print(f'  {progress} {name}: skip ({len(df) if df is not None else 0} pitches)')
                continue
            unique_games = df['game_pk'].nunique() if 'game_pk' in df.columns else '?'
            print(f'    {name}: {len(df)} pitches across {unique_games} games (expect ~{p.get("starts", "?")} starts)')

            # 1. Arsenal + movement → pitch_arsenals
            arsenal_rows = compute_arsenal(df)
            for row in arsenal_rows:
                row.update({'player_id': player_id, 'player_name': name, 'season': season})
            if arsenal_rows:
                supa.table('pitch_arsenals').upsert(arsenal_rows, on_conflict='player_id,season,pitch_type').execute()

            # 2. TTO + two-strike + first-pitch → pitcher_stats
            tto = compute_tto(df)
            two_strike = compute_two_strike_mix(df)
            fp_pct, fp_mix = compute_first_pitch(df)

            update = {'updated_at': datetime.utcnow().isoformat()}
            if tto:
                for bucket in (1, 2, 3):
                    b = tto.get(bucket)
                    if b:
                        update[f'tto{bucket}_pa'] = b['pa']
                        if b['xwoba'] is not None:
                            update[f'tto{bucket}_era'] = b['xwoba']
            if two_strike:
                update['two_strike_mix'] = two_strike
            if fp_pct is not None:
                update['first_pitch_strike_pct'] = fp_pct
            if fp_mix:
                update['first_pitch_mix'] = fp_mix

            if len(update) > 1:
                supa.table('pitcher_stats').update(update).eq('player_id', player_id).execute()

            print(f'  {progress} {name}: ✓ {len(arsenal_rows)} pitch types, TTO={bool(tto)}, 2K={bool(two_strike)}')
            time.sleep(1.5)

        except Exception as e:
            print(f'  {progress} {name}: ✗ {e}')
            time.sleep(3)

    print('Done.')


if __name__ == '__main__':
    main()