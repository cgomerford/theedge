#!/usr/bin/env python3
"""
fetch_team_advanced.py
The Edge — V5 Advanced Team Data Fetcher

Fetches and writes advanced team + offense + defense + bullpen stats.
Adds: RISP BA/OPS, LOB%, GDP/game, chase rate, Z-contact%, sprint speed,
hard hit%, exit velocity, barrel%, fielding%, catcher framing, rest days,
bullpen ERA/WHIP L14, inherited strand %, saves/blown saves.

Sources:
  - MLB Stats API (statsapi.mlb.com) — free, no auth
  - pybaseball Statcast — already installed

Run: python3 scripts/fetch_team_advanced.py
Schedule: Nightly via GitHub Actions before log-predictions cron
"""

import os
import sys
import time
import datetime
import requests
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

MLB_API = 'https://statsapi.mlb.com/api/v1'
SEASON  = datetime.datetime.now().year
SLEEP   = 0.4


# ─────────────────────────────────────────────────────────────
# MLB STATS API HELPERS
# ─────────────────────────────────────────────────────────────

def mlb_get(path: str, params: dict = {}) -> dict:
    url = f'{MLB_API}/{path}'
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=15)
            if r.status_code == 429:
                time.sleep(5)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt == 2:
                print(f'  MLB API error {path}: {e}')
                return {}
            time.sleep(2)
    return {}


def _safe_float(val) -> "float | None":
    try:
        f = float(val)
        return round(f, 4) if not pd.isna(f) else None
    except:
        return None


def get_all_teams() -> list[dict]:
    """Get all teams currently in team_stats."""
    resp = supa.table('team_stats').select('team_id, team_name').execute()
    return resp.data or []


def get_team_hitting_stats(team_id: int) -> dict:
    """
    Season hitting stats for a team.
    Group: hitting. Returns raw stat block.
    """
    data = mlb_get(
        f'teams/{team_id}/stats',
        {'stats': 'season', 'group': 'hitting', 'season': SEASON}
    )
    splits = data.get('stats', [{}])[0].get('splits', [])
    return splits[0].get('stat', {}) if splits else {}


def get_team_hitting_splits(team_id: int) -> dict:
    """
    Situation splits for hitting: RISP, LOB, vs LHP, vs RHP.
    """
    data = mlb_get(
        f'teams/{team_id}/stats',
        {
            'stats':    'statSplits',
            'group':    'hitting',
            'season':   SEASON,
            'sitCodes': 'risp,lob,vl,vr',
        }
    )
    result = {}
    for block in data.get('stats', []):
        for split in block.get('splits', []):
            code = split.get('split', {}).get('code', '')
            result[code] = split.get('stat', {})
    return result


def get_team_fielding_stats(team_id: int) -> dict:
    """
    Season fielding stats: fielding%, errors, putouts.
    """
    data = mlb_get(
        f'teams/{team_id}/stats',
        {'stats': 'season', 'group': 'fielding', 'season': SEASON}
    )
    splits = data.get('stats', [{}])[0].get('splits', [])
    return splits[0].get('stat', {}) if splits else {}


def get_team_pitching_stats(team_id: int) -> dict:
    """
    Team pitching (bullpen) season stats.
    """
    data = mlb_get(
        f'teams/{team_id}/stats',
        {'stats': 'season', 'group': 'pitching', 'season': SEASON}
    )
    splits = data.get('stats', [{}])[0].get('splits', [])
    return splits[0].get('stat', {}) if splits else {}


def get_last_game_date(team_id: int) -> "str | None":
    """
    Find the most recent completed game for this team.
    Used to calculate days_since_last_game.
    """
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    data = mlb_get(
        'schedule',
        {
            'sportId':   1,
            'teamId':    team_id,
            'startDate': (datetime.date.today() - datetime.timedelta(days=7)).isoformat(),
            'endDate':   yesterday,
            'gameType':  'R',
        }
    )
    dates = data.get('dates', [])
    if not dates:
        return None
    # Most recent date with a final game
    for date_entry in reversed(dates):
        games = date_entry.get('games', [])
        for g in games:
            state = g.get('status', {}).get('abstractGameState', '')
            if state == 'Final':
                return date_entry.get('date')
    return None


def get_team_game_log_last_n(team_id: int, n_days: int = 14) -> list[dict]:
    """
    Get last N days of game log for bullpen L14 calcs.
    """
    start = (datetime.date.today() - datetime.timedelta(days=n_days)).isoformat()
    end   = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    data  = mlb_get(
        'schedule',
        {
            'sportId':   1,
            'teamId':    team_id,
            'startDate': start,
            'endDate':   end,
            'gameType':  'R',
            'hydrate':   'boxscore',
        }
    )
    games = []
    for date_entry in data.get('dates', []):
        for g in date_entry.get('games', []):
            if g.get('status', {}).get('abstractGameState') == 'Final':
                games.append(g)
    return games


