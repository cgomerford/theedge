#!/usr/bin/env python3
"""
scripts/fetch_batter_pitch_splits.py

Populates `batter_pitch_type_splits` — batter performance broken down by
pitch type (BA, whiff%, xwOBA, hard-hit% vs sliders/four-seamers/etc).
This is the missing half of Component 5 (Matchup) documented in model.md:
we've had pitcher arsenal data for a while ("what does this pitcher throw
and how well") but never the lineup side ("how does this lineup hit that
specific pitch"). scout.ts joins the two to build Zone Clash rows.

SOURCE: Baseball Savant's Pitch Arsenal Stats leaderboard, batter mode.
Confirmed field names via curl 2026-08-12 (George's terminal, not
guessed — see chat). Raw CSV header:

  "last_name, first_name",player_id,team_name_alt,pitch_type,pitch_name,
  run_value_per_100,run_value,pitches,pitch_usage,pa,ba,slg,woba,
  whiff_percent,k_percent,put_away,est_ba,est_slg,est_woba,hard_hit_percent

Notes on the fields, since several are quoted-string numerics that need
explicit coercion (same trap as Supabase numeric columns returning as
strings — verified, not assumed, this time):
  - ba / slg / woba / est_ba / est_slg / est_woba come back as quoted
    strings ("0.331") in the sample row — float() them.
  - put_away is the correct field name — NOT put_away_percent (that was
    the earlier-discovered wrong guess on a different Savant endpoint;
    confirmed different here via the same curl).
  - pa is total plate appearances for THIS batter against THIS pitch
    type specifically — this is the sample-size gate. scout.ts's
    per-batter drill-down rows should not trust a pitch-type line with
    a thin pa count, same spirit as MIN_PUTAWAY_PITCH_COUNT there.

SCOPE: fetches the full leaderboard in one request (Savant serves all
qualifying batters across all pitch types per call — no per-player
rate-limiting concern like the MLB Stats API game-log calls in
fetch_player_form.py). Filtered to min_pa=10 per pitch type at the
source so we're not storing statistical noise from token appearances.

WRITE PATTERN: full clear-then-insert on `batter_pitch_type_splits`,
same spirit as fetch_player_form.py's clear_today() — this table has
no foreign key relying on row identity day-to-day, so a full replace
each run is safe and avoids stale pitch-type rows lingering for a
batter whose sample composition changed.

Target Python 3.9 compatible.
"""

from __future__ import annotations

import csv
import io
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').strip()
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing env vars: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

SAVANT_URL = (
    'https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats'
    '?type=batter&pitchType=&team=&min=10&year={season}&csv=true'
)

MIN_PA_TO_STORE = 10  # matches the `min=10` query param — belt and braces


def _float(v: Optional[str]) -> Optional[float]:
    if v is None:
        return None
    v = v.strip().strip('"')
    if v == '' or v == '—':
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _int(v: Optional[str]) -> Optional[int]:
    f = _float(v)
    return int(f) if f is not None else None


def fetch_savant_csv(season: int) -> list[dict]:
    url = SAVANT_URL.format(season=season)
    headers = {'User-Agent': 'Mozilla/5.0'}
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()

    # Savant's CSV export includes a UTF-8 BOM before the opening quote of
    # the first header field. Left in place, that breaks csv.DictReader's
    # quote detection on that field ('\ufeff"last_name' doesn't start with
    # a bare '"'), which shifts every column over by one — pa/player_id/etc
    # all read from the wrong field. utf-8-sig strips the BOM on decode.
    text = resp.content.decode('utf-8-sig')

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    print(f'Fetched {len(rows)} raw rows from Savant for season {season}')
    return rows


def build_row(raw: dict, season: int, today: str) -> Optional[dict]:
    pa = _int(raw.get('pa'))
    if pa is None or pa < MIN_PA_TO_STORE:
        return None

    player_id = _int(raw.get('player_id'))
    if player_id is None:
        return None

    name_field = raw.get('last_name, first_name') or ''
    if ',' in name_field:
        last, first = [p.strip() for p in name_field.split(',', 1)]
        player_name = f'{first} {last}'
    else:
        player_name = name_field.strip() or f'Player {player_id}'

    return {
        'player_id': player_id,
        'player_name': player_name,
        'team_abbr': (raw.get('team_name_alt') or '').strip() or None,
        'pitch_type': (raw.get('pitch_type') or '').strip() or None,
        'pitch_name': (raw.get('pitch_name') or '').strip() or None,
        'season': season,
        'pa': pa,
        'pitch_usage': _float(raw.get('pitch_usage')),
        'ba': _float(raw.get('ba')),
        'slg': _float(raw.get('slg')),
        'woba': _float(raw.get('woba')),
        'whiff_percent': _float(raw.get('whiff_percent')),
        'k_percent': _float(raw.get('k_percent')),
        'put_away': _float(raw.get('put_away')),
        'est_ba': _float(raw.get('est_ba')),
        'est_slg': _float(raw.get('est_slg')),
        'est_woba': _float(raw.get('est_woba')),
        'hard_hit_percent': _float(raw.get('hard_hit_percent')),
        'run_value_per_100': _float(raw.get('run_value_per_100')),
        'computed_date': today,
    }


def clear_table():
    # Full replace — see module docstring for why this is safe here.
    supa.table('batter_pitch_type_splits').delete().neq('player_id', -1).execute()


def save_rows(rows: list[dict]) -> int:
    if not rows:
        return 0
    CHUNK = 500
    saved = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        try:
            supa.table('batter_pitch_type_splits').insert(chunk).execute()
            saved += len(chunk)
        except Exception as e:
            print(f'  ERROR saving chunk {i}-{i+len(chunk)}: {e}')
    return saved


def main():
    season = datetime.now(timezone.utc).year
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    print(f'Fetching batter pitch-type splits for season {season}...')
    raw_rows = fetch_savant_csv(season)

    if not raw_rows:
        print('No rows returned from Savant — aborting without touching the table.')
        sys.exit(1)

    built = [build_row(r, season, today) for r in raw_rows]
    built = [r for r in built if r is not None]
    dropped = len(raw_rows) - len(built)

    print(f'Built {len(built)} usable rows ({dropped} dropped: missing PA/player_id or below min PA)')

    # Sanity check + abort window, same convention as other scripts here.
    if len(built) < 500:
        print(f'\n⚠️  Only {len(built)} rows — expected several thousand '
              f'(30 teams × ~13 batters × ~4-6 pitch types each).')
        print('This looks short. Ctrl+C within 10s to abort, or wait to proceed anyway.')
        import time
        time.sleep(10)

    print('\nClearing existing table...')
    clear_table()

    print(f'Saving {len(built)} rows...')
    saved = save_rows(built)

    mark = '✓' if saved == len(built) else ('⚠' if saved > 0 else '✗')
    print(f'\n{mark} Done — {saved} of {len(built)} rows saved'
          + ('' if saved == len(built) else ' (see ERROR lines above)'))


if __name__ == '__main__':
    main()