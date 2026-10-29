"""
scripts/build_pitch_shape_bins.py

Builds `pitch_shape_bins`: league pitch counts per shape bin (velocity x induced vertical break x
horizontal break x arm-angle band), the cached table the Pitch Shape Lab and Shape Sandbox read.
Pages never compute this; they read these rows.

TABLE OWNERSHIP: this script (via .github/workflows/shape-bins.yml) is the ONLY writer of
pitch_shape_bins. Nothing else may write it.

SOURCE: Baseball Savant statcast_search CSV, one regular-season day per request (a day is ~4-5k rows,
under Savant's 25k-row cap). Field names, units and `description` strings were verified against a
live pull of 2026-09-15 (docs/fields/savant_2026-09-15.json + a curl of the same day):
  - pfx_x, pfx_z are in FEET. pfx_x is from the catcher's view: RHP four-seams average about -0.63,
    LHP about +0.65. Arm-side-positive horizontal break (inches) is therefore
    -pfx_x*12 for RHP and +pfx_x*12 for LHP (left-handers flipped, as the app expects).
  - pfx_z*12 = induced vertical break in inches (four-seam averages ~15.5).
  - arm_angle is degrees (blank on ~0.5% of rows; those rows are skipped).
  - description values: swinging_strike, swinging_strike_blocked, foul, foul_tip, hit_into_play,
    foul_bunt, missed_bunt, called_strike (+ balls etc.).

CONTRACT with the app (src/lib/pitch-shape/model.ts BIN_WIDTH and data.ts constants):
  span = '2024-2026', coord_era = '2026' (one era for now), velo bin = round(mph / 1),
  ivb bin = round(in / 2), hb bin = round(in / 2), slot bin = floor(arm_angle / 10) clipped to 0..9.
  "round" is round-half-up (floor(x + 0.5)) to match JavaScript's Math.round.

DEFINITIONS (note: deliberately differs from the first draft of the migration comment, which
counted every row with a launch_speed. Live data showed that includes foul balls: 1,465 rows with
launch_speed vs 764 balls in play on one day, so xwOBA on contact and GB% would have been wrong):
  n_pitches        every pitch row in the bin (regular season, standard pitch types)
  n_swings         swinging_strike, swinging_strike_blocked, foul, foul_tip, hit_into_play,
                   foul_bunt, missed_bunt
  n_whiffs         swinging_strike, swinging_strike_blocked, missed_bunt
  n_called_strikes called_strike
  n_csw            called_strike + whiffs
  n_bbe            balls in play (description = hit_into_play) that have an
                   estimated_woba_using_speedangle (drops ~1%: bunts / untracked)
  xwoba_con_sum    SUM(estimated_woba_using_speedangle) over those BBE
  n_hard_hit       those BBE with launch_speed >= 95
  n_gb             those BBE with bb_type = 'ground_ball'

Runs weekly (see workflow) because it re-reads every day of the span (~550 days, 4 at a time). Rows are upserted, then rows of
this span/era not touched by this run are deleted, so a page never sees an empty table mid-run.

USAGE
  python3 scripts/build_pitch_shape_bins.py                    # full 2024..current, writes
  python3 scripts/build_pitch_shape_bins.py --dry-run --start 2026-09-15 --end 2026-09-15
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import io
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

SPAN = '2024-2026'
COORD_ERA = '2026'
FIRST_SEASON = 2024
CONCURRENCY = 4
PITCH_TYPES = {'FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS', 'SV'}
SWING = {'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'}
WHIFF = {'swinging_strike', 'swinging_strike_blocked', 'missed_bunt'}
USECOLS = ['pitch_type', 'p_throws', 'release_speed', 'pfx_x', 'pfx_z', 'arm_angle', 'description',
           'launch_speed', 'estimated_woba_using_speedangle', 'bb_type']
KEYS = ['pitch_type', 'p_throws', 'velo_bin', 'ivb_bin', 'hb_bin', 'slot_bin']
SUMS = ['n_pitches', 'n_swings', 'n_whiffs', 'n_called_strikes', 'n_csw', 'n_bbe', 'xwoba_con_sum', 'n_hard_hit', 'n_gb']
PK = 'span,pitch_type,p_throws,velo_bin,ivb_bin,hb_bin,slot_bin,coord_era'
URL = ('https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C'
       '&game_date_gt={d}&game_date_lt={d}&player_type=pitcher')


def half_up(x: pd.Series) -> pd.Series:
    return np.floor(x + 0.5).astype(int)  # floor(x + 0.5), same as JS Math.round


def fetch_day(d: date) -> pd.DataFrame | None:
    for attempt in range(4):
        try:
            r = requests.get(URL.format(d=d.isoformat()), timeout=120)
            text = r.content.decode('utf-8-sig')  # Savant CSVs can carry a BOM that corrupts the first header
            if r.status_code == 200 and text.lstrip('"').startswith('pitch_type'):
                return pd.read_csv(io.StringIO(text), usecols=lambda c: c in USECOLS)
            if r.status_code == 200 and len(text) < 500:
                return None  # off day: empty body
            print(f'  {d}: unexpected response (HTTP {r.status_code}, {len(text)} bytes), retry {attempt + 1}')
        except requests.RequestException as e:
            print(f'  {d}: {e}, retry {attempt + 1}')
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'could not fetch {d} after 4 tries')  # fail loudly: a silent gap would skew the bins


def aggregate(df: pd.DataFrame) -> pd.DataFrame:
    df = df[df['pitch_type'].isin(PITCH_TYPES) & df['p_throws'].isin(['R', 'L'])]
    df = df.dropna(subset=['release_speed', 'pfx_x', 'pfx_z', 'arm_angle'])
    if df.empty:
        return pd.DataFrame(columns=KEYS + SUMS)
    right = df['p_throws'] == 'R'
    hb_in = (-df['pfx_x'] * 12).where(right, df['pfx_x'] * 12)  # arm-side positive
    out = pd.DataFrame({
        'pitch_type': df['pitch_type'], 'p_throws': df['p_throws'],
        'velo_bin': half_up(df['release_speed'] / 1),
        'ivb_bin': half_up(df['pfx_z'] * 12 / 2),
        'hb_bin': half_up(hb_in / 2),
        'slot_bin': (df['arm_angle'] // 10).clip(0, 9).astype(int),
    })
    desc = df['description']
    whiff = desc.isin(WHIFF)
    called = desc == 'called_strike'
    bbe = (desc == 'hit_into_play') & df['estimated_woba_using_speedangle'].notna()
    out['n_pitches'] = 1
    out['n_swings'] = desc.isin(SWING).astype(int)
    out['n_whiffs'] = whiff.astype(int)
    out['n_called_strikes'] = called.astype(int)
    out['n_csw'] = (whiff | called).astype(int)
    out['n_bbe'] = bbe.astype(int)
    out['xwoba_con_sum'] = df['estimated_woba_using_speedangle'].where(bbe, 0).fillna(0)
    out['n_hard_hit'] = (bbe & (df['launch_speed'] >= 95)).astype(int)
    out['n_gb'] = (bbe & (df['bb_type'] == 'ground_ball')).astype(int)
    return out.groupby(KEYS, as_index=False)[SUMS].sum()


def days(start: date, end: date, seasons: list[int]):
    d = start
    while d <= end:
        # regular season only: March..early November covers every season's regular-season window
        if d.year in seasons and (3, 15) <= (d.month, d.day) <= (11, 10):
            yield d
        d += timedelta(days=1)


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
    seasons = list(range(FIRST_SEASON, today.year + 1))
    started = datetime.now(timezone.utc)

    # One request is ~3 MB and ~8-15 s, so reading ~550 days one at a time takes ~3 hours. Four at a
    # time (CONCURRENCY) keeps it under an hour without hammering Savant. Order does not matter:
    # every day is summed into the same bins.
    def read_day(d: date) -> pd.DataFrame | None:
        raw = fetch_day(d)
        return None if raw is None or raw.empty else aggregate(raw)

    parts: list[pd.DataFrame] = []
    n_days = 0
    all_days = list(days(start, end, seasons))
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        for agg in pool.map(read_day, all_days):
            if agg is None:
                continue
            parts.append(agg)
            n_days += 1
            if n_days % 20 == 0:
                print(f'  ...{n_days} game days read', flush=True)
    if not parts:
        print('No data read; nothing to write.')
        sys.exit(1)
    bins = pd.concat(parts).groupby(KEYS, as_index=False)[SUMS].sum()
    bins['xwoba_con_sum'] = bins['xwoba_con_sum'].round(4)
    print(f'\n{n_days} game days -> {len(bins):,} bins, {int(bins.n_pitches.sum()):,} pitches')
    print(bins.groupby(['pitch_type', 'p_throws'])[['n_pitches', 'n_swings', 'n_whiffs', 'n_bbe']].sum().to_string())
    print('\n5-row sample (largest bins):')
    print(bins.sort_values('n_pitches', ascending=False).head(5).to_string(index=False))
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

    print(f'\nWriting {len(bins):,} rows to pitch_shape_bins (span={SPAN}, coord_era={COORD_ERA}) in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)

    bins['span'] = SPAN
    bins['coord_era'] = COORD_ERA
    bins['updated_at'] = started.isoformat()
    records = bins.astype(object).to_dict('records')
    for i in range(0, len(records), 1000):
        sb.table('pitch_shape_bins').upsert(records[i:i + 1000], on_conflict=PK).execute()
        if (i // 1000) % 50 == 0:
            print(f'  upserted {min(i + 1000, len(records)):,}/{len(records):,}')
    # Rows of this span/era this run did not touch are stale (a bin that no longer has pitches).
    sb.table('pitch_shape_bins').delete().eq('span', SPAN).eq('coord_era', COORD_ERA).lt('updated_at', started.isoformat()).execute()
    sb.table('cron_run_log').insert({
        'job': 'build_pitch_shape_bins', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
        'rows_written': len(records), 'status': 'ok', 'note': f'{n_days} game days, span {SPAN}',
    }).execute()
    print('Done.')


if __name__ == '__main__':
    main()
