"""
scripts/build_contact_profile.py

Builds `batter_contact_profile`: per batter x season x period ('season' or 'month'), counts of batted balls by quality bucket,
by ground ball / air ball, and by spray direction within each. Counts, not rates. Behind the Batting Lab Contact tab and the
Contact Engine leaderboard.

TABLE OWNERSHIP: this script (via .github/workflows/contact-profile.yml) is the ONLY writer of batter_contact_profile.

DRY RUN BY DEFAULT: nothing is written unless --write is passed. A dry run reads Savant, checks that every group adds up to
n_bbe, prints sanity numbers and a 5-row sample, and stops. --write then waits --wait seconds (Ctrl-C to abort) before the upsert.

SOURCE (verified against a live 2026 pull of five game days spread across the season; see the migration for the full rules):
  launch_speed_angle 1 weak, 2 topped, 3 under, 4 flare/burner, 5 solid contact, 6 barrel (checked: mean exit velocity / launch
  angle / xwOBA on contact per code), bb_type ground_ball | line_drive | fly_ball | popup, hc_x / hc_y plot coordinates.
  A ball counts only when all four of those are present. Spray: angle = atan2(hc_x - X0, Y0 - hc_y) in degrees with hc_x mirrored
  around X0 for left-handed batters (per pitch, so switch hitters are right); pull < -15 <= straight <= +15 < oppo.
  X0 = 126.5 (the centre where mirrored RHB and LHB pull rates match), Y0 = 199 (home-plate row; bunts land near y 191).

USAGE
  python3 scripts/build_contact_profile.py --start 2026-09-01 --end 2026-09-21        # dry run, a short window
  python3 scripts/build_contact_profile.py --first-season 2026                         # dry run, the whole season
  python3 scripts/build_contact_profile.py --write                                     # 2024..current, writes
"""
from __future__ import annotations

import argparse
import io
import os
import pickle
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

DEFAULT_FIRST_SEASON = 2024
CACHE_VERSION = 'v1'
CONCURRENCY = 4
BATCH = 100
MIN_BBE = 10                 # a row with fewer batted balls is not stored
X0, Y0 = 126.5, 199.0
SECTOR = 15.0                # degrees either side of straight
BUCKETS = {1: 'weak', 2: 'topped', 3: 'under', 4: 'flare_burner', 5: 'solid', 6: 'barrel'}
USECOLS = ['batter', 'game_date', 'type', 'bb_type', 'launch_speed_angle', 'hc_x', 'hc_y', 'stand', 'home_team', 'away_team', 'inning_topbot']
COUNT_COLS = ['n_bbe', 'weak', 'topped', 'under', 'flare_burner', 'solid', 'barrel', 'gb', 'air',
              'pull_gb', 'straight_gb', 'oppo_gb', 'pull_air', 'straight_air', 'oppo_air']
MLB_API = 'https://statsapi.mlb.com/api/v1'
URL = ('https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C'
       '&game_date_gt={d}&game_date_lt={d}&player_type=batter')


def http_get(url: str, total: int = 240):
    """GET with a hard total deadline (requests' own timeout only limits the gap between bytes)."""
    t0 = time.time()
    r = requests.get(url, timeout=(10, 120), stream=True)
    chunks = []
    for c in r.iter_content(chunk_size=65536):
        chunks.append(c)
        if time.time() - t0 > total:
            r.close()
            raise requests.Timeout(f'exceeded {total}s total')
    r._content = b''.join(chunks)
    return r


def fetch_day(d: date):
    for attempt in range(6):
        try:
            r = http_get(URL.format(d=d.isoformat()))
            text = r.content.decode('utf-8-sig')  # BOM-safe
            if r.status_code == 200 and text.lstrip('"').startswith('pitch_type'):
                return pd.read_csv(io.StringIO(text), usecols=lambda c: c in USECOLS)
            if r.status_code == 200 and len(text) < 500:
                return None  # off day
            print(f'  {d}: unexpected response (HTTP {r.status_code}, {len(text)} bytes), retry {attempt + 1}')
        except requests.RequestException as e:
            print(f'  {d}: {e}, retry {attempt + 1}')
        time.sleep(8 * (attempt + 1))
    raise RuntimeError(f'could not fetch {d} after 6 tries')  # a silent gap would skew every rate


