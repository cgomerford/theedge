"""
scripts/build_pitch_shape_monthly.py

Builds `pitch_shape_monthly`: per pitcher x pitch type x season x month, the mean release point, speed, spin,
break, Statcast flight terms and outcome counts (swings, whiffs, CSW, balls in play, xwOBA-on-contact sum) behind the Pitching Lab Shape tab's "story so far" model.

TABLE OWNERSHIP: this script (via .github/workflows/shape-monthly.yml) is the ONLY writer of pitch_shape_monthly.

SOURCE / CONVERSIONS: Baseball Savant pitch CSV, one game day per request, regular season only. Columns checked
against a live pull of 2026-09-15 (4,427 rows; ~0.5% have blank flight fields and are skipped). ivb = pfx_z * 12
(inches). hb = arm-side-positive inches: -pfx_x*12 for RHP, +pfx_x*12 for LHP (same as build_pitch_shape_pitcher.py).
Means are over the month's pitches that have every flight field; a (pitcher, type, month) under MIN_MONTH pitches
is not written. Nothing is filled or estimated.

USAGE
  python3 scripts/build_pitch_shape_monthly.py                       # previous + current season
  python3 scripts/build_pitch_shape_monthly.py --dry-run --start 2026-09-14 --end 2026-09-16 --min-month 1
  python3 scripts/build_pitch_shape_monthly.py --pitcher 650911      # one pitcher, both seasons, a single request each (seconds)
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

CONCURRENCY = 4
MIN_MONTH = 10
PITCH_TYPES = {'FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS', 'SV'}
URL = ('https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C'
       '&game_date_gt={d}&game_date_lt={d}&player_type=pitcher')
CORE = ['release_speed', 'release_pos_x', 'release_pos_y', 'release_pos_z', 'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az',
        'plate_x', 'plate_z', 'sz_top', 'sz_bot', 'pfx_x', 'pfx_z']
SWING = {'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'}
WHIFF = {'swinging_strike', 'swinging_strike_blocked', 'missed_bunt'}
USECOLS = CORE + ['pitch_type', 'p_throws', 'pitcher', 'game_date', 'release_spin_rate', 'release_extension',
                  'description', 'estimated_woba_using_speedangle', 'launch_speed_angle']
SUMS = ['n_swings', 'n_whiffs', 'n_csw', 'n_bbe', 'xwoba_con_sum', 'n_weak']
MEANS = ['release_pos_x', 'release_pos_y', 'release_pos_z', 'release_extension', 'release_speed', 'release_spin_rate',
         'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az', 'plate_x', 'plate_z', 'sz_top', 'sz_bot', 'ivb', 'hb']
KEY = ['season', 'pitcher_id', 'pitch_type', 'month']
PITCHER_URL = ('https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C&hfSea={y}%7C&player_type=pitcher'
               '&pitchers_lookup%5B%5D={pid}&game_date_gt={y}-03-01&game_date_lt={y}-11-15')


def http_get(url: str, total: int = 150):
    """GET with a hard total deadline. requests' own timeout only limits the gap between bytes, so a server that
    trickles data can hang a worker for ever (the first full run stalled 48 minutes on one day this way)."""
    t0 = time.time()
    r = requests.get(url, timeout=(10, 45), stream=True)
    chunks = []
    for c in r.iter_content(chunk_size=65536):
        chunks.append(c)
        if time.time() - t0 > total:
            r.close()
            raise requests.Timeout(f'exceeded {total}s total')
    r._content = b''.join(chunks)
    return r


def fetch_pitcher(pid: int, year: int):
    for attempt in range(4):
        try:
            r = http_get(PITCHER_URL.format(y=year, pid=pid), total=240)
            text = r.content.decode('utf-8-sig')
            if r.status_code == 200 and text.lstrip('"').startswith('pitch_type'):
                return pd.read_csv(io.StringIO(text), usecols=lambda c: c in USECOLS)
            if r.status_code == 200 and len(text) < 500:
                return None  # no pitches that season
            print(f'  {pid} {year}: unexpected response (HTTP {r.status_code}, {len(text)} bytes), retry {attempt + 1}')
        except requests.RequestException as e:
            print(f'  {pid} {year}: {e}, retry {attempt + 1}')
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'could not fetch pitcher {pid} {year} after 4 tries')


def fetch_day(d: date):
    for attempt in range(4):
        try:
            r = http_get(URL.format(d=d.isoformat()))
            text = r.content.decode('utf-8-sig')  # BOM-safe
            if r.status_code == 200 and text.lstrip('"').startswith('pitch_type'):
                return pd.read_csv(io.StringIO(text), usecols=lambda c: c in USECOLS)
            if r.status_code == 200 and len(text) < 500:
                return None  # off day
            print(f'  {d}: unexpected response (HTTP {r.status_code}, {len(text)} bytes), retry {attempt + 1}')
        except requests.RequestException as e:
            print(f'  {d}: {e}, retry {attempt + 1}')
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'could not fetch {d} after 4 tries')  # a silent gap would skew a month's mean


def prep(df: pd.DataFrame) -> pd.DataFrame:
    df = df[df['pitch_type'].isin(PITCH_TYPES) & df['p_throws'].isin(['R', 'L'])]
    df = df.dropna(subset=CORE + ['pitcher'])
    right = df['p_throws'] == 'R'
    date_ = pd.to_datetime(df['game_date'])
    out = df.copy()
    out['season'] = date_.dt.year.astype(int)
    out['month'] = date_.dt.month.astype(int)
    out['pitcher_id'] = df['pitcher'].astype(int)
    out['ivb'] = df['pfx_z'] * 12
    out['hb'] = (-df['pfx_x'] * 12).where(right, df['pfx_x'] * 12)
    # Outcome counts (same definitions as build_pitch_shape_bins.py); a rate is sums / sums in the app.
    desc = df['description']
    xw = df['estimated_woba_using_speedangle']
    whiff = desc.isin(WHIFF)
    bbe = (desc == 'hit_into_play') & xw.notna()
    out['n_swings'] = desc.isin(SWING).astype(int)
    out['n_whiffs'] = whiff.astype(int)
    out['n_csw'] = (whiff | (desc == 'called_strike')).astype(int)
    out['n_bbe'] = bbe.astype(int)
    out['xwoba_con_sum'] = xw.where(bbe, 0).fillna(0)
    out['n_weak'] = (bbe & df['launch_speed_angle'].isin([1, 2])).astype(int)   # Savant classes 1 = Weak, 2 = Topped
    return out


def build(df: pd.DataFrame, min_month: int) -> list[dict]:
    g = df.groupby(KEY)
    agg = g[MEANS].mean()
    agg[SUMS] = g[SUMS].sum()
    agg['n_pitches'] = g.size()
    agg['p_throws'] = g['p_throws'].agg(lambda s: s.mode().iloc[0])
    agg = agg[agg['n_pitches'] >= min_month].reset_index()
    for c in MEANS:
        agg[c] = agg[c].round(4)
    agg['xwoba_con_sum'] = agg['xwoba_con_sum'].round(4)
    for c in ('season', 'pitcher_id', 'month', 'n_pitches', 'n_swings', 'n_whiffs', 'n_csw', 'n_bbe', 'n_weak'):
        agg[c] = agg[c].astype(int)
    out = agg.astype(object).where(agg.notna(), None)
    return out.to_dict('records')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--start')
    ap.add_argument('--end')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--pitcher', type=int, help='only this pitcher id (both seasons); rows of other pitchers are left untouched')
    ap.add_argument('--min-month', type=int, default=MIN_MONTH)
    ap.add_argument('--batch', type=int, default=500, help='rows per upsert; each batch prints a progress line')
    ap.add_argument('--wait', type=int, default=10, help='seconds to abort (Ctrl-C) before the upsert')
    args = ap.parse_args()

    today = date.today()
    start = date.fromisoformat(args.start) if args.start else date(today.year - 1, 3, 15)
    end = date.fromisoformat(args.end) if args.end else today - timedelta(days=1)
    started = datetime.now(timezone.utc)

    days = []
    d = start
    while d <= end and not args.pitcher:
        if (3, 15) <= (d.month, d.day) <= (11, 10):
            days.append(d)
        d += timedelta(days=1)

    def read_day(day: date):
        raw = fetch_day(day)
        return None if raw is None or raw.empty else prep(raw)

    parts, n_days = [], 0
    total_days, seen = len(days), 0   # every calendar day in the window is fetched, so progress counts days, not game days
    if args.pitcher:
        for yr in (today.year - 1, today.year):
            raw = fetch_pitcher(args.pitcher, yr)
            if raw is not None and not raw.empty:
                parts.append(prep(raw))
                n_days += 1
    else:
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
            futs = [pool.submit(read_day, d) for d in days]
            for f in as_completed(futs):   # unordered, so progress never waits on one slow day
                p = f.result()
                seen += 1
                for m in (20, 40, 60, 80, 100):   # milestone lines the progress watcher keys on
                    if seen * 100 >= m * total_days and (seen - 1) * 100 < m * total_days:
                        print(f'MILESTONE reading {m}% ({seen}/{total_days} days)', flush=True)
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
    print(f'\n{n_days} game days, {len(df):,} pitches with complete flight data -> {len(rows):,} monthly rows')
    print('5-row sample (most pitches):')
    show = sorted(rows, key=lambda r: -r['n_pitches'])[:5]
    print(pd.DataFrame(show)[['season', 'pitcher_id', 'pitch_type', 'month', 'n_pitches', 'release_pos_x', 'release_pos_z', 'release_extension',
                              'release_speed', 'ivb', 'hb', 'n_swings', 'n_whiffs', 'n_bbe', 'n_weak', 'xwoba_con_sum']].to_string(index=False))
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

    # An upsert does not refresh updated_at (its default only fires on insert), so stamp it ourselves: the stale-row
    # cleanup below deletes anything older than `started`, and without this it deleted every row this run had just written.
    stamp = datetime.now(timezone.utc).isoformat()
    for r_ in rows:
        r_['updated_at'] = stamp
    print(f'\nWriting {len(rows):,} rows to pitch_shape_monthly in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    total = len(rows)
    next_m = 20
    for i in range(0, total, args.batch):
        sb.table('pitch_shape_monthly').upsert(rows[i:i + args.batch], on_conflict='season,pitcher_id,pitch_type,month').execute()
        done = min(i + args.batch, total)
        print(f'  wrote {done:,}/{total:,} rows ({done * 100 // total}%)', flush=True)
        while next_m <= 100 and done * 100 >= next_m * total:
            print(f'MILESTONE writing {next_m}% ({done:,}/{total:,} rows)', flush=True)
            next_m += 20
    seasons = sorted({r['season'] for r in rows})
    for s in seasons:  # rows of these seasons this run did not touch are stale (a month that fell under the minimum)
        base = sb.table('pitch_shape_monthly').select('season', count='exact').eq('season', s).lt('updated_at', started.isoformat())
        if args.pitcher:
            base = base.eq('pitcher_id', args.pitcher)
        stale = base.limit(1).execute().count or 0
        written = sum(1 for r_ in rows if r_['season'] == s)
        if stale > max(200, written // 10):   # a healthy run leaves a few stale months, never a tenth of the table
            print(f'REFUSING to delete {stale:,} stale rows for {s} (only {written:,} written): something is wrong.')
            sys.exit(1)
        d = sb.table('pitch_shape_monthly').delete().eq('season', s).lt('updated_at', started.isoformat())
        (d.eq('pitcher_id', args.pitcher) if args.pitcher else d).execute()
        print(f'  removed {stale:,} stale rows for {s}', flush=True)
    sb.table('cron_run_log').insert({
        'job': 'build_pitch_shape_monthly', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
        'rows_written': len(rows), 'status': 'ok', 'note': f'{n_days} game days, seasons {seasons}',
    }).execute()
    print('Done.')


if __name__ == '__main__':
    main()
