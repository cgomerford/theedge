"""
scripts/fetch_fielding_run_value.py

Fetches Baseball Savant's Fielding Run Value (FRV) leaderboard — one row per
qualifying player, season-blended across every position they logged innings
at. Powers the full 9-position diamond on the Scout Report Defense tab
(companion to OAAZoneMap.tsx, which currently only covers OF via a live
per-request Savant fetch).

CONFIRMED via curl 2026-08-15 (position= param is decorative on this
endpoint — it does NOT filter the result set, so we fetch once, unfiltered,
and get the full league):

    https://baseballsavant.mlb.com/leaderboard/fielding-run-value
        ?type=fielder&seasonStart={year}&seasonEnd={year}
        &gameType=Regular&minInnings=1&minResults=1&csv=true

minInnings — CONFIRMED via curl 2026-08-15: 'q' (qualified/full-season
starters, Savant's batting-title-equivalent innings threshold) returned
308 rows; minInnings=1 returned 618. 'q' silently drops platoon players,
recent call-ups, and anyone short of a full-season workload — exactly the
players a "no data" badge on the diamond was meant to flag as missing, not
excluded from the source data entirely. Using minInnings=1 to capture the
full fielder pool; a legitimately unqualified player still gets a real FRV
number here, just over fewer innings than a full-time starter.

CSV columns (verified from live pull, not assumed):
    name, id, total_runs, inf_of_runs, range_runs, arm_runs, dp_runs,
    catching_runs, framing_runs, throwing_runs, blocking_runs,
    outs_total, outs_2, outs_3, outs_4, outs_5, outs_6, outs_7, outs_8, outs_9

`total_runs` is FRV itself — NOT `frv`. It is the single number to badge a
fielder with regardless of position; the sub-component columns (range/arm/dp
for IF-OF, catching/framing/throwing/blocking for catchers) are blank
(empty string) for positions where they don't apply — not zero, blank.
Convert blanks to None, do not coerce to 0.

outs_2..outs_9 use standard scorekeeping position numbers (2=C, 3=1B, 4=2B,
5=3B, 6=SS, 7=LF, 8=CF, 9=RF) and reflect innings logged AT EACH POSITION
this season — they are NOT which position to display the player at tonight.
Tonight's position comes from the confirmed starting lineup (existing lineup
data), joined against this table by player_id at render time.

`id` is the Savant/MLBAM player ID, which is the same ID space as MLB Stats
API player_id used everywhere else in this codebase (pitcher_zone_arsenal,
batter_hot_zones, etc.) — no cross-referencing needed.

Stores one row per player per season in `player_fielding_run_value`.
Upsert on conflict (player_id, season) — never delete-then-insert.

Run weekly via GitHub Actions (same cadence as fetch_pitcher_hot_zones.py).
"""
from __future__ import annotations

import csv
import io
import os
import sys
import time
from datetime import datetime
from typing import Optional

import requests
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip()
SUPABASE_SERVICE_KEY = (os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

SEASON = datetime.now().year

FRV_URL = (
    'https://baseballsavant.mlb.com/leaderboard/fielding-run-value'
    f'?type=fielder&seasonStart={SEASON}&seasonEnd={SEASON}'
    '&gameType=Regular&minInnings=1&minResults=1&csv=true'
)

# Columns that are legitimately blank (not zero) for positions where they
# don't apply. Keep as None, never coerce to 0 — a blank arm_runs for a
# catcher is "not applicable", not "zero arm runs".
FLOAT_COLS = [
    'total_runs', 'inf_of_runs', 'range_runs', 'arm_runs', 'dp_runs',
    'catching_runs', 'framing_runs', 'throwing_runs', 'blocking_runs',
]
INT_COLS = [
    'outs_total', 'outs_2', 'outs_3', 'outs_4', 'outs_5', 'outs_6',
    'outs_7', 'outs_8', 'outs_9',
]


def parse_float(v: str) -> Optional[float]:
    v = (v or '').strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def parse_int(v: str) -> Optional[int]:
    v = (v or '').strip()
    if not v:
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def normalize_name(raw: str) -> str:
    """'Crow-Armstrong, Pete' -> 'Pete Crow-Armstrong'"""
    if ',' not in raw:
        return raw.strip()
    last, first = raw.split(',', 1)
    return f'{first.strip()} {last.strip()}'


def fetch_frv_csv() -> list[dict]:
    resp = requests.get(FRV_URL, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
    resp.raise_for_status()
    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)


def build_rows(raw_rows: list[dict]) -> list[dict]:
    out = []
    for row in raw_rows:
        player_id = parse_int(row.get('id', ''))
        if player_id is None:
            continue
        rec = {
            'player_id': player_id,
            'player_name': normalize_name(row.get('name', '')),
            'season': SEASON,
        }
        for col in FLOAT_COLS:
            rec[col] = parse_float(row.get(col, ''))
        for col in INT_COLS:
            rec[col] = parse_int(row.get(col, ''))
        out.append(rec)
    return out


def main():
    print(f'Fetching Fielding Run Value leaderboard for {SEASON}...')
    print(f'URL: {FRV_URL}')

    try:
        raw_rows = fetch_frv_csv()
    except requests.RequestException as e:
        print(f'Fetch failed: {e}')
        sys.exit(1)

    if not raw_rows:
        print('No rows returned — aborting (empty state over fabricated data).')
        sys.exit(1)

    rows = build_rows(raw_rows)
    print(f'Parsed {len(rows)} player rows.')

    # ── Five-row sanity print + abort window ──────────────────────────────
    print('\nSample rows:')
    for r in rows[:5]:
        print(
            f"  {r['player_name']:<28} id={r['player_id']:<7} "
            f"total_runs={r['total_runs']}"
        )

    print('\nWriting to Supabase in 5s — Ctrl+C to abort...')
    try:
        time.sleep(5)
    except KeyboardInterrupt:
        print('\nAborted.')
        sys.exit(0)

    # ── Upsert — never delete-then-insert ──────────────────────────────────
    BATCH = 100
    written = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        supabase.table('player_fielding_run_value') \
            .upsert(batch, on_conflict='player_id,season') \
            .execute()
        written += len(batch)

    print(f'Upserted {written} rows into player_fielding_run_value.')


if __name__ == '__main__':
    main()