def aggregate(df: pd.DataFrame):
    """One game day -> (per batter x month counts, per batter team)."""
    df = df[df['type'].eq('X') & df['stand'].isin(['R', 'L'])].copy()
    df['team'] = np.where(df['inning_topbot'] == 'Top', df['away_team'], df['home_team'])
    teams = df.groupby('batter', as_index=False).agg(team=('team', 'last'))
    df = df.dropna(subset=['launch_speed_angle', 'bb_type', 'hc_x', 'hc_y'])
    df = df[df['launch_speed_angle'].isin(BUCKETS.keys())]
    if df.empty:
        return None
    d = pd.to_datetime(df['game_date'])
    x = np.where(df['stand'] == 'L', 2 * X0 - df['hc_x'], df['hc_x'])          # mirror left-handed batters
    ang = np.degrees(np.arctan2(x - X0, Y0 - df['hc_y']))
    spray = np.where(ang < -SECTOR, 'pull', np.where(ang > SECTOR, 'oppo', 'straight'))
    gb = (df['bb_type'] == 'ground_ball').to_numpy()
    out = pd.DataFrame({'batter': df['batter'].to_numpy(), 'season': d.dt.year.to_numpy(), 'month': d.dt.month.to_numpy(), 'n_bbe': 1})
    for code, name in BUCKETS.items():
        out[name] = (df['launch_speed_angle'] == code).astype(int).to_numpy()
    out['gb'] = gb.astype(int)
    out['air'] = (~gb).astype(int)
    for s in ('pull', 'straight', 'oppo'):
        out[f'{s}_gb'] = ((spray == s) & gb).astype(int)
        out[f'{s}_air'] = ((spray == s) & ~gb).astype(int)
    g = out.groupby(['batter', 'season', 'month'], as_index=False)[COUNT_COLS].sum()
    t = teams.assign(season=d.dt.year.iloc[0])
    return g, t


