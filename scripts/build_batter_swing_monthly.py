"""
scripts/build_batter_swing_monthly.py

Builds `batter_swing_monthly`: per batter x season x calendar month, how his swing looked (bat speed, attack angle, squared-up
count, stance angle and width). Behind the Batting Lab Swing tab ("Swing Changes").

TABLE OWNERSHIP: this script (via .github/workflows/swing-monthly.yml) is the ONLY writer of batter_swing_monthly.

DRY RUN BY DEFAULT: nothing is written unless --write is passed. A dry run reads Savant, runs the checks below, prints a 5-row
sample and stops. --write then waits --wait seconds (Ctrl-C to abort) before the upsert.

SOURCE (verified live on 2026-10-22; field names come from the responses): three Savant leaderboard CSVs, one request per
season x month x file, each with seasonStart/seasonEnd + dateStart/dateEnd + minSwings=1:
  https://baseballsavant.mlb.com/leaderboard/bat-tracking?type=batter&csv=true
      id, swings_competitive, contact, avg_bat_speed, squared_up_per_swing, batted_ball_events, ...
  https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-path-attack-angle?type=batter&csv=true
      id, side, attack_angle, competitive_swings, ...
  https://baseballsavant.mlb.com/visuals/batting-stance?csv=true
      id, side, avg_foot_sep (in), avg_stance_angle (deg), ...
Savant's "competitive swing" and "squared-up" definitions cannot be rebuilt from the pitch CSV (tried: a 1.23 x bat speed +
0.2116 x pitch speed rule did not reproduce Savant's own counts), so the leaderboard values are used as published.
squared_up_n = round(squared_up_per_swing x swings_competitive); checked to be an integer within 0.02.
A batter listed under both sides (a switch hitter) is averaged by swings for the swing-path file; his stance is left null,
because the stance file has no swing count to weight by. Rows under MIN_SWINGS swings are not stored.

CHECKS (printed): squared_up_n integrality; the sum of each season's months against Savant's own whole-season swing count
(months leave out only games Savant has no month for, so they should agree closely); how many batters have no stance row.

USAGE
  python3 scripts/build_batter_swing_monthly.py --first-season 2026                 # dry run
  python3 scripts/build_batter_swing_monthly.py --write                             # 2024..current, writes
"""
from __future__ import annotations

import argparse
import calendar
import io
import os
import sys
import time
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd
import requests

DEFAULT_FIRST_SEASON = 2024
MIN_SWINGS = 10
BATCH = 100
BASE = 'https://baseballsavant.mlb.com'
FILES = {
    'bt': ('leaderboard/bat-tracking', {'type': 'batter'}),
    'sp': ('leaderboard/bat-tracking/swing-path-attack-angle', {'type': 'batter'}),
    'st': ('visuals/batting-stance', {}),
}


def fetch(kind: str, season: int, month: int | None):
    """One leaderboard CSV for a season (month None) or a calendar month; empty frame when Savant has no rows."""
    path, extra = FILES[kind]
    params = {**extra, 'csv': 'true', 'seasonStart': season, 'seasonEnd': season, 'minSwings': 1}
    if month is not None:
        last = calendar.monthrange(season, month)[1]
        params.update({'dateStart': f'{season}-{month:02d}-01', 'dateEnd': f'{season}-{month:02d}-{last:02d}'})
    for attempt in range(6):
        try:
            r = requests.get(f'{BASE}/{path}', params=params, timeout=(10, 90))
            text = r.content.decode('utf-8-sig')
            if r.status_code == 200 and text.lstrip().startswith('"id"'):
                return pd.read_csv(io.StringIO(text))
            if r.status_code == 200 and len(text.strip()) < 400:
                return pd.DataFrame()   # no rows (month not played yet, or no tracking)
            print(f'  {kind} {season}-{month}: unexpected response (HTTP {r.status_code}, {len(text)} bytes), retry {attempt + 1}')
        except requests.RequestException as e:
            print(f'  {kind} {season}-{month}: {e}, retry {attempt + 1}')
        time.sleep(6 * (attempt + 1))
    raise RuntimeError(f'could not fetch {kind} {season}-{month} after 6 tries')  # a silent gap would hide a month


