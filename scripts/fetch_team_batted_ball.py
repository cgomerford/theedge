#!/usr/bin/env python3
"""
scripts/fetch_team_batted_ball.py

Fetches real Statcast batted-ball type distribution (GB/FB/LD/popup %),
aggregated to team level from individual batters. Feeds edge.ts's
battedBallCollision sub-factor — the batting team's own groundball lean,
compared against the opposing pitcher's gb_percent (already built via
fetch_pitcher_batted_ball.py) — completing the "two GB-heavy profiles
colliding" interaction from the model-goal conversation.

Savant's custom leaderboard uses internal codes, not display names —
confirmed via Savant's own example URLs that groundball% is
"groundballs_percent", NOT "gb_percent" (a first attempt using
"gb_percent" silently returned a matching column header with every
value blank, rather than failing loudly — same failure class as the
archived fetch_team_advanced.py's "oz_swing_percent"/"barrel_batted_rate"
codes). flyballs_percent/linedrives_percent/popups_percent are inferred
by the same naming pattern but NOT independently confirmed — the
validate_coverage() check below will abort loudly if any of these guesses
is also wrong, rather than silently writing another round of zeros.

OWNERSHIP: this script owns gb_percent_batting/fb_percent_batting/
ld_percent_batting/popup_percent_batting on team_stats ONLY. Everything
else on that table belongs to refresh-team-stats/route.ts.

Team assignment pulled directly from each team's MLB Stats API roster
(player_id), same non-indirect-join approach as fetch_team_pull_tendency.py.

Run: python3 scripts/fetch_team_batted_ball.py
Cron: weekly, same cadence as the other batted-ball/pull-tendency scripts.
"""
from __future__ import annotations

import io
import os
import sys
import time
import csv
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

