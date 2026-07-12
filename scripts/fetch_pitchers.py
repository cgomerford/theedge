#!/usr/bin/env python3
"""
scripts/fetch_pitchers.py
The Edge — Unified Pitcher Data Fetcher

Replaces:
  - fetch_pitcher_advanced.py
  - fetch_pitcher_statcast.py  (new — never ran in prod)

Does NOT replace (different tables / pybaseball-heavy / weekly):
  - fetch_pitcher_tto_splits.py  → TTO data, weekly, pybaseball
  - fetch_pitch_arsenals.py      → pitch_arsenals table

Confirmed working Savant endpoints (tested July 4 2026):
  1. expected_statistics  → xera, xwoba_allowed
  2. statcast leaderboard → avg_exit_velocity, hard_hit_pct, barrel_pct
  3. custom (discipline)  → k_pct, bb_pct, whiff_pct
  4. custom (plate disc)  → chase_rate (oz_swing_percent),
                            zone_contact_rate (iz_contact_percent),
                            swstr_pct (swstr_percent)

NOT available from any free Savant source:
  gb_percent, fb_percent, ld_percent → return NULL from custom endpoint
  → gb_percent derived from gb_rate ratio already in DB

Run:  python3 scripts/fetch_pitchers.py
Cron: daily via GitHub Actions, 04:00 UTC
"""

import os
import sys
import time
import datetime
import requests
import pandas as pd
from io import StringIO
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: Missing Supabase env vars')
    sys.exit(1)

supa    = create_client(SUPABASE_URL, SUPABASE_KEY)
SEASON  = datetime.datetime.now().year
MLB_API = 'https://statsapi.mlb.com/api/v1'
SLEEP   = 0.35

