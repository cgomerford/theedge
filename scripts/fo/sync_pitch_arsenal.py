"""
scripts/fo/sync_pitch_arsenal.py

Pitching Desk · arsenal, movement points and league averages, from the pitch Parquet.

TABLE OWNERSHIP (single writer):
  fo_pitch_arsenal, fo_pitch_points, fo_pitch_league_avg  <- this script and nothing else.
  (stuff_grade / method_version on fo_pitch_arsenal belong to the future Stuff Grade job; never written here.)

Reads: models/data/pitches_{season}.parquet (fetch_pitches.py), models/src/features.py (shape maths, imported,
never copied), Savant leaderboard/active-spin (wide CSV, one column per pitch type), MLB roster (which pitchers).

Per pitcher x pitch type x window x side (all / R / L = batter side, Savant `stand`):
  pitches, usage_pct (share of his pitches in that window+side), velo, ivb (in), hb (in, arm side +), spin,
  extension, arm_angle, vaa (deg, features.approach_angles), whiff_pct = whiffs / swings * 100,
  xwoba, rv_per_100, rel_x (arm side +), rel_z (ft).
  xwOBA: over plate appearances ENDING on that pitch type (woba_denom = 1), numerator = the Savant
         estimated wOBA when the ball is in play, else the event's woba_value; divided by sum(woba_denom).
  rv_per_100 = -sum(delta_run_exp) / pitches * 100  (positive = good for the pitcher; sign checked against the
               Savant arsenal leaderboard in --check mode).
  active_spin_pct: SEASON-LEVEL value from the Savant active-spin leaderboard, repeated on every window and
               side of that pitch type (the leaderboard has no windows). NULL for types it does not cover.
Windows (same rule as sync_pitch_staff.py): season; l30 / l15 = games on or after (last game in data - N days);
l5 = last five games he pitched in. No appearances -> no row.
League averages: per pitch type, over pitcher-pitch types with >= 100 pitches in the season (all sides):
  pitch-weighted mean, SD across those pitcher-types. Points: <= 150 per pitch type, seeded sample, side 'all'.

Run:  models/venv/bin/python scripts/fo/sync_pitch_arsenal.py --team 143 --dry-run --check 650911
"""
from __future__ import annotations

import argparse
import sys
from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from common import SAVANT_LB, confirm_abort, load_pitches, mlb_get, num, savant_csv, upsert  # noqa: E402
import features as F  # noqa: E402

WINDOWS = ('season', 'l30', 'l15', 'l5')
SIDES = ('all', 'R', 'L')
MIN_LEAGUE_PITCHES = 100
MAX_POINTS, SEED = 150, 7
ACTIVE_SPIN_COLS = {'FF': 'active_spin_fourseam', 'SI': 'active_spin_sinker', 'FC': 'active_spin_cutter',
                    'CH': 'active_spin_changeup', 'FS': 'active_spin_splitter', 'CU': 'active_spin_curve',
                    'SL': 'active_spin_slider', 'ST': 'active_spin_sweeper', 'SV': 'active_spin_slurve'}


def prepare(pq: pd.DataFrame) -> pd.DataFrame:
    d = F.add_shape_columns(pq)
    d['gd'] = pd.to_datetime(d['game_date'])
    d['whiff'] = d['description'].isin(F.WHIFF_DESCS)
    d['swing'] = d['description'].isin(F.SWING_DESCS)
    pa_end = d['woba_denom'].fillna(0) > 0
    x = d['estimated_woba_using_speedangle'].where(d['estimated_woba_using_speedangle'].notna(), d['woba_value'])
    d['xw_num'] = x.where(pa_end, 0.0).fillna(0.0)
    d['xw_den'] = d['woba_denom'].where(pa_end, 0.0).fillna(0.0)
    d['rv'] = -d['delta_run_exp']
    return d


def agg_types(sub: pd.DataFrame) -> pd.DataFrame:
    """Per pitch type stats for one slice (before usage)."""
    g = sub[sub['pitch_type'].notna()].groupby('pitch_type')
    t = pd.DataFrame({
        'pitches': g.size(), 'velo': g['release_speed'].mean(), 'ivb': g['ivb_in'].mean(), 'hb': g['hb_in'].mean(),
        'spin': g['release_spin_rate'].mean(), 'extension': g['release_extension'].mean(), 'arm_angle': g['arm_angle'].mean(),
        'vaa': g['vaa'].mean(), 'rel_x': g['rel_x_arm'].mean(), 'rel_z': g['rel_z'].mean(),
        'whiffs': g['whiff'].sum(), 'swings': g['swing'].sum(), 'xw_num': g['xw_num'].sum(), 'xw_den': g['xw_den'].sum(),
        'rv_sum': g['rv'].sum(min_count=1), 'rv_n': g['rv'].count(),
    })
    t['whiff_pct'] = np.where(t['swings'] > 0, 100 * t['whiffs'] / t['swings'].where(t['swings'] > 0), np.nan)
    t['xwoba'] = np.where(t['xw_den'] > 0, t['xw_num'] / t['xw_den'].where(t['xw_den'] > 0), np.nan)
    t['rv_per_100'] = np.where(t['rv_n'] > 0, 100 * t['rv_sum'] / t['rv_n'].where(t['rv_n'] > 0), np.nan)
    return t


