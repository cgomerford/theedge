"""
scripts/build_pitch_shape_results.py

Builds `pitch_shape_results` (league outcomes at 0.1-inch resolution on the movement map, one row per SEASON x pitch type x hand)
and `pitch_shape_results_pitcher` (each pitcher's own outcomes on each pitch type, per season). They sit behind the Pitch Shape Lab's
results heat map and Shape Score: what pitches at a given shape have produced (runs, wOBA, xwOBA, average, slugging, whiffs), and what a
pitcher's own pitch has produced against that.

TABLE OWNERSHIP: this script (via .github/workflows/shape-results.yml) is the ONLY writer of both tables, and of pitch_shape_pitcher_expected (each pitcher's ERA and xERA).

SOURCE: Baseball Savant statcast_search CSV, one game day per request, regular season, 2024..current, as build_pitch_shape_cells.py.
Columns checked against a live pull of 2026-09-15: events, woba_value, woba_denom, estimated_woba_using_speedangle, delta_run_exp,
description, pitcher, pfx_x, pfx_z. The hb / ivb conversion and the 0.1 in cell are identical to build_pitch_shape_cells.py.
Definitions (all described in the migration): a plate appearance is a pitch with woba_denom > 0; at-bats are hits plus the out events in
AB_EVENTS (walks, hit by pitch, sacrifices and interference are not at-bats); run value is delta_run_exp summed over pitches that have one.

USAGE
  python3 scripts/build_pitch_shape_results.py --expected-only        # just ERA / xERA from Savant's expected-statistics file (seconds), writes
  python3 scripts/build_pitch_shape_results.py                       # 2024..current, writes
  python3 scripts/build_pitch_shape_results.py --dry-run --start 2026-09-15 --end 2026-09-15
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
FIRST_SEASON = 2024
CONCURRENCY = 4
PITCH_TYPES = {'FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS', 'SV'}
SWING = {'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'}
WHIFF = {'swinging_strike', 'swinging_strike_blocked', 'missed_bunt'}
HIT_BASES = {'single': 1, 'double': 2, 'triple': 3, 'home_run': 4}
AB_EVENTS = set(HIT_BASES) | {'field_out', 'strikeout', 'strikeout_double_play', 'double_play', 'grounded_into_double_play', 'force_out',
                              'fielders_choice', 'fielders_choice_out', 'field_error', 'triple_play', 'other_out'}
USECOLS = ['pitch_type', 'p_throws', 'release_speed', 'pfx_x', 'pfx_z', 'description', 'game_date', 'pitcher', 'events',
           'woba_value', 'woba_denom', 'estimated_woba_using_speedangle', 'delta_run_exp']
SUMS = ['pitches', 'swings', 'whiffs', 'rv_n', 'rv', 'pa', 'ab', 'hits', 'tb', 'woba_den', 'woba_sum', 'xwoba_sum']
CELL_KEYS = ['season', 'pitch_type', 'p_throws', 'hb10', 'ivb10']
PITCHER_KEYS = ['season', 'pitcher', 'pitch_type', 'p_throws']
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


EXPECTED_URL = ('https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year={y}&position=&team=&filterType=bip&min=1&csv=true')


def fetch_expected(year: int) -> pd.DataFrame:
    """One season of Savant's expected statistics for pitchers with the minimum at 1 plate appearance (columns checked 2026-11-07: player_id, pa, bip, era, xera, woba, est_woba)."""
    r = http_get(EXPECTED_URL.format(y=year), total=90)
    text = r.content.decode('utf-8-sig')   # BOM-safe
    df = pd.read_csv(io.StringIO(text))
    need = {'player_id', 'pa', 'bip', 'era', 'xera', 'woba', 'est_woba'}
    if r.status_code != 200 or not need.issubset(df.columns):
        raise RuntimeError(f'expected-statistics file for {year} is not as expected (HTTP {r.status_code}, columns {list(df.columns)[:8]})')
    out = df[['player_id', 'pa', 'bip', 'era', 'xera', 'woba', 'est_woba']].copy()
    out.insert(0, 'season', year)
    return out


