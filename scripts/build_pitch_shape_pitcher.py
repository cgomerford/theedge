"""
scripts/build_pitch_shape_pitcher.py

Builds `pitch_shape_pitcher`: each pitcher's average shape per pitch type and season, a sample of
his pitches for the movement-map dots, and the small splits the Pitching Lab Shape tab shows.

TABLE OWNERSHIP: this script (via .github/workflows/shape-pitcher.yml) is the ONLY writer of
pitch_shape_pitcher. pitch_shape_bins has its own writer (build_pitch_shape_bins.py).

SOURCE / CONVERSIONS: identical to build_pitch_shape_bins.py (verified against a live pull of
2026-09-15): pfx_x and pfx_z are feet; arm-side-positive horizontal break in inches is
-pfx_x*12 for RHP and +pfx_x*12 for LHP; IVB inches = pfx_z*12; arm_angle is degrees. Regular
season only. Rows missing velocity, pfx or arm_angle are skipped. Pitcher team = the club he was
pitching for (top of the inning -> home club, bottom -> away club), most common over the season.

A (season, pitcher, pitch type) with under MIN_PITCHES pitches is not written.

USAGE
  python3 scripts/build_pitch_shape_pitcher.py                       # current + previous season
  python3 scripts/build_pitch_shape_pitcher.py --dry-run --start 2026-09-14 --end 2026-09-16
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
MIN_PITCHES = 50
N_POINTS = 60
PITCH_TYPES = {'FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS', 'SV'}
SWING = {'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'}
WHIFF = {'swinging_strike', 'swinging_strike_blocked', 'missed_bunt'}
BALLS = {'ball', 'blocked_ball'}
TAKEN = BALLS | {'called_strike'}
USECOLS = ['pitch_type', 'p_throws', 'release_speed', 'pfx_x', 'pfx_z', 'arm_angle', 'description', 'estimated_woba_using_speedangle',
           'pitcher', 'player_name', 'game_date', 'balls', 'strikes', 'stand', 'inning_topbot', 'home_team', 'away_team',
           'zone', 'game_pk', 'at_bat_number', 'pitch_number']
URL = ('https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C'
       '&game_date_gt={d}&game_date_lt={d}&player_type=pitcher')
MONTHS = {3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov'}
KEY = ['season', 'pitcher_id', 'pitch_type']


def http_get(url: str, total: int = 150):
    """GET with a hard total deadline (requests' own timeout only limits the gap between bytes, so a server that
    trickles data can hang a worker for ever; the monthly build once stalled 48 minutes this way)."""
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
    raise RuntimeError(f'could not fetch {d} after 4 tries')  # a silent gap would skew a pitcher's shape


def prep(df: pd.DataFrame) -> pd.DataFrame:
    # The pitch BEFORE each pitch, found on the full day (before any filtering) so a pitch we do not track still counts.
    df = df.sort_values(['game_pk', 'at_bat_number', 'pitch_number']).copy()
    grp = df.groupby(['game_pk', 'at_bat_number'])
    prev_t, prev_v = grp['pitch_type'].shift(1), grp['release_speed'].shift(1)
    df['prev_type'] = np.where(prev_t.isna(), 'FIRST', np.where(prev_t.isin(PITCH_TYPES), prev_t, 'OTH'))
    df['prev_speed'] = prev_v.where(prev_t.notna())
    df = df[df['pitch_type'].isin(PITCH_TYPES) & df['p_throws'].isin(['R', 'L'])]
    df = df.dropna(subset=['release_speed', 'pfx_x', 'pfx_z', 'arm_angle', 'pitcher'])
    right = df['p_throws'] == 'R'
    desc = df['description']
    xw = df['estimated_woba_using_speedangle']
    bbe = (desc == 'hit_into_play') & xw.notna()
    date_ = pd.to_datetime(df['game_date'])
    return pd.DataFrame({
        'season': date_.dt.year.astype(int), 'month': date_.dt.month.astype(int),
        'pitcher_id': df['pitcher'].astype(int), 'pitcher_name': df['player_name'],
        'pitch_type': df['pitch_type'], 'p_throws': df['p_throws'],
        'team': np.where(df['inning_topbot'] == 'Top', df['home_team'], df['away_team']),
        'velo': df['release_speed'], 'ivb': df['pfx_z'] * 12,
        'hb': (-df['pfx_x'] * 12).where(right, df['pfx_x'] * 12), 'slot': df['arm_angle'],
        'swing': desc.isin(SWING).astype(int), 'whiff': desc.isin(WHIFF).astype(int),
        'state': np.where(df['strikes'] > df['balls'], 'Ahead in count', np.where(df['balls'] > df['strikes'], 'Behind in count', 'Even count')),
        'stand': df['stand'], 'bbe': bbe.astype(int), 'xw': xw.where(bbe, 0).fillna(0),
        # umpire calls (taken pitches only); zone is Savant's: 1-9 inside the rulebook zone, 11-14 outside
        'taken': (desc.isin(TAKEN) & df['zone'].notna()).astype(int),
        'gift': ((desc == 'called_strike') & (df['zone'] >= 11)).astype(int),
        'miss': (desc.isin(BALLS) & (df['zone'] <= 9)).astype(int),
        'called': (desc == 'called_strike').astype(int),
        'prev_type': df['prev_type'], 'dv': df['prev_speed'] - df['release_speed'],
    })


def mode(s: pd.Series):
    m = s.dropna().mode()
    return m.iloc[0] if len(m) else None


def clean_name(n: str) -> str:
    # Savant gives "Last, First"
    if isinstance(n, str) and ', ' in n:
        last, first = n.split(', ', 1)
        return f'{first} {last}'
    return n


def build(df: pd.DataFrame, now_iso: str) -> list[dict]:
    rows: list[dict] = []
    for (season, pid, ptype), g in df.groupby(KEY):
        if len(g) < MIN_PITCHES:
            continue
        pts = g.sample(min(N_POINTS, len(g)), random_state=int(pid) % 100000)
        counts = [{'label': k, 'swings': int(v['swing'].sum()), 'whiffs': int(v['whiff'].sum())}
                  for k, v in g.groupby('state')]
        sides = [{'label': 'vs left-handed' if k == 'L' else 'vs right-handed', 'bbe': int(v['bbe'].sum()), 'xwoba_sum': round(float(v['xw'].sum()), 4)}
                 for k, v in g.groupby('stand')]
        monthly = [{'label': MONTHS.get(int(k), str(k)), 'velo': round(float(v['velo'].mean()), 2), 'pitches': int(len(v))}
                   for k, v in sorted(g.groupby('month'), key=lambda kv: kv[0])]
        setup = [{'prev': k, 'n': int(len(v)), 'swings': int(v['swing'].sum()), 'whiffs': int(v['whiff'].sum()), 'called': int(v['called'].sum()),
                  'dv': None if k == 'FIRST' or v['dv'].isna().all() else round(float(v['dv'].mean()), 1)}
                 for k, v in g.groupby('prev_type')]
        rows.append({
            'season': int(season), 'pitcher_id': int(pid), 'pitch_type': ptype,
            'pitcher_name': clean_name(mode(g['pitcher_name'])), 'team_abbr': mode(g['team']), 'p_throws': mode(g['p_throws']),
            'n_pitches': int(len(g)),
            'velo': round(float(g['velo'].mean()), 2), 'ivb': round(float(g['ivb'].mean()), 2),
            'hb': round(float(g['hb'].mean()), 2), 'slot': round(float(g['slot'].mean()), 1),
            'sd_hb': round(float(g['hb'].std(ddof=0)), 2), 'sd_ivb': round(float(g['ivb'].std(ddof=0)), 2),
            'n_swings': int(g['swing'].sum()), 'n_whiffs': int(g['whiff'].sum()),
            'n_taken': int(g['taken'].sum()), 'n_gift': int(g['gift'].sum()), 'n_miss': int(g['miss'].sum()), 'setup': setup,
            'points': [{'hb': round(float(h), 1), 'ivb': round(float(i), 1)} for h, i in zip(pts['hb'], pts['ivb'])],
            'counts': counts, 'batter_sides': sides, 'monthly': monthly, 'updated_at': now_iso,
        })
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--start')
    ap.add_argument('--end')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--batch', type=int, default=500, help='rows per upsert; each batch prints a progress line')
    ap.add_argument('--wait', type=int, default=10, help='seconds to abort (Ctrl-C) before the upsert')
    args = ap.parse_args()

    today = date.today()
    start = date.fromisoformat(args.start) if args.start else date(today.year - 1, 3, 15)
    end = date.fromisoformat(args.end) if args.end else today - timedelta(days=1)
    started = datetime.now(timezone.utc)

    all_days = []
    d = start
    while d <= end:
        if (3, 15) <= (d.month, d.day) <= (11, 10):
            all_days.append(d)
        d += timedelta(days=1)

    def read_day(day: date):
        raw = fetch_day(day)
        return None if raw is None or raw.empty else prep(raw)

    parts, n_days, seen, total_days = [], 0, 0, len(all_days)
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futs = [pool.submit(read_day, d) for d in all_days]
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
    rows = build(df, started.isoformat())
    print(f'\n{n_days} game days, {len(df):,} pitches -> {len(rows):,} pitcher/pitch-type rows')
    print('5-row sample (most pitches):')
    show = sorted(rows, key=lambda r: -r['n_pitches'])[:5]
    print(pd.DataFrame([{k: v for k, v in r.items() if k in ('season', 'pitcher_id', 'pitcher_name', 'team_abbr', 'pitch_type', 'p_throws', 'n_pitches', 'velo', 'ivb', 'hb', 'slot', 'sd_hb', 'sd_ivb', 'n_swings', 'n_whiffs')} for r in show]).to_string(index=False))
    if args.dry_run:
        print('\n--dry-run: nothing written.')
        return

    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv('.env.local')
    url = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip()
    key = (os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()
    if not url or not key:
        print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
        sys.exit(1)
    sb = create_client(url, key)

    print(f'\nWriting {len(rows):,} rows to pitch_shape_pitcher in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    total, next_m = len(rows), 20
    for i in range(0, total, args.batch):
        sb.table('pitch_shape_pitcher').upsert(rows[i:i + args.batch], on_conflict='season,pitcher_id,pitch_type').execute()
        done = min(i + args.batch, total)
        print(f'  wrote {done:,}/{total:,} rows ({done * 100 // total}%)', flush=True)
        while next_m <= 100 and done * 100 >= next_m * total:
            print(f'MILESTONE writing {next_m}% ({done:,}/{total:,} rows)', flush=True)
            next_m += 20
    seasons = sorted({r['season'] for r in rows})
    # Rows of these seasons this run did not touch are stale (a pitcher who fell under the minimum). Every row written
    # above carries updated_at = started, so only genuinely untouched rows are older. Refuse a mass delete.
    for s in seasons:
        stale = sb.table('pitch_shape_pitcher').select('season', count='exact').eq('season', s).lt('updated_at', started.isoformat()).limit(1).execute().count or 0
        written = sum(1 for r in rows if r['season'] == s)
        if stale > max(100, written // 10):
            print(f'REFUSING to delete {stale:,} stale rows for {s} (only {written:,} written): something is wrong.')
            sys.exit(1)
        sb.table('pitch_shape_pitcher').delete().eq('season', s).lt('updated_at', started.isoformat()).execute()
        print(f'  removed {stale:,} stale rows for {s}', flush=True)
    sb.table('cron_run_log').insert({
        'job': 'build_pitch_shape_pitcher', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
        'rows_written': len(rows), 'status': 'ok', 'note': f'{n_days} game days, seasons {seasons}',
    }).execute()
    print('Done.')


if __name__ == '__main__':
    main()
