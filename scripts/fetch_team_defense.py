#!/usr/bin/env python3
"""
scripts/fetch_team_defense.py

Fetches real Statcast OAA (Outs Above Average) per team from Baseball
Savant's outs_above_average leaderboard — direct CSV, same endpoint
already proven working in src/components/OAAZoneMap.tsx (which only
pulls outfield positions 7/8/9 for a display widget). This script pulls
all seven fielding positions and aggregates to team-level infield/outfield/
total OAA, then writes to the team_defense table.

Also keeps the three individual outfield position values (oaa_lf, oaa_cf,
oaa_rf) rather than only their sum — these feed edge.ts's positionalExploit
sub-factor (weak-side OAA at the specific position a lineup's handedness
composition pulls toward), paired with pull_pct_lhb/pull_pct_rhb from a
separate, not-yet-built pipeline. positionalExploit stays at 0 until both
halves exist — this script only completes one of the two.

This replaces the fielding_pct-based proxy previously written by
refresh-team-stats/route.ts (self-flagged in that file's own comments as
an estimate, not real OAA — see the Defense audit).

Position codes match the mapping already used elsewhere in this codebase
(fetch_ultimate_team_pool.py's POSITION_CODES):
  3=1B, 4=2B, 5=3B, 6=SS (infield) | 7=LF, 8=CF, 9=RF (outfield)
Catcher (2) and pitcher (1) fielding aren't included — OAA isn't a
meaningful framing-independent metric for those positions the same way.

Run frequency: daily. Rate-limit note: 30 teams x 7 positions = 210
requests per run. Savant returns HTML instead of CSV when rate-limited
(same failure mode fetch_pitch_arsenals.py guards against) — this script
guards the same way and backs off on that signal.
"""
import os
import sys
import time
import csv
import io
import requests
from datetime import datetime
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client

from pathlib import Path
load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

MLB_TEAMS = {
    108: 'Los Angeles Angels', 109: 'Arizona Diamondbacks',
    110: 'Baltimore Orioles', 111: 'Boston Red Sox',
    112: 'Chicago Cubs', 113: 'Cincinnati Reds',
    114: 'Cleveland Guardians', 115: 'Colorado Rockies',
    116: 'Detroit Tigers', 117: 'Houston Astros',
    118: 'Kansas City Royals', 119: 'Los Angeles Dodgers',
    120: 'Washington Nationals', 121: 'New York Mets',
    133: 'Athletics', 134: 'Pittsburgh Pirates',
    135: 'San Diego Padres', 136: 'Seattle Mariners',
    137: 'San Francisco Giants', 138: 'St. Louis Cardinals',
    139: 'Tampa Bay Rays', 140: 'Texas Rangers',
    141: 'Toronto Blue Jays', 142: 'Minnesota Twins',
    143: 'Philadelphia Phillies', 144: 'Atlanta Braves',
    145: 'Chicago White Sox', 146: 'Miami Marlins',
    147: 'New York Yankees', 158: 'Milwaukee Brewers',
}