def windows_for(g: pd.DataFrame, anchor: pd.Timestamp) -> dict[str, set]:
    games = g[['game_pk', 'gd']].drop_duplicates().sort_values(['gd', 'game_pk'])
    return {
        'season': set(games['game_pk']),
        'l30': set(games[games['gd'] >= anchor - timedelta(days=30)]['game_pk']),
        'l15': set(games[games['gd'] >= anchor - timedelta(days=15)]['game_pk']),
        'l5': set(games.tail(5)['game_pk']),
    }


def active_spin(season: int) -> dict[tuple[int, str], float]:
    rows = savant_csv(f'{SAVANT_LB}/active-spin', {'year': season, 'min': 10, 'pitch_type': '', 'hand': '', 'csv': 'true'})
    out: dict[tuple[int, str], float] = {}
    for r in rows or []:
        for pt, col in ACTIVE_SPIN_COLS.items():
            v = num(r.get(col))
            if v is not None:
                out[(int(r['entity_id']), pt)] = v
    if not rows:
        print('[active_spin] leaderboard unavailable; active_spin_pct will be NULL')
    return out


def league_avg_rows(d: pd.DataFrame, season: int, spin: dict) -> list[dict]:
    g = d[d['pitch_type'].notna()].groupby(['pitcher', 'pitch_type'])
    per = pd.DataFrame({'n': g.size(), 'velo': g['release_speed'].mean(), 'ivb': g['ivb_in'].mean(), 'hb': g['hb_in'].mean(),
                        'spin': g['release_spin_rate'].mean(), 'vaa': g['vaa'].mean(), 'extension': g['release_extension'].mean(),
                        'whiffs': g['whiff'].sum(), 'swings': g['swing'].sum(), 'xw_num': g['xw_num'].sum(), 'xw_den': g['xw_den'].sum()})
    per['whiff_pct'] = np.where(per['swings'] > 0, 100 * per['whiffs'] / per['swings'].where(per['swings'] > 0), np.nan)
    per['xwoba'] = np.where(per['xw_den'] > 0, per['xw_num'] / per['xw_den'].where(per['xw_den'] > 0), np.nan)
    per = per[per['n'] >= MIN_LEAGUE_PITCHES].reset_index()
    rows = []
    metrics = ['velo', 'ivb', 'hb', 'spin', 'vaa', 'extension', 'whiff_pct', 'xwoba']
    for pt, sub in per.groupby('pitch_type'):
        row = {'season': season, 'pitch_type': pt, 'n_pitchers': int(len(sub))}
        for m in metrics:
            s = sub[sub[m].notna()]
            row[m] = float(np.average(s[m], weights=s['n'])) if len(s) else None
            row[f'{m}_sd'] = float(s[m].std(ddof=1)) if len(s) > 1 else None
        asp = [spin[(int(p), pt)] for p in sub['pitcher'] if (int(p), pt) in spin]
        row['active_spin_pct'] = float(np.mean(asp)) if asp else None
        row['active_spin_pct_sd'] = float(np.std(asp, ddof=1)) if len(asp) > 1 else None
        rows.append(row)
    return rows


def check_against_savant(pid: int, season: int, arsenal: list[dict]) -> None:
    """Compare our season/all rows with the Savant arsenal leaderboard (whiff%, RV/100, xwOBA, pitches)."""
    print(f'\n=== CROSS-CHECK vs Savant pitch-arsenal-stats, pitcher {pid} ===')
    ours = {r['pitch_type']: r for r in arsenal if r['player_id'] == pid and r['win'] == 'season' and r['side'] == 'all'}
    print(f"{'type':4} {'pitches':>8} {'(sav)':>7} {'whiff%':>7} {'(sav)':>7} {'rv/100':>7} {'(sav)':>7} {'xwOBA':>6} {'(sav)':>6}")
    for pt, r in ours.items():
        rows = savant_csv(f'{SAVANT_LB}/pitch-arsenal-stats', {'type': 'pitcher', 'pitchType': pt, 'year': season, 'team': '', 'min': 10, 'csv': 'true'})
        s = next((x for x in rows or [] if int(x['player_id']) == pid), None)
        sv = (lambda k: num(s[k]) if s else None)
        f = lambda v, p=1: '—' if v is None else f'{v:.{p}f}'
        print(f"{pt:4} {r['pitches']:>8} {f(sv('pitches'),0):>7} {f(r['whiff_pct']):>7} {f(sv('whiff_percent')):>7} "
              f"{f(r['rv_per_100'],2):>7} {f(sv('run_value_per_100'),2):>7} {f(r['xwoba'],3):>6} {f(sv('est_woba'),3):>6}")


