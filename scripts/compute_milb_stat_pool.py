#!/usr/bin/env python3
"""
compute_milb_stat_pool.py

Fills milb_stat_pool: for every minor-league level (Triple-A, Double-A, High-A, Single-A, Rookie) and one season, every batter's and pitcher's rates, so the player page can rank a minor
leaguer against everyone else at his level. Source: the MLB Stats API season stats (free, no auth), one call per level per group (hitting, pitching), players combined across clubs.

TABLE OWNERSHIP (single writer): this script is the only writer of milb_stat_pool.
Depends on nothing else. Runs daily from GitHub Actions (compute-milb-stat-pool.yml) at 10:15 UTC, after the overnight games are final. Python crons live only in GitHub Actions.

FIP uses a constant worked out per level from that level's own totals (lgERA - (13 HR + 3 (BB + HBP) - 2 K) / IP), so a Double-A FIP is on Double-A's scale.

Usage:
  python3 scripts/compute_milb_stat_pool.py [--season 2026] [--wait 5] [--dry-run]
  python3 scripts/compute_milb_stat_pool.py --dry-run --level aa      # one level, prints the sample and writes nothing
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import date
from pathlib import Path

import requests

try:  # local runs read .env.local; GitHub Actions passes secrets as environment variables
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / '.env.local')
    load_dotenv()
except ImportError:
    pass

API = 'https://statsapi.mlb.com/api/v1'
LEVELS = {'aaa': 11, 'aa': 12, 'higha': 13, 'a': 14, 'rk': 16}   # keep in step with src/lib/levels.ts
MIN_N = 20      # rows below this many PA / batters faced are not stored; the site applies its own (higher) minimum when ranking
BATCH = 500


def num(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def ip(v) -> float:
    w, _, f = str(v or '0').partition('.')
    return num(w) + num(f) / 3


def fetch(level: str, group: str, season: int) -> list[dict]:
    r = requests.get(f'{API}/stats', params={'stats': 'season', 'group': group, 'season': season, 'sportId': LEVELS[level], 'playerPool': 'ALL', 'limit': 5000, 'offset': 0}, timeout=120)
    r.raise_for_status()
    splits = (r.json().get('stats') or [{}])[0].get('splits') or []
    total = (r.json().get('stats') or [{}])[0].get('totalSplits')
    if total is not None and total > len(splits):
        raise RuntimeError(f'{level} {group}: API returned {len(splits)} of {total} rows; raise the limit')
    return splits


def batter_row(s: dict) -> tuple[int, dict] | None:
    st = s['stat']
    pa = num(st.get('plateAppearances'))
    if pa < MIN_N:
        return None
    return int(pa), {
        'avg': num(st.get('avg')), 'obp': num(st.get('obp')), 'slg': num(st.get('slg')), 'ops': num(st.get('ops')),
        'iso': round(num(st.get('slg')) - num(st.get('avg')), 3),
        'k_pct': round(100 * num(st.get('strikeOuts')) / pa, 2), 'bb_pct': round(100 * num(st.get('baseOnBalls')) / pa, 2),
        'hr': int(num(st.get('homeRuns'))), 'sb': int(num(st.get('stolenBases'))),
    }


def fip_constant(splits: list[dict]) -> float | None:
    t = dict(hr=0.0, bb=0.0, hbp=0.0, k=0.0, er=0.0, ip=0.0)
    for s in splits:
        st = s['stat']
        t['hr'] += num(st.get('homeRuns')); t['bb'] += num(st.get('baseOnBalls')); t['hbp'] += num(st.get('hitByPitch'))
        t['k'] += num(st.get('strikeOuts')); t['er'] += num(st.get('earnedRuns')); t['ip'] += ip(st.get('inningsPitched'))
    if t['ip'] <= 0:
        return None
    return 9 * t['er'] / t['ip'] - (13 * t['hr'] + 3 * (t['bb'] + t['hbp']) - 2 * t['k']) / t['ip']


def pitcher_row(s: dict, cfip: float | None) -> tuple[int, dict] | None:
    st = s['stat']
    bf, inn = num(st.get('battersFaced')), ip(st.get('inningsPitched'))
    if bf < MIN_N or inn <= 0:
        return None
    k, bb, hr = num(st.get('strikeOuts')), num(st.get('baseOnBalls')), num(st.get('homeRuns'))
    m = {
        'era': num(st.get('era')), 'whip': num(st.get('whip')),
        'k_pct': round(100 * k / bf, 2), 'bb_pct': round(100 * bb / bf, 2), 'kbb_pct': round(100 * (k - bb) / bf, 2),
        'hr9': round(hr * 9 / inn, 3),
    }
    if cfip is not None:
        m['fip'] = round((13 * hr + 3 * (bb + num(st.get('hitByPitch'))) - 2 * k) / inn + cfip, 3)
    return int(bf), m


def build(level: str, season: int) -> list[dict]:
    rows: list[dict] = []
    bat = fetch(level, 'hitting', season)
    pit = fetch(level, 'pitching', season)
    cfip = fip_constant(pit)
    print(f'  {level}: {len(bat)} hitters, {len(pit)} pitchers, FIP constant {cfip:.2f}' if cfip is not None else f'  {level}: {len(bat)} hitters, {len(pit)} pitchers, no FIP constant')
    for subject, splits, fn in (('batter', bat, batter_row), ('pitcher', pit, lambda s: pitcher_row(s, cfip))):
        for s in splits:
            out = fn(s)
            if out:
                rows.append({'level': level, 'season': season, 'subject': subject, 'player_id': int(s['player']['id']), 'n': out[0], 'metrics': out[1]})
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--season', type=int, default=date.today().year)
    ap.add_argument('--level', choices=sorted(LEVELS))
    ap.add_argument('--wait', type=int, default=5, help='seconds to wait before writing, so a wrong run can be stopped (0 in GitHub Actions)')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    rows: list[dict] = []
    for level in ([a.level] if a.level else list(LEVELS)):
        rows += build(level, a.season)
        time.sleep(1)   # the MLB Stats API rejects bursts
    print(f'{len(rows)} rows for {a.season}. Sample:')
    for r in rows[:5]:
        print('  ', r)
    if not rows:
        print('Nothing to write; stopping rather than clearing the table.')
        return 1
    if a.dry_run:
        print('Dry run: nothing written.')
        return 0

    from supabase import create_client   # imported here so a dry run needs no Supabase package
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not url or not key:
        print('Missing Supabase env vars'); return 1
    if a.wait:
        print(f'Writing in {a.wait}s. Ctrl-C to stop.'); time.sleep(a.wait)
    supa = create_client(url, key)
    for i in range(0, len(rows), BATCH):
        res = supa.table('milb_stat_pool').upsert(rows[i:i + BATCH], on_conflict='level,season,subject,player_id').execute()
        print(f'  wrote {i + len(res.data or [])} / {len(rows)}')
    print('Done.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