# Same mapping already used in fetch_ultimate_team_pool.py's POSITION_CODES
INFIELD_POS = ['3', '4', '5', '6']   # 1B, 2B, 3B, SS
OUTFIELD_POS = ['7', '8', '9']       # LF, CF, RF
OUTFIELD_COLUMN_BY_POS = {'7': 'oaa_lf', '8': 'oaa_cf', '9': 'oaa_rf'}

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/csv,*/*',
    'Referer': 'https://baseballsavant.mlb.com/',
}

SAVANT_OAA_URL = (
    'https://baseballsavant.mlb.com/leaderboard/outs_above_average'
    '?type=Fielder&year={year}&team={team_id}&pos={pos}&min=0&csv=true'
)


def fetch_position_oaa(team_id: int, pos: str, year: int) -> Optional[float]:
    """Sum of OAA across all fielders at this position for this team."""
    url = SAVANT_OAA_URL.format(year=year, team_id=team_id, pos=pos)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        resp.encoding = 'utf-8-sig'

        if resp.text.strip().startswith('<!DOCTYPE') or resp.text.strip().startswith('<html'):
            print(f'    WARNING: rate-limited on team {team_id} pos {pos} — backing off 15s')
            time.sleep(15)
            return None

        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)
        if not rows:
            return None

        oaa_key = next((k for k in rows[0].keys() if k.lower() in ('outs_above_average', 'oaa')), None)
        if not oaa_key:
            return None

        total = 0.0
        for r in rows:
            try:
                total += float(r.get(oaa_key, 0) or 0)
            except (ValueError, TypeError):
                continue
        return round(total, 1)
    except Exception as e:
        print(f'    ERROR team {team_id} pos {pos}: {e}')
        return None


def main():
    season = datetime.now().year
    print(f'Fetching team defense (real Statcast OAA) for {season}...\n')

    rows = []
    for team_id, team_name in MLB_TEAMS.items():
        print(f'{team_name}...', end=' ', flush=True)

        infield_total = 0.0
        outfield_total = 0.0
        outfield_by_column: dict = {}
        got_any = False

        for pos in INFIELD_POS:
            v = fetch_position_oaa(team_id, pos, season)
            if v is not None:
                infield_total += v
                got_any = True
            time.sleep(0.25)

        for pos in OUTFIELD_POS:
            v = fetch_position_oaa(team_id, pos, season)
            if v is not None:
                outfield_total += v
                outfield_by_column[OUTFIELD_COLUMN_BY_POS[pos]] = v
                got_any = True
            time.sleep(0.25)

        if not got_any:
            print('✗ no data')
            continue

        row = {
            'team_id': team_id,
            'season': season,
            'oaa': round(infield_total + outfield_total, 1),
            'infield_oaa': round(infield_total, 1),
            'outfield_oaa': round(outfield_total, 1),
            'oaa_lf': outfield_by_column.get('oaa_lf'),
            'oaa_cf': outfield_by_column.get('oaa_cf'),
            'oaa_rf': outfield_by_column.get('oaa_rf'),
            'updated_at': datetime.utcnow().isoformat(),
        }
        rows.append(row)
        lf = row['oaa_lf'] if row['oaa_lf'] is not None else '—'
        cf = row['oaa_cf'] if row['oaa_cf'] is not None else '—'
        rf = row['oaa_rf'] if row['oaa_rf'] is not None else '—'
        print(f'✓ OAA {row["oaa"]:+.1f} (IF {row["infield_oaa"]:+.1f} / OF {row["outfield_oaa"]:+.1f}) '
              f'[LF {lf} / CF {cf} / RF {rf}]')

    if not rows:
        print('\nNo rows collected — aborting, nothing written.')
        sys.exit(1)

    # Spot-check before touching Supabase — same pattern as fetch_pitch_arsenals.py
    print(f'\n{"="*60}')
    print('SPOT-CHECK — compare these against baseballsavant.mlb.com')
    print('team defense leaderboard before confirming:')
    print(f'{"="*60}')
    ranked = sorted(rows, key=lambda r: r['oaa'], reverse=True)
    for r in ranked[:3]:
        name = MLB_TEAMS[r['team_id']]
        print(f'  TOP:    {name}: {r["oaa"]:+.1f} OAA (RF {r["oaa_rf"]})')
    for r in ranked[-3:]:
        name = MLB_TEAMS[r['team_id']]
        print(f'  BOTTOM: {name}: {r["oaa"]:+.1f} OAA (RF {r["oaa_rf"]})')

    print(f'\nAbout to upsert {len(rows)} rows to team_defense. Ctrl-C now to abort.')
    time.sleep(3)

    supa.table('team_defense').upsert(rows, on_conflict='team_id,season').execute()
    print(f'\n✓ DONE — {len(rows)} teams written to team_defense')


if __name__ == '__main__':
    main()