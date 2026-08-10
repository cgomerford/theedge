"""
fetch_pitch_arsenals.py  —  v2

Fetches pitch arsenal stats for every pitcher from Baseball Savant's
direct CSV endpoint and writes to Supabase pitch_arsenals table.

v2 change: replaces pybaseball's statcast_pitcher_arsenal_stats() with
a direct fetch from Savant's /leaderboard/pitch-arsenal-stats endpoint.
This endpoint returns EXACTLY the numbers shown on Savant's Pitch Tracking
page (whiff%, put-away%, xwOBA, BA, etc.) — pybaseball returned slightly
different aggregated values, causing scout report numbers to diverge from
what users saw when they cross-checked on baseballsavant.mlb.com.

The endpoint returns one row per (pitcher × pitch_type × year). We fetch
all pitchers in a single request (min=0, no team filter) and upsert the
full season's data in one go.

Usage:
    python3 scripts/fetch_pitch_arsenals.py

Environment:
    SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import io
import os
import sys
import time
import csv
import requests
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── Pitch name lookup ────────────────────────────────────────────────
PITCH_NAMES = {
    'FF': '4-Seam Fastball', 'SI': 'Sinker',    'FC': 'Cutter',
    'SL': 'Slider',          'ST': 'Sweeper',   'SV': 'Slurve',
    'CU': 'Curveball',       'KC': 'Knuckle Curve',
    'CH': 'Changeup',        'FS': 'Splitter',  'FO': 'Forkball',
    'SC': 'Screwball',       'KN': 'Knuckleball', 'EP': 'Eephus',
}

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/csv,*/*',
    'Referer': 'https://baseballsavant.mlb.com/',
}

# ─── Savant arsenal endpoint ──────────────────────────────────────────
#
# This is the SAME endpoint that powers the Pitch Tracking table at:
# https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats
#
# Key parameters:
#   type=pitcher   — pitcher POV (not batter)
#   pitchType=     — empty = all pitch types in one response
#   year=YYYY      — season
#   team=          — empty = all teams
#   min=0          — minimum PA = 0, so we get everyone (no qualifier cutoff)
#
# The CSV has one row per (pitcher × pitch_type). It includes:
#   player_id, last_name, first_name, pitch_type, year,
#   pitches (#), pa, avg_speed, whiff_percent, put_away, est_woba,
#   hard_hit_percent, ba, plus many others.
#
# NOTE: pitch_usage (%) is NOT a column — we compute it from
#   (pitches for this pitch_type) / (total pitches for this pitcher).

SAVANT_ARSENAL_URL = (
    'https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats'
    '?type=pitcher&pitchType=&year={year}&team=&min=0&csv=true'
)


def fetch_arsenal_csv(year: int) -> list:
    url = SAVANT_ARSENAL_URL.format(year=year)
    print('  Fetching: {}'.format(url))
    resp = requests.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()

    # ADD THIS LINE: 'utf-8-sig' automatically handles and removes the BOM (\ufeff)
    resp.encoding = 'utf-8-sig'

    if resp.text.strip().startswith('<!DOCTYPE') or resp.text.strip().startswith('<html'):
        raise ValueError('Savant returned HTML instead of CSV — likely rate-limited. Wait 30s and retry.')

    reader = csv.DictReader(io.StringIO(resp.text))
    rows = list(reader)
    print('  -> {} rows from Savant (before filtering)'.format(len(rows)))
    return rows


def safe_float(val) -> Optional[float]:
    if val is None or val == '' or val == 'null':
        return None
    try:
        f = float(val)
        return None if f != f else f  # NaN guard
    except (ValueError, TypeError):
        return None


def safe_int(val) -> Optional[int]:
    f = safe_float(val)
    return int(f) if f is not None else None


def format_name(raw) -> Optional[str]:
    """Savant returns 'Last, First' — invert to 'First Last'."""
    if not raw:
        return None
    s = str(raw).strip()
    if ',' in s:
        last, first = s.split(',', 1)
        return '{} {}'.format(first.strip(), last.strip())
    return s


def build_rows(csv_rows: list, year: int) -> list:
    """
    Transform raw Savant CSV rows -> Supabase pitch_arsenals rows.

    Column mapping (Savant CSV header -> Supabase column):
        player_id             -> player_id
        last_name, first_name -> player_name  (inverted)
        pitch_type            -> pitch_type
        pitch_name            -> pitch_name   (or looked up from PITCH_NAMES)
        year                  -> season
        pitches               -> count        (raw pitch count this season)
        avg_speed             -> avg_velocity
        whiff_percent         -> whiff_percent
        put_away              -> put_away_percent   NOTE: column is 'put_away' not 'put_away_percent'
        est_woba              -> est_woba
        hard_hit_percent      -> hard_hit_percent
        ba                    -> ba_against         NOTE: column is 'ba' not 'ba_against'

    Usage % computed from: count_for_pitch / total_count_for_pitcher * 100
    """

    # Step 1: load all rows, compute per-pitcher total pitch count
    pitcher_totals = {}
    parsed = []

    for r in csv_rows:
        pid = safe_int(r.get('player_id') or r.get('pitcher_id'))
        if pid is None:
            continue

        pitch_type = str(r.get('pitch_type') or r.get('pitchType') or '').strip().upper()
        if not pitch_type:
            continue

        count = safe_int(r.get('pitches') or r.get('count') or 0) or 0
        pitcher_totals[pid] = pitcher_totals.get(pid, 0) + count
        parsed.append({'_pid': pid, '_pt': pitch_type, '_count': count, '_raw': r})

    # Step 2: build output rows
    out = []
    for item in parsed:
        pid = item['_pid']
        pt  = item['_pt']
        cnt = item['_count']
        r   = item['_raw']

        total = pitcher_totals.get(pid, 0)
        usage = round((cnt / total * 100), 2) if total > 0 else 0.0

        # Try both the combined column and separate first/last columns
        name_raw = (
            r.get('last_name, first_name')
            or r.get('player_name')
            or r.get('name')
        )
        if not name_raw:
            last = r.get('last_name', '') or ''
            first = r.get('first_name', '') or ''
            if last or first:
                name_raw = '{}, {}'.format(last.strip(), first.strip())

        pitch_name_raw = r.get('pitch_name') or PITCH_NAMES.get(pt, pt)

        row = {
            'player_id':   pid,
            'player_name': format_name(name_raw),
            'season':      year,
            'pitch_type':  pt,
            'pitch_name':  pitch_name_raw,
            'count':       cnt,
            'percentage':  usage,
        }

        # Velocity
        velo = safe_float(r.get('avg_speed') or r.get('velocity') or r.get('avg_velocity'))
        if velo is not None:
            row['avg_velocity'] = round(velo, 1)

        # Whiff % — Savant returns whole number (e.g. 48.0)
        whiff = safe_float(r.get('whiff_percent') or r.get('whiff_pct'))
        if whiff is not None:
            row['whiff_percent'] = round(whiff, 2)

        # Put-away % — column is 'put_away' on Savant (NOT 'put_away_percent')
        put_away = safe_float(r.get('put_away') or r.get('put_away_percent') or r.get('put_away_pct'))
        if put_away is not None:
            row['put_away_percent'] = round(put_away, 2)

        # xwOBA — stored as decimal (e.g. 0.181)
        est_woba = safe_float(r.get('est_woba') or r.get('xwoba'))
        if est_woba is not None:
            row['est_woba'] = round(est_woba, 4)

        # Hard-hit %
        hard_hit = safe_float(r.get('hard_hit_percent') or r.get('hard_hit_pct'))
        if hard_hit is not None:
            row['hard_hit_percent'] = round(hard_hit, 2)

        # BA against — column is 'ba' on Savant (NOT 'ba_against')
        ba = safe_float(r.get('ba') or r.get('ba_against') or r.get('batting_avg'))
        if ba is not None:
            row['ba_against'] = round(ba, 4)

        out.append(row)

    return out


def upsert_rows(rows: list, batch_size: int = 500) -> None:
    total = len(rows)
    upserted = 0
    errors = 0

    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        try:
            supabase.table('pitch_arsenals').upsert(
                batch,
                on_conflict='player_id,season,pitch_type',
            ).execute()
            upserted += len(batch)
            print('  Upserted {}/{}...'.format(upserted, total))
        except Exception as e:
            print('  Batch {}–{} failed: {}'.format(i, i + batch_size, e))
            errors += len(batch)
        time.sleep(0.1)

    print('\n  Done — {} rows upserted, {} errors'.format(upserted, errors))


def main():
    season = datetime.now().year
    print('\nFetching Savant pitch arsenal stats for {}...\n'.format(season))

    try:
        csv_rows = fetch_arsenal_csv(season)
    except Exception as e:
        print('Fetch failed: {}'.format(e))
        sys.exit(1)

    if not csv_rows:
        print('No rows returned from Savant.')
        sys.exit(1)

    # Print CSV headers so we can see what Savant is actually returning
    print('\nCSV headers: {}\n'.format(list(csv_rows[0].keys())))

    rows = build_rows(csv_rows, season)

    if not rows:
        print('No rows parsed — check CSV headers above. Savant may have changed their format.')
        sys.exit(1)

    # Sanity check before touching Supabase
    print('Sample rows (check these match baseballsavant.mlb.com before confirming upsert):')
    for s in rows[:5]:
        print(
            '  {} | {} | {}% usage | whiff {} | put_away {} | est_woba {} | hard_hit {} | ba {}'.format(
                s.get('player_name'),
                s.get('pitch_type'),
                s.get('percentage'),
                s.get('whiff_percent'),
                s.get('put_away_percent'),
                s.get('est_woba'),
                s.get('hard_hit_percent'),
                s.get('ba_against'),
            )
        )

    print('\nAbout to upsert {} rows. Ctrl-C now to abort.'.format(len(rows)))
    time.sleep(3)

    print('\nUpserting {} rows to Supabase pitch_arsenals...\n'.format(len(rows)))
    upsert_rows(rows)


if __name__ == '__main__':
    main()