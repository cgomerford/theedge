#!/usr/bin/env python3
"""
scripts/fetch_team_pull_tendency.py

Fetches real Statcast pull-direction tendency, split by batter handedness,
aggregated to team level. Feeds edge.ts's positionalExploit sub-factor —
paired with fetch_team_defense.py's oaa_lf/oaa_cf/oaa_rf (already built) —
completing the "lefty pull hitters target a weak-OAA right fielder" signal
described in the model-goal conversation.

OWNERSHIP: this script owns pull_pct_lhb/pull_pct_rhb on team_platoon_splits
ONLY. fetch_team_platoon.py owns everything else on that table (vs_lhp_ops
etc, from MLB Stats API). Different source (Savant Statcast vs MLB Stats
API), different columns, same table — no collision, matches the one-writer-
per-column rule established across this whole pipeline audit.

Team + handedness assignment: pulled directly from each team's MLB Stats
API roster (player_id + batSide.code), NOT joined through a separate
Savant CSV the way the archived fetch_team_statcast.py did — that indirect
join silently drops any player missing from either side. One authoritative
source per team instead.

Switch hitters (batSide.code == 'S') are excluded from both pull_pct_lhb
and pull_pct_rhb. Their real pull tendency depends on which side they're
batting from, which depends on the opposing pitcher's hand that specific
game — a single team-level number would misrepresent them, not just
approximate them. Small population; an honest gap beats a fabricated one.

Players under MIN_PA are excluded from the weighted average — same spirit
as fetch_pitcher_batted_ball.py's MIN_BATTED_BALLS floor.

Run: python3 scripts/fetch_team_pull_tendency.py
Cron: weekly, same cadence as fetch_team_platoon.py and fetch_pitch_arsenals'
weekly siblings — pull tendency doesn't shift fast enough to need daily runs.
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

# Batch endpoint — all qualified batters league-wide in one request, same
# pattern as fetch_pitch_arsenals.py rather than per-team looping.
SAVANT_PULL_URL = (
    'https://baseballsavant.mlb.com/leaderboard/custom'
    '?year={year}&type=batter&filter=&sort=4&sortDir=desc&min=1'
    '&selections=pa,pull_percent&team=&csv=true'
)


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


def fetch_pull_data(year: int) -> dict:
    """
    Returns {player_id: {'pa': int, 'pull_percent': float}} for every
    batter Savant has data for. NOT team-scoped — joined against each
    team's own roster below.
    """
    url = SAVANT_PULL_URL.format(year=year)
    print(f'Fetching Savant batted-ball direction: {url}\n')
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
    pull_key = next((k for k in headers_found if 'pull' in k.lower()), None)
    pa_key = next((k for k in headers_found if k.lower() == 'pa'), None)

    if not pid_key or not pull_key:
        raise ValueError(
            f'Could not find expected columns. player_id key={pid_key}, pull key={pull_key}. '
            f'Full headers were: {headers_found} — Savant likely changed their schema, '
            f'update the key-matching above before proceeding.'
        )

    print(f'Using columns: player_id="{pid_key}", pull="{pull_key}", pa="{pa_key}"\n')

    out = {}
    for r in rows:
        pid = safe_int(r.get(pid_key))
        pull = safe_float(r.get(pull_key))
        pa = safe_int(r.get(pa_key)) if pa_key else None
        if pid is None or pull is None:
            continue
        out[pid] = {'pa': pa or 0, 'pull_percent': pull}

    print(f'Parsed pull data for {len(out)} batters\n')
    return out


def fetch_team_roster_batters(team_id: int) -> list[dict]:
    """[{player_id, bats}] for this team's non-pitcher active roster."""
    url = f'{MLB_API}/teams/{team_id}/roster?rosterType=active'
    try:
        resp = requests.get(url, timeout=15)
        if not resp.ok:
            return []
        roster = resp.json().get('roster', [])
    except Exception as e:
        print(f'    Roster fetch failed for team {team_id}: {e}')
        return []

    out = []
    for p in roster:
        if p.get('position', {}).get('abbreviation') == 'P':
            continue
        pid = p.get('person', {}).get('id')
        # batSide isn't always on the roster payload — fall back to a
        # per-player people lookup only when missing, to keep this cheap
        bats = p.get('person', {}).get('batSide', {}).get('code')
        if pid:
            out.append({'player_id': pid, 'bats': bats})
    return out


