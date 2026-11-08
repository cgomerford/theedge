#!/usr/bin/env python3
"""
build_rotation_board.py

Fills the Rotation Lab's two tables from Baseball Savant pitch data (one row per pitch) and the MLB Stats API roster:

  rotation_apps      one row per pitcher per game: pitches, batters faced, outs, K, BB, CSW%, and for each fastball type (FF, SI) a small object
                     {"n": pitches, "v": avg mph, "e": avg mph over the first 25 pitches of the outing, "l": avg mph over the last 25,
                      "z": avg release height ft, "a": avg arm angle}. e / l are null when fewer than 5 fastballs fall in that stretch.
  rotation_pitchers  one row per pitcher per season: name, throwing hand, current club and injured-list status (roster feed).

TABLE OWNERSHIP (single writer): this script writes rotation_apps and rotation_pitchers and nothing else does.
Runs from GitHub Actions (rotation-board.yml): --days N re-pulls the last N finished days (Savant corrects recent data) and upserts them. Depends on nothing else.
Backfill from the local season file:  python3 scripts/build_rotation_board.py --parquet models/data/pitches_2026.parquet

Usage:
  python3 scripts/build_rotation_board.py --days 4 [--wait 5] [--dry-run]
  python3 scripts/build_rotation_board.py --parquet models/data/pitches_2026.parquet [--dry-run]
  python3 scripts/build_rotation_board.py --parquet models/data/pitches_2026.parquet --json .dev-cache/rotation.json   # local dev: write a file instead of the tables
  python3 scripts/build_rotation_board.py --selftest
"""
from __future__ import annotations

import argparse
import math
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import requests

try:  # local runs read .env.local; GitHub Actions passes secrets as environment variables
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / '.env.local')
    load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'models' / 'src'))
FB_TYPES = ('FF', 'SI')
CSW = {'called_strike', 'swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt', 'swinging_pitchout'}
# outs recorded by the event that ends a plate appearance (or a runner out on a pitch row)
OUTS = {
    'field_out': 1, 'strikeout': 1, 'force_out': 1, 'sac_fly': 1, 'sac_bunt': 1, 'fielders_choice_out': 1, 'other_out': 1,
    'grounded_into_double_play': 2, 'double_play': 2, 'strikeout_double_play': 2, 'sac_fly_double_play': 2, 'sac_bunt_double_play': 2,
    'triple_play': 3,
    'caught_stealing_2b': 1, 'caught_stealing_3b': 1, 'caught_stealing_home': 1,
    'pickoff_1b': 1, 'pickoff_2b': 1, 'pickoff_3b': 1,
    'pickoff_caught_stealing_2b': 1, 'pickoff_caught_stealing_3b': 1, 'pickoff_caught_stealing_home': 1,
}
K_EV = {'strikeout', 'strikeout_double_play'}
BB_EV = {'walk', 'intent_walk'}
TEAM_FIX = {'AZ': 'ARI'}   # Savant says AZ; the site's team list says ARI


def r1(x: float | None, nd: int = 1) -> float | None:
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), nd)


def outs_by_pitch(d: pd.DataFrame) -> pd.Series:
    """Outs credited to the pitcher of each pitch: the rise in outs_when_up before the next pitch of the half-inning (3 - outs on the last one).
    Counting rises rather than finishing events also catches caught-stealing and pickoff outs, which the events column omits.
    The last half-inning of a game that ends with the home club ahead is not played to three outs, so its last pitch uses the finishing event instead."""
    key = ['game_pk', 'inning', 'inning_topbot']
    nxt = d.groupby(key)['outs_when_up'].shift(-1)
    last = nxt.isna()
    final = (d['inning'] == d.groupby('game_pk')['inning'].transform('max')) & (d['inning_topbot'] == 'Bot')
    ended = d['outs_when_up'] + d['events'].map(OUTS).fillna(0)
    after = nxt.where(~last, np.where(final, ended, 3))
    return (after - d['outs_when_up']).clip(lower=0).fillna(0)