def get_catcher_framing(team_id: int) -> "float | None":
    """
    Catcher framing runs — from MLB Stats API catcher fielding splits.
    framingRuns is a fielding stat for catchers.
    Returns team total framing runs (sum across catchers).
    """
    data = mlb_get(
        f'teams/{team_id}/stats',
        {
            'stats':    'season',
            'group':    'catching',
            'season':   SEASON,
        }
    )
    splits = data.get('stats', [{}])[0].get('splits', [])
    total_framing = 0.0
    found = False
    for s in splits:
        val = s.get('stat', {}).get('catcherEra')
        # framingRuns not always available — use passedBalls as proxy if not
        fr = s.get('stat', {}).get('framingRuns')
        if fr is not None:
            total_framing += float(fr or 0)
            found = True
    return round(total_framing, 1) if found else None


# ─────────────────────────────────────────────────────────────
# STATCAST TEAM METRICS
# ─────────────────────────────────────────────────────────────

def get_statcast_team_metrics() -> dict[str, dict]:
    """
    Batch-fetch Statcast batting metrics for all teams.
    Returns dict keyed by team abbreviation (e.g. 'NYY', 'BOS').

    Metrics:
      - avg_exit_velocity, barrel_pct, hard_hit_pct (batting)
      - sprint_speed_avg (team level)
      - chase_rate (oz_swing_percent — batter swings at balls)
      - zone_contact_rate (z_contact_percent)
    """
    metrics = {}

    try:
        from pybaseball import (
            statcast_batter_exitvelo_barrels,
            team_batting,
            cache,
        )
        cache.enable()
    except ImportError:
        print('  pybaseball not installed — skipping Statcast team metrics')
        return {}

    # ── Exit velo + barrel + hard hit by team ──────────────────
    try:
        from pybaseball import statcast_batter_exitvelo_barrels
        df = statcast_batter_exitvelo_barrels(SEASON, minBBE=50)
        # Group by team
        if 'team_id' in df.columns:
            grp = df.groupby('team_id').agg({
                'avg_hit_speed':    'mean',
                'brl_percent':      'mean',
                'hard_hit_percent': 'mean',
            }).reset_index()
            for _, row in grp.iterrows():
                team = str(row['team_id'])
                metrics.setdefault(team, {})
                metrics[team]['avg_exit_velocity'] = _safe_float(row.get('avg_hit_speed'))
                metrics[team]['barrel_pct']         = _safe_float(row.get('brl_percent'))
                metrics[team]['hard_hit_pct']       = _safe_float(row.get('hard_hit_percent'))
    except Exception as e:
        print(f'  Statcast exit velo team batch failed: {e}')

    # ── Sprint speed ────────────────────────────────────────────
    try:
        from pybaseball import statcast_sprint_speed
        df_speed = statcast_sprint_speed(SEASON, min_opp=10)
        if 'team_id' in df_speed.columns:
            grp = df_speed.groupby('team_id')['hp_to_1b'].mean().reset_index()
            for _, row in grp.iterrows():
                team = str(row['team_id'])
                metrics.setdefault(team, {})
                # hp_to_1b is in feet/second — higher = faster
                metrics[team]['sprint_speed_avg'] = _safe_float(row.get('hp_to_1b'))
    except Exception as e:
        print(f'  Sprint speed fetch failed: {e}')

    # ── Plate discipline (chase rate, zone contact) ─────────────
    try:
        from pybaseball import statcast_batter_arm_angle  # noqa — just checking install
        # Use team_batting from FanGraphs via pybaseball
        df_disc = team_batting(SEASON, qual=0)
        for _, row in df_disc.iterrows():
            team = str(row.get('Team', ''))
            if team:
                metrics.setdefault(team, {})
                metrics[team]['chase_rate']        = _safe_float(row.get('O-Swing%'))
                metrics[team]['zone_contact_rate']  = _safe_float(row.get('Z-Contact%'))
                metrics[team]['swstr_pct']          = _safe_float(row.get('SwStr%'))
    except Exception as e:
        print(f'  Team plate discipline fetch failed (FanGraphs): {e}')

    return metrics


# ─────────────────────────────────────────────────────────────
# BULLPEN L14 COMPUTATION
# ─────────────────────────────────────────────────────────────

