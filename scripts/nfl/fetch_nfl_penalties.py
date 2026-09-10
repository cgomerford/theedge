#!/usr/bin/env python3
"""
scripts/fetch_nfl_penalties.py

DO NOT RUN THIS FOR REAL until scripts/verify_penalty_columns.py has been
run and its output confirms the column names below actually match your
installed nflreadpy version. This script is written against the commonly
documented nflverse pbp schema (penalty, penalty_team, penalty_yards),
which I have not personally curl/live-verified -- flagging that honestly
rather than presenting it as confirmed.

Aggregates penalty count + yards per team per week from load_pbp(),
writes to nfl_team_penalties_weekly (see nfl_team_penalties_schema.sql --
run that in Supabase before the first upsert).

Run: python3 scripts/fetch_nfl_penalties.py --season 2026
Schedule: same cadence as fetch_nfl_team_stats.py -- weekly during season,
this is post-game box-score-derived data, not something that changes
mid-week.
"""
import os
import sys
import argparse
import time
from pathlib import Path

import nflreadpy as nfl
import polars as pl
from dotenv import load_dotenv
from supabase import create_client

# Dual dotenv fallback -- matches every other script in this project
def _find_env_file() -> Path | None:
    here = Path(__file__).resolve()
    for candidate_dir in [here.parent, *here.parents]:
        candidate = candidate_dir / '.env.local'
        if candidate.exists():
            return candidate
    return None
 
ENV_PATH = _find_env_file()
if ENV_PATH:
    load_dotenv(ENV_PATH)
else:
    print('WARNING: .env.local not found by walking up from this script — relying on already-exported env vars, if any.')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing Supabase env vars — cannot write. Check .env.local.')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--season', type=int, required=True)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    print(f'Loading play-by-play for {args.season}...')
    pbp = nfl.load_pbp(seasons=[args.season])

    # ── VERIFY THESE COLUMN NAMES AGAINST verify_penalty_columns.py's
    # output before trusting this filter/select. Written against the
    # commonly documented nflverse schema, not personally confirmed. ──
    required_cols = {'penalty', 'penalty_team', 'penalty_yards', 'week', 'season_type'}
    missing = required_cols - set(pbp.columns)
    if missing:
        print(f'ERROR: expected columns not found in pbp: {missing}')
        print('Run scripts/verify_penalty_columns.py first and adjust this script to match reality.')
        sys.exit(1)

    penalties = pbp.filter(pbp['penalty'] == 1)
    grouped = (
        penalties
        .group_by(['penalty_team', 'season', 'week', 'season_type'])
        .agg([
            pl.len().alias('penalties'),
            pl.col('penalty_yards').sum().alias('penalty_yards'),
        ])
    )
 
    rows = grouped.to_dicts()

    if not rows:
        print('No penalty rows computed — aborting before touching the table.')
        sys.exit(1)

    print(f'\nSample rows (first 5 of {len(rows)}):')
    for r in rows[:5]:
        print(f"  {r.get('penalty_team')} wk{r.get('week')}: "
              f"{r.get('penalties')} penalties, {r.get('penalty_yards')} yds")

    if args.dry_run:
        print('\n--dry-run set — not writing to Supabase.')
        return

    print(f'\nAbout to upsert {len(rows)} rows to nfl_team_penalties_weekly. Ctrl+C within 5 seconds to abort...')
    time.sleep(5)

    upsert_rows = [
        {
            'team_id': r['penalty_team'],
            'season': int(r['season']),
            'week': int(r['week']),
            'season_type': r['season_type'],
            'penalties': int(r['penalties']),
            'penalty_yards': int(r['penalty_yards']),
        }
        for r in rows
        if r.get('penalty_team')  # drop rows with no team attributed (e.g. some pre-snap penalties)
    ]

    BATCH = 100
    for i in range(0, len(upsert_rows), BATCH):
        batch = upsert_rows[i:i + BATCH]
        supa.table('nfl_team_penalties_weekly').upsert(
            batch, on_conflict='team_id,season,week,season_type'
        ).execute()

    print(f'Done. {len(upsert_rows)} rows upserted.')


if __name__ == '__main__':
    main()