def fb_block(g: pd.DataFrame) -> dict:
    """{type: {n, v, e, l, z, a}} for the fastball types in one outing (g is that pitcher's pitches in order)."""
    out: dict = {}
    n_all = len(g)
    for t in FB_TYPES:
        f = g[g['pitch_type'] == t]
        f = f[f['release_speed'].notna()]
        if f.empty:
            continue
        pos = f.index.map(lambda i: g.index.get_loc(i)).to_numpy()   # position of each fastball in the outing
        early, late = f[pos < 25]['release_speed'], f[pos >= n_all - 25]['release_speed']
        out[t] = {'n': int(len(f)), 'v': r1(f['release_speed'].mean(), 1),
                  'e': r1(early.mean(), 1) if len(early) >= 5 else None, 'l': r1(late.mean(), 1) if len(late) >= 5 else None,
                  'z': r1(f['release_pos_z'].mean(), 2), 'a': r1(f['arm_angle'].mean(), 1)}
    return out


def build_apps(pq: pd.DataFrame, season: int) -> tuple[list[dict], dict[int, str], dict[int, str]]:
    """Appearance rows, plus {pitcher: 'First Last'} and {pitcher: throws}."""
    d = pq.copy()
    d = d[d['game_date'].notna()].sort_values(['game_pk', 'at_bat_number', 'pitch_number']).reset_index(drop=True)
    top = d['inning_topbot'] == 'Top'
    d['team'] = np.where(top, d['home_team'], d['away_team'])      # top of the inning: the home club is pitching
    d['opp'] = np.where(top, d['away_team'], d['home_team'])
    ev = d['events']
    d['outs_e'] = outs_by_pitch(d)
    runner_ev = ev.astype(str).str.startswith(('caught_stealing', 'pickoff'))   # an out on the bases, not a finished plate appearance
    d['k'], d['bb'], d['bf'] = ev.isin(K_EV), ev.isin(BB_EV), ev.notna() & ~runner_ev
    d['csw'] = d['description'].isin(CSW)
    first = d.groupby(['game_pk', 'team'])['pitcher'].transform('first')        # the club's first pitcher in the game is its starter
    d['starter'] = d['pitcher'] == first
    names, throws = {}, {}
    rows: list[dict] = []
    for (pid, gpk), g in d.groupby(['pitcher', 'game_pk'], sort=False):
        g = g.sort_values(['at_bat_number', 'pitch_number'])
        last = g.iloc[-1]
        nm = str(last['player_name'])
        names[int(pid)] = ' '.join(reversed([p.strip() for p in nm.split(',', 1)])) if ',' in nm else nm
        throws[int(pid)] = str(last['p_throws']) if isinstance(last['p_throws'], str) else None
        team = TEAM_FIX.get(last['team'], last['team'])
        opp = TEAM_FIX.get(last['opp'], last['opp'])
        rows.append({'player_id': int(pid), 'game_pk': int(gpk), 'season': season, 'game_date': str(last['game_date'])[:10],
                     'team': team, 'opp': opp, 'is_start': bool(g['starter'].iloc[0]),
                     'pitches': int(len(g)), 'bf': int(g['bf'].sum()), 'outs': int(g['outs_e'].sum()),
                     'k': int(g['k'].sum()), 'bb': int(g['bb'].sum()), 'csw': r1(100 * g['csw'].mean(), 1),
                     'fb': fb_block(g.reset_index(drop=True))})
    return rows, names, throws