def compute_bullpen_l14(team_id: int) -> dict:
    """
    Compute bullpen ERA and WHIP over last 14 days from game logs.
    This is a heuristic: total bullpen IP approximated from starter's IP.
    For exact figures we'd need box scores per game — approximate is fine.
    """
    data = mlb_get(
        f'teams/{team_id}/stats',
        {
            'stats':     'byDateRange',
            'group':     'pitching',
            'season':    SEASON,
            'startDate': (datetime.date.today() - datetime.timedelta(days=14)).isoformat(),
            'endDate':   datetime.date.today().isoformat(),
        }
    )
    splits = data.get('stats', [{}])[0].get('splits', [])
    if not splits:
        return {}
    stat = splits[0].get('stat', {})
    era  = _safe_float(stat.get('era'))
    whip = _safe_float(stat.get('whip'))
    inh  = int(stat.get('inheritedRunners', 0) or 0)
    inh_sc = int(stat.get('inheritedRunnersScored', 0) or 0)
    saves = int(stat.get('saves', 0) or 0)
    blown = int(stat.get('blownSaves', 0) or 0)

    result = {}
    if era  is not None: result['bullpen_era_l14']  = era
    if whip is not None: result['bullpen_whip_l14'] = whip
    if saves is not None: result['saves_l30']        = saves
    if blown is not None: result['blown_saves_l30']  = blown
    if inh >= 5:
        result['bullpen_inherited_strand_pct'] = round(1.0 - (inh_sc / inh), 3)
    return result


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    print(f'=== The Edge — fetch_team_advanced.py  ({SEASON}) ===')

    teams = get_all_teams()
    if not teams:
        print('No teams in team_stats — run the base team fetcher first')
        sys.exit(0)

    print(f'Found {len(teams)} teams to update')

    # Batch Statcast metrics once
    print('Fetching Statcast team metrics (batch)...')
    statcast = get_statcast_team_metrics()

    updated = 0
    errors  = []
    today   = datetime.date.today()

    for i, t in enumerate(teams):
        team_id   = t['team_id']
        team_name = t.get('team_name', f'ID:{team_id}')
        print(f'  [{i+1}/{len(teams)}] {team_name}')

        try:
            update = {'updated_at': datetime.datetime.utcnow().isoformat()}

            def add(key, val):
                if val is not None:
                    update[key] = val

            # ── Hitting season totals ──────────────────────────
            h = get_team_hitting_stats(team_id)
            time.sleep(SLEEP)
            add('avg_l30',        _safe_float(h.get('avg')))
            add('obp_l30',        _safe_float(h.get('obp')))
            add('slg_l30',        _safe_float(h.get('slg')))
            add('babip_l30',      _safe_float(h.get('babip')))

            # GDP per game
            gdp  = int(h.get('groundIntoDoublePlay', 0) or 0)
            gp   = int(h.get('gamesPlayed', 1) or 1)
            if gdp and gp:
                add('gdp_per_game', round(gdp / gp, 2))

            # HR per game L30
            hrs  = int(h.get('homeRuns', 0) or 0)
            if hrs and gp:
                add('hr_per_game_l30', round(hrs / gp, 2))

            # ── Situation splits (RISP, LOB) ───────────────────
            splits = get_team_hitting_splits(team_id)
            time.sleep(SLEEP)

            risp = splits.get('risp', {})
            add('avg_with_risp', _safe_float(risp.get('avg')))
            add('ops_with_risp', _safe_float(risp.get('ops')))

            lob = splits.get('lob', {})
            lob_pct = _safe_float(lob.get('leftOnBasePercentage'))
            if lob_pct is None:
                # compute manually if available
                lob_count = int(h.get('leftOnBase', 0) or 0)
                runners   = int(h.get('rbi', 0) or 0) + lob_count
                if runners > 0:
                    lob_pct = round(lob_count / runners, 3)
            add('lob_pct', lob_pct)

            # ── Fielding ───────────────────────────────────────
            f = get_team_fielding_stats(team_id)
            time.sleep(SLEEP)
            add('fielding_pct', _safe_float(f.get('fieldingPercentage')))

            # ── Catcher framing ────────────────────────────────
            framing = get_catcher_framing(team_id)
            time.sleep(SLEEP)
            add('catcher_framing_runs', framing)

            # ── Rest days ──────────────────────────────────────
            last_game_date_str = get_last_game_date(team_id)
            time.sleep(SLEEP)
            if last_game_date_str:
                last_game = datetime.date.fromisoformat(last_game_date_str)
                days_rest = (today - last_game).days
                add('days_since_last_game', days_rest)

            # ── Bullpen L14 ────────────────────────────────────
            bp14 = compute_bullpen_l14(team_id)
            time.sleep(SLEEP)
            for k, v in bp14.items():
                add(k, v)

            # ── Statcast (from batch) ──────────────────────────
            # Try to match by team_id string or team abbreviation
            sc = statcast.get(str(team_id), {})
            if not sc:
                # Try abbreviation match (FanGraphs uses abbrev)
                for key, val in statcast.items():
                    if key.upper() in team_name.upper() or team_name.upper() in key.upper():
                        sc = val
                        break

            add('avg_exit_velocity', sc.get('avg_exit_velocity'))
            add('barrel_pct',        sc.get('barrel_pct'))
            add('hard_hit_pct',      sc.get('hard_hit_pct'))
            add('sprint_speed_avg',  sc.get('sprint_speed_avg'))
            add('chase_rate',        sc.get('chase_rate'))
            add('zone_contact_rate', sc.get('zone_contact_rate'))
            add('swstr_pct',         sc.get('swstr_pct'))

            # ── Upsert ─────────────────────────────────────────
            supa.table('team_stats').update(update).eq('team_id', team_id).execute()
            updated += 1

        except Exception as e:
            errors.append(f'{team_name} ({team_id}): {e}')
            print(f'    ERROR: {e}')

    print(f'\n=== Done: {updated} updated, {len(errors)} errors ===')
    if errors:
        print('Errors:')
        for e in errors:
            print(f'  {e}')


if __name__ == '__main__':
    main()