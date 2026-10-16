"""
models/src/fetch_pitches.py

Pull Baseball Savant pitch-level data, one day at a time, into Parquet.

TABLE / FILE OWNERSHIP (single writer):
  models/data/days_{season}/YYYY-MM-DD.parquet   <- this script and nothing else
  models/data/pitches_{season}.parquet           <- this script and nothing else
Everything else (features.py, the fo sync scripts, future model training) only READS them.

Source (curl-verified 2026-10-15, 119 columns, one row per pitch, UTF-8 BOM on line 1):
  https://baseballsavant.mlb.com/statcast_search/csv
    ?all=true&hfGT=R%7C&hfSea={season}%7C&player_type=pitcher
    &game_date_gt={d}&game_date_lt={d}&type=details
A single day is about 4,300 pitches; Savant caps a request at 25,000 rows, so a day can
never be truncated (the script still refuses a response that hits the cap).

Idempotent: a day that already has a file is skipped, except the most recent
--refresh-days days, which are re-pulled because Savant corrects recent data.
Days with no games are recorded as an empty marker file so they are not re-requested.

Usage (from the repo root):
  models/venv/bin/python models/src/fetch_pitches.py --season 2026
  models/venv/bin/python models/src/fetch_pitches.py --season 2026 --start 2026-09-01 --end 2026-09-30
"""
from __future__ import annotations

import argparse
import io
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
URL = 'https://baseballsavant.mlb.com/statcast_search/csv'
ROW_CAP = 25000

# Columns kept (all confirmed present in the live 2026 header). Everything else is dropped to
# keep a season file small; add a name here, then re-run with --refresh-all, to keep more.
KEEP_TEXT = [
    'pitch_type', 'game_date', 'player_name', 'events', 'description', 'des', 'game_type', 'stand',
    'p_throws', 'home_team', 'away_team', 'type', 'bb_type', 'inning_topbot',
]
KEEP_NUM = [
    'game_pk', 'pitcher', 'batter', 'inning', 'outs_when_up', 'balls', 'strikes', 'at_bat_number',
    'pitch_number', 'n_thruorder_pitcher', 'zone', 'plate_x', 'plate_z', 'sz_top', 'sz_bot',
    'release_speed', 'effective_speed', 'release_spin_rate', 'spin_axis', 'pfx_x', 'pfx_z',
    'release_pos_x', 'release_pos_y', 'release_pos_z', 'release_extension', 'arm_angle',
    'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az', 'launch_speed', 'launch_angle',
    'estimated_woba_using_speedangle', 'woba_value', 'woba_denom', 'delta_run_exp',
    'bat_speed', 'swing_length', 'attack_angle', 'swing_path_tilt', 'age_pit',
]


def fetch_day(d: date, tries: int = 4) -> pd.DataFrame | None:
    """Return that day's pitches (possibly empty), or None if every retry failed."""
    params = {
        'all': 'true', 'hfGT': 'R|', 'hfSea': f'{d.year}|', 'player_type': 'pitcher',
        'game_date_gt': d.isoformat(), 'game_date_lt': d.isoformat(), 'type': 'details',
    }
    for attempt in range(tries):
        try:
            r = requests.get(URL, params=params, timeout=120, headers={'User-Agent': 'Mozilla/5.0'})
            text = r.content.decode('utf-8-sig')  # strips the BOM that corrupts the first header
            if r.status_code != 200 or not text.lstrip().startswith('"pitch_type"'):
                print(f'[fetch_day] {d} http={r.status_code} not a CSV (attempt {attempt + 1})')
            else:
                df = pd.read_csv(io.StringIO(text), dtype=str, na_values=['', 'null', 'NA'], keep_default_na=False)
                if len(df) >= ROW_CAP:
                    print(f'[fetch_day] {d} returned {len(df)} rows = the request cap; refusing a truncated day')
                    return None
                return df
        except requests.RequestException as e:
            print(f'[fetch_day] {d} {type(e).__name__} (attempt {attempt + 1})')
        time.sleep(2 * (attempt + 1))
    return None


