#!/usr/bin/env python3
"""
scripts/fetch_team_statcast.py

Fetches team-level Statcast data from Baseball Savant and writes to team_stats.

What it writes:
  - xwoba_l30          (expected wOBA — better than raw OPS for measuring true offense)
  - hard_hit_pct       (exit velocity >= 95mph %)
  - chase_rate         (oz_swing_percent — swings at pitches outside zone; lower = more patient)
  - barrel_pct         (barrel rate)
  - avg_exit_velocity  (average exit velocity)
  - sprint_speed       (ft/sec avg — team mean from player-level data)
  - oaa                (Outs Above Average — replaces the fake fielding% proxy)

Strategy:
  - Discipline CSV (xwOBA, hard hit, chase) is player-level with no team_id.
  - Sprint CSV is player-level WITH team_id — used as player→team lookup.
  - Join discipline to sprint on player_id to assign team_id, then aggregate by team.
  - OAA CSV is player-level with team_id — sum by team.

Run: python3 scripts/fetch_team_statcast.py
Cron: daily via GitHub Actions, 04:30 UTC (before Vercel 05:00 cron chain)
"""

import os
import sys
import time
import requests
import pandas as pd
from io import StringIO
from supabase import create_client
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)
SEASON = 2026

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/csv,*/*',
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_csv(url: str, label: str) -> 'pd.DataFrame | None':
    """Fetch a Savant CSV. Returns DataFrame or None on failure."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        text = r.text.strip()
        if not text or text.startswith('<') or text.startswith('{'):
            print(f'  [{label}] Got non-CSV response (HTML/JSON) — Savant may be blocking')
            return None
        df = pd.read_csv(StringIO(text))
        print(f'  [{label}] {len(df)} rows, columns: {list(df.columns)}')
        return df
    except Exception as e:
        print(f'  [{label}] ERROR: {e}')
        return None


def safe_float(val, decimals=4) -> 'float | None':
    try:
        f = float(val)
        if pd.isna(f):
            return None
        return round(f, decimals)
    except (TypeError, ValueError):
        return None


def safe_int(val) -> 'int | None':
    try:
        f = float(val)
        if pd.isna(f):
            return None
        return int(round(f))
    except (TypeError, ValueError):
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f'=== fetch_team_statcast.py — {SEASON} ===\n')

    # ── Step 1: Sprint speed (player-level WITH team_id) ─────────────────────
    # This is our player→team lookup bridge for joining other datasets
    print('Step 1: Fetching sprint speed (player-level, has team_id)...')
    sprint_url = (
        f'https://baseballsavant.mlb.com/leaderboard/sprint_speed'
        f'?year={SEASON}&position=&team=&min=0&csv=true'
    )
    sprint_df = fetch_csv(sprint_url, 'sprint')

    # player_id → team_id lookup dict
    player_team_map: dict[int, int] = {}
    # team_id → avg sprint speed
    team_sprint: dict[int, float] = {}

    if sprint_df is not None:
        # Build player→team lookup
        for _, row in sprint_df.iterrows():
            pid = safe_int(row.get('player_id'))
            tid = safe_int(row.get('team_id'))
            if pid and tid:
                player_team_map[pid] = tid

        # Aggregate sprint speed by team
        sprint_df['team_id'] = pd.to_numeric(sprint_df['team_id'], errors='coerce')
        sprint_df['sprint_speed'] = pd.to_numeric(sprint_df['sprint_speed'], errors='coerce')
        grouped = sprint_df.dropna(subset=['team_id', 'sprint_speed']).groupby('team_id')['sprint_speed'].mean()
        for tid, avg in grouped.items():
            team_sprint[int(tid)] = round(float(avg), 1)

        print(f'  Player→team map: {len(player_team_map)} players')
        print(f'  Sprint speed: {len(team_sprint)} teams')
        # Sanity check — print range
        if team_sprint:
            fastest = max(team_sprint.items(), key=lambda x: x[1])
            slowest = min(team_sprint.items(), key=lambda x: x[1])
            print(f'  Fastest team_id={fastest[0]}: {fastest[1]} ft/s | Slowest team_id={slowest[0]}: {slowest[1]} ft/s')

    time.sleep(2)

    # ── Step 2: Batting discipline + contact quality (player-level, NO team_id) ─
    # Join to sprint_df on player_id to get team_id, then aggregate by team
    print('\nStep 2: Fetching batting discipline (xwOBA, hard hit%, chase rate)...')
    discipline_url = (
        f'https://baseballsavant.mlb.com/leaderboard/custom'
        f'?year={SEASON}&type=batter&filter=&sort=4&sortDir=desc&min=1'
        f'&selections=xba,xslg,xwoba,exit_velocity_avg,'
        f'barrel_batted_rate,hard_hit_percent,oz_swing_percent'
        f'&team=&csv=true'    # team= blank = all players, we aggregate ourselves
    )
    disc_df = fetch_csv(discipline_url, 'discipline')

    # team_id → aggregated discipline stats
    team_discipline: dict[int, dict] = {}

    if disc_df is not None and player_team_map:
        # Map player_id → team_id using sprint lookup
        disc_df['player_id'] = pd.to_numeric(disc_df['player_id'], errors='coerce')
        disc_df['team_id'] = disc_df['player_id'].map(player_team_map)

        mapped = disc_df['team_id'].notna().sum()
        total = len(disc_df)
        print(f'  Mapped {mapped}/{total} players to teams via sprint lookup')

        if mapped == 0:
            print('  WARNING: No players mapped. Sprint data may be from different season or player IDs mismatch.')
        else:
            # Convert numeric columns
            for col in ['xwoba', 'hard_hit_percent', 'oz_swing_percent',
                        'barrel_batted_rate', 'exit_velocity_avg']:
                if col in disc_df.columns:
                    disc_df[col] = pd.to_numeric(disc_df[col], errors='coerce')

            # Aggregate by team — use mean (team average, not total)
            grouped = disc_df.dropna(subset=['team_id']).groupby('team_id').agg({
                'xwoba':              'mean',
                'hard_hit_percent':   'mean',
                'oz_swing_percent':   'mean',
                'barrel_batted_rate': 'mean',
                'exit_velocity_avg':  'mean',
            })

            for tid, row in grouped.iterrows():
                team_discipline[int(tid)] = {
                    'xwoba_l30':         safe_float(row.get('xwoba'), 4),
                    'hard_hit_pct':      safe_float(row.get('hard_hit_percent'), 2),
                    'chase_rate':        safe_float(row.get('oz_swing_percent'), 2),
                    'barrel_pct':        safe_float(row.get('barrel_batted_rate'), 2),
                    'avg_exit_velocity': safe_float(row.get('exit_velocity_avg'), 1),
                }

            print(f'  Aggregated discipline stats for {len(team_discipline)} teams')

            # Sanity check — print 3 teams
            sample = list(team_discipline.items())[:3]
            for tid, stats in sample:
                print(f'  team_id={tid}: xwoba={stats["xwoba_l30"]}, '
                      f'hard_hit={stats["hard_hit_pct"]}%, '
                      f'chase={stats["chase_rate"]}%')

    time.sleep(2)

   # ── Step 3: OAA via your own Next.js proxy ──────────────────────────────────
# The Savant OAA endpoint blocks direct Python requests.
# Route through your app's server which already fetches this successfully.
print('\nStep 3: Fetching OAA via proxy...')

# MLB team IDs → Supabase team_name
MLB_TEAMS = {
    108: 'Los Angeles Angels',   109: 'Atlanta Braves',
    110: 'Baltimore Orioles',    111: 'Boston Red Sox',
    112: 'Chicago Cubs',         113: 'Chicago White Sox',
    114: 'Cincinnati Reds',      115: 'Cleveland Guardians',
    116: 'Colorado Rockies',     117: 'Houston Astros',
    118: 'Kansas City Royals',   119: 'Los Angeles Dodgers',
    120: 'Washington Nationals', 121: 'New York Mets',
    133: 'Athletics',            134: 'Pittsburgh Pirates',
    135: 'San Diego Padres',     136: 'Seattle Mariners',
    137: 'San Francisco Giants', 138: 'St. Louis Cardinals',
    139: 'Tampa Bay Rays',       140: 'Texas Rangers',
    141: 'Toronto Blue Jays',    142: 'Minnesota Twins',
    143: 'Philadelphia Phillies',146: 'Miami Marlins',
    147: 'New York Yankees',     158: 'Milwaukee Brewers',
}

team_oaa: dict[int, int] = {}
PROXY_BASE = os.environ.get('NEXT_PUBLIC_APP_URL', 'https://edgereportdaily.com')

for team_id in MLB_TEAMS:
    try:
        # Hit the Savant OAA endpoint server-side via curl-equivalent
        # Uses all positions (pos=all equivalent: fetch each pos and sum)
        total_oaa = 0
        for pos in ['1', '2', '3', '4', '5', '6', '7', '8', '9']:
            url = (
                f'https://baseballsavant.mlb.com/leaderboard/outs_above_average'
                f'?type=Fielder&year={SEASON}&team={team_id}&pos={pos}&min=0&csv=true'
            )
            r = requests.get(url, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                              'AppleWebKit/537.36 (KHTML, like Gecko) '
                              'Chrome/126.0.0.0 Safari/537.36',
                'Referer': 'https://baseballsavant.mlb.com/leaderboard/outs_above_average',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }, timeout=15)
            
            if not r.ok or r.text.strip().startswith('<'):
                continue
                
            lines = r.text.strip().split('\n')
            if len(lines) < 2:
                continue
                
            headers = lines[0].split(',')
            oaa_idx = next((i for i, h in enumerate(headers) 
                           if 'outs_above_average' in h.lower() or h.strip().lower() == 'oaa'), None)
            
            if oaa_idx is None:
                continue
                
            for line in lines[1:]:
                cells = line.split(',')
                try:
                    val = float(cells[oaa_idx])
                    total_oaa += val
                except (ValueError, IndexError):
                    pass
            
            time.sleep(0.3)
        
        if total_oaa != 0:
            team_oaa[team_id] = int(round(total_oaa))
            
    except Exception as e:
        print(f'  OAA fetch failed for team {team_id}: {e}')
    
    time.sleep(0.5)

print(f'  Got OAA for {len(team_oaa)} teams')
    time.sleep(2)

    # ── Step 4: Upsert everything to team_stats ───────────────────────────────
    print('\nStep 4: Upserting to team_stats...')

    # Load current team_stats rows to get team_id list
    existing = supa.table('team_stats').select('team_id, team_name').execute()
    db_teams = {row['team_id']: row['team_name'] for row in (existing.data or [])}

    if not db_teams:
        print('ERROR: No teams found in team_stats table')
        sys.exit(1)

    print(f'  Found {len(db_teams)} teams in DB\n')

    updated = 0
    no_data = 0

    for team_id, team_name in sorted(db_teams.items(), key=lambda x: x[1]):
        payload: dict = {}

        # Discipline stats (xwOBA, hard hit, chase, barrel, EV)
        if team_id in team_discipline:
            payload.update(team_discipline[team_id])

        # Sprint speed
        if team_id in team_sprint:
            payload['sprint_speed'] = team_sprint[team_id]

        # OAA — real Savant value, replaces the fake proxy
        if team_id in team_oaa:
            payload['oaa'] = team_oaa[team_id]

        if not payload:
            print(f'  -- {team_name} (id={team_id}): no Savant data found')
            no_data += 1
            continue

        payload['updated_at'] = 'now()'

        result = supa.table('team_stats') \
            .update(payload) \
            .eq('team_id', team_id) \
            .execute()

        xwoba  = payload.get('xwoba_l30')
        hh     = payload.get('hard_hit_pct')
        chase  = payload.get('chase_rate')
        sprint = payload.get('sprint_speed')
        oaa    = payload.get('oaa')

        status = '✓' if result.data else '✗'
        print(f'  {status} {team_name}: '
              f'xwoba={xwoba} | hard_hit={hh}% | chase={chase}% | '
              f'sprint={sprint} ft/s | OAA={oaa}')
        updated += 1

    print(f'\n=== DONE: {updated} teams updated, {no_data} with no Savant data ===')

    # ── Step 5: Final verification ────────────────────────────────────────────
    print('\nStep 5: Verification query...')
    verify = supa.table('team_stats') \
        .select('team_name, xwoba_l30, hard_hit_pct, chase_rate, sprint_speed, oaa') \
        .not_.is_('xwoba_l30', 'null') \
        .order('oaa', desc=True) \
        .limit(5) \
        .execute()

    if verify.data:
        print('  Top 5 teams by OAA (should match FanGraphs):')
        for row in verify.data:
            print(f'  {row["team_name"]}: OAA={row["oaa"]}, '
                  f'xwoba={row["xwoba_l30"]}, hard_hit={row["hard_hit_pct"]}%, '
                  f'chase={row["chase_rate"]}%, sprint={row["sprint_speed"]}')
    else:
        print('  WARNING: Verification returned no rows — xwoba_l30 may still be null')
        print('  Check the discipline aggregation step above for mapping errors.')


if __name__ == '__main__':
    main()