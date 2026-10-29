"""
scripts/build_swing_decisions.py

Builds the three Swing Lab tables behind the Batting Lab "Decisions" tab:
  swing_decision_league         league mean run value of a swing and of a take, per count group x pitch family x
                                pitcher hand x cell of a 5x5 grid around the zone
  swing_decision_league_count   league swing rate per exact count (the count ladder's baseline)
  batter_swing_decisions        per batter, per window ('season' and 'l30'): how many pitches he saw and swung at in
                                each of those cells and counts. Counts only: the app derives decision value from them.

TABLE OWNERSHIP: this script (via .github/workflows/swing-decisions.yml) is the ONLY writer of all three tables.
One pass over Savant fills them together, so they always describe the same pitches.

SOURCE / DEFINITIONS (verified against a live pull of 2026-09-15, 4,427 pitches):
  delta_run_exp is present, batter's side (called strike three -0.233, ball +0.054).
  swing = swinging_strike, swinging_strike_blocked, foul, foul_tip, hit_into_play
  take  = ball, called_strike, blocked_ball      (bunts, hit_by_pitch, pitchout, automatic_ball/strike are not decisions)
  plate_x is negative for pitches inside to a right-handed batter (HBP mean -2.0 for R, +1.85 for L), so x is flipped
  for left-handed batters: zone_c 0 is always "wide inside". Inner three columns span +-0.83 ft. Rows: thirds of the
  batter's own sz_top..sz_bot, padded 0.12 ft; zone_r 0 = above the zone .. 4 = below.
  count_group: even 0-0,1-1 | hitters 1-0,2-0,3-0,2-1,3-1 | two_strike any 2-strike count. 0-1 is in no group
  (it only shows on the count ladder).
  family: FF SI FC fastball | SL ST CU KC SV breaking | CH FS FO offspeed. Other pitch types are skipped.
  Regular season, coord era '2026' (same as pitch_shape_bins). Rows with no delta_run_exp are left out of the LEAGUE
  run values only; they still count as pitches seen.
  'l30' = the 30 days ending on the last game day read (not the calendar today), so the offseason shows the season's
  final month instead of an empty window.

USAGE
  python3 scripts/build_swing_decisions.py                                   # whole 2026 season, writes
  python3 scripts/build_swing_decisions.py --dry-run --start 2026-09-15 --end 2026-09-17
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests

SEASON = 2026
COORD_ERA = '2026'
CONCURRENCY = 4
BATCH = 100
MIN_PITCHES = 100            # a batter-window with fewer decision pitches is not stored (every page gate is higher)
SWING = {'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play'}
TAKE = {'ball', 'called_strike', 'blocked_ball'}
FAMILY = {'FF': 0, 'SI': 0, 'FC': 0, 'SL': 1, 'ST': 1, 'CU': 1, 'KC': 1, 'SV': 1, 'CH': 2, 'FS': 2, 'FO': 2}
FAMILY_NAME = ['fastball', 'breaking', 'offspeed']
GROUP_NAME = ['even', 'hitters', 'two_strike']
HALF = 0.83                  # ft, half-width of the zone incl. the ball
PAD = 0.12                   # ft added above and below the batter's zone for the ball
USECOLS = ['batter', 'game_date', 'balls', 'strikes', 'plate_x', 'plate_z', 'sz_top', 'sz_bot', 'stand', 'p_throws',
           'pitch_type', 'description', 'delta_run_exp', 'home_team', 'away_team', 'inning_topbot']
MLB_API = 'https://statsapi.mlb.com/api/v1'
URL = ('https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C'
       '&game_date_gt={d}&game_date_lt={d}&player_type=batter')


def http_get(url: str, total: int = 150):
    """GET with a hard total deadline (requests' own timeout only limits the gap between bytes)."""
    t0 = time.time()
    r = requests.get(url, timeout=(10, 45), stream=True)
    chunks = []
    for c in r.iter_content(chunk_size=65536):
        chunks.append(c)
        if time.time() - t0 > total:
            r.close()
            raise requests.Timeout(f'exceeded {total}s total')
    r._content = b''.join(chunks)
    return r


def fetch_day(d: date):
    for attempt in range(4):
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
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'could not fetch {d} after 4 tries')  # a silent gap would skew every rate


