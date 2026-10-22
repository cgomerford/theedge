"""
scripts/build_pitch_shape_flights.py

Builds `pitch_shape_flights`: up to 3 real, typical pitches per pitcher x pitch type x season x month with the
full Statcast flight fields (release point, constant-acceleration terms, plate location, zone, spin), for the
3D pitch view and its month-by-month ghosts.

TABLE OWNERSHIP: this script (via .github/workflows/shape-flights.yml) is the ONLY writer of pitch_shape_flights.

SOURCE: Baseball Savant pitch CSV, one game day per request, regular season only. Every column below was
checked against a live pull of 2026-09-15 (4,427 rows; ~0.5% of rows have blank flight fields and are skipped).
A rank-1..3 pitch is one of the pitches closest to that month's average (z-scored release x/z, plate x/z and
velocity). A (pitcher, type, month) under MIN_MONTH pitches is not written. Nothing is invented: a pitch with
any missing flight field is dropped, never filled.

USAGE
  python3 scripts/build_pitch_shape_flights.py                       # previous + current season
  python3 scripts/build_pitch_shape_flights.py --dry-run --start 2026-09-14 --end 2026-09-16 --min-month 1
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

CONCURRENCY = 4
MIN_MONTH = 10
PER_MONTH = 3
PITCH_TYPES = {'FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS', 'SV'}
URL = ('https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C'
       '&game_date_gt={d}&game_date_lt={d}&player_type=pitcher')
FLIGHT = ['release_speed', 'release_pos_x', 'release_pos_y', 'release_pos_z', 'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az',
          'plate_x', 'plate_z', 'sz_top', 'sz_bot']
USECOLS = FLIGHT + ['pitch_type', 'p_throws', 'stand', 'pitcher', 'game_date', 'game_pk', 'at_bat_number', 'pitch_number',
                    'balls', 'strikes', 'release_spin_rate', 'spin_axis', 'release_extension']
Z_COLS = ['release_pos_x', 'release_pos_z', 'plate_x', 'plate_z', 'release_speed']
KEY = ['season', 'pitcher_id', 'pitch_type', 'month']
OUT_COLS = ['season', 'pitcher_id', 'pitch_type', 'month', 'rank', 'n_in_month', 'p_throws', 'stand', 'game_date', 'game_pk',
            'at_bat_number', 'pitch_number', 'balls', 'strikes', 'release_speed', 'release_spin_rate', 'spin_axis',
            'release_pos_x', 'release_pos_y', 'release_pos_z', 'release_extension', 'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az',
            'plate_x', 'plate_z', 'sz_top', 'sz_bot']


def fetch_day(d: date):
    for attempt in range(4):
        try:
            r = requests.get(URL.format(d=d.isoformat()), timeout=120)
            text = r.content.decode('utf-8-sig')  # BOM-safe
            if r.status_code == 200 and text.lstrip('"').startswith('pitch_type'):
                return pd.read_csv(io.StringIO(text), usecols=lambda c: c in USECOLS)
            if r.status_code == 200 and len(text) < 500:
                return None  # off day
            print(f'  {d}: unexpected response (HTTP {r.status_code}, {len(text)} bytes), retry {attempt + 1}')
        except requests.RequestException as e:
            print(f'  {d}: {e}, retry {attempt + 1}')
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'could not fetch {d} after 4 tries')


def prep(df: pd.DataFrame) -> pd.DataFrame:
    df = df[df['pitch_type'].isin(PITCH_TYPES) & df['p_throws'].isin(['R', 'L'])]
    df = df.dropna(subset=FLIGHT + ['pitcher', 'game_pk', 'at_bat_number', 'pitch_number'])
    date_ = pd.to_datetime(df['game_date'])
    out = df.copy()
    out['season'] = date_.dt.year.astype(int)
    out['month'] = date_.dt.month.astype(int)
    out['pitcher_id'] = df['pitcher'].astype(int)
    return out


def build(df: pd.DataFrame, min_month: int) -> list[dict]:
    parts = []
    for _, g in df.groupby(KEY):
        if len(g) < min_month:
            continue
        sd = g[Z_COLS].std(ddof=0).replace(0, 1)
        dist = (((g[Z_COLS] - g[Z_COLS].mean()) / sd) ** 2).sum(axis=1)
        top = g.assign(_d=dist).sort_values(['_d', 'game_date', 'at_bat_number', 'pitch_number']).head(PER_MONTH).copy()
        top['rank'] = np.arange(1, len(top) + 1)
        top['n_in_month'] = len(g)
        parts.append(top)
    if not parts:
        return []
    o = pd.concat(parts, ignore_index=True)
    for c in ('balls', 'strikes', 'release_spin_rate', 'spin_axis', 'release_extension'):
        o[c] = o[c].astype(float).where(o[c].notna(), None)
    o['game_date'] = pd.to_datetime(o['game_date']).dt.strftime('%Y-%m-%d')
    for c in ('game_pk', 'at_bat_number', 'pitch_number'):
        o[c] = o[c].astype(int)
    o = o[OUT_COLS].astype(object).where(o[OUT_COLS].notna(), None)
    return o.to_dict('records')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--start')
    ap.add_argument('--end')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--min-month', type=int, default=MIN_MONTH)
    ap.add_argument('--wait', type=int, default=10, help='seconds to abort (Ctrl-C) before the upsert')
    args = ap.parse_args()

    today = date.today()
    start = date.fromisoformat(args.start) if args.start else date(today.year - 1, 3, 15)
    end = date.fromisoformat(args.end) if args.end else today - timedelta(days=1)
    started = datetime.now(timezone.utc)

    days = []
    d = start
    while d <= end:
        if (3, 15) <= (d.month, d.day) <= (11, 10):
            days.append(d)
        d += timedelta(days=1)

    def read_day(day: date):
        raw = fetch_day(day)
        return None if raw is None or raw.empty else prep(raw)

    parts, n_days = [], 0
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        for p in pool.map(read_day, days):
            if p is None:
                continue
            parts.append(p)
            n_days += 1
            if n_days % 20 == 0:
                print(f'  ...{n_days} game days read', flush=True)
    if not parts:
        print('No data read; nothing to write.')
        sys.exit(1)
    df = pd.concat(parts, ignore_index=True)
    rows = build(df, args.min_month)
    print(f'\n{n_days} game days, {len(df):,} pitches with complete flight data -> {len(rows):,} rows')
    print('5-row sample:')
    print(pd.DataFrame(rows[:5])[['season', 'pitcher_id', 'pitch_type', 'month', 'rank', 'n_in_month', 'release_speed', 'release_pos_x',
                                   'release_pos_z', 'plate_x', 'plate_z']].to_string(index=False))
    if args.dry_run:
        print('\n--dry-run: nothing written.')
        return
    if not rows:
        print('0 rows built; refusing to delete anything.')
        sys.exit(1)

    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv('.env.local')
    url = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip()
    key = (os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()
    if not url or not key:
        print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
        sys.exit(1)
    sb = create_client(url, key)

    print(f'\nWriting {len(rows):,} rows to pitch_shape_flights in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    for i in range(0, len(rows), 500):
        sb.table('pitch_shape_flights').upsert(rows[i:i + 500], on_conflict='season,pitcher_id,pitch_type,month,rank').execute()
    seasons = sorted({r['season'] for r in rows})
    for s in seasons:  # rows of these seasons this run did not touch are stale (a month that fell under the minimum)
        sb.table('pitch_shape_flights').delete().eq('season', s).lt('updated_at', started.isoformat()).execute()
    sb.table('cron_run_log').insert({
        'job': 'build_pitch_shape_flights', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
        'rows_written': len(rows), 'status': 'ok', 'note': f'{n_days} game days, seasons {seasons}',
    }).execute()
    print('Done.')


if __name__ == '__main__':
    main()
