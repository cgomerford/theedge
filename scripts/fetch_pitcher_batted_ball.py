"""
scripts/fetch_pitcher_batted_ball.py

Computes real groundball/flyball/line-drive rates per pitcher from Statcast
bb_type, and writes them to the exact column names edge.ts actually reads
(gb_percent, fb_percent) — closing the gap where the model's GB-collision
and GB/FB-defense-synergy sub-factors have been silently scoring 0 because
no script wrote to those column names (the closest thing, gb_rate, is a
different metric from a different source: MLB API groundOuts/airOuts, not
Statcast bb_type).

Follows the same per-pitcher statcast_pitcher() loop as
fetch_pitcher_tto_splits.py, so it inherits the same rate-limit backoff and
low-sample-size guard pattern — deliberately not reinventing that.

Run frequency: weekly (same schedule as fetch_pitch_arsenals.py and
fetch_pitcher_tto_splits.py — batted-ball mix doesn't shift fast enough to
need daily refresh).

Usage: python3 scripts/fetch_pitcher_batted_ball.py
"""
import os
import sys
import time
from datetime import datetime
from typing import Optional
import pandas as pd
from pybaseball import statcast_pitcher, cache
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')
cache.enable()

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

# Minimum batted-ball events before trusting a rate — same spirit as
# MIN_PITCHES_PER_TYPE in the hot-zones scripts. Below this, GB%/FB% swing
# wildly on a handful of balls in play and shouldn't be scored on.
MIN_BATTED_BALLS = 30

# Statcast's own bb_type categories — this is the ground truth column the
# CSV confirmed exists (game_date/pitcher/bb_type/hc_x/hc_y all present in
# a raw statcast_search pull), unlike gb_rate which is an MLB-API proxy.
GROUND_BALL = 'ground_ball'
FLY_BALL    = 'fly_ball'
LINE_DRIVE  = 'line_drive'
POPUP       = 'popup'


def compute_batted_ball_rates(df: pd.DataFrame) -> Optional[dict]:
    if df is None or df.empty or 'bb_type' not in df.columns:
        return None

    bip = df[df['bb_type'].notna() & (df['bb_type'] != '')]
    total = len(bip)
    if total < MIN_BATTED_BALLS:
        return None

    counts = bip['bb_type'].value_counts()
    gb = int(counts.get(GROUND_BALL, 0))
    fb = int(counts.get(FLY_BALL, 0))
    ld = int(counts.get(LINE_DRIVE, 0))
    pu = int(counts.get(POPUP, 0))

    return {
        'gb_percent': round(gb / total, 4),
        'fb_percent': round(fb / total, 4),
        'ld_percent': round(ld / total, 4),
        'popup_percent': round(pu / total, 4),
        'batted_ball_sample': total,
    }


def main():
    season = datetime.now().year
    today = datetime.now().strftime('%Y-%m-%d')
    season_start = f'{season}-03-15'

    print(f'Fetching batted-ball profiles for {season}')

    # Same pitcher pool as fetch_pitcher_tto_splits.py — active starters
    result = supa.table('pitcher_stats').select('player_id, player_name, starts').execute()
    pitchers = [p for p in (result.data or []) if (p.get('starts') or 0) >= 3]
    print(f'Processing {len(pitchers)} starting pitchers')

    success = 0
    skipped = 0
    failed = 0

    for i, p in enumerate(pitchers):
        player_id = p['player_id']
        name = p.get('player_name', str(player_id))
        progress = f'[{i + 1}/{len(pitchers)}]'

        try:
            df = statcast_pitcher(season_start, today, player_id=player_id)

            rates = compute_batted_ball_rates(df)
            if rates is None:
                sample = 0 if df is None or 'bb_type' not in (df.columns if df is not None else []) \
                    else int(df['bb_type'].notna().sum())
                print(f'  {progress} {name}: skipped (only {sample} batted balls, need {MIN_BATTED_BALLS}+)')
                skipped += 1
                continue

            update = {
                'gb_percent': rates['gb_percent'],
                'fb_percent': rates['fb_percent'],
                'ld_percent': rates['ld_percent'],
                'popup_percent': rates['popup_percent'],
                'updated_at': datetime.utcnow().isoformat(),
            }

            supa.table('pitcher_stats').update(update).eq('player_id', player_id).execute()
            print(f'  {progress} {name}: GB {rates["gb_percent"]*100:.1f}% / '
                  f'FB {rates["fb_percent"]*100:.1f}% / LD {rates["ld_percent"]*100:.1f}% '
                  f'(n={rates["batted_ball_sample"]})')
            success += 1
            time.sleep(2)  # Statcast rate limiting — matches fetch_pitcher_tto_splits.py

        except Exception as e:
            print(f'  {progress} {name}: ✗ {e}')
            failed += 1
            time.sleep(3)

    print(f'\n─── Complete ───')
    print(f'  Success: {success}')
    print(f'  Skipped: {skipped}')
    print(f'  Failed:  {failed}')


if __name__ == '__main__':
    main()