MLB_API = 'https://statsapi.mlb.com/api/v1'
SEASON = datetime.now().year
MIN_PA = 20
# Minimum fraction of parsed batters that must have a non-null value for
# a given field before we trust it enough to write to Supabase. Guards
# against the exact silent failure this script just hit — a matching
# column header with every value blank.
MIN_COVERAGE = 0.5

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

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/csv,*/*',
    'Referer': 'https://baseballsavant.mlb.com/',
}

# groundballs_percent CONFIRMED via Savant's own example custom-leaderboard
# URL. flyballs_percent/linedrives_percent/popups_percent are inferred by
# the same naming pattern, NOT independently confirmed — validate_coverage()
# below catches it if any of these three is also wrong.
SAVANT_BATTED_BALL_URL = (
    'https://baseballsavant.mlb.com/leaderboard/custom'
    '?year={year}&type=batter&filter=&sort=4&sortDir=desc&min=1'
    '&selections=pa,groundballs_percent,flyballs_percent,linedrives_percent,popups_percent'
    '&team=&csv=true'
)


def safe_float(val) -> Optional[float]:
    if val is None or val == '' or val == 'null':
        return None
    try:
        f = float(val)
        return None if f != f else f
    except (ValueError, TypeError):
        return None


def safe_int(val) -> Optional[int]:
    f = safe_float(val)
    return int(f) if f is not None else None


def validate_coverage(field_name: str, data: dict, key: str) -> None:
    """
    Aborts the script if a field's non-null rate is suspiciously low —
    catches the exact failure this script just hit (matching column
    header, every value blank) instead of silently writing zeros.
    """
    total = len(data)
    if total == 0:
        return
    non_null = sum(1 for v in data.values() if v.get(key) is not None)
    coverage = non_null / total
    print(f'  {field_name}: {non_null}/{total} batters have a value ({coverage:.0%} coverage)')
    if coverage < MIN_COVERAGE:
        raise ValueError(
            f'{field_name} coverage is only {coverage:.0%} (need {MIN_COVERAGE:.0%}+). '
            f'The column header matched but values are mostly blank — this is the same '
            f'failure that happened with "gb_percent" (wrong internal code). The selection '
            f'code for {field_name} in SAVANT_BATTED_BALL_URL is likely wrong too. '
            f'Check https://baseballsavant.mlb.com/leaderboard/custom in a browser, use the '
            f'"Custom Columns" picker to find the real code, and update the URL above.'
        )


def fetch_batted_ball_data(year: int) -> dict:
    """Returns {player_id: {'pa': int, 'gb': f, 'fb': f, 'ld': f, 'pu': f}}."""
    url = SAVANT_BATTED_BALL_URL.format(year=year)
    print(f'Fetching Savant batted-ball type distribution: {url}\n')
    resp = requests.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    resp.encoding = 'utf-8-sig'

    if resp.text.strip().startswith('<!DOCTYPE') or resp.text.strip().startswith('<html'):
        raise ValueError('Savant returned HTML instead of CSV — likely rate-limited. Wait 30s and retry.')

    reader = csv.DictReader(io.StringIO(resp.text))
    rows = list(reader)
    if not rows:
        raise ValueError('Savant returned zero rows — check the URL/params above manually.')

    headers_found = list(rows[0].keys())
    print(f'CSV headers: {headers_found}\n')

    pid_key = next((k for k in headers_found if k.lower() in ('player_id', 'batter', 'batter_id')), None)
    gb_key = next((k for k in headers_found if k.lower() == 'groundballs_percent'), None)
    fb_key = next((k for k in headers_found if k.lower() == 'flyballs_percent'), None)
    ld_key = next((k for k in headers_found if k.lower() == 'linedrives_percent'), None)
    pu_key = next((k for k in headers_found if k.lower() == 'popups_percent'), None)
    pa_key = next((k for k in headers_found if k.lower() == 'pa'), None)

    if not pid_key or not gb_key:
        raise ValueError(
            f'Could not find expected columns. player_id key={pid_key}, gb key={gb_key}. '
            f'Full headers were: {headers_found}'
        )

    print(f'Using columns: player_id="{pid_key}", gb="{gb_key}", fb="{fb_key}", '
          f'ld="{ld_key}", popup="{pu_key}", pa="{pa_key}"\n')

    out = {}
    for r in rows:
        pid = safe_int(r.get(pid_key))
        pa = safe_int(r.get(pa_key)) if pa_key else None
        if pid is None:
            continue
        out[pid] = {
            'pa': pa or 0,
            'gb': safe_float(r.get(gb_key)) if gb_key else None,
            'fb': safe_float(r.get(fb_key)) if fb_key else None,
            'ld': safe_float(r.get(ld_key)) if ld_key else None,
            'pu': safe_float(r.get(pu_key)) if pu_key else None,
        }

    print(f'Parsed batted-ball data for {len(out)} batters\n')

    # Validate BEFORE returning — catches the exact silent-blank-values
    # failure this script hit on its first run.
    print('Validating field coverage:')
    validate_coverage('groundballs_percent', out, 'gb')
    validate_coverage('flyballs_percent', out, 'fb')
    validate_coverage('linedrives_percent', out, 'ld')
    validate_coverage('popups_percent', out, 'pu')
    print()

    return out


def fetch_team_roster_batters(team_id: int) -> list[int]:
    url = f'{MLB_API}/teams/{team_id}/roster?rosterType=active'
    try:
        resp = requests.get(url, timeout=15)
        if not resp.ok:
            return []
        roster = resp.json().get('roster', [])
    except Exception as e:
        print(f'    Roster fetch failed for team {team_id}: {e}')
        return []

    return [
        p['person']['id']
        for p in roster
        if p.get('position', {}).get('abbreviation') != 'P' and p.get('person', {}).get('id')
    ]


def main():
    print(f'Fetching team batted-ball profiles for {SEASON}...\n')

    batted_ball = fetch_batted_ball_data(SEASON)

    rows = []
    for team_id, team_name in MLB_TEAMS.items():
        print(f'{team_name}...', end=' ', flush=True)

        batter_ids = fetch_team_roster_batters(team_id)
        if not batter_ids:
            print('✗ no roster data')
            time.sleep(0.3)
            continue

        weighted = {'gb': 0.0, 'fb': 0.0, 'ld': 0.0, 'pu': 0.0}
        pa_sum = 0
        excluded = 0

        for pid in batter_ids:
            data = batted_ball.get(pid)
            if not data or data['pa'] < MIN_PA:
                excluded += 1
                continue
            pa = data['pa']
            for key in ('gb', 'fb', 'ld', 'pu'):
                val = data.get(key)
                if val is not None:
                    weighted[key] += val * pa
            pa_sum += pa

        if pa_sum == 0:
            print(f'✗ no qualifying batters (excluded={excluded})')
            time.sleep(0.3)
            continue

        row = {
            'team_id': team_id,
            'gb_percent_batting': round(weighted['gb'] / pa_sum, 2),
            'fb_percent_batting': round(weighted['fb'] / pa_sum, 2),
            'ld_percent_batting': round(weighted['ld'] / pa_sum, 2),
            'popup_percent_batting': round(weighted['pu'] / pa_sum, 2),
            'updated_at': datetime.utcnow().isoformat(),
        }
        rows.append(row)
        print(f'✓ GB {row["gb_percent_batting"]}% / FB {row["fb_percent_batting"]}% / '
              f'LD {row["ld_percent_batting"]}% / PU {row["popup_percent_batting"]}% (n={pa_sum} PA)')
        time.sleep(0.3)

    if not rows:
        print('\nNo rows collected — aborting, nothing written.')
        sys.exit(1)

    print(f'\n{"="*60}')
    print('SPOT-CHECK before confirming:')
    print(f'{"="*60}')
    for r in rows[:5]:
        name = MLB_TEAMS[r['team_id']]
        print(f'  {name}: GB {r["gb_percent_batting"]}%')

    print(f'\nAbout to update {len(rows)} rows in team_stats. Ctrl-C now to abort.')
    time.sleep(3)

    updated = 0
    for r in rows:
        team_id = r.pop('team_id')
        result = supa.table('team_stats').update(r).eq('team_id', team_id).execute()
        if result.data:
            updated += 1

    print(f'\n✓ DONE — {updated}/{len(rows)} teams updated in team_stats')


if __name__ == '__main__':
    main()