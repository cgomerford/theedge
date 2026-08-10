"""
scripts/fetch_batter_spray.py

Fetches Statcast pitch-by-pitch data for every active MLB position player
and extracts the coordinates of every ball in play (hc_x, hc_y). Stores as
JSONB in batter_spray, one row per batter for the current season.

Powers the Scout Report's combined lineup spray heatmap — displays where
the confirmed lineup collectively puts balls in play across the field.

Uses pybaseball.statcast_batter(), same architecture and library as
fetch_pitch_velocity_range.py — hc_x / hc_y / events / bb_type /
launch_speed / launch_angle are all standard Statcast columns, already
proven working in this codebase via the batter Statcast fetch in
BattingTabContent.tsx.

Also stores events, bb_type, launch_speed, launch_angle alongside the
coordinates. Not used by the current heatmap view, but small storage
cost and unblocks a scatter-by-outcome view later without re-running
the whole pipeline.

Runs once a week via GitHub Actions.

USAGE
  python3 scripts/fetch_batter_spray.py --season 2026
  python3 scripts/fetch_batter_spray.py --season 2026 --limit 10   # test
"""
import os
import sys
import time
import argparse
from datetime import datetime

import pandas as pd
import requests
from pybaseball import statcast_batter, cache
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')
cache.enable()

SUPABASE_URL = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip()
SUPABASE_SERVICE_KEY = (os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Below this, a lineup batter's spray row isn't worth storing — a heatmap
# with 3 dots isn't meaningfully more useful than the "no data" state.
MIN_BALLS_IN_PLAY = 20


def clear_season(year: int) -> bool:
    """Same pattern as the arsenal + velocity scripts — clear before writing
    so a batter who stops appearing in the pool doesn't leave stale data."""
    try:
        supabase.table('batter_spray').delete().eq('season', year).execute()
        return True
    except Exception as e:
        print('WARNING: failed to clear existing season {} rows: {}'.format(year, e))
        return False


def fetch_active_batter_ids() -> list:
    """
    Pool = position players on any current 40-man roster. Deliberately
    non-pitchers only — pitchers do bat in AL parks post-DH but their
    ball-in-play sample is trivially small and clutters the pool.
    """
    ids = set()
    try:
        teams_res = requests.get('https://statsapi.mlb.com/api/v1/teams?sportId=1', timeout=10)
        teams_res.raise_for_status()
        team_ids = [t['id'] for t in teams_res.json().get('teams', [])]
    except Exception as e:
        print('Failed to fetch team list: {}'.format(e))
        return []

    for team_id in team_ids:
        try:
            roster_res = requests.get(
                'https://statsapi.mlb.com/api/v1/teams/{}/roster?rosterType=40Man'.format(team_id),
                timeout=10,
            )
            roster_res.raise_for_status()
            for p in roster_res.json().get('roster', []):
                pos_type = p.get('position', {}).get('type', '')
                if pos_type and pos_type != 'Pitcher':
                    ids.add(p['person']['id'])
        except Exception as e:
            print('  Roster fetch failed for team {}: {}'.format(team_id, e))
            continue
        time.sleep(0.2)

    return sorted(ids)


def compute_batter_spray(player_id: int, season: int):
    """
    Pulls this batter's full-season pitch-by-pitch log via pybaseball and
    extracts every ball in play. Returns None on failure or empty result —
    one bad batter never kills the whole run.

    hc_x / hc_y are null on non-BIP outcomes (K, BB, HBP, foul balls that
    aren't caught, etc.), so dropna() cleanly filters those out.
    """
    start_dt = '{}-01-01'.format(season)
    end_dt = '{}-12-31'.format(season)
    try:
        df = statcast_batter(start_dt, end_dt, player_id)
    except Exception as e:
        print('  statcast_batter failed for {}: {}'.format(player_id, e))
        return None

    if df is None or df.empty:
        return None

    needed = ['hc_x', 'hc_y', 'events', 'bb_type', 'launch_speed', 'launch_angle']
    if not all(c in df.columns for c in needed):
        return None

    df = df.dropna(subset=['hc_x', 'hc_y'])
    if len(df) < MIN_BALLS_IN_PLAY:
        return None

    plays = []
    for row in df[needed].itertuples(index=False):
        plays.append({
            'x': round(float(row.hc_x), 1),
            'y': round(float(row.hc_y), 1),
            'ev': None if pd.isna(row.events) else str(row.events),
            'bt': None if pd.isna(row.bb_type) else str(row.bb_type),
            'ls': None if pd.isna(row.launch_speed) else round(float(row.launch_speed), 1),
            'la': None if pd.isna(row.launch_angle) else round(float(row.launch_angle), 1),
        })

    return {
        'player_id': player_id,
        'season': season,
        'plays': plays,
        'total_balls_in_play': len(plays),
    }


def upsert_rows(rows: list, batch_size: int = 100) -> int:
    """Smaller batch size than the other scripts — spray rows carry a large
    JSONB payload each, and 500 at a time will push Supabase's row-batch
    request-body limits."""
    upserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            supabase.table('batter_spray').upsert(
                batch, on_conflict='player_id,season',
            ).execute()
            upserted += len(batch)
            print('  Upserted {}/{}...'.format(upserted, len(rows)))
        except Exception as e:
            print('  Batch upsert failed: {}'.format(e))
    return upserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--season', type=int, default=datetime.now().year)
    parser.add_argument('--limit', type=int, default=None, help='Cap batters processed, for testing')
    args = parser.parse_args()

    print('Fetching active position-player pool...')
    batter_ids = fetch_active_batter_ids()
    if args.limit:
        batter_ids = batter_ids[:args.limit]
    print('  {} batters in pool'.format(len(batter_ids)))

    all_rows = []
    for i, pid in enumerate(batter_ids):
        if (i + 1) % 25 == 0:
            print('  {}/{}...'.format(i + 1, len(batter_ids)))
        row = compute_batter_spray(pid, args.season)
        if row:
            all_rows.append(row)
        # 1s sleep — this hits Savant harder than the pitcher-side pulls
        # because there are more position players than pitchers.
        time.sleep(1.0)

    if not all_rows:
        print('No rows computed — aborting before touching the table.')
        sys.exit(1)

    print('\nSample rows (first 3):')
    for r in all_rows[:3]:
        print('  player_id={} season={} balls_in_play={}'.format(
            r['player_id'], r['season'], r['total_balls_in_play']))

    print('\nAbout to clear season {} and upsert {} rows. Ctrl-C now to abort.'.format(args.season, len(all_rows)))
    time.sleep(3)

    clear_season(args.season)
    saved = upsert_rows(all_rows)
    print('\nDone — {} rows saved.'.format(saved))


if __name__ == '__main__':
    main()