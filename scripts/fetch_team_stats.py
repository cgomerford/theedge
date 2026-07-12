#!/usr/bin/env python3
"""
scripts/fetch_team_stats.py
The Edge — Master Team Stats Fetcher

Single script that collects every team-level stat the Edge model uses.
Replaces: fetch_team_statcast.py, fetch_team_advanced.py, fetch_team_platoon_splits.py

Sources:
  ① MLB Stats API      — hitting, pitching, fielding, splits, schedule
  ② Baseball Savant    — xwOBA, hard hit%, chase rate, zone contact, swstr%, sprint speed
  ③ Savant OAA         — Outs Above Average per position, summed to team total

Writes to:
  - team_stats          (all per-team metrics)
  - team_platoon_splits (vs LHP / vs RHP splits — separate table, joined in edge.ts)

Run:   python3 scripts/fetch_team_stats.py
Cron:  04:30 UTC daily via GitHub Actions (before Vercel 05:00 cron chain)

Python 3.9+ compatible. No pybaseball dependency — uses confirmed Savant CSV endpoints only.
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

# ── Env ───────────────────────────────────────────────────────────────────────

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

SEASON = datetime.datetime.now().year
TODAY  = datetime.date.today()
SLEEP  = 0.35   # seconds between MLB API calls — stays well under rate limit

MLB_API = 'https://statsapi.mlb.com/api/v1'

# All 30 MLB teams: MLB team_id → display name
MLB_TEAMS: dict[int, str] = {
    108: 'Los Angeles Angels',
    109: 'Arizona Diamondbacks',
    110: 'Baltimore Orioles',
    111: 'Boston Red Sox',
    112: 'Chicago Cubs',
    113: 'Cincinnati Reds',
    114: 'Cleveland Guardians',
    115: 'Colorado Rockies',
    116: 'Detroit Tigers',
    117: 'Houston Astros',
    118: 'Kansas City Royals',
    119: 'Los Angeles Dodgers',
    120: 'Washington Nationals',
    121: 'New York Mets',
    133: 'Athletics',
    134: 'Pittsburgh Pirates',
    135: 'San Diego Padres',
    136: 'Seattle Mariners',
    137: 'San Francisco Giants',
    138: 'St. Louis Cardinals',
    139: 'Tampa Bay Rays',
    140: 'Texas Rangers',
    141: 'Toronto Blue Jays',
    142: 'Minnesota Twins',
    143: 'Philadelphia Phillies',
    144: 'Atlanta Braves',
    145: 'Chicago White Sox',
    146: 'Miami Marlins',
    147: 'New York Yankees',
    158: 'Milwaukee Brewers',
}

SAVANT_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/126.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': 'https://baseballsavant.mlb.com/',
}


# ═══════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════

def sf(val, decimals: int = 4) -> 'float | None':
    """Safe float — returns None for null/NaN/error."""
    try:
        f = float(val)
        if pd.isna(f):
            return None
        return round(f, decimals)
    except (TypeError, ValueError):
        return None


def si(val) -> 'int | None':
    """Safe int."""
    try:
        f = float(val)
        if pd.isna(f):
            return None
        return int(round(f))
    except (TypeError, ValueError):
        return None


def ip_to_float(ip_str) -> float:
    """Convert '15.1' MLB innings format to decimal (15.333)."""
    try:
        parts = str(ip_str).split('.')
        full = int(parts[0])
        thirds = int(parts[1]) if len(parts) > 1 else 0
        return round(full + thirds / 3, 4)
    except Exception:
        return 0.0


def mlb_get(path: str, params: dict = {}) -> dict:
    """MLB Stats API GET with retry."""
    url = f'{MLB_API}/{path}'
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=15)
            if r.status_code == 429:
                time.sleep(10)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt == 2:
                print(f'    MLB API error [{path}]: {e}')
                return {}
            time.sleep(3)
    return {}


def fetch_savant_csv(url: str, label: str) -> 'pd.DataFrame | None':
    """Fetch a Savant CSV endpoint. Returns DataFrame or None."""
    try:
        r = requests.get(url, headers=SAVANT_HEADERS, timeout=30)
        r.raise_for_status()
        text = r.text.strip()
        if not text or text.startswith('<') or text.startswith('{'):
            print(f'  [{label}] Non-CSV response — Savant may be blocking')
            return None
        df = pd.read_csv(StringIO(text))
        print(f'  [{label}] {len(df)} rows · {len(df.columns)} columns')
        return df
    except Exception as e:
        print(f'  [{label}] ERROR: {e}')
        return None


# ═══════════════════════════════════════════════════════════════════
# SOURCE A — BASEBALL SAVANT CSVs
# ═══════════════════════════════════════════════════════════════════

def fetch_savant_metrics() -> 'tuple[dict[int, dict], dict[int, float], dict[int, int]]':
    """
    Fetches three Savant datasets:
      1. Discipline CSV  → xwOBA, hard hit%, chase rate, zone contact, swstr%, barrel%, exit velo
      2. Sprint speed    → avg sprint speed per team (also provides player→team mapping)
      3. OAA             → Outs Above Average per position, summed to team total

    Returns: (discipline_by_team_id, sprint_by_team_id, oaa_by_team_id)
    """
    discipline: dict[int, dict] = {}
    sprint:     dict[int, float] = {}
    oaa:        dict[int, int]   = {}

    # ── 1. Sprint speed (player-level WITH team_id — our cross-join bridge) ──
    print('  Fetching sprint speed...')
    sprint_url = (
        f'https://baseballsavant.mlb.com/leaderboard/sprint_speed'
        f'?year={SEASON}&position=&team=&min=0&csv=true'
    )
    sprint_df = fetch_savant_csv(sprint_url, 'sprint')

    player_team_map: dict[int, int] = {}

    if sprint_df is not None:
        for _, row in sprint_df.iterrows():
            pid = si(row.get('player_id'))
            tid = si(row.get('team_id'))
            if pid and tid:
                player_team_map[pid] = tid

        sprint_df['team_id']     = pd.to_numeric(sprint_df['team_id'], errors='coerce')
        sprint_df['sprint_speed'] = pd.to_numeric(sprint_df['sprint_speed'], errors='coerce')
        grouped = sprint_df.dropna(subset=['team_id', 'sprint_speed']).groupby('team_id')['sprint_speed'].mean()
        for tid, avg in grouped.items():
            sprint[int(tid)] = round(float(avg), 1)

        print(f'    {len(player_team_map)} player→team mappings · {len(sprint)} teams with sprint speed')

    time.sleep(2)

    # ── 2. Discipline + contact quality (player-level, NO team_id) ───────────
    print('  Fetching batting discipline (xwOBA, hard hit, chase, zone contact, swstr)...')
    disc_url = (
        f'https://baseballsavant.mlb.com/leaderboard/custom'
        f'?year={SEASON}&type=batter&filter=&sort=4&sortDir=desc&min=1'
        f'&selections=xba,xslg,xwoba,exit_velocity_avg,'
        f'barrel_batted_rate,hard_hit_percent,oz_swing_percent,'
        f'iz_contact_percent,swinging_strike_percent'
        f'&team=&csv=true'
    )
    disc_df = fetch_savant_csv(disc_url, 'discipline')

    if disc_df is not None and player_team_map:
        disc_df['player_id'] = pd.to_numeric(disc_df['player_id'], errors='coerce')
        disc_df['team_id']   = disc_df['player_id'].map(player_team_map)

        mapped = disc_df['team_id'].notna().sum()
        print(f'    {mapped}/{len(disc_df)} players mapped to teams')

        if mapped > 0:
            for col in ['xwoba', 'hard_hit_percent', 'oz_swing_percent',
                        'barrel_batted_rate', 'exit_velocity_avg',
                        'iz_contact_percent', 'swinging_strike_percent']:
                if col in disc_df.columns:
                    disc_df[col] = pd.to_numeric(disc_df[col], errors='coerce')

            grouped = disc_df.dropna(subset=['team_id']).groupby('team_id').agg({
                c: 'mean' for c in [
                    'xwoba', 'hard_hit_percent', 'oz_swing_percent',
                    'barrel_batted_rate', 'exit_velocity_avg',
                    'iz_contact_percent', 'swinging_strike_percent',
                ] if c in disc_df.columns
            })

            for tid, row in grouped.iterrows():
                discipline[int(tid)] = {
                    'xwoba_l30':         sf(row.get('xwoba'), 4),
                    'hard_hit_pct':      sf(row.get('hard_hit_percent'), 2),
                    'chase_rate':        sf(row.get('oz_swing_percent'), 2),
                    'barrel_pct':        sf(row.get('barrel_batted_rate'), 2),
                    'avg_exit_velocity': sf(row.get('exit_velocity_avg'), 1),
                    'zone_contact_rate': sf(row.get('iz_contact_percent'), 2),
                    'swstr_pct':         sf(row.get('swinging_strike_percent'), 2),
                }

            print(f'    Discipline aggregated for {len(discipline)} teams')

    time.sleep(2)

    # ── 3. OAA — per position, all 9, summed to team total ───────────────────
    print('  Fetching OAA (all 9 positions per team)...')
    for team_id in MLB_TEAMS:
        total_oaa = 0
        got_any   = False
        for pos in ['1', '2', '3', '4', '5', '6', '7', '8', '9']:
            url = (
                f'https://baseballsavant.mlb.com/leaderboard/outs_above_average'
                f'?type=Fielder&year={SEASON}&team={team_id}&pos={pos}&min=0&csv=true'
            )
            try:
                r = requests.get(url, headers=SAVANT_HEADERS, timeout=15)
                if not r.ok or r.text.strip().startswith('<'):
                    continue
                lines = r.text.strip().split('\n')
                if len(lines) < 2:
                    continue
                headers = [h.strip().lower() for h in lines[0].split(',')]
                oaa_idx = next(
                    (i for i, h in enumerate(headers)
                     if 'outs_above_average' in h or h == 'oaa'),
                    None
                )
                if oaa_idx is None:
                    continue
                for line in lines[1:]:
                    cells = line.split(',')
                    try:
                        total_oaa += float(cells[oaa_idx])
                        got_any = True
                    except (ValueError, IndexError):
                        pass
            except Exception:
                pass
            time.sleep(0.25)

        if got_any:
            oaa[team_id] = int(round(total_oaa))

        time.sleep(0.4)

    print(f'    OAA retrieved for {len(oaa)}/30 teams')
    return discipline, sprint, oaa


# ═══════════════════════════════════════════════════════════════════
# SOURCE B — MLB STATS API PER-TEAM
# ═══════════════════════════════════════════════════════════════════

def get_hitting_stats(team_id: int) -> dict:
    data = mlb_get(f'teams/{team_id}/stats',
                   {'stats': 'season', 'group': 'hitting', 'season': SEASON})
    splits = data.get('stats', [{}])[0].get('splits', [])
    return splits[0].get('stat', {}) if splits else {}


def get_hitting_splits(team_id: int) -> dict:
    """RISP, LOB situation splits."""
    data = mlb_get(f'teams/{team_id}/stats', {
        'stats': 'statSplits', 'group': 'hitting',
        'season': SEASON, 'sitCodes': 'risp,lob',
    })
    result = {}
    for block in data.get('stats', []):
        for split in block.get('splits', []):
            code = split.get('split', {}).get('code', '')
            result[code] = split.get('stat', {})
    return result


def get_platoon_splits(team_id: int) -> 'tuple[dict, dict]':
    """vs LHP (vl) and vs RHP (vr)."""
    def fetch(sit: str) -> dict:
        data = mlb_get(f'teams/{team_id}/stats', {
            'stats': 'statSplits', 'group': 'hitting',
            'season': SEASON, 'sitCodes': sit,
        })
        for block in data.get('stats', []):
            for split in block.get('splits', []):
                if split.get('split', {}).get('code') == sit:
                    return split.get('stat', {})
        # fallback — some endpoints return splits without sitCode echo
        for block in data.get('stats', []):
            splits = block.get('splits', [])
            if splits:
                return splits[0].get('stat', {})
        return {}

    vs_lhp = fetch('vl')
    time.sleep(SLEEP)
    vs_rhp = fetch('vr')
    return vs_lhp, vs_rhp


def get_fielding_stats(team_id: int) -> dict:
    data = mlb_get(f'teams/{team_id}/stats',
                   {'stats': 'season', 'group': 'fielding', 'season': SEASON})
    splits = data.get('stats', [{}])[0].get('splits', [])
    return splits[0].get('stat', {}) if splits else {}


def get_bullpen_window(team_id: int, days: int) -> dict:
    """Bullpen stats over a rolling N-day window."""
    start = (TODAY - datetime.timedelta(days=days)).isoformat()
    data  = mlb_get(f'teams/{team_id}/stats', {
        'stats': 'byDateRange', 'group': 'pitching',
        'season': SEASON, 'startDate': start, 'endDate': TODAY.isoformat(),
    })
    splits = data.get('stats', [{}])[0].get('splits', [])
    return splits[0].get('stat', {}) if splits else {}


def get_last_game_date(team_id: int) -> 'str | None':
    """Most recent completed game date (YYYY-MM-DD)."""
    data = mlb_get('schedule', {
        'sportId': 1, 'teamId': team_id,
        'startDate': (TODAY - datetime.timedelta(days=7)).isoformat(),
        'endDate':   (TODAY - datetime.timedelta(days=1)).isoformat(),
        'gameType':  'R',
    })
    for date_entry in reversed(data.get('dates', [])):
        for g in date_entry.get('games', []):
            if g.get('status', {}).get('abstractGameState') == 'Final':
                return date_entry.get('date')
    return None


def get_games_in_window(team_id: int, days: int) -> int:
    """Count completed games in the last N days."""
    start = (TODAY - datetime.timedelta(days=days)).isoformat()
    end   = (TODAY - datetime.timedelta(days=1)).isoformat()
    data  = mlb_get('schedule', {
        'sportId': 1, 'teamId': team_id,
        'startDate': start, 'endDate': end, 'gameType': 'R',
    })
    count = 0
    for date_entry in data.get('dates', []):
        for g in date_entry.get('games', []):
            if g.get('status', {}).get('abstractGameState') == 'Final':
                count += 1
    return count


def get_road_trip_length(team_id: int) -> int:
    """Count consecutive away games ending today (including today if away)."""
    data = mlb_get('schedule', {
        'sportId': 1, 'teamId': team_id,
        'startDate': (TODAY - datetime.timedelta(days=14)).isoformat(),
        'endDate':   TODAY.isoformat(),
        'gameType':  'R',
        'hydrate':   'team',
    })
    # Collect games in order
    recent: list[dict] = []
    for date_entry in data.get('dates', []):
        for g in date_entry.get('games', []):
            home_id = g.get('teams', {}).get('home', {}).get('team', {}).get('id')
            recent.append({
                'date':    date_entry.get('date'),
                'is_home': home_id == team_id,
                'state':   g.get('status', {}).get('abstractGameState', ''),
            })

    # Count consecutive away games from the end
    consecutive = 0
    for g in reversed(recent):
        if g['state'] not in ('Final', 'Live', 'Preview'):
            continue
        if not g['is_home']:
            consecutive += 1
        else:
            break
    return consecutive


def get_day_after_night(team_id: int) -> bool:
    """
    True if yesterday was a night game (first pitch >= 19:00 local)
    and today's game starts before 16:00 local.
    Approximated from schedule — if yesterday's game has a late gamePk or
    'N' in the day/night indicator.
    """
    yesterday = (TODAY - datetime.timedelta(days=1)).isoformat()
    data = mlb_get('schedule', {
        'sportId': 1, 'teamId': team_id,
        'startDate': yesterday, 'endDate': yesterday, 'gameType': 'R',
    })
    for date_entry in data.get('dates', []):
        for g in date_entry.get('games', []):
            if g.get('status', {}).get('abstractGameState') == 'Final':
                # dayNight field: 'night', 'day', 'evening'
                day_night = g.get('dayNight', '')
                if day_night in ('night', 'evening', 'N'):
                    # Check today for a day game
                    today_data = mlb_get('schedule', {
                        'sportId': 1, 'teamId': team_id,
                        'startDate': TODAY.isoformat(), 'endDate': TODAY.isoformat(),
                        'gameType': 'R',
                    })
                    for td in today_data.get('dates', []):
                        for tg in td.get('games', []):
                            if tg.get('dayNight', '') == 'day':
                                return True
    return False


# ═══════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════

def main():
    print(f'\n{"═" * 60}')
    print(f'  The Edge — fetch_team_stats.py  ·  {SEASON}  ·  {TODAY}')
    print(f'{"═" * 60}\n')

    # ── Phase 1: Savant batch (one-shot for all 30 teams) ─────────────────────
    print('━━  PHASE 1 — Baseball Savant  ━━')
    discipline, sprint, oaa = fetch_savant_metrics()
    print()

    # ── Phase 2: Per-team MLB API pass ────────────────────────────────────────
    print('━━  PHASE 2 — MLB Stats API (per team)  ━━')

    team_stats_updates:   list[dict] = []
    platoon_rows:         list[dict] = []
    updated = skipped = errors = 0

    for team_id, team_name in sorted(MLB_TEAMS.items(), key=lambda x: x[1]):
        print(f'\n  [{team_name}]')

        try:
            row: dict = {
                'team_id':    team_id,
                'team_name':  team_name,
                'updated_at': datetime.datetime.utcnow().isoformat(),
            }

            def add(key: str, val):
                if val is not None:
                    row[key] = val

            # ── A. Season hitting totals ──────────────────────────────────────
            h = get_hitting_stats(team_id)
            time.sleep(SLEEP)

            pa  = int(h.get('plateAppearances', 0) or 0)
            gp  = int(h.get('gamesPlayed', 1) or 1)
            ks  = int(h.get('strikeOuts', 0) or 0)
            bbs = int(h.get('baseOnBalls', 0) or 0)
            hrs = int(h.get('homeRuns', 0) or 0)
            gdp = int(h.get('groundIntoDoublePlay', 0) or 0)
            runs = int(h.get('runs', 0) or 0)

            avg_val = sf(h.get('avg'), 3)
            obp_val = sf(h.get('obp'), 3)
            slg_val = sf(h.get('slg'), 3)

            add('avg_l30',           avg_val)
            add('obp_l30',           obp_val)
            add('slg_l30',           slg_val)
            add('babip_l30',         sf(h.get('babip'), 3))
            add('stolen_base_pct',   sf(h.get('stolenBasePercentage'), 3))

            # Computed from raw counting stats
            if pa > 0:
                add('k_pct',  round(ks  / pa * 100, 1))
                add('bb_pct', round(bbs / pa * 100, 1))
            if slg_val and avg_val:
                add('iso', round(slg_val - avg_val, 3))
            if obp_val and slg_val:
                add('ops_l30', round(obp_val + slg_val, 3))
            if gp:
                add('runs_per_game_l30', round(runs / gp, 2))
                add('hr_per_game_l30',   round(hrs  / gp, 2))
                add('gdp_per_game',      round(gdp  / gp, 2))

            # ── B. Situation splits (RISP, LOB) ──────────────────────────────
            splits = get_hitting_splits(team_id)
            time.sleep(SLEEP)

            risp = splits.get('risp', {})
            add('avg_with_risp', sf(risp.get('avg'), 3))
            add('ops_with_risp', sf(risp.get('ops'), 3))

            # LOB% — use API field or compute from available stats
            lob_pct = sf(splits.get('lob', {}).get('leftOnBasePercentage'), 3)
            if lob_pct is None:
                lob_n = int(h.get('leftOnBase', 0) or 0)
                runners = int(h.get('rbi', 0) or 0) + lob_n
                if runners > 0:
                    lob_pct = round(lob_n / runners, 3)
            add('lob_pct', lob_pct)

            # ── C. Fielding ───────────────────────────────────────────────────
            f = get_fielding_stats(team_id)
            time.sleep(SLEEP)

            add('fielding_pct', sf(f.get('fieldingPercentage'), 4))
            errs = int(f.get('errors', 0) or 0)
            if gp:
                add('errors_per_game_l30', round(errs / gp, 3))

            # ── D. Rest & travel ──────────────────────────────────────────────
            last_game_date_str = get_last_game_date(team_id)
            time.sleep(SLEEP)

            if last_game_date_str:
                add('last_game_date', last_game_date_str)
                last_game = datetime.date.fromisoformat(last_game_date_str)
                add('days_since_last_game', (TODAY - last_game).days)

            games_l10 = get_games_in_window(team_id, 10)
            time.sleep(SLEEP)
            add('games_last_10_days', games_l10)

            road_trip = get_road_trip_length(team_id)
            time.sleep(SLEEP)
            add('consecutive_road_games', road_trip)

            dan = get_day_after_night(team_id)
            time.sleep(SLEEP)
            add('day_after_night', dan)

            # ── E. Bullpen windows ────────────────────────────────────────────
            bp14 = get_bullpen_window(team_id, 14)
            time.sleep(SLEEP)

            add('bullpen_era_l14',  sf(bp14.get('era'), 2))
            add('bullpen_whip_l14', sf(bp14.get('whip'), 3))
            saves   = int(bp14.get('saves', 0) or 0)
            blown   = int(bp14.get('blownSaves', 0) or 0)
            inh     = int(bp14.get('inheritedRunners', 0) or 0)
            inh_sc  = int(bp14.get('inheritedRunnersScored', 0) or 0)
            add('saves_l30',       saves)
            add('blown_saves_l30', blown)
            if inh >= 5:
                add('bullpen_inherited_strand_pct', round(1.0 - (inh_sc / inh), 3))

            bp3 = get_bullpen_window(team_id, 3)
            time.sleep(SLEEP)
            ip3_raw = bp3.get('inningsPitched')
            if ip3_raw:
                add('bullpen_ip_last_3', round(ip_to_float(ip3_raw), 1))

            # ── F. Savant batch data ──────────────────────────────────────────
            if team_id in discipline:
                row.update({k: v for k, v in discipline[team_id].items() if v is not None})
                print(f'    Savant discipline: xwOBA={discipline[team_id].get("xwoba_l30")} '
                      f'· hard_hit={discipline[team_id].get("hard_hit_pct")}% '
                      f'· chase={discipline[team_id].get("chase_rate")}%')
            else:
                print('    Savant discipline: no data (player→team join missed)')

            if team_id in sprint:
                add('sprint_speed', sprint[team_id])
                print(f'    Sprint: {sprint[team_id]} ft/s')

            if team_id in oaa:
                add('oaa', oaa[team_id])
                print(f'    OAA: {oaa[team_id]}')

            # ── G. Platoon splits → separate table ────────────────────────────
            vs_lhp, vs_rhp = get_platoon_splits(team_id)
            time.sleep(SLEEP)

            def k_pct_from(stat: dict) -> 'float | None':
                pa2 = int(stat.get('plateAppearances', 0) or 0)
                ks2 = int(stat.get('strikeOuts', 0) or 0)
                return round(ks2 / pa2 * 100, 1) if pa2 > 0 else None

            platoon_row: dict = {
                'team_id':   team_id,
                'team_name': team_name,
                'season':    SEASON,
            }
            if vs_lhp:
                platoon_row.update({
                    'vs_lhp_ops':   sf(vs_lhp.get('ops'), 3),
                    'vs_lhp_avg':   sf(vs_lhp.get('avg'), 3),
                    'vs_lhp_obp':   sf(vs_lhp.get('obp'), 3),
                    'vs_lhp_slg':   sf(vs_lhp.get('slg'), 3),
                    'vs_lhp_hr':    int(vs_lhp.get('homeRuns', 0) or 0),
                    'vs_lhp_k_pct': k_pct_from(vs_lhp),
                    'vs_lhp_games': int(vs_lhp.get('gamesPlayed', 0) or 0),
                })
            if vs_rhp:
                platoon_row.update({
                    'vs_rhp_ops':   sf(vs_rhp.get('ops'), 3),
                    'vs_rhp_avg':   sf(vs_rhp.get('avg'), 3),
                    'vs_rhp_obp':   sf(vs_rhp.get('obp'), 3),
                    'vs_rhp_slg':   sf(vs_rhp.get('slg'), 3),
                    'vs_rhp_hr':    int(vs_rhp.get('homeRuns', 0) or 0),
                    'vs_rhp_k_pct': k_pct_from(vs_rhp),
                    'vs_rhp_games': int(vs_rhp.get('gamesPlayed', 0) or 0),
                })
            if vs_lhp or vs_rhp:
                platoon_rows.append(platoon_row)
                print(f'    Platoon: vs LHP {platoon_row.get("vs_lhp_ops","—")} OPS · '
                      f'vs RHP {platoon_row.get("vs_rhp_ops","—")} OPS')

            team_stats_updates.append(row)
            updated += 1

        except Exception as e:
            print(f'    ERROR: {e}')
            errors += 1

    # ── Phase 3: Write to Supabase ────────────────────────────────────────────
    print(f'\n{"━" * 60}')
    print(f'  PHASE 3 — Writing to Supabase')
    print(f'{"━" * 60}')

    # team_stats — upsert on team_id
    ts_success = ts_fail = 0
    for row in team_stats_updates:
        team_id   = row['team_id']
        team_name = row['team_name']
        try:
            # Use update (not upsert) — rows already exist from base fetcher
            result = supa.table('team_stats') \
                .update({k: v for k, v in row.items() if k != 'team_id'}) \
                .eq('team_id', team_id) \
                .execute()
            if result.data:
                ts_success += 1
            else:
                # Row might not exist — try upsert
                supa.table('team_stats').upsert(row, on_conflict='team_id').execute()
                ts_success += 1
        except Exception as e:
            print(f'  ✗ team_stats upsert failed for {team_name}: {e}')
            ts_fail += 1

    print(f'  team_stats:          {ts_success} ✓  {ts_fail} ✗')

    # team_platoon_splits — upsert on team_id,season
    ps_success = ps_fail = 0
    if platoon_rows:
        try:
            supa.table('team_platoon_splits') \
                .upsert(platoon_rows, on_conflict='team_id,season') \
                .execute()
            ps_success = len(platoon_rows)
        except Exception as e:
            print(f'  ✗ team_platoon_splits upsert failed: {e}')
            ps_fail = len(platoon_rows)

    print(f'  team_platoon_splits: {ps_success} ✓  {ps_fail} ✗')

    # ── Phase 4: Verification spot-check ──────────────────────────────────────
    print(f'\n{"━" * 60}')
    print('  PHASE 4 — Verification')
    print(f'{"━" * 60}')

    verify = supa.table('team_stats') \
        .select('team_name, ops_l30, xwoba_l30, hard_hit_pct, chase_rate, '
                'sprint_speed, oaa, k_pct, bb_pct, bullpen_era_l14, '
                'last_game_date, games_last_10_days') \
        .not_.is_('ops_l30', 'null') \
        .order('xwoba_l30', desc=True) \
        .limit(5) \
        .execute()

    if verify.data:
        print('\n  Top 5 teams by xwOBA (sanity check):')
        print(f'  {"Team":<28} {"xwOBA":>6} {"OPS":>6} {"HH%":>6} {"Chase%":>7} {"K%":>5} {"OAA":>5}')
        print(f'  {"─" * 68}')
        for r in verify.data:
            print(
                f'  {r["team_name"]:<28} '
                f'{str(r["xwoba_l30"] or "—"):>6} '
                f'{str(r["ops_l30"] or "—"):>6} '
                f'{str(r["hard_hit_pct"] or "—"):>6} '
                f'{str(r["chase_rate"] or "—"):>7} '
                f'{str(r["k_pct"] or "—"):>5} '
                f'{str(r["oaa"] or "—"):>5}'
            )
    else:
        print('  WARNING: No rows returned — check Savant discipline join')

    print(f'\n{"═" * 60}')
    print(f'  DONE  ·  {updated} teams processed  ·  {errors} errors')
    print(f'{"═" * 60}\n')


if __name__ == '__main__':
    main()