def month_frame(season: int, month: int) -> pd.DataFrame:
    bt, sp, st = (fetch(k, season, month) for k in ('bt', 'sp', 'st'))
    time.sleep(0.4)
    if bt.empty:
        return pd.DataFrame()
    bt = bt.rename(columns={'id': 'batter_id'})
    out = pd.DataFrame({
        'batter_id': bt['batter_id'], 'n_swings': bt['swings_competitive'], 'n_contact': bt['contact'], 'n_bbe': bt['batted_ball_events'],
        'bat_speed_mean': bt['avg_bat_speed'], '_sq': bt['squared_up_per_swing'] * bt['swings_competitive'],
    })
    out['squared_up_n'] = out['_sq'].round()
    out['_sq_err'] = (out['_sq'] - out['squared_up_n']).abs()
    if not sp.empty:   # switch hitters appear once per side: weight by swings
        g = sp.assign(w=sp['competitive_swings'], a=sp['attack_angle'] * sp['competitive_swings']).groupby('id').agg(w=('w', 'sum'), a=('a', 'sum'))
        out = out.merge((g['a'] / g['w']).rename('attack_angle_mean').reset_index().rename(columns={'id': 'batter_id'}), on='batter_id', how='left')
    else:
        out['attack_angle_mean'] = np.nan
    if not st.empty:   # a batter listed twice has no swing count to weight by: leave his stance null
        cnt = st.groupby('id').size()
        one = st[st['id'].isin(cnt[cnt == 1].index)]
        out = out.merge(one[['id', 'avg_stance_angle', 'avg_foot_sep']].rename(columns={'id': 'batter_id', 'avg_stance_angle': 'stance_angle_mean', 'avg_foot_sep': 'stance_width_mean'}), on='batter_id', how='left')
    else:
        out['stance_angle_mean'] = np.nan
        out['stance_width_mean'] = np.nan
    return out.assign(season=season, month=month)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--first-season', type=int, default=DEFAULT_FIRST_SEASON)
    ap.add_argument('--write', action='store_true', help='write to Supabase (default is a dry run)')
    ap.add_argument('--wait', type=int, default=10, help='seconds to abort (Ctrl-C) before the upsert')
    args = ap.parse_args()
    started = datetime.now(timezone.utc)
    today = date.today()

    frames, season_totals = [], {}
    for season in range(args.first_season, today.year + 1):
        months = [m for m in range(3, 12) if date(season, m, 1) <= today]
        for i, m in enumerate(months, 1):
            f = month_frame(season, m)
            print(f'MILESTONE reading {season}: month {m} ({i}/{len(months)})  rows {len(f)}', flush=True)
            if not f.empty:
                frames.append(f)
        whole = fetch('bt', season, None)
        season_totals[season] = int(whole['swings_competitive'].sum()) if not whole.empty else 0
    if not frames:
        print('No data read; nothing to write.')
        sys.exit(1)
    allm = pd.concat(frames, ignore_index=True)

    print('\nCHECKS')
    print(f'  squared_up_n: {int((allm["_sq_err"] > 0.02).sum())} of {len(allm):,} rows are not within 0.02 of an integer')
    for s in sorted(season_totals):
        mm = int(allm.loc[allm.season == s, 'n_swings'].sum())
        print(f'  {s}: months add up to {mm:,} swings, Savant whole-season total {season_totals[s]:,} ({(mm / season_totals[s] - 1) * 100:+.2f}%)' if season_totals[s] else f'  {s}: no whole-season total')
    print(f'  stance missing on {allm["stance_angle_mean"].isna().sum():,} of {len(allm):,} rows; attack angle missing on {allm["attack_angle_mean"].isna().sum():,}')

    keep = allm[allm['n_swings'] >= MIN_SWINGS].copy()
    cols = ['n_swings', 'n_contact', 'n_bbe', 'bat_speed_mean', 'attack_angle_mean', 'squared_up_n', 'stance_angle_mean', 'stance_width_mean']

    def wmean(g: pd.DataFrame, c: str) -> float | None:
        v = g[g[c].notna()]
        return float((v[c] * v['n_swings']).sum() / v['n_swings'].sum()) if len(v) and v['n_swings'].sum() else None

    league = []
    for (s, m), g in keep.groupby(['season', 'month']):
        league.append({'batter_id': 0, 'season': int(s), 'month': int(m), 'n_swings': int(g.n_swings.sum()), 'n_contact': int(g.n_contact.sum()), 'n_bbe': int(g.n_bbe.sum()),
                       'bat_speed_mean': wmean(g, 'bat_speed_mean'), 'attack_angle_mean': wmean(g, 'attack_angle_mean'), 'squared_up_n': int(g.squared_up_n.sum()),
                       'stance_angle_mean': wmean(g, 'stance_angle_mean'), 'stance_width_mean': wmean(g, 'stance_width_mean')})

    INT_COLS = {'batter_id', 'season', 'month', 'n_swings', 'n_contact', 'n_bbe', 'squared_up_n'}   # integer columns: pandas may hold them as floats (NaN promotes)

    def clean(k, v):
        if v is None or (isinstance(v, (float, np.floating)) and np.isnan(v)):
            return None
        return int(round(float(v))) if k in INT_COLS else round(float(v), 3)
    rows = [{'batter_id': int(r.batter_id), 'season': int(r.season), 'month': int(r.month), **{c: clean(c, getattr(r, c)) for c in cols}, 'updated_at': started.isoformat()}
            for r in keep.itertuples(index=False)]
    rows += [{**{k: clean(k, v) for k, v in r.items()}, 'updated_at': started.isoformat()} for r in league]

    print(f'\n{len(keep):,} batter-month rows + {len(league)} league rows = {len(rows):,}')
    print('\nSANITY: league means by month (latest season read)')
    last = max(r['season'] for r in league)
    for r in sorted((r for r in league if r['season'] == last), key=lambda r: r['month']):
        print(f'  {last}-{r["month"]:02d}: swings {r["n_swings"]:>7,} | bat speed {r["bat_speed_mean"]:.2f} mph | attack angle {r["attack_angle_mean"]:.2f}° | '
              f'squared-up {r["squared_up_n"] / r["n_contact"]:.1%} of contact | stance angle {r["stance_angle_mean"] if r["stance_angle_mean"] is None else round(r["stance_angle_mean"], 1)}° | width {r["stance_width_mean"] if r["stance_width_mean"] is None else round(r["stance_width_mean"], 1)} in')
    print('\n5-row sample (most swings, latest season):')
    show = sorted([r for r in rows if r['season'] == last and r['batter_id'] > 0], key=lambda r: -r['n_swings'])[:5]
    print(pd.DataFrame([{k: v for k, v in r.items() if k != 'updated_at'} for r in show]).to_string(index=False))
    if not args.write:
        print('\nDRY RUN (default): nothing written. Pass --write to write.')
        return

    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv('.env.local')
    url = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip()
    key = (os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()
    if not url or not key:
        print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
        sys.exit(1)
    sb = create_client(url, key)
    print(f'\nWriting {len(rows):,} rows to batter_swing_monthly in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    for i in range(0, len(rows), BATCH):
        sb.table('batter_swing_monthly').upsert(rows[i:i + BATCH], on_conflict='batter_id,season,month').execute()
        done = min(i + BATCH, len(rows))
        print(f'  wrote {done:,}/{len(rows):,} ({done * 100 // len(rows)}%)', flush=True)
        for m in (20, 40, 60, 80, 100):
            if done * 100 >= m * len(rows) and i * 100 < m * len(rows):
                print(f'MILESTONE writing {m}% ({done:,}/{len(rows):,} rows)', flush=True)
    seasons = sorted({r['season'] for r in rows})
    stale = sb.table('batter_swing_monthly').select('batter_id', count='exact').in_('season', seasons).lt('updated_at', started.isoformat()).limit(1).execute().count or 0
    if stale > max(3, len(rows) // 2):
        print(f'REFUSING to delete {stale} stale rows (only {len(rows)} written): something is wrong.')
        sys.exit(1)
    sb.table('batter_swing_monthly').delete().in_('season', seasons).lt('updated_at', started.isoformat()).execute()
    print(f'  removed {stale} stale rows', flush=True)
    sb.table('cron_run_log').insert({'job': 'build_batter_swing_monthly', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
                                     'rows_written': len(rows), 'status': 'ok', 'note': f'seasons {seasons}'}).execute()
    print('Done.')


if __name__ == '__main__':
    main()