def run(team_id: int | None, season: int, dry_run: bool, check_pid: int | None) -> int:
    pq = load_pitches(season)
    d = prepare(pq)
    anchor = d['gd'].max()
    print(f'Parquet: {len(d):,} pitches through {anchor.date()}')
    spin = active_spin(season)

    league = league_avg_rows(d, season, spin)
    if team_id is None:
        ids = set(d['pitcher'].unique())
    else:
        r = mlb_get(f'/teams/{team_id}/roster', {'rosterType': '40Man', 'hydrate': 'person'})
        ids = {int(x['person']['id']) for x in (r or {}).get('roster', []) if x.get('position', {}).get('type') == 'Pitcher'}
    arsenal, points = [], []
    rng = np.random.default_rng(SEED)
    d = d[d['pitcher'].isin(ids)]
    for pid, g in d.groupby('pitcher'):
        pid = int(pid)
        for win, games in windows_for(g, anchor).items():
            gw = g[g['game_pk'].isin(games)]
            for side in SIDES:
                gs = gw if side == 'all' else gw[gw['stand'] == side]
                t = agg_types(gs)
                total = t['pitches'].sum()
                for pt, r in t.iterrows():
                    arsenal.append({
                        'player_id': pid, 'season': season, 'win': win, 'side': side, 'pitch_type': pt,
                        'pitches': int(r['pitches']), 'usage_pct': 100 * r['pitches'] / total, 'velo': r['velo'], 'ivb': r['ivb'],
                        'hb': r['hb'], 'spin': r['spin'], 'active_spin_pct': spin.get((pid, pt)), 'vaa': r['vaa'],
                        'extension': r['extension'], 'arm_angle': r['arm_angle'], 'whiff_pct': r['whiff_pct'],
                        'xwoba': r['xwoba'], 'rv_per_100': r['rv_per_100'], 'rel_x': r['rel_x'], 'rel_z': r['rel_z'],
                    })
            for pt, gp in gw[gw['pitch_type'].notna() & gw['hb_in'].notna()].groupby('pitch_type'):
                take = gp if len(gp) <= MAX_POINTS else gp.iloc[np.sort(rng.choice(len(gp), MAX_POINTS, replace=False))]
                points.append({'player_id': pid, 'season': season, 'win': win, 'pitch_type': pt, 'points': [
                    {'hb': round(float(a), 1), 'ivb': round(float(b), 1), 'rel_x': round(float(c), 2), 'rel_z': round(float(e), 2)}
                    for a, b, c, e in zip(take['hb_in'], take['ivb_in'], take['rel_x_arm'], take['rel_z'])
                    if not np.isnan([a, b, c, e]).any()]})
    print(f'Built: {len(arsenal)} arsenal rows, {len(points)} point sets, {len(league)} league rows for {len(ids)} pitchers')
    if check_pid:
        check_against_savant(check_pid, season, arsenal)
        print('\nLeague averages (FF, SI, CH, SL, ST):')
        for r in league:
            if r['pitch_type'] in ('FF', 'SI', 'CH', 'SL', 'ST'):
                print({k: (round(v, 2) if isinstance(v, float) else v) for k, v in r.items() if not k.endswith('_sd')})

    ok = True
    for table, rows, key in (('fo_pitch_league_avg', league, 'season,pitch_type'),
                             ('fo_pitch_arsenal', arsenal, 'player_id,season,win,side,pitch_type'),
                             ('fo_pitch_points', points, 'player_id,season,win,pitch_type')):
        if confirm_abort(table, rows, dry_run):
            ok &= upsert(table, rows, key, chunk=200 if table == 'fo_pitch_points' else 500)
    return 0 if ok else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--team', type=int, default=143)
    ap.add_argument('--all', action='store_true', help='every pitcher in the Parquet, not one roster')
    ap.add_argument('--season', type=int, default=2026)
    ap.add_argument('--check', type=int, default=None, help='MLBAM id to cross-check against Savant')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    sys.exit(run(None if a.all else a.team, a.season, a.dry_run, a.check))