SAVANT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/csv,*/*',
}


# ══════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════

def fetch_csv(url, label):
    try:
        r = requests.get(url, headers=SAVANT_HEADERS, timeout=30)
        r.raise_for_status()
        text = r.text.strip()
        if not text or text.startswith('<') or text.startswith('{'):
            print(f'  [{label}] Non-CSV response — blocked or empty')
            return None
        df = pd.read_csv(StringIO(text))
        print(f'  [{label}] {len(df)} rows')
        return df
    except Exception as e:
        print(f'  [{label}] ERROR: {e}')
        return None


def safe(val, decimals=4):
    try:
        f = float(val)
        return None if pd.isna(f) else round(f, decimals)
    except (TypeError, ValueError):
        return None


def safe_int(val):
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def mlb_get(path, params={}):
    url = f'{MLB_API}/{path}'
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=15)
            if r.status_code == 429:
                time.sleep(5)
                continue
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt == 2:
                return {}
            time.sleep(2)
    return {}


# ══════════════════════════════════════════════════════════════
# SECTION 1 — SAVANT BATCH (4 CSV fetches, ~60 seconds total)
# ══════════════════════════════════════════════════════════════

def fetch_savant_metrics(season):
    print('\n── Savant CSV batch ──')
    result = {}

    # 1. Expected statistics → xERA, xwOBA allowed
    df = fetch_csv(
        f'https://baseballsavant.mlb.com/leaderboard/expected_statistics'
        f'?type=pitcher&year={season}&position=&team=&min=10&csv=true',
        'expected_stats'
    )
    if df is not None:
        df['player_id'] = pd.to_numeric(df['player_id'], errors='coerce')
        for _, row in df.dropna(subset=['player_id']).iterrows():
            pid = int(row['player_id'])
            result.setdefault(pid, {})
            result[pid]['xera']          = safe(row.get('xera'), 3)
            result[pid]['xwoba_allowed'] = safe(row.get('est_woba'), 4)
    time.sleep(1)

    # 2. Statcast leaderboard → exit velocity, hard hit%, barrels
    df = fetch_csv(
        f'https://baseballsavant.mlb.com/leaderboard/statcast'
        f'?type=pitcher&year={season}&position=&team=&min=10&csv=true',
        'statcast_contact'
    )
    if df is not None:
        df['player_id'] = pd.to_numeric(df['player_id'], errors='coerce')
        for _, row in df.dropna(subset=['player_id']).iterrows():
            pid = int(row['player_id'])
            result.setdefault(pid, {})
            result[pid]['avg_exit_velocity'] = safe(row.get('avg_hit_speed'), 1)
            result[pid]['hard_hit_pct']      = safe(row.get('ev95percent'), 2)
            result[pid]['barrel_pct']        = safe(row.get('brl_percent'), 2)
    time.sleep(1)

    # 3. Custom leaderboard → K%, BB%, whiff%
    df = fetch_csv(
        f'https://baseballsavant.mlb.com/leaderboard/custom'
        f'?year={season}&type=pitcher&filter=&sort=4&sortDir=desc&min=10'
        f'&selections=k_percent,bb_percent,whiff_percent,hard_hit_percent&team=&csv=true',
        'discipline_rates'
    )
    if df is not None:
        df['player_id'] = pd.to_numeric(df['player_id'], errors='coerce')
        for _, row in df.dropna(subset=['player_id']).iterrows():
            pid = int(row['player_id'])
            result.setdefault(pid, {})
            result[pid]['k_pct']     = safe(row.get('k_percent'), 3)
            result[pid]['bb_pct']    = safe(row.get('bb_percent'), 3)
            result[pid]['whiff_pct'] = safe(row.get('whiff_percent'), 2)
            hh = safe(row.get('hard_hit_percent'), 2)
            if hh is not None and result[pid].get('hard_hit_pct') is None:
                result[pid]['hard_hit_pct'] = hh
    time.sleep(1)

    # 4. Custom leaderboard → chase rate, zone contact, swstr%
    # CONFIRMED WORKING July 4 2026:
    # oz_swing_percent   = chase rate
    # iz_contact_percent = zone contact rate
    # swstr_percent      = swinging strike rate
    df = fetch_csv(
        f'https://baseballsavant.mlb.com/leaderboard/custom'
        f'?year={season}&type=pitcher&filter=&sort=4&sortDir=desc&min=10'
        f'&selections=oz_swing_percent,iz_contact_percent,swstr_percent&team=&csv=true',
        'plate_discipline'
    )
    if df is not None:
        df['player_id'] = pd.to_numeric(df['player_id'], errors='coerce')
        for _, row in df.dropna(subset=['player_id']).iterrows():
            pid = int(row['player_id'])
            result.setdefault(pid, {})
            result[pid]['chase_rate']        = safe(row.get('oz_swing_percent'), 2)
            result[pid]['zone_contact_rate'] = safe(row.get('iz_contact_percent'), 2)
            result[pid]['swstr_pct']         = safe(row.get('swstr_percent'), 2)

    print(f'\n  Total: {len(result)} pitchers with Savant data')
    return result


# ══════════════════════════════════════════════════════════════
# SECTION 2 — MLB STATS API HELPERS
# ══════════════════════════════════════════════════════════════

def get_game_log(player_id):
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


def get_season_totals(player_id):
    data = mlb_get(
        f'people/{player_id}/stats',
        {'stats': 'season', 'group': 'pitching', 'season': SEASON}
    )
    splits = data.get('stats', [{}])[0].get('splits', [])
    return splits[0].get('stat', {}) if splits else {}


def get_count_splits(player_id):
    data = mlb_get(
        f'people/{player_id}/stats',
        {'stats': 'statSplits', 'group': 'pitching', 'season': SEASON, 'sitCodes': 'c00,c02,c32'}
    )
    result = {}
    code_map = {'c00': '0_0', 'c02': '0_2', 'c32': '3_2'}
    for block in data.get('stats', []):
        for split in block.get('splits', []):
            code = split.get('split', {}).get('code', '')
            if code in code_map:
                avg = split.get('stat', {}).get('avg')
                if avg and avg not in ('-.---', ''):
                    try:
                        result[code_map[code]] = float(avg)
                    except (ValueError, TypeError):
                        pass
    return result or None


def compute_game_log_stats(game_log):
    if not game_log:
        return {}
    starts = [g for g in game_log if g['innings_pitched'] >= 3.0]
    if not starts:
        return {}
    quality   = sum(1 for g in starts if g['innings_pitched'] >= 6.0 and g['earned_runs'] <= 3)
    total_gdp = sum(g['gdp'] for g in starts)
    total_ip  = sum(g['innings_pitched'] for g in starts)
    pitches   = [g['number_of_pitches'] for g in starts if g['number_of_pitches'] > 0]
    sorted_log = sorted(game_log, key=lambda x: x['date'], reverse=True)
    last_pc = next((g['number_of_pitches'] for g in sorted_log if g['number_of_pitches'] > 0), None)
    return {
        'quality_start_pct': round(quality / len(starts), 3),
        'avg_pitch_count':   round(sum(pitches) / len(pitches), 1) if pitches else None,
        'pitch_count_last':  last_pc,
        'gdp_rate':          round(total_gdp / total_ip * 9, 3) if total_ip > 0 else None,
    }


def derive_babip(stat):
    """MLB API doesn't return BABIP for pitchers — derive it."""
    try:
        h  = int(stat.get('hits', 0) or 0)
        hr = int(stat.get('homeRuns', 0) or 0)
        ab = int(stat.get('atBats', 0) or 0)
        k  = int(stat.get('strikeOuts', 0) or 0)
        sf = int(stat.get('sacFlies', 0) or 0)
        denom = ab - k - hr + sf
        if denom < 10:
            return None
        return round((h - hr) / denom, 3)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def derive_gb_percent(gb_rate):
    """Convert groundout/airout ratio to GB%. Already have gb_rate in DB."""
    if gb_rate is None:
        return None
    try:
        ratio = float(gb_rate)
        if ratio <= 0:
            return None
        return round(ratio / (1 + ratio) * 100, 1)
    except (TypeError, ValueError):
        return None


def derive_inherited_strand(stat):
    inherited    = int(stat.get('inheritedRunners', 0) or 0)
    inherited_sc = int(stat.get('inheritedRunnersScored', 0) or 0)
    if inherited < 5:
        return None
    return round(1.0 - (inherited_sc / inherited), 3)


# ══════════════════════════════════════════════════════════════
# SECTION 3 — MAIN
# ══════════════════════════════════════════════════════════════

def main():
    print(f'=== fetch_pitchers.py — {SEASON} ===')
    print('Unified: Savant CSVs + MLB Stats API\n')

    # Step 1: Savant batch
    savant = fetch_savant_metrics(SEASON)

    # Step 2: Load pitchers from DB (include gb_rate for derivation)
    print('\n── MLB Stats API per-pitcher ──')
    resp = supa.table('pitcher_stats')\
        .select('player_id, player_name, gb_rate')\
        .eq('season', SEASON)\
        .execute()
    pitchers = resp.data or []

    if not pitchers:
        print('No pitchers in DB — run Vercel refresh-pitcher-stats cron first')
        sys.exit(0)

    print(f'Processing {len(pitchers)} pitchers\n')

    updated = 0
    errors  = []

    for i, p in enumerate(pitchers):
        pid  = p['player_id']
        name = p.get('player_name', f'ID:{pid}')

        try:
            update = {'updated_at': datetime.datetime.utcnow().isoformat()}

            def add(key, val):
                if val is not None:
                    update[key] = val

            # Savant (from batch — no API calls)
            sc = savant.get(pid, {})
            add('xera',              sc.get('xera'))
            add('xwoba_allowed',     sc.get('xwoba_allowed'))
            add('avg_exit_velocity', sc.get('avg_exit_velocity'))
            add('hard_hit_pct',      sc.get('hard_hit_pct'))
            add('barrel_pct',        sc.get('barrel_pct'))
            add('k_pct',             sc.get('k_pct'))
            add('bb_pct',            sc.get('bb_pct'))
            add('whiff_pct',         sc.get('whiff_pct'))
            add('chase_rate',        sc.get('chase_rate'))
            add('zone_contact_rate', sc.get('zone_contact_rate'))
            add('swstr_pct',         sc.get('swstr_pct'))

            # GB% derived from gb_rate already in DB
            add('gb_percent', derive_gb_percent(p.get('gb_rate')))

            # MLB Stats API — game log
            game_log = get_game_log(pid)
            gl       = compute_game_log_stats(game_log)
            time.sleep(SLEEP)

            add('gdp_rate',          gl.get('gdp_rate'))
            add('quality_start_pct', gl.get('quality_start_pct'))
            add('avg_pitch_count',   gl.get('avg_pitch_count'))
            add('pitch_count_last',  gl.get('pitch_count_last'))

            # Season totals
            stat = get_season_totals(pid)
            time.sleep(SLEEP)

            add('babip',               derive_babip(stat))
            add('inherited_strand_pct', derive_inherited_strand(stat))
            add('saves',               safe_int(stat.get('saves')))
            add('blown_saves',         safe_int(stat.get('blownSaves')))
            add('holds',               safe_int(stat.get('holds')))

            k9  = safe(stat.get('strikeoutsPer9Inn'))
            bb9 = safe(stat.get('walksPer9Inn'))
            if k9 and bb9 and bb9 > 0:
                add('k_bb_ratio', round(k9 / bb9, 2))

            # Count splits
            count_ba = get_count_splits(pid)
            if count_ba:
                add('avg_by_count', count_ba)
            time.sleep(SLEEP)

            if len(update) > 1:
                supa.table('pitcher_stats')\
                    .update(update)\
                    .eq('player_id', pid)\
                    .execute()
                updated += 1

            if (i + 1) % 25 == 0 or i < 3:
                print(
                    f'  [{i+1}/{len(pitchers)}] {name}: '
                    f'xERA={update.get("xera","—")} '
                    f'K%={update.get("k_pct","—")} '
                    f'chase={update.get("chase_rate","—")} '
                    f'BABIP={update.get("babip","—")}'
                )

        except Exception as e:
            errors.append(f'{name} ({pid}): {e}')

    print(f'\n=== DONE: {updated} updated, {len(errors)} errors ===')
    if errors[:5]:
        for e in errors[:5]:
            print(f'  {e}')

    # Verification — Sánchez
    print('\n── Verification: Cristopher Sánchez (650911) ──')
    check = supa.table('pitcher_stats')\
        .select(
            'player_name,era,xera,xwoba_allowed,'
            'k_pct,bb_pct,whiff_pct,swstr_pct,'
            'chase_rate,zone_contact_rate,'
            'hard_hit_pct,avg_exit_velocity,barrel_pct,'
            'gb_percent,babip,quality_start_pct,'
            'avg_pitch_count,pitch_count_last'
        )\
        .eq('player_id', 650911)\
        .eq('season', SEASON)\
        .execute()

    if check.data:
        d = check.data[0]
        fields = [
            ('ERA',             d.get('era')),
            ('xERA',            d.get('xera')),
            ('xwOBA allowed',   d.get('xwoba_allowed')),
            ('K%',              d.get('k_pct')),
            ('BB%',             d.get('bb_pct')),
            ('Whiff%',          d.get('whiff_pct')),
            ('SwStr%',          d.get('swstr_pct')),
            ('Chase rate',      d.get('chase_rate')),
            ('Zone contact',    d.get('zone_contact_rate')),
            ('Hard hit%',       d.get('hard_hit_pct')),
            ('Avg exit velo',   d.get('avg_exit_velocity')),
            ('Barrel%',         d.get('barrel_pct')),
            ('GB%',             d.get('gb_percent')),
            ('BABIP',           d.get('babip')),
            ('QS%',             d.get('quality_start_pct')),
            ('Avg pitch count', d.get('avg_pitch_count')),
            ('Last outing PC',  d.get('pitch_count_last')),
        ]
        for label, val in fields:
            status = '✓' if val is not None else '✗ NULL'
            print(f'  {label:<20} {str(val) if val is not None else "—":>10}   {status}')

    # Top 10 by xERA
    print('\n── Top 10 starters by xERA ──')
    top = supa.table('pitcher_stats')\
        .select('player_name,era,xera,k_pct,whiff_pct,innings_pitched')\
        .eq('season', SEASON)\
        .not_.is_('xera', 'null')\
        .gte('innings_pitched', 30)\
        .order('xera', desc=False)\
        .limit(10)\
        .execute()

    if top.data:
        for r in top.data:
            print(
                f'  {str(r["player_name"]):<26} '
                f'ERA={str(r.get("era") or "—"):>5}  '
                f'xERA={str(r.get("xera") or "—"):>5}  '
                f'K%={str(r.get("k_pct") or "—"):>5}  '
                f'IP={str(r.get("innings_pitched") or "—"):>6}'
            )


if __name__ == '__main__':
    main()