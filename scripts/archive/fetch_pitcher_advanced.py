#!/usr/bin/env python3
"""
fetch_pitcher_advanced.py
The Edge — V5 Advanced Pitcher Data Fetcher

Fetches and writes advanced pitcher stats to pitcher_stats table.
Adds: GDP rate, quality start %, avg pitch count, exit velocity,
chase rate, K/BB, zone contact, SwStr%, barrel%, strand rate,
BABIP, FIP-, ERA-, WAR, count-based BA splits, inherited strand %.

Sources:
  - MLB Stats API (statsapi.mlb.com) — free, no auth
  - pybaseball (Statcast) — already installed

Run: python3 scripts/fetch_pitcher_advanced.py
Schedule: Nightly via GitHub Actions (add to existing workflow)
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

MLB_API   = 'https://statsapi.mlb.com/api/v1'
SEASON    = datetime.datetime.now().year
SLEEP     = 0.4   # seconds between MLB API calls — stay under rate limit


# ─────────────────────────────────────────────────────────────
# MLB STATS API HELPERS
# ─────────────────────────────────────────────────────────────

def mlb_get(path: str, params: dict = {}) -> dict:
    """GET from MLB Stats API with basic retry."""
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


def get_all_pitcher_ids() -> list[dict]:
    """
    Get every pitcher currently in pitcher_stats table.
    We only update pitchers we're already tracking.
    """
    resp = supa.table('pitcher_stats').select('player_id, player_name, team_id').execute()
    return resp.data or []


def get_pitcher_game_log(player_id: int) -> list[dict]:
    """
    Returns game-by-game log for this pitcher this season.
    Used to calculate quality starts, avg pitch count.
    """
    data = mlb_get(
        f'people/{player_id}/stats',
        {'stats': 'gameLog', 'group': 'pitching', 'season': SEASON}
    )
    splits = data.get('stats', [{}])[0].get('splits', [])
    results = []
    for s in splits:
        stat = s.get('stat', {})
        results.append({
            'date':              s.get('date', ''),
            'innings_pitched':   float(stat.get('inningsPitched', 0) or 0),
            'earned_runs':       int(stat.get('earnedRuns', 0) or 0),
            'number_of_pitches': int(stat.get('numberOfPitches', 0) or 0),
            'gdp':               int(stat.get('groundIntoDoublePlay', 0) or 0),
        })
    return results


def get_pitcher_advanced_season(player_id: int) -> dict:
    """
    Season totals from MLB Stats API pitching group.
    Returns raw stat dict.
    """
    data = mlb_get(
        f'people/{player_id}/stats',
        {'stats': 'season', 'group': 'pitching', 'season': SEASON}
    )
    splits = data.get('stats', [{}])[0].get('splits', [])
    if not splits:
        return {}
    return splits[0].get('stat', {})


def get_pitcher_splits(player_id: int) -> dict:
    """
    Pitching splits: vs LHB, vs RHB, home/away, by count.
    MLB Stats API pitchingSplits group.
    """
    data = mlb_get(
        f'people/{player_id}/stats',
        {'stats': 'statSplits', 'group': 'pitching', 'season': SEASON,
         'sitCodes': 'vl,vr,h,a,c00,c02,c32,c33'}
    )
    result = {}
    for block in data.get('stats', []):
        for split in block.get('splits', []):
            code = split.get('split', {}).get('code', '')
            stat = split.get('stat', {})
            result[code] = stat
    return result


def get_pitcher_inherited_runners(player_id: int) -> "float | None":
    """
    Inherited runners stranded %.
    From season relief pitching stats.
    """
    data = mlb_get(
        f'people/{player_id}/stats',
        {'stats': 'season', 'group': 'pitching', 'season': SEASON}
    )
    splits = data.get('stats', [{}])[0].get('splits', [])
    if not splits:
        return None
    stat = splits[0].get('stat', {})
    inherited     = int(stat.get('inheritedRunners', 0) or 0)
    inherited_sc  = int(stat.get('inheritedRunnersScored', 0) or 0)
    if inherited < 5:
        return None
    return round(1.0 - (inherited_sc / inherited), 3)


# ─────────────────────────────────────────────────────────────
# STATCAST VIA PYBASEBALL
# ─────────────────────────────────────────────────────────────

def get_statcast_pitcher_metrics() -> dict[int, dict]:
    """
    Fetch Statcast-level pitcher metrics for all pitchers.
    Returns dict keyed by player_id.

    Columns we use:
      xba, xslg, xwoba, xwobacon, exit_velocity_avg,
      barrel_batted_rate, hard_hit_percent,
      oz_swing_percent (chase), zone_percent,
      whiff_percent, swstr_percent
    """
    try:
        from pybaseball import statcast_pitcher_exitvelo_barrels, cache
        from pybaseball import pitching_stats_bref  # FIP-, ERA-, WAR
        cache.enable()
    except ImportError:
        print('  pybaseball not installed — skipping Statcast metrics')
        return {}

    metrics = {}

    # Exit velocity + barrel + hard hit
    try:
        df_ev = statcast_pitcher_exitvelo_barrels(SEASON, minBBE=20)
        for _, row in df_ev.iterrows():
            pid = int(row.get('pitcher_id', 0) or 0)
            if pid:
                metrics.setdefault(pid, {})
                metrics[pid]['avg_exit_velocity']  = _safe_float(row.get('avg_hit_speed'))
                metrics[pid]['barrel_pct']          = _safe_float(row.get('brl_percent'))
                metrics[pid]['hard_hit_pct']        = _safe_float(row.get('hard_hit_percent'))
    except Exception as e:
        print(f'  Statcast exit velo fetch failed: {e}')

    # Plate discipline (chase rate, zone contact, swstr)
    try:
        from pybaseball import statcast_pitcher_arsenal_stats
        df_disc = statcast_pitcher_arsenal_stats(year=SEASON, minPA=20)
        # Aggregate across all pitches per pitcher
        pitcher_groups = df_disc.groupby('pitcher_id').agg({
            'oz_swing_percent':    'mean',   # chase rate
            'z_swing_miss_percent':'mean',   # zone SwStr
            'whiff_percent':       'mean',   # overall whiff
        }).reset_index()
        for _, row in pitcher_groups.iterrows():
            pid = int(row.get('pitcher_id', 0) or 0)
            if pid:
                metrics.setdefault(pid, {})
                metrics[pid]['chase_rate']         = _safe_float(row.get('oz_swing_percent'))
                metrics[pid]['zone_contact_rate']   = _safe_float(row.get('z_swing_miss_percent'))
                metrics[pid]['swstr_pct']           = _safe_float(row.get('whiff_percent'))
    except Exception as e:
        print(f'  Statcast plate discipline fetch failed: {e}')

    # FIP-, ERA-, WAR from Baseball Reference via pybaseball
    try:
        df_war = pitching_stats_bref(SEASON)
        # bref uses Name column, match by name — imperfect but workable
        war_by_name = {}
        for _, row in df_war.iterrows():
            war_by_name[str(row.get('Name', '')).lower()] = {
                'war': _safe_float(row.get('WAR')),
            }
        metrics['_war_by_name'] = war_by_name
    except Exception as e:
        print(f'  BRef WAR fetch failed: {e}')

    return metrics


def _safe_float(val) -> "float | None":
    try:
        f = float(val)
        return round(f, 4) if not pd.isna(f) else None
    except:
        return None


# ─────────────────────────────────────────────────────────────
# COMPUTE DERIVED STATS FROM GAME LOG
# ─────────────────────────────────────────────────────────────

def compute_game_log_stats(game_log: list[dict]) -> dict:
    """
    Derived from per-game data:
      - quality_start_pct: starts with ≥6IP and ≤3 ER
      - avg_pitch_count:   mean pitches per start
      - gdp_rate:          ground into DP per 9 IP
    """
    if not game_log:
        return {}

    # Only count starts (≥3 IP and has pitch count data)
    starts = [g for g in game_log if g['innings_pitched'] >= 3.0]
    if not starts:
        return {}

    quality_starts = sum(
        1 for g in starts
        if g['innings_pitched'] >= 6.0 and g['earned_runs'] <= 3
    )
    total_gdp = sum(g['gdp'] for g in starts)
    total_ip  = sum(g['innings_pitched'] for g in starts)
    total_pitches = [g['number_of_pitches'] for g in starts if g['number_of_pitches'] > 0]

    return {
        'quality_start_pct': round(quality_starts / len(starts), 3) if starts else None,
        'avg_pitch_count':   round(sum(total_pitches) / len(total_pitches), 1) if total_pitches else None,
        'gdp_rate':          round(total_gdp / total_ip * 9, 3) if total_ip > 0 else None,
    }


def compute_count_splits(splits: dict) -> "dict | None":
    """
    Build avg_by_count JSON from split codes:
      c00 = 0-0, c02 = 0-2, c32 = 3-2, c33 = full count
    """
    result = {}
    code_map = {'c00': '0_0', 'c02': '0_2', 'c32': '3_2', 'c33': 'full'}
    for code, label in code_map.items():
        stat = splits.get(code, {})
        avg = stat.get('avg')
        if avg and avg not in ('-.---', ''):
            try:
                result[label] = float(avg)
            except:
                pass
    return result if result else None


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

def main():
    print(f'=== The Edge — fetch_pitcher_advanced.py  ({SEASON}) ===')

    pitchers = get_all_pitcher_ids()
    if not pitchers:
        print('No pitchers in pitcher_stats — run the base fetcher first')
        sys.exit(0)

    print(f'Found {len(pitchers)} pitchers to update')

    # Fetch Statcast metrics once for all pitchers (one big batch)
    print('Fetching Statcast metrics (batch)...')
    statcast = get_statcast_pitcher_metrics()
    war_lookup = statcast.pop('_war_by_name', {})

    updated = 0
    errors  = []

    for i, p in enumerate(pitchers):
        pid   = p['player_id']
        name  = p.get('player_name', f'ID:{pid}')
        print(f'  [{i+1}/{len(pitchers)}] {name}')

        try:
            # 1. Game log derived stats
            game_log    = get_pitcher_game_log(pid)
            gl_stats    = compute_game_log_stats(game_log)
            time.sleep(SLEEP)

            # 2. Season totals (advanced)
            season_stat = get_pitcher_advanced_season(pid)
            time.sleep(SLEEP)

            # 3. Count-based splits
            splits      = get_pitcher_splits(pid)
            count_ba    = compute_count_splits(splits)
            time.sleep(SLEEP)

            # 4. Inherited runners
            inh_strand  = get_pitcher_inherited_runners(pid)
            time.sleep(SLEEP)

            # 5. Statcast from batch
            sc = statcast.get(pid, {})

            # 6. WAR by name
            war_val = None
            name_lower = name.lower()
            for war_name, war_data in war_lookup.items():
                if war_name in name_lower or name_lower in war_name:
                    war_val = war_data.get('war')
                    break

            # Build update row — only include non-None values
            update = {'updated_at': datetime.datetime.utcnow().isoformat()}

            def add(key, val):
                if val is not None:
                    update[key] = val

            # From game log
            add('gdp_rate',           gl_stats.get('gdp_rate'))
            add('quality_start_pct',  gl_stats.get('quality_start_pct'))
            add('avg_pitch_count',    gl_stats.get('avg_pitch_count'))

            # From season totals
            add('strand_rate', _safe_float(season_stat.get('stolenBasePercentage')))
            add('babip',       _safe_float(season_stat.get('babip')))
            add('saves',       season_stat.get('saves'))
            add('blown_saves', season_stat.get('blownSaves'))
            add('holds',       season_stat.get('holds'))

            # K/BB ratio — compute from existing K/9 and BB/9
            # Pull existing values from DB if not in season_stat
            k9  = _safe_float(season_stat.get('strikeoutsPer9Inn'))
            bb9 = _safe_float(season_stat.get('walksPer9Inn'))
            if k9 and bb9 and bb9 > 0:
                add('k_bb_ratio', round(k9 / bb9, 2))

            # Batted ball
            add('line_drive_pct',   _safe_float(season_stat.get('lineDrivePercentage')))
            add('flyball_pct',      _safe_float(season_stat.get('flyBallPercentage')))
            add('hr_per_fb',        _safe_float(season_stat.get('homeRunsPerNine')))
            add('popup_pct',        _safe_float(season_stat.get('popUpPercentage')))
            add('soft_contact_pct', _safe_float(season_stat.get('softHitPercentage')))
            add('medium_contact_pct',_safe_float(season_stat.get('mediumHitPercentage')))
            add('hard_contact_pct', _safe_float(season_stat.get('hardHitPercentage')))

            # Count splits
            if count_ba:
                add('avg_by_count', count_ba)

            # Inherited runners
            add('inherited_strand_pct', inh_strand)

            # Statcast
            add('avg_exit_velocity', sc.get('avg_exit_velocity'))
            add('barrel_pct',        sc.get('barrel_pct'))
            add('chase_rate',        sc.get('chase_rate'))
            add('zone_contact_rate', sc.get('zone_contact_rate'))
            add('swstr_pct',         sc.get('swstr_pct'))

            # WAR
            add('war', war_val)

            # Upsert
            supa.table('pitcher_stats').update(update).eq('player_id', pid).execute()
            updated += 1

        except Exception as e:
            errors.append(f'{name} ({pid}): {e}')
            print(f'    ERROR: {e}')

    print(f'\n=== Done: {updated} updated, {len(errors)} errors ===')
    if errors:
        print('Errors:')
        for e in errors:
            print(f'  {e}')


if __name__ == '__main__':
    main()