def write_expected(sb, frames: list, started) -> int:
    rows = []
    for f in frames:
        for r in f.itertuples(index=False):
            nz = lambda v: None if pd.isna(v) else round(float(v), 3)
            rows.append({'season': int(r.season), 'pitcher_id': int(r.player_id), 'pa': int(r.pa), 'bip': int(r.bip), 'era': nz(r.era), 'xera': nz(r.xera),
                         'woba': nz(r.woba), 'est_woba': nz(r.est_woba), 'updated_at': started.isoformat()})
    for i in range(0, len(rows), 500):
        sb.table('pitch_shape_pitcher_expected').upsert(rows[i:i + 500], on_conflict='season,pitcher_id').execute()
    return len(rows)


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    """One row per pitch with every summable measure; keys hb10 / ivb10 / season added."""
    df = df[df['pitch_type'].isin(PITCH_TYPES) & df['p_throws'].isin(['R', 'L'])]
    df = df.dropna(subset=['release_speed', 'pfx_x', 'pfx_z'])
    if df.empty:
        return pd.DataFrame()
    right = df['p_throws'] == 'R'
    hb = (-df['pfx_x'] * 12).where(right, df['pfx_x'] * 12)
    desc, ev = df['description'], df['events']
    den = df['woba_denom'].fillna(0).where(df['woba_denom'].fillna(0) > 0, 0)
    woba = df['woba_value'].fillna(0) * (den > 0)
    xw = df['estimated_woba_using_speedangle'].where(df['estimated_woba_using_speedangle'].notna(), df['woba_value']).fillna(0) * (den > 0)
    return pd.DataFrame({
        'season': pd.to_datetime(df['game_date']).dt.year.astype(int), 'pitcher': df['pitcher'].astype(int),
        'pitch_type': df['pitch_type'], 'p_throws': df['p_throws'],
        'hb10': np.floor(hb * 10 + 0.5).astype(int), 'ivb10': np.floor(df['pfx_z'] * 12 * 10 + 0.5).astype(int),
        'pitches': 1, 'swings': desc.isin(SWING).astype(int), 'whiffs': desc.isin(WHIFF).astype(int),
        'rv_n': df['delta_run_exp'].notna().astype(int), 'rv': df['delta_run_exp'].fillna(0),
        'pa': (den > 0).astype(int), 'ab': ev.isin(AB_EVENTS).astype(int), 'hits': ev.isin(HIT_BASES).astype(int),
        'tb': ev.map(HIT_BASES).fillna(0).astype(int), 'woba_den': den, 'woba_sum': woba, 'xwoba_sum': xw,
    })


