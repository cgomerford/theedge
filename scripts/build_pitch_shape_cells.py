"""
scripts/build_pitch_shape_cells.py

Builds `pitch_shape_cells`: league pitches at 0.1-inch resolution on the movement map (arm-side horizontal break
x induced vertical break), one row per SEASON x pitch type x hand (span = '2024', '2025', '2026'), behind the Pitching
Lab Shape tab's "How they win" map. Rows are per season so the page can show 2026 pitches only, or add the seasons up
(2024-2026), and compare the two.

TABLE OWNERSHIP: this script (via .github/workflows/shape-cells.yml) is the ONLY writer of pitch_shape_cells.

SOURCE / CONVERSIONS: identical to build_pitch_shape_bins.py (verified against a live pull of 2026-09-15):
pfx_x, pfx_z are feet; hb (inches, arm-side positive) = -pfx_x*12 for RHP, +pfx_x*12 for LHP; ivb = pfx_z*12.
Each pitch goes in the cell (floor(hb*10+0.5), floor(ivb*10+0.5)), i.e. tenths of an inch, round-half-up like
JavaScript's Math.round. Pooled over velocity and arm slot (as the 2-inch map is). Rows missing velocity, pfx are
skipped. Regular season only, 2024..current, coord era as pitch_shape_bins. The earlier pooled rows (span '2024-2026')
are removed by this script: the page now sums seasons itself.

USAGE
  python3 scripts/build_pitch_shape_cells.py                       # 2024..current, writes
  python3 scripts/build_pitch_shape_cells.py --dry-run --start 2026-09-15 --end 2026-09-15
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

LEGACY_SPAN = '2024-2026'   # pooled rows from the first version of this table; deleted below
COORD_ERA = '2026'
FIRST_SEASON = 2024
CONCURRENCY = 4
PITCH_TYPES = {'FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS', 'SV'}
SWING = {'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'}
WHIFF = {'swinging_strike', 'swinging_strike_blocked', 'missed_bunt'}
USECOLS = ['pitch_type', 'p_throws', 'release_speed', 'pfx_x', 'pfx_z', 'description', 'game_date']
KEYS = ['season', 'pitch_type', 'p_throws', 'hb10', 'ivb10']
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
    df = df[df['pitch_type'].isin(PITCH_TYPES) & df['p_throws'].isin(['R', 'L'])]
    df = df.dropna(subset=['release_speed', 'pfx_x', 'pfx_z'])
    if df.empty:
        return pd.DataFrame(columns=KEYS + ['pitches', 'swings', 'whiffs'])
    right = df['p_throws'] == 'R'
    hb = (-df['pfx_x'] * 12).where(right, df['pfx_x'] * 12)
    desc = df['description']
    out = pd.DataFrame({
        'season': pd.to_datetime(df['game_date']).dt.year.astype(int),
        'pitch_type': df['pitch_type'], 'p_throws': df['p_throws'],
        'hb10': np.floor(hb * 10 + 0.5).astype(int), 'ivb10': np.floor(df['pfx_z'] * 12 * 10 + 0.5).astype(int),
        'pitches': 1, 'swings': desc.isin(SWING).astype(int), 'whiffs': desc.isin(WHIFF).astype(int),
    })
    return out.groupby(KEYS, as_index=False)[['pitches', 'swings', 'whiffs']].sum()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--start')
    ap.add_argument('--end')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--wait', type=int, default=10, help='seconds to abort (Ctrl-C) before the upsert')
    args = ap.parse_args()

    today = date.today()
    start = date.fromisoformat(args.start) if args.start else date(FIRST_SEASON, 3, 15)
    end = date.fromisoformat(args.end) if args.end else today - timedelta(days=1)
    started = datetime.now(timezone.utc)

    days = []
    d = start
    while d <= end:
        if FIRST_SEASON <= d.year and (3, 15) <= (d.month, d.day) <= (11, 10):
            days.append(d)
        d += timedelta(days=1)

    def read_day(day: date):
        raw = fetch_day(day)
        return None if raw is None or raw.empty else aggregate(raw)

    parts, n_days, seen, total_days = [], 0, 0, len(days)
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futs = [pool.submit(read_day, x) for x in days]
        for f in as_completed(futs):   # unordered, so progress never waits on one slow day
            p = f.result()
            seen += 1
            for m in (20, 40, 60, 80, 100):
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
    allc = pd.concat(parts, ignore_index=True).groupby(KEYS, as_index=False)[['pitches', 'swings', 'whiffs']].sum()

    rows = []
    for (season, ptype, hand), g in allc.groupby(['season', 'pitch_type', 'p_throws']):
        flat = g[['hb10', 'ivb10', 'pitches', 'swings', 'whiffs']].to_numpy(dtype=int).ravel().tolist()
        rows.append({
            'span': str(int(season)), 'coord_era': COORD_ERA, 'pitch_type': ptype, 'p_throws': hand,
            'n_pitches': int(g['pitches'].sum()), 'n_swings': int(g['swings'].sum()), 'n_whiffs': int(g['whiffs'].sum()),
            'cells': flat, 'updated_at': started.isoformat(),
        })
    spans = sorted({r['span'] for r in rows})
    print(f'\n{n_days} game days, {int(allc["pitches"].sum()):,} pitches -> {len(allc):,} occupied season x 0.1 in cells in {len(rows)} rows (seasons {spans})')
    print('5-row sample (most pitches):')
    show = sorted(rows, key=lambda r: -r['n_pitches'])[:5]
    print(pd.DataFrame([{**{k: v for k, v in r.items() if k != 'cells' and k != 'updated_at'}, 'cells': len(r['cells']) // 5} for r in show]).to_string(index=False))
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

    print(f'\nWriting {len(rows)} rows to pitch_shape_cells in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    for i, r in enumerate(rows, 1):
        sb.table('pitch_shape_cells').upsert(r, on_conflict='span,coord_era,pitch_type,p_throws').execute()   # one row per call: each is a large JSON array
        print(f'  wrote {i}/{len(rows)} rows ({i * 100 // len(rows)}%)', flush=True)
        for m in (20, 40, 60, 80, 100):
            if i * 100 >= m * len(rows) and (i - 1) * 100 < m * len(rows):
                print(f'MILESTONE writing {m}% ({i}/{len(rows)} rows)', flush=True)
    # The pooled rows from the first version of this table (span '2024-2026') are superseded by the per-season rows above.
    legacy = sb.table('pitch_shape_cells').delete().eq('span', LEGACY_SPAN).execute()
    print(f'  removed {len(legacy.data or [])} legacy pooled rows', flush=True)
    # Rows of these seasons this run did not touch are stale (a type/hand that vanished). Every row written above carries
    # updated_at = started, so only genuinely untouched rows are older. Refuse a mass delete.
    stale = sb.table('pitch_shape_cells').select('span', count='exact').in_('span', spans).eq('coord_era', COORD_ERA).lt('updated_at', started.isoformat()).limit(1).execute().count or 0
    if stale > max(3, len(rows) // 10):
        print(f'REFUSING to delete {stale} stale rows (only {len(rows)} written): something is wrong.')
        sys.exit(1)
    sb.table('pitch_shape_cells').delete().in_('span', spans).eq('coord_era', COORD_ERA).lt('updated_at', started.isoformat()).execute()
    print(f'  removed {stale} stale rows', flush=True)
    sb.table('cron_run_log').insert({
        'job': 'build_pitch_shape_cells', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
        'rows_written': len(rows), 'status': 'ok', 'note': f'{n_days} game days, seasons {spans}',
    }).execute()
    print('Done.')


if __name__ == '__main__':
    main()
