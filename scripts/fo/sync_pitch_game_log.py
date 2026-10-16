"""
scripts/fo/sync_pitch_game_log.py

Pitching Desk · per-appearance log and IL stints.

TABLE OWNERSHIP (single writer):
  fo_pitch_game_log, fo_pitch_il_stints  <- this script and nothing else.

fo_pitch_game_log (one row per pitcher appearance), all from the pitch Parquet so the numbers agree with the
arsenal tables:
  game_date, pitches (rows), bf (plate appearances ended), k, bb (walks incl. intentional), csw (0-100),
  velo_by_type {pitch_type: mean release_speed}, arm_angle (mean), rel_z (mean release height, ft).
  days_rest = calendar days between this appearance and his previous one, minus 1 (back-to-back days = 0);
  NULL for his first appearance of the season. Matches the mockup's workload card.

fo_pitch_il_stints, from /transactions?teamId=..&startDate=..&endDate=.. (field list printed 2026-10-15:
date, description, effectiveDate, id, person, resolutionDate, toTeam, typeCode, typeDesc). The feed has NO
structured IL code: every IL move is typeCode 'SC' (Status Change). Placement, activation and the 15->60-day
transfer exist only in the description text, so they are parsed with regexes (see parse_il) and the raw text is
stored. A stint starts at a "placed ... on the N-day injured list" row (effectiveDate if present, because
placements are often retroactive) and ends at the next "activated ... from the ... injured list" for that player.
A "transferred ... to the 60-day injured list" row keeps the stint open and upgrades il_type. No activation
yet -> end_date NULL (still on the IL). Rows that are not about the injured list (number changes, option
moves, restricted list...) are ignored.

Run:  models/venv/bin/python scripts/fo/sync_pitch_game_log.py --team 143 --dry-run
      models/venv/bin/python scripts/fo/sync_pitch_game_log.py --selftest
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from common import confirm_abort, load_pitches, mlb_get, upsert  # noqa: E402
import features as F  # noqa: E402

IL_RE = re.compile(r'(\d+)-day injured list', re.I)
K_EV = {'strikeout', 'strikeout_double_play'}
BB_EV = {'walk', 'intent_walk'}


def parse_il(description: str) -> tuple[str, str | None] | None:
    """('place' | 'activate' | 'transfer', '10-day'|'15-day'|'60-day'|None) for an IL transaction, else None."""
    d = description or ''
    low = d.lower()
    if 'injured list' not in low:
        return None
    if ' transferred ' in low:
        m = re.search(r'to the (\d+)-day injured list', low)
        return ('transfer', f'{m.group(1)}-day' if m else None)
    if ' activated ' in low or ' reinstated ' in low:
        return ('activate', None)
    if ' placed ' in low:
        m = IL_RE.search(d)
        return ('place', f'{m.group(1)}-day' if m else None)
    return None


def build_stints(transactions: list[dict], pitcher_ids: set[int], team_id: int) -> list[dict]:
    ev = []
    for t in transactions:
        pid = (t.get('person') or {}).get('id')
        if pid not in pitcher_ids or t.get('typeCode') != 'SC':
            continue
        p = parse_il(t.get('description', ''))
        if p:
            ev.append((str(t.get('effectiveDate') or t['date']), int(t['id']), int(pid), p, t))
    ev.sort(key=lambda e: (e[0], e[1]))
    open_: dict[int, dict] = {}
    out: list[dict] = []
    for when, tid, pid, (kind, il_type), t in ev:
        if kind == 'place':
            if pid in open_:  # a second placement without an activation: close the old one at this date
                open_[pid]['end_date'] = when
            open_[pid] = {'player_id': pid, 'start_tx_id': tid, 'team_id': team_id, 'start_date': when, 'end_date': None,
                          'il_type': il_type, 'description': t['description'], 'end_description': None, 'end_tx_id': None}
            out.append(open_[pid])
        elif kind == 'transfer' and pid in open_ and il_type:
            open_[pid]['il_type'] = il_type
        elif kind == 'activate' and pid in open_:
            s = open_.pop(pid)
            s.update(end_date=when, end_description=t['description'], end_tx_id=tid)
    return out


def selftest() -> int:
    cases = [
        ('Philadelphia Phillies placed RHP Zack Wheeler on the 15-day injured list retroactive to March 22, 2026. Right shoulder surgery.', ('place', '15-day')),
        ('Philadelphia Phillies placed C J.T. Realmuto on the 10-day injured list. Back spasms.', ('place', '10-day')),
        ('Philadelphia Phillies activated RHP Orion Kerkering from the 15-day injured list.', ('activate', None)),
        ('Philadelphia Phillies transferred RHP Max Lazar from the 15-day injured list to the 60-day injured list. Left oblique strain.', ('transfer', '60-day')),
        ('Philadelphia Phillies C Will Vierling roster status changed by something.', None),
    ]
    bad = [(s, want, parse_il(s)) for s, want in cases if parse_il(s) != want]
    tx = [
        {'id': 1, 'typeCode': 'SC', 'date': '2026-03-25', 'effectiveDate': '2026-03-22', 'person': {'id': 9}, 'description': cases[0][0]},
        {'id': 2, 'typeCode': 'SC', 'date': '2026-06-01', 'effectiveDate': '2026-06-01', 'person': {'id': 9}, 'description': cases[3][0].replace('Max Lazar', 'X')},
        {'id': 3, 'typeCode': 'SC', 'date': '2026-08-10', 'effectiveDate': '2026-08-10', 'person': {'id': 9}, 'description': cases[2][0]},
    ]
    st = build_stints(tx, {9}, 143)
    if len(st) != 1 or st[0]['start_date'] != '2026-03-22' or st[0]['il_type'] != '60-day' or st[0]['end_date'] != '2026-08-10':
        bad.append(('build_stints', 'one 60-day stint 03-22..08-10', st))
    print('selftest FAIL' if bad else 'selftest ok', *bad, sep='\n  ')
    return 1 if bad else 0


def game_log_rows(pq: pd.DataFrame, ids: set[int], team_id: int, season: int) -> list[dict]:
    d = pq[pq['pitcher'].isin(ids)].copy()
    d['gd'] = pd.to_datetime(d['game_date'])
    ev = d['events']
    d['k'], d['bb'], d['bf'] = ev.isin(K_EV), ev.isin(BB_EV), ev.notna()
    d['csw'] = d['description'].isin(F.CSW_DESCS)
    rows = []
    for pid, g in d.groupby('pitcher'):
        per = g.groupby(['game_pk', 'gd'])
        a = per.agg(pitches=('pitch_type', 'size'), bf=('bf', 'sum'), k=('k', 'sum'), bb=('bb', 'sum'),
                    csw=('csw', 'mean'), arm_angle=('arm_angle', 'mean'), rel_z=('release_pos_z', 'mean')).reset_index().sort_values(['gd', 'game_pk'])
        a['days_rest'] = (a['gd'].diff().dt.days - 1)
        velo = g[g['pitch_type'].notna()].groupby(['game_pk', 'pitch_type'])['release_speed'].mean()
        for r in a.itertuples():
            vt = velo.loc[r.game_pk].dropna().round(1).to_dict() if r.game_pk in velo.index.get_level_values(0) else {}
            rows.append({'player_id': int(pid), 'game_pk': int(r.game_pk), 'team_id': team_id, 'season': season,
                         'game_date': r.gd.date(), 'days_rest': None if pd.isna(r.days_rest) else int(r.days_rest),
                         'pitches': int(r.pitches), 'bf': int(r.bf), 'k': int(r.k), 'bb': int(r.bb),
                         'csw': float(100 * r.csw), 'velo_by_type': vt,
                         'arm_angle': None if pd.isna(r.arm_angle) else float(r.arm_angle),
                         'rel_z': None if pd.isna(r.rel_z) else float(r.rel_z)})
    return rows


def run(team_id: int, season: int, dry_run: bool) -> int:
    pq = load_pitches(season)
    r = mlb_get(f'/teams/{team_id}/roster', {'rosterType': '40Man', 'hydrate': 'person'})
    ids = {int(x['person']['id']) for x in (r or {}).get('roster', []) if x.get('position', {}).get('type') == 'Pitcher'}
    print(f'Team {team_id}: {len(ids)} pitchers')
    log = game_log_rows(pq, ids, team_id, season)
    t = mlb_get('/transactions', {'teamId': team_id, 'startDate': f'{season}-01-01', 'endDate': date.today().isoformat()})
    if t is None:
        print('[run] transactions unavailable; no IL stints will be written (nothing is guessed)')
        stints: list[dict] = []
    else:
        stints = build_stints(t.get('transactions', []), ids, team_id)
    names = {int(x['person']['id']): x['person']['fullName'] for x in (r or {}).get('roster', [])}
    print(f'\nBuilt {len(log)} appearances and {len(stints)} IL stints. Stints:')
    for s in stints:
        print(f"  {names.get(s['player_id'], s['player_id']):24} {s['il_type']}  {s['start_date']} -> {s['end_date'] or 'open'}")
    ok = True
    if confirm_abort('fo_pitch_game_log', log, dry_run):
        ok &= upsert('fo_pitch_game_log', log, 'player_id,game_pk')
    if confirm_abort('fo_pitch_il_stints', stints, dry_run):
        ok &= upsert('fo_pitch_il_stints', stints, 'player_id,start_tx_id')
    return 0 if ok else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--team', type=int, default=143)
    ap.add_argument('--season', type=int, default=2026)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    sys.exit(selftest() if a.selftest else run(a.team, a.season, a.dry_run))