def resolve_names(ids: list[int]) -> dict:
    """One bulk MLB Stats API lookup (100 ids a call, sequential: the API rejects concurrent bursts)."""
    names = {}
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        for attempt in range(3):
            try:
                r = requests.get(f'{MLB_API}/people', params={'personIds': ','.join(map(str, chunk))}, timeout=30)
                r.raise_for_status()
                for p in r.json().get('people', []):
                    names[p['id']] = p.get('fullName')
                break
            except requests.RequestException as e:
                print(f'  names {i}: {e}, retry {attempt + 1}')
                time.sleep(3 * (attempt + 1))
        time.sleep(0.3)
    return names


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--start')
    ap.add_argument('--end')
    ap.add_argument('--first-season', type=int, default=DEFAULT_FIRST_SEASON)
    ap.add_argument('--no-cache', action='store_true', help='ignore the per-day cache and read every day from Savant')
    ap.add_argument('--write', action='store_true', help='write to Supabase (default is a dry run)')
    ap.add_argument('--wait', type=int, default=10, help='seconds to abort (Ctrl-C) before the upsert')
    args = ap.parse_args()

    today = date.today()
    start = date.fromisoformat(args.start) if args.start else date(args.first_season, 3, 15)
    end = date.fromisoformat(args.end) if args.end else today - timedelta(days=1)
    started = datetime.now(timezone.utc)
    days, d = [], start
    while d <= end:
        if args.first_season <= d.year and (3, 15) <= (d.month, d.day) <= (11, 10):
            days.append(d)
        d += timedelta(days=1)

    # Per-day cache in the OS temp dir: a finished game day is read from Savant once, so a rerun after a timeout resumes where it
    # stopped instead of starting over. Bump CACHE_VERSION whenever aggregate() changes. --no-cache ignores it.
    cache_dir = os.path.join(tempfile.gettempdir(), 'theedge-savant-cache', 'contact-' + CACHE_VERSION)
    os.makedirs(cache_dir, exist_ok=True)

    def read_day(day: date):
        path = os.path.join(cache_dir, day.isoformat() + '.pkl')
        if not args.no_cache and os.path.exists(path):
            with open(path, 'rb') as fh:
                return pickle.load(fh)
        raw = fetch_day(day)
        out = None if raw is None or raw.empty else aggregate(raw)
        if day < today - timedelta(days=1):   # only a finished day is final
            with open(path, 'wb') as fh:
                pickle.dump(out, fh)
        return out

    parts, n_days, seen, total_days = [], 0, 0, len(days)
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futs = [pool.submit(read_day, x) for x in days]
        for f in as_completed(futs):
            p = f.result()
            seen += 1
            for m in (20, 40, 60, 80, 100):
                if seen * 100 >= m * total_days and (seen - 1) * 100 < m * total_days:
                    print(f'MILESTONE reading {m}% ({seen}/{total_days} days)', flush=True)
            if p is None:
                continue
            parts.append(p)
            n_days += 1
    if not parts:
        print('No data read; nothing to write.')
        sys.exit(1)

    cells = pd.concat([p[0] for p in parts], ignore_index=True)
    teams = pd.concat([p[1] for p in parts], ignore_index=True).groupby(['batter', 'season'])['team'].last()
    month = cells.groupby(['batter', 'season', 'month'], as_index=False)[COUNT_COLS].sum()
    season = month.groupby(['batter', 'season'], as_index=False)[COUNT_COLS].sum().assign(month=0)
    month = month.assign(period='month')
    season = season.assign(period='season')
    full = pd.concat([season, month], ignore_index=True)
    # the league rows (batter_id 0): every batter's counts added up per season / month, BEFORE the per-batter minimum, so a
    # page can show the league beside a hitter from one cheap read
    league = full.groupby(['season', 'period', 'month'], as_index=False)[COUNT_COLS].sum().assign(batter=0)
    allr = full[full['n_bbe'] >= MIN_BBE]

    # every group must add up to n_bbe, or the rates on the page would not mean what they say
    bad = pd.concat([allr, league], ignore_index=True)
    bad = bad[(bad[['weak', 'topped', 'under', 'flare_burner', 'solid', 'barrel']].sum(axis=1) != bad['n_bbe'])
               | (bad['gb'] + bad['air'] != bad['n_bbe'])
               | (bad[['pull_gb', 'straight_gb', 'oppo_gb']].sum(axis=1) != bad['gb'])
               | (bad[['pull_air', 'straight_air', 'oppo_air']].sum(axis=1) != bad['air'])]
    if len(bad):
        print(f'ABORT: {len(bad)} rows whose groups do not add up to n_bbe'); print(bad.head().to_string()); sys.exit(1)
    print(f'\nCHECK: every group adds up to n_bbe in all {len(allr):,} rows')

    names = resolve_names(sorted({int(b) for b in allr['batter']}))
    rows = []
    for r in pd.concat([allr, league], ignore_index=True).itertuples(index=False):
        row = {'batter_id': int(r.batter), 'season': int(r.season), 'period': r.period, 'month': int(r.month),
               'name': 'League' if int(r.batter) == 0 else names.get(int(r.batter)), 'team': None if int(r.batter) == 0 else teams.get((r.batter, r.season)), 'updated_at': started.isoformat()}
        row.update({c: int(getattr(r, c)) for c in COUNT_COLS})
        rows.append(row)
    miss = sum(r['name'] is None for r in rows)
    n_league = sum(r['batter_id'] == 0 for r in rows)
    if miss:
        print(f'WARNING: {miss} rows have no name from the MLB API (stored null)')

    sr = allr[allr['period'] == 'season']
    print(f'\n{n_days} game days -> {len(rows):,} rows ({len(sr):,} season, {len(allr) - len(sr):,} month, plus {n_league} league rows), seasons {sorted(sr.season.unique().tolist())}')
    print('\nSANITY (all season rows pooled, share of batted balls):')
    for s, g in sr.groupby('season'):
        n = g['n_bbe'].sum()
        print(f'  {s}: n_bbe {n:,} | barrel {g.barrel.sum() / n:.1%} | gb {g.gb.sum() / n:.1%} | pull {(g.pull_gb.sum() + g.pull_air.sum()) / n:.1%} '
              f'straight {(g.straight_gb.sum() + g.straight_air.sum()) / n:.1%} oppo {(g.oppo_gb.sum() + g.oppo_air.sum()) / n:.1%} | pull AIR {g.pull_air.sum() / n:.1%}')
    print('\n5-row sample (season rows, most batted balls):')
    show = sorted([r for r in rows if r['period'] == 'season'], key=lambda r: -r['n_bbe'])[:5]
    print(pd.DataFrame([{k: v for k, v in r.items() if k not in ('updated_at', 'period', 'month')} for r in show]).to_string(index=False))
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
    print(f'\nWriting {len(rows):,} rows to batter_contact_profile in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    for i in range(0, len(rows), BATCH):
        sb.table('batter_contact_profile').upsert(rows[i:i + BATCH], on_conflict='batter_id,season,period,month').execute()
        done = min(i + BATCH, len(rows))
        print(f'  wrote {done:,}/{len(rows):,} ({done * 100 // len(rows)}%)', flush=True)
        for m in (20, 40, 60, 80, 100):
            if done * 100 >= m * len(rows) and i * 100 < m * len(rows):
                print(f'MILESTONE writing {m}% ({done:,}/{len(rows):,} rows)', flush=True)
    seasons = sorted({r['season'] for r in rows})
    stale = sb.table('batter_contact_profile').select('batter_id', count='exact').in_('season', seasons).lt('updated_at', started.isoformat()).limit(1).execute().count or 0
    if stale > max(3, len(rows) // 2):
        print(f'REFUSING to delete {stale} stale rows (only {len(rows)} written): something is wrong.')
        sys.exit(1)
    sb.table('batter_contact_profile').delete().in_('season', seasons).lt('updated_at', started.isoformat()).execute()
    print(f'  removed {stale} stale rows', flush=True)
    sb.table('cron_run_log').insert({
        'job': 'build_contact_profile', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
        'rows_written': len(rows), 'status': 'ok', 'note': f'{n_days} game days, seasons {seasons}',
    }).execute()
    print('Done.')


if __name__ == '__main__':
    main()