def aggregate(df: pd.DataFrame, day: date):
    """One game day -> (batter cells, league cells, batter ladder, league ladder), each tagged with the day."""
    df = df[df['stand'].isin(['R', 'L']) & df['p_throws'].isin(['R', 'L'])].copy()
    df['f'] = df['pitch_type'].map(FAMILY)
    df['sw'] = df['description'].isin(SWING)
    df = df[df['f'].notna() & (df['sw'] | df['description'].isin(TAKE))]
    df = df[df['balls'].between(0, 3) & df['strikes'].between(0, 2)]
    if df.empty:
        return None
    df['team'] = np.where(df['inning_topbot'] == 'Top', df['away_team'], df['home_team'])  # the batting team
    teamB = df.groupby('batter', as_index=False).agg(team=('team', 'last'))
    df['f'] = df['f'].astype(int)
    df['h'] = (df['p_throws'] == 'L').astype(int)
    df['swi'] = df['sw'].astype(int)
    b, s = df['balls'].astype(int), df['strikes'].astype(int)

    # count ladder: needs no location
    lad = df.assign(b=b, s=s)
    ladB = lad.groupby(['batter', 'b', 's', 'f', 'h'], as_index=False).agg(n=('swi', 'size'), sw=('swi', 'sum'))
    ladL = lad.groupby(['b', 's', 'f', 'h'], as_index=False).agg(n=('swi', 'size'), sw=('swi', 'sum'))

    # cell table: needs a location and one of the three count groups
    grp = np.full(len(df), -1)
    two = (s == 2).to_numpy()
    even = ((b == 0) & (s == 0)).to_numpy() | ((b == 1) & (s == 1)).to_numpy()
    hit = (b.to_numpy() > s.to_numpy()) & (s.to_numpy() < 2)
    grp[even] = 0
    grp[hit] = 1
    grp[two] = 2
    df['g'] = grp
    c = df.dropna(subset=['plate_x', 'plate_z']).query('g >= 0').copy()
    if c.empty:
        teamB['day'] = day
        ladB['day'] = ladL['day'] = day
        return None, None, ladB, ladL, teamB
    x_in = np.where(c['stand'] == 'R', c['plate_x'], -c['plate_x'])
    u = (x_in + HALF) / (2 * HALF / 3)
    c['c'] = np.where(u < 0, 0, np.where(u >= 3, 4, 1 + np.floor(u))).astype(int)
    top = c['sz_top'].fillna(3.5).to_numpy() + PAD
    bot = c['sz_bot'].fillna(1.5).to_numpy() - PAD
    v = (c['plate_z'].to_numpy() - bot) / (top - bot) * 3
    c['r'] = np.where(v < 0, 4, np.where(v >= 3, 0, 3 - np.floor(v))).astype(int)

    cellB = c.groupby(['batter', 'g', 'f', 'h', 'r', 'c'], as_index=False).agg(n=('swi', 'size'), sw=('swi', 'sum'))
    d = c.dropna(subset=['delta_run_exp'])
    d = d.assign(rs=np.where(d['sw'], d['delta_run_exp'], 0.0), rt=np.where(d['sw'], 0.0, d['delta_run_exp']),
                 ns=d['swi'], nt=1 - d['swi'])
    cellL = d.groupby(['g', 'f', 'h', 'r', 'c'], as_index=False)[['rs', 'rt', 'ns', 'nt']].sum()
    teamB['day'] = day
    for t in (cellB, cellL, ladB, ladL):
        t['day'] = day
    return cellB, cellL, ladB, ladL, teamB


def metrics(cb: pd.DataFrame, L: pd.DataFrame) -> pd.DataFrame:
    """Per batter: Selection, Aggression and decision runs per 100 over his grid cells, against the league table L.
    Mirrors summarize()/aggregate() in src/lib/swing-decisions/model.ts. A cell the league has no swing or no take for
    cannot be baselined and is left out."""
    m = cb.merge(L, on=['g', 'f', 'h', 'r', 'c'], how='inner')
    m = m[(m['ns'] > 0) & (m['nt'] > 0)].copy()
    sr = m['ns'] / (m['ns'] + m['nt'])
    gap = m['rs'] / m['ns'] - m['rt'] / m['nt']
    m['dr'] = (m['sw'] - m['n'] * sr) * gap * 100
    m['junk'] = gap < 0
    j, k = m[m['junk']], m[~m['junk']]
    out = pd.DataFrame({'n_grid': m.groupby('batter')['n'].sum(), 'dr': m.groupby('batter')['dr'].sum(),
                        'n_junk': j.groupby('batter')['n'].sum(), 'sw_junk': j.groupby('batter')['sw'].sum(),
                        'n_hit': k.groupby('batter')['n'].sum(), 'sw_hit': k.groupby('batter')['sw'].sum()}).fillna(0)
    out['selection'] = np.where(out['n_junk'] > 0, 1 - out['sw_junk'] / out['n_junk'].where(out['n_junk'] > 0, 1), np.nan)
    out['aggression'] = np.where(out['n_hit'] > 0, out['sw_hit'] / out['n_hit'].where(out['n_hit'] > 0, 1), np.nan)
    out['drp'] = out['dr'] / out['n_grid'].where(out['n_grid'] > 0, 1)
    return out


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