def fetch_bats_handedness(player_id: int) -> Optional[str]:
    """Fallback when roster payload doesn't include batSide directly."""
    try:
        resp = requests.get(f'{MLB_API}/people/{player_id}', timeout=10)
        if not resp.ok:
            return None
        people = resp.json().get('people', [])
        if not people:
            return None
        return people[0].get('batSide', {}).get('code')
    except Exception:
        return None


def main():
    print(f'Fetching team pull tendency for {SEASON}...\n')

    pull_data = fetch_pull_data(SEASON)

    rows = []
    for team_id, team_name in MLB_TEAMS.items():
        print(f'{team_name}...', end=' ', flush=True)

        batters = fetch_team_roster_batters(team_id)
        if not batters:
            print('✗ no roster data')
            time.sleep(0.3)
            continue

        lhb_pull_sum, lhb_pa_sum = 0.0, 0
        rhb_pull_sum, rhb_pa_sum = 0.0, 0
        switch_excluded = 0
        no_savant_data = 0

        for b in batters:
            pid = b['player_id']
            bats = b['bats']

            if not bats:
                bats = fetch_bats_handedness(pid)
                time.sleep(0.1)

            if bats == 'S':
                switch_excluded += 1
                continue
            if bats not in ('L', 'R'):
                continue

            data = pull_data.get(pid)
            if not data or data['pa'] < MIN_PA:
                no_savant_data += 1
                continue

            if bats == 'L':
                lhb_pull_sum += data['pull_percent'] * data['pa']
                lhb_pa_sum += data['pa']
            else:
                rhb_pull_sum += data['pull_percent'] * data['pa']
                rhb_pa_sum += data['pa']

        pull_pct_lhb = round(lhb_pull_sum / lhb_pa_sum, 2) if lhb_pa_sum > 0 else None
        pull_pct_rhb = round(rhb_pull_sum / rhb_pa_sum, 2) if rhb_pa_sum > 0 else None

        if pull_pct_lhb is None and pull_pct_rhb is None:
            print(f'✗ no qualifying batters (switch-excluded={switch_excluded}, below-min-PA={no_savant_data})')
            time.sleep(0.3)
            continue

        rows.append({
            'team_id': team_id,
            'season': SEASON,
            'pull_pct_lhb': pull_pct_lhb,
            'pull_pct_rhb': pull_pct_rhb,
            'updated_at': datetime.utcnow().isoformat(),
        })
        lhb_str = f'{pull_pct_lhb}%' if pull_pct_lhb is not None else '—'
        rhb_str = f'{pull_pct_rhb}%' if pull_pct_rhb is not None else '—'
        print(f'✓ LHB pull {lhb_str} (n={lhb_pa_sum} PA) / RHB pull {rhb_str} (n={rhb_pa_sum} PA) '
              f'[switch excluded: {switch_excluded}]')
        time.sleep(0.3)

    if not rows:
        print('\nNo rows collected — aborting, nothing written.')
        sys.exit(1)

    print(f'\n{"="*60}')
    print('SPOT-CHECK — compare against baseballsavant.mlb.com')
    print('custom leaderboard (batted ball > Pull%) before confirming:')
    print(f'{"="*60}')
    for r in rows[:5]:
        name = MLB_TEAMS[r['team_id']]
        print(f'  {name}: LHB {r["pull_pct_lhb"]}% / RHB {r["pull_pct_rhb"]}%')

    print(f'\nAbout to upsert {len(rows)} rows to team_platoon_splits. Ctrl-C now to abort.')
    time.sleep(3)

    supa.table('team_platoon_splits').upsert(rows, on_conflict='team_id,season').execute()
    print(f'\n✓ DONE — {len(rows)} teams written to team_platoon_splits (pull_pct_lhb/pull_pct_rhb only)')


if __name__ == '__main__':
    main()