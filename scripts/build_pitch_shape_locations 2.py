"""
scripts/build_pitch_shape_locations.py

Builds `pitch_shape_locations`: where league pitches cross the plate, keyed to their place on the movement map (arm-side
horizontal break x induced vertical break, 0.5 inch bins). One row per SEASON x pitch type x pitcher hand (span = '2024',
'2025', '2026'). Behind the location panel beside the movement heat map in the Pitch Shape Lab.

TABLE OWNERSHIP: this script (via .github/workflows/shape-locations.yml) is the ONLY writer of pitch_shape_locations.

SOURCE / CONVERSIONS: movement identical to build_pitch_shape_cells.py (pfx_x, pfx_z in feet; hb inches = -pfx_x*12 for RHP,
+pfx_x*12 for LHP; ivb = pfx_z*12). Location in the BATTER's frame (same as the Swing Lab): plate_x is flipped for left-handed
batters so inside is always negative; the grid is 24 columns of 0.166 ft with the zone (+-0.83 ft) exactly columns 7..16, and 28
rows of a tenth of the batter's own zone height (sz_bot-0.12 .. sz_top+0.12 ft) with the zone exactly rows 9..18. Regular season,
coord era '2026' (as the other shape tables). Rows missing movement or location are skipped.

USAGE
  python3 scripts/build_pitch_shape_locations.py                          # 2024..current, writes
  python3 scripts/build_pitch_shape_locations.py --first-season 2026      # just this season (fast)
  python3 scripts/build_pitch_shape_locations.py --dry-run --start 2026-09-15 --end 2026-09-15
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

COORD_ERA = '2026'
DEFAULT_FIRST_SEASON = 2024
CONCURRENCY = 4
PITCH_TYPES = {'FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS', 'SV'}
USECOLS = ['pitch_type', 'p_throws', 'pfx_x', 'pfx_z', 'plate_x', 'plate_z', 'stand', 'sz_top', 'sz_bot', 'game_date']
KEYS = ['season', 'pitch_type', 'p_throws', 'hb2', 'iv2', 'lx', 'lz']
CW = 0.166                   # ft per location column
X0 = -(0.83 + 7 * CW)        # left edge of column 0: the zone's left edge (-0.83 ft) is the start of column 7
COLS, ROWS = 24, 28
PAD = 0.12                   # ft added above and below the batter's zone for the ball
URL = ('https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C'
       '&game_date_gt={d}&game_date_lt={d}&player_type=pitcher')


def http_get(url: str, total: int = 150):
    """GET with a hard total deadline (requests' own timeout only limits the gap between bytes)."""
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
    raise RuntimeError(f'could not fetch {d} after 4 tries')  # a silent gap would skew the map


def aggregate(df: pd.DataFrame) -> pd.DataFrame:
    df = df[df['pitch_type'].isin(PITCH_TYPES) & df['p_throws'].isin(['R', 'L']) & df['stand'].isin(['R', 'L'])]
    df = df.dropna(subset=['pfx_x', 'pfx_z', 'plate_x', 'plate_z'])
    if df.empty:
        return pd.DataFrame(columns=KEYS + ['n'])
    right = df['p_throws'] == 'R'
    hb = (-df['pfx_x'] * 12).where(right, df['pfx_x'] * 12)
    x_in = np.where(df['stand'] == 'R', df['plate_x'], -df['plate_x'])
    top = df['sz_top'].fillna(3.5).to_numpy() + PAD
    bot = df['sz_bot'].fillna(1.5).to_numpy() - PAD
    zn = (df['plate_z'].to_numpy() - bot) / (top - bot)
    out = pd.DataFrame({
        'season': pd.to_datetime(df['game_date']).dt.year.astype(int),
        'pitch_type': df['pitch_type'], 'p_throws': df['p_throws'],
        'hb2': np.floor(hb * 2).astype(int), 'iv2': np.floor(df['pfx_z'] * 12 * 2).astype(int),
        'lx': np.clip(np.floor((x_in - X0) / CW + 1e-9), 0, COLS - 1).astype(int),
        'lz': np.clip(np.floor(zn * 10 + 9 + 1e-9), 0, ROWS - 1).astype(int),
        'n': 1,
    })
    return out.groupby(KEYS, as_index=False)['n'].sum()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--start')
    ap.add_argument('--end')
    ap.add_argument('--first-season', type=int, default=DEFAULT_FIRST_SEASON)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--wait', type=int, default=10, help='seconds to abort (Ctrl-C) before the upsert')
    args = ap.parse_args()

    today = date.today()
    start = date.fromisoformat(args.start) if args.start else date(args.first_season, 3, 15)
    end = date.fromisoformat(args.end) if args.end else today - timedelta(days=1)
    started = datetime.now(timezone.utc)
    days, d = [], start
    while d <= end:
        if args.first_season <= d.year and (3, 15) <= (d.month, d.day) <= (11, 10):
            days.append(d)
        d += timedelta(days=1)

    def read_day(day: date):
        raw = fetch_day(day)
        return None if raw is None or raw.empty else aggregate(raw)

    parts, n_days, seen, total_days = [], 0, 0, len(days)
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futs = [pool.submit(read_day, x) for x in days]
        for f in as_completed(futs):
            p = f.result()
            seen += 1
            for m in (20, 40, 60, 80, 100):
                if seen * 100 >= m * total_days and (seen - 1) * 100 < m * total_days:
                    print(f'MILESTONE reading {m}% ({seen}/{total_days} days)', flush=True)
            if p is None or p.empty:
                continue
            parts.append(p)
            n_days += 1
    if not parts:
        print('No data read; nothing to write.')
        sys.exit(1)
    allc = pd.concat(parts, ignore_index=True).groupby(KEYS, as_index=False)['n'].sum()

    rows = []
    for (season, ptype, hand), g in allc.groupby(['season', 'pitch_type', 'p_throws']):
        flat = g[['hb2', 'iv2', 'lx', 'lz', 'n']].to_numpy(dtype=int).ravel().tolist()
        rows.append({
            'span': str(int(season)), 'coord_era': COORD_ERA, 'pitch_type': ptype, 'p_throws': hand,
            'n_pitches': int(g['n'].sum()), 'bins': flat, 'updated_at': started.isoformat(),
        })
    spans = sorted({r['span'] for r in rows})
    print(f'\n{n_days} game days, {int(allc["n"].sum()):,} pitches -> {len(allc):,} (movement bin x location cell) entries in {len(rows)} rows (seasons {spans})')
    # sanity: share of four-seam fastballs inside the zone box (columns 7..16, rows 9..18); a known ballpark is about half
    ff = allc[allc['pitch_type'] == 'FF']
    if len(ff):
        inz = ff[ff['lx'].between(7, 16) & ff['lz'].between(9, 18)]['n'].sum() / ff['n'].sum()
        print(f'SANITY: four-seam fastballs inside the zone box: {inz:.1%}')
    print('5-row sample (most pitches):')
    show = sorted(rows, key=lambda r: -r['n_pitches'])[:5]
    print(pd.DataFrame([{**{k: v for k, v in r.items() if k not in ('bins', 'updated_at')}, 'entries': len(r['bins']) // 5} for r in show]).to_string(index=False))
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

    print(f'\nWriting {len(rows)} rows to pitch_shape_locations in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    for i, r in enumerate(rows, 1):
        sb.table('pitch_shape_locations').upsert(r, on_conflict='span,coord_era,pitch_type,p_throws').execute()   # one row per call: each is a large JSON array
        print(f'  wrote {i}/{len(rows)} rows ({i * 100 // len(rows)}%)', flush=True)
        for m in (20, 40, 60, 80, 100):
            if i * 100 >= m * len(rows) and (i - 1) * 100 < m * len(rows):
                print(f'MILESTONE writing {m}% ({i}/{len(rows)} rows)', flush=True)
    # Rows of these seasons this run did not touch are stale (a type/hand that vanished). Refuse a mass delete.
    stale = sb.table('pitch_shape_locations').select('span', count='exact').in_('span', spans).eq('coord_era', COORD_ERA).lt('updated_at', started.isoformat()).limit(1).execute().count or 0
    if stale > max(3, len(rows) // 10):
        print(f'REFUSING to delete {stale} stale rows (only {len(rows)} written): something is wrong.')
        sys.exit(1)
    sb.table('pitch_shape_locations').delete().in_('span', spans).eq('coord_era', COORD_ERA).lt('updated_at', started.isoformat()).execute()
    print(f'  removed {stale} stale rows', flush=True)
    sb.table('cron_run_log').insert({
        'job': 'build_pitch_shape_locations', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
        'rows_written': len(rows), 'status': 'ok', 'note': f'{n_days} game days, seasons {spans}',
    }).execute()
    print('Done.')


if __name__ == '__main__':
    main()
