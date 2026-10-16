"""
scripts/load_contracts_csv.py

Loads contract years into player_contract_seasons from a CSV you export or type by hand.
The MLB Stats API publishes no contract terms, so this table only ever holds rows a human
has checked against a source. Nothing is estimated.

TABLE OWNERSHIP (single writer): player_contract_seasons <- this script and nothing else.

CSV header (one row per player per season of the deal):
  player_id,season,salary_usd,source_url,verified_at[,deferred_usd,guaranteed,option_type]
  e.g. 605400,2027,24000000,https://www.spotrac.com/...,2026-10-15,0,true,
  - player_id    MLB person id (the number in /mlb/players/{id})
  - guaranteed   true/false (default true); option_type e.g. team, player, vesting
  - source_url and verified_at are required: every row must be traceable.

Usage:  python3 scripts/load_contracts_csv.py contracts.csv [--dry-run]
"""
from __future__ import annotations

import csv
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env.local')
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')
REQUIRED = ['player_id', 'season', 'salary_usd', 'source_url', 'verified_at']


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry-run' in sys.argv
    if not args:
        print(__doc__)
        sys.exit(1)
    rows = []
    with open(args[0], newline='', encoding='utf-8-sig') as f:  # utf-8-sig strips an Excel BOM
        for n, r in enumerate(csv.DictReader(f), start=2):
            missing = [k for k in REQUIRED if not (r.get(k) or '').strip()]
            if missing:
                print(f'line {n}: missing {missing} — aborting, nothing written')
                sys.exit(1)
            rows.append(dict(
                player_id=int(r['player_id']), season=int(r['season']),
                salary_usd=int(float(r['salary_usd'])), deferred_usd=int(float(r.get('deferred_usd') or 0)),
                guaranteed=(r.get('guaranteed') or 'true').strip().lower() != 'false',
                option_type=(r.get('option_type') or '').strip() or None,
                source_url=r['source_url'].strip(), verified_at=r['verified_at'].strip()))
    print(f'{len(rows)} rows. Sanity sample (5):')
    for r in rows[:5]:
        print(f"  player {r['player_id']}  {r['season']}  ${r['salary_usd']:,}  guaranteed={r['guaranteed']}  {r['option_type']}")
    if dry:
        print('--dry-run: nothing written')
        return
    print('Writing in 10 seconds — Ctrl-C to abort...')
    time.sleep(10)
    from supabase import create_client
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)
    for i in range(0, len(rows), 500):
        supa.table('player_contract_seasons').upsert(rows[i:i + 500], on_conflict='player_id,season').execute()
    print(f'Upserted {len(rows)} rows.')


if __name__ == '__main__':
    main()