def roster_rows(season: int, names: dict[int, str], throws: dict[int, str]) -> list[dict]:
    """Current club and injured-list status for every pitcher seen, from the MLB 40-man rosters."""
    teams = requests.get('https://statsapi.mlb.com/api/v1/teams?sportId=1', timeout=60).json()['teams']
    out: dict[int, dict] = {}
    for t in teams:
        r = requests.get(f"https://statsapi.mlb.com/api/v1/teams/{t['id']}/roster", params={'rosterType': '40Man'}, timeout=60)
        time.sleep(0.15)
        if r.status_code != 200:
            print(f"[roster_rows] HTTP {r.status_code} for team {t['id']}; its pitchers get no club or IL status")
            continue
        abbr = TEAM_FIX.get(t['abbreviation'], t['abbreviation'])
        for p in r.json().get('roster', []):
            pid = p['person']['id']
            if pid not in names:
                continue
            st = p.get('status') or {}
            code = st.get('code') or ''
            out[pid] = {'team': abbr, 'il_code': code if code.startswith('D') else None, 'il_desc': st.get('description') if code.startswith('D') else None}
    return [{'season': season, 'player_id': pid, 'name': nm, 'throws': throws.get(pid),
             **out.get(pid, {'team': None, 'il_code': None, 'il_desc': None})} for pid, nm in names.items()]


def selftest() -> int:
    n = 40
    g = pd.DataFrame({'pitch_type': ['FF'] * n, 'release_speed': [96.0] * 10 + [95.0] * 20 + [93.0] * 10, 'release_pos_z': [5.9] * n, 'arm_angle': [40.0] * n})
    b = fb_block(g)['FF']
    bad = []
    if b['n'] != 40 or b['e'] != round(np.mean([96.0] * 10 + [95.0] * 15), 1) or b['l'] != round(np.mean([95.0] * 5 + [93.0] * 10 + [95.0] * 10), 1):
        bad.append(('fb_block', b))
    print('selftest FAIL' if bad else 'selftest ok', *bad, sep='\n  ')
    return 1 if bad else 0


def load_days(days: int) -> pd.DataFrame:
    import fetch_pitches as fp
    frames = []
    end = date.today() - timedelta(days=1)
    for i in range(days):
        d = end - timedelta(days=i)
        df = fp.fetch_day(d)
        if df is None:
            raise SystemExit(f'[load_days] could not fetch {d}; writing nothing')
        if not df.empty:
            frames.append(fp.tidy(df))
        time.sleep(1.0)
    if not frames:
        raise SystemExit('[load_days] no games in the window; nothing to write')
    return pd.concat(frames, ignore_index=True)


def upsert(table: str, rows: list[dict], on_conflict: str) -> bool:
    from supabase import create_client
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')
    if not url or not key:
        raise SystemExit('[upsert] Supabase URL / service key not set')
    db = create_client(url, key)
    for i in range(0, len(rows), 300):
        db.table(table).upsert(rows[i:i + 300], on_conflict=on_conflict).execute()
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=0)
    ap.add_argument('--parquet', type=str, default='')
    ap.add_argument('--season', type=int, default=date.today().year)
    ap.add_argument('--wait', type=int, default=5)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--json', type=str, default='')
    ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not a.days and not a.parquet:
        raise SystemExit('give --days N or --parquet FILE')
    pq = pd.read_parquet(a.parquet) if a.parquet else load_days(a.days)
    if a.parquet:
        a.season = int(str(pq['game_date'].max())[:4])
    apps, names, throws = build_apps(pq, a.season)
    pit = roster_rows(a.season, names, throws)
    print(f'{len(apps)} appearances, {len(pit)} pitchers. First 5 appearances:')
    for r in apps[:5]:
        print(r)
    print('First 5 pitchers:', *pit[:5], sep='\n  ')
    if a.dry_run:
        print('dry run: nothing written')
        return 0
    if a.json:
        import json
        Path(a.json).parent.mkdir(parents=True, exist_ok=True)
        Path(a.json).write_text(json.dumps({'apps': apps, 'pitchers': pit}, separators=(',', ':')))
        print(f'wrote {a.json}')
        return 0
    print(f'writing in {a.wait}s (Ctrl-C to abort)')
    time.sleep(a.wait)
    ok = upsert('rotation_apps', apps, 'player_id,game_pk') and upsert('rotation_pitchers', pit, 'season,player_id')
    print('done' if ok else 'FAILED')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