def aggregate(df: pd.DataFrame):
    p = prepare(df)
    if p.empty:
        return None
    return p.groupby(CELL_KEYS, as_index=False)[SUMS].sum(), p.groupby(PITCHER_KEYS, as_index=False)[SUMS].sum()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--start')
    ap.add_argument('--end')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--wait', type=int, default=10, help='seconds to abort (Ctrl-C) before the upsert')
    ap.add_argument('--expected-only', action='store_true', help='only refresh ERA / xERA from Savant\'s expected-statistics file')
    args = ap.parse_args()

    if args.expected_only:
        year_now = date.today().year
        frames = [fetch_expected(y) for y in range(FIRST_SEASON, year_now + 1)]
        allx = pd.concat(frames, ignore_index=True)
        print(f'{len(allx):,} pitcher x season rows; xERA present on {int(allx["xera"].notna().sum()):,}')
        print('5-row sample (most PA):')
        print(allx.sort_values('pa', ascending=False).head(5).to_string(index=False))
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
        print(f'\nWriting {len(allx)} rows to pitch_shape_pitcher_expected in {args.wait}s. Ctrl-C to abort.')
        time.sleep(args.wait)
        n_rows = write_expected(sb, frames, datetime.now(timezone.utc))
        print(f'  wrote {n_rows} rows')
        return

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

    cell_parts, pit_parts, n_days, seen, total_days = [], [], 0, 0, len(days)
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futs = [pool.submit(read_day, x) for x in days]
        for f in as_completed(futs):
            res = f.result()
            seen += 1
            for m in (20, 40, 60, 80, 100):
                if seen * 100 >= m * total_days and (seen - 1) * 100 < m * total_days:
                    print(f'MILESTONE reading {m}% ({seen}/{total_days} days)', flush=True)
            if res is None:
                continue
            cell_parts.append(res[0]); pit_parts.append(res[1])
            n_days += 1
            if n_days % 20 == 0:
                print(f'  ...{n_days} game days read', flush=True)
    if not cell_parts:
        print('No data read; nothing to write.')
        sys.exit(1)
    cells = pd.concat(cell_parts, ignore_index=True).groupby(CELL_KEYS, as_index=False)[SUMS].sum()
    pits = pd.concat(pit_parts, ignore_index=True).groupby(PITCHER_KEYS, as_index=False)[SUMS].sum()

    rows = []
    for (season, ptype, hand), g in cells.groupby(['season', 'pitch_type', 'p_throws']):
        out = g[['hb10', 'ivb10', 'pitches', 'swings', 'whiffs', 'rv_n']].astype(int).copy()
        out['rv'] = np.round(g['rv'] * 1000).astype(int)
        for c in ('pa', 'ab', 'hits', 'tb'):
            out[c] = g[c].astype(int)
        out['woba_den'] = g['woba_den'].astype(int)
        out['woba_sum'] = np.round(g['woba_sum'] * 1000).astype(int)
        out['xwoba_sum'] = np.round(g['xwoba_sum'] * 1000).astype(int)
        flat = out[['hb10', 'ivb10', 'pitches', 'swings', 'whiffs', 'rv_n', 'rv', 'pa', 'ab', 'hits', 'tb', 'woba_den', 'woba_sum', 'xwoba_sum']].to_numpy(dtype=int).ravel().tolist()
        rows.append({'span': str(int(season)), 'coord_era': COORD_ERA, 'pitch_type': ptype, 'p_throws': hand,
                     'n_pitches': int(g['pitches'].sum()), 'cells': flat, 'updated_at': started.isoformat()})
    spans = sorted({r['span'] for r in rows})
    print(f'\n{n_days} game days, {int(cells["pitches"].sum()):,} pitches -> {len(cells):,} occupied season x 0.1 in cells in {len(rows)} rows (seasons {spans}); {len(pits):,} pitcher x pitch x season rows')
    print('5-row sample (most pitches), league cells:')
    print(pd.DataFrame([{k: v for k, v in r.items() if k not in ('cells', 'updated_at')} | {'cells': len(r['cells']) // 14} for r in sorted(rows, key=lambda r: -r['n_pitches'])[:5]]).to_string(index=False))
    print('5-row sample, pitchers (most pitches):')
    print(pits.sort_values('pitches', ascending=False).head(5).round(2).to_string(index=False))
    league = cells.groupby('season')[['pitches', 'rv_n', 'rv', 'pa', 'ab', 'hits', 'tb', 'woba_den', 'woba_sum']].sum()
    league['AVG'] = league['hits'] / league['ab']; league['SLG'] = league['tb'] / league['ab']; league['wOBA'] = league['woba_sum'] / league['woba_den']; league['rv/100'] = league['rv'] / league['rv_n'] * 100
    print('Sanity: league totals per season (AVG should be near .240, wOBA near .315, rv/100 near 0):')
    print(league[['pitches', 'AVG', 'SLG', 'wOBA', 'rv/100']].round(3).to_string())
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

    print(f'\nWriting {len(rows)} league rows and {len(pits)} pitcher rows in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    for i, r in enumerate(rows, 1):
        sb.table('pitch_shape_results').upsert(r, on_conflict='span,coord_era,pitch_type,p_throws').execute()   # one row per call: each is a large JSON array
        for m in (20, 40, 60, 80, 100):
            if i * 100 >= m * len(rows) and (i - 1) * 100 < m * len(rows):
                print(f'MILESTONE writing league rows {m}% ({i}/{len(rows)})', flush=True)
    prow = [{'season': int(r.season), 'pitcher_id': int(r.pitcher), 'pitch_type': r.pitch_type, 'p_throws': r.p_throws,
             'n_pitches': int(r.pitches), 'n_swings': int(r.swings), 'n_whiffs': int(r.whiffs), 'rv_n': int(r.rv_n), 'rv': round(float(r.rv), 3),
             'pa': int(r.pa), 'ab': int(r.ab), 'hits': int(r.hits), 'tb': int(r.tb), 'woba_den': float(r.woba_den),
             'woba_sum': round(float(r.woba_sum), 3), 'xwoba_sum': round(float(r.xwoba_sum), 3), 'updated_at': started.isoformat()}
            for r in pits.itertuples(index=False)]
    for i in range(0, len(prow), 500):
        sb.table('pitch_shape_results_pitcher').upsert(prow[i:i + 500], on_conflict='season,pitcher_id,pitch_type').execute()
        done = min(i + 500, len(prow))
        for m in (20, 40, 60, 80, 100):
            if done * 100 >= m * len(prow) and (done - 500 if done - 500 > 0 else 0) * 100 < m * len(prow):
                print(f'MILESTONE writing pitcher rows {m}% ({done}/{len(prow)})', flush=True)
    # Rows of these seasons this run did not touch are stale. Refuse a mass delete.
    stale = sb.table('pitch_shape_results').select('span', count='exact').in_('span', spans).eq('coord_era', COORD_ERA).lt('updated_at', started.isoformat()).limit(1).execute().count or 0
    if stale > max(3, len(rows) // 10):
        print(f'REFUSING to delete {stale} stale rows (only {len(rows)} written): something is wrong.')
        sys.exit(1)
    sb.table('pitch_shape_results').delete().in_('span', spans).eq('coord_era', COORD_ERA).lt('updated_at', started.isoformat()).execute()
    n_exp = write_expected(sb, [fetch_expected(y) for y in range(FIRST_SEASON, date.today().year + 1)], started)
    print(f'  wrote {n_exp} expected-statistics rows', flush=True)
    sb.table('cron_run_log').insert({
        'job': 'build_pitch_shape_results', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
        'rows_written': len(rows) + len(prow), 'status': 'ok', 'note': f'{n_days} game days, seasons {spans}',
    }).execute()
    print('Done.')


if __name__ == '__main__':
    main()