def pack(df: pd.DataFrame, cols: list[str]) -> list[int]:
    return df[cols].to_numpy(dtype=int).ravel().tolist()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--start')
    ap.add_argument('--end')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--wait', type=int, default=10, help='seconds to abort (Ctrl-C) before the upsert')
    args = ap.parse_args()

    today = date.today()
    start = date.fromisoformat(args.start) if args.start else date(SEASON, 3, 15)
    end = date.fromisoformat(args.end) if args.end else min(today - timedelta(days=1), date(SEASON, 11, 10))
    started = datetime.now(timezone.utc)
    days, d = [], start
    while d <= end:
        if d.year == SEASON and (3, 15) <= (d.month, d.day) <= (11, 10):
            days.append(d)
        d += timedelta(days=1)

    def read_day(day: date):
        raw = fetch_day(day)
        if raw is None or raw.empty:
            return None
        return aggregate(raw, day)

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
            if n_days % 20 == 0:
                print(f'  ...{n_days} game days read', flush=True)
    if not parts:
        print('No data read; nothing to write.')
        sys.exit(1)

    cat = lambda i: pd.concat([p[i] for p in parts if p[i] is not None], ignore_index=True)
    cellB, cellL, ladB, ladL, teamB = cat(0), cat(1), cat(2), cat(3), cat(4)
    teams = teamB.sort_values('day').groupby('batter')['team'].last()
    last_day = max(p[2]['day'].max() for p in parts)
    l30_from = last_day - timedelta(days=29)
    print(f'\nlast game day read {last_day}; l30 window {l30_from} .. {last_day}')

    # ---- league tables (whole season) ----
    L = cellL.groupby(['g', 'f', 'h', 'r', 'c'], as_index=False)[['rs', 'rt', 'ns', 'nt']].sum()
    league_rows = []
    for x in L.itertuples(index=False):
        n = int(x.ns + x.nt)
        league_rows.append({
            'coord_era': COORD_ERA, 'count_group': GROUP_NAME[x.g], 'family': FAMILY_NAME[x.f], 'p_throws': 'L' if x.h else 'R',
            'zone_r': int(x.r), 'zone_c': int(x.c), 'n': n, 'n_swing': int(x.ns), 'n_take': int(x.nt),
            'swing_rate': round(x.ns / n, 4),
            'rv_swing_mean': round(x.rs / x.ns, 5) if x.ns else None, 'rv_take_mean': round(x.rt / x.nt, 5) if x.nt else None,
            'updated_at': started.isoformat(),
        })
    LL = ladL.groupby(['b', 's', 'f', 'h'], as_index=False)[['n', 'sw']].sum()
    count_rows = [{
        'coord_era': COORD_ERA, 'balls': int(x.b), 'strikes': int(x.s), 'family': FAMILY_NAME[x.f], 'p_throws': 'L' if x.h else 'R',
        'n': int(x.n), 'n_swing': int(x.sw), 'updated_at': started.isoformat(),
    } for x in LL.itertuples(index=False)]

    # ---- batter rows, two windows ----
    batter_rows = []
    for win, lo in (('season', None), ('l30', l30_from)):
        cb = cellB if lo is None else cellB[cellB['day'] >= lo]
        lb = ladB if lo is None else ladB[ladB['day'] >= lo]
        cb = cb.groupby(['batter', 'g', 'f', 'h', 'r', 'c'], as_index=False)[['n', 'sw']].sum()
        lb = lb.groupby(['batter', 'b', 's', 'f', 'h'], as_index=False)[['n', 'sw']].sum()
        totals = lb.groupby('batter')['n'].sum()
        cells_by = {k: g for k, g in cb.groupby('batter')}
        met = metrics(cb, L)
        num = lambda v, d: None if v is None or pd.isna(v) else round(float(v), d)
        for bid, g in lb.groupby('batter'):
            if totals[bid] < MIN_PITCHES:
                continue
            cg = cells_by.get(bid)
            mm = met.loc[bid] if bid in met.index else None
            batter_rows.append({
                'batter_id': int(bid), 'season': SEASON, 'win': win, 'coord_era': COORD_ERA, 'n_pitches': int(totals[bid]),
                'team': teams.get(bid),
                'n_grid': int(mm['n_grid']) if mm is not None else 0, 'n_junk': int(mm['n_junk']) if mm is not None else 0,
                'n_hit': int(mm['n_hit']) if mm is not None else 0,
                'selection': num(mm['selection'], 4) if mm is not None else None, 'aggression': num(mm['aggression'], 4) if mm is not None else None,
                'decision_runs_per100': num(mm['drp'], 3) if mm is not None else None,
                'cells': pack(cg, ['g', 'f', 'h', 'r', 'c', 'n', 'sw']) if cg is not None else [],
                'counts': pack(g, ['b', 's', 'f', 'h', 'n', 'sw']), 'updated_at': started.isoformat(),
            })
    names = resolve_names(sorted({r['batter_id'] for r in batter_rows}))
    missing = 0
    for r in batter_rows:
        r['name'] = names.get(r['batter_id'])
        missing += r['name'] is None
    if missing:
        print(f'WARNING: {missing} batter rows have no name from the MLB API (stored null)')

    print(f'\n{n_days} game days read -> {len(league_rows)} league cells, {len(count_rows)} league count rows, '
          f'{len(batter_rows)} batter-window rows ({sum(r["win"] == "season" for r in batter_rows)} season, '
          f'{sum(r["win"] == "l30" for r in batter_rows)} l30)')
    lg = pd.DataFrame(league_rows)
    print('\nSANITY: league swing rate / run value of a swing vs a take, in the zone and out of it')
    inz = lg['zone_r'].between(1, 3) & lg['zone_c'].between(1, 3)
    for name, m in (('inside the zone', inz), ('outside the zone', ~inz)):
        t = lg[m]
        ts, tt = t.dropna(subset=['rv_swing_mean']), t.dropna(subset=['rv_take_mean'])
        print(f'  {name:17s} swing rate {np.average(t["swing_rate"].astype(float), weights=t["n"]):.3f}   '
              f'swing rv {np.average(ts["rv_swing_mean"].astype(float), weights=ts["n_swing"]):+.4f}   '
              f'take rv {np.average(tt["rv_take_mean"].astype(float), weights=tt["n_take"]):+.4f}')
    print('\n5-row sample, league (most pitches):')
    print(lg.sort_values('n', ascending=False).head(5).drop(columns=['updated_at', 'coord_era']).to_string(index=False))
    print('\n5-row sample, batter windows (most pitches):')
    show = sorted(batter_rows, key=lambda r: -r['n_pitches'])[:5]
    print(pd.DataFrame([{**{k: v for k, v in r.items() if k not in ('cells', 'counts', 'updated_at', 'coord_era', 'season')},
                         'cells': len(r['cells']) // 7, 'counts': len(r['counts']) // 6} for r in show]).to_string(index=False))
    if args.dry_run:
        print('\n--dry-run: nothing written.')
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

    plan = [('swing_decision_league', league_rows, 'coord_era,count_group,family,p_throws,zone_r,zone_c'),
            ('swing_decision_league_count', count_rows, 'coord_era,balls,strikes,family,p_throws'),
            ('batter_swing_decisions', batter_rows, 'batter_id,season,win,coord_era')]
    total = sum(len(r) for _, r, _ in plan)
    print(f'\nWriting {total:,} rows across 3 tables in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    done = 0
    for table, rows, conflict in plan:
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            sb.table(table).upsert(chunk, on_conflict=conflict).execute()
            before, done = done, done + len(chunk)
            print(f'  {table}: wrote {min(i + BATCH, len(rows))}/{len(rows)}  (overall {done * 100 // total}%)', flush=True)
            for m in (20, 40, 60, 80, 100):
                if done * 100 >= m * total and before * 100 < m * total:
                    print(f'MILESTONE writing {m}% ({done:,}/{total:,} rows)', flush=True)
    # Rows this run did not touch are stale. Every row written carries updated_at = started. Refuse a mass delete.
    for table, rows, _ in plan:
        stale = sb.table(table).select('updated_at', count='exact').eq('coord_era', COORD_ERA).lt('updated_at', started.isoformat()).limit(1).execute().count or 0
        if stale > max(3, len(rows) // 2):
            print(f'REFUSING to delete {stale} stale rows from {table} (only {len(rows)} written): something is wrong.')
            sys.exit(1)
        sb.table(table).delete().eq('coord_era', COORD_ERA).lt('updated_at', started.isoformat()).execute()
        print(f'  {table}: removed {stale} stale rows', flush=True)
    sb.table('cron_run_log').insert({
        'job': 'build_swing_decisions', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
        'rows_written': total, 'status': 'ok', 'note': f'{n_days} game days, last {last_day}',
    }).execute()
    print('Done.')


if __name__ == '__main__':
    main()