# Columns that did not exist in older seasons (arm angle from 2024, bat tracking from 2023-25). Missing ones are
# stored as empty (NaN), never filled; every other kept column must be present or the day is rejected loudly.
OPTIONAL = {'arm_angle', 'bat_speed', 'swing_length', 'attack_angle', 'swing_path_tilt', 'n_thruorder_pitcher', 'age_pit'}
_warned: set[str] = set()


def tidy(df: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in KEEP_TEXT + KEEP_NUM if c not in df.columns]
    hard = [c for c in missing if c not in OPTIONAL]
    if hard:
        raise RuntimeError(f'[tidy] Savant response is missing expected columns: {hard}')
    for c in missing:
        if c not in _warned:
            _warned.add(c)
            print(f'[tidy] optional column {c} absent in this response; stored as empty')
        df = df.assign(**{c: np.nan})
    out = df[KEEP_TEXT + KEEP_NUM].copy()
    for c in KEEP_NUM:
        out[c] = pd.to_numeric(out[c], errors='coerce')
    out['game_date'] = pd.to_datetime(out['game_date']).dt.date
    return out


def build_season(season: int, start: date, end: date, refresh_days: int, refresh_all: bool) -> int:
    day_dir = DATA / f'days_{season}'
    day_dir.mkdir(parents=True, exist_ok=True)
    refresh_from = date.today() - timedelta(days=refresh_days)
    failed: list[date] = []
    fetched = skipped = empty = 0

    d = start
    while d <= end:
        f, marker = day_dir / f'{d}.parquet', day_dir / f'{d}.empty'
        have = f.exists() or marker.exists()
        if have and not refresh_all and d < refresh_from:
            skipped += 1
        else:
            df = fetch_day(d)
            if df is None:
                failed.append(d)
            elif df.empty:
                f.unlink(missing_ok=True)
                marker.touch()
                empty += 1
            else:
                marker.unlink(missing_ok=True)
                tidy(df).to_parquet(f, index=False)
                fetched += 1
                print(f'[fetch] {d} {len(df)} pitches')
            time.sleep(1.0)  # be polite to Savant
        d += timedelta(days=1)

    files = sorted(day_dir.glob('*.parquet'))
    if not files:
        print(f'[build_season] no day files for {season}; nothing combined')
    else:
        season_df = pd.concat((pd.read_parquet(p) for p in files), ignore_index=True)
        season_df = season_df.drop_duplicates(['game_pk', 'at_bat_number', 'pitch_number', 'pitcher'])
        season_df = season_df.sort_values(['game_date', 'game_pk', 'at_bat_number', 'pitch_number'])
        out = DATA / f'pitches_{season}.parquet'
        tmp = out.with_suffix('.tmp')
        season_df.to_parquet(tmp, index=False)
        tmp.replace(out)  # atomic: a failed run never leaves a half-written season file
        print(f'[build_season] wrote {out.name}: {len(season_df):,} pitches, '
              f'{season_df.game_date.min()} to {season_df.game_date.max()}')

    print(f'\nSummary: fetched={fetched} skipped(cached)={skipped} no-game days={empty} failed={len(failed)}')
    if failed:
        print('FAILED DAYS (re-run to retry):', ', '.join(str(x) for x in failed))
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--season', type=int, required=True)
    ap.add_argument('--start', type=date.fromisoformat, default=None)
    ap.add_argument('--end', type=date.fromisoformat, default=None)
    ap.add_argument('--refresh-days', type=int, default=3)
    ap.add_argument('--refresh-all', action='store_true')
    a = ap.parse_args()
    start = a.start or date(a.season, 3, 15)
    end = a.end or min(date(a.season, 11, 15), date.today() - timedelta(days=1))
    print(f'Fetching {start} to {end} (regular season only)')
    return build_season(a.season, start, end, a.refresh_days, a.refresh_all)


if __name__ == '__main__':
    sys.exit(main())
