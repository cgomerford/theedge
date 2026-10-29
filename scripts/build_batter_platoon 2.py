"""
scripts/build_batter_platoon.py

Builds `batter_platoon_process`: every Platoon Lab number per batter x season x side batted from x pitcher hand x metric, as counts and sums
(n, value_sum, value_sq_sum). Behind the Batting Lab Platoon tab and the league view. See the migration (20261023100000) for every metric's definition.

TABLE OWNERSHIP: this script (via .github/workflows/batter-platoon.yml) is the ONLY writer of batter_platoon_process.

DRY RUN BY DEFAULT: nothing is written unless --write is passed. A dry run reads Savant, runs the checks below, prints a 5-row sample and stops.
--write then waits --wait seconds (Ctrl-C to abort) before the upsert.

SOURCE (all field names verified against live 2026 pulls; see the step-0 notes in the project history):
  - the Savant pitch CSV, one game day per request: stand, p_throws, description, events, type, bb_type, plate_x, plate_z, sz_top, sz_bot, bat_speed,
    swing_path_tilt, attack_direction, intercept_ball_minus_batter_pos_x_inches / _y_inches, hc_x, hc_y, launch_speed_angle, woba_value, woba_denom,
    estimated_woba_using_speedangle
  - squared-up: Savant's bat-tracking leaderboard with seasonStart/seasonEnd + batSide + pitchHand (verified: pitchHand splits add up exactly, e.g. 419 + 754
    = 1,173 swings; batSide splits a switch hitter, 554 + 246 = 800). Savant's squared-up definition cannot be rebuilt from the pitch CSV.
LOCATION-MATCHED BAT SPEED: each (batter, side, hand)'s full swings (bat_speed >= 60 mph, tracked) are counted in a 5x5 grid of the zone (batter's frame, same grid
  as the swing-decision tables). The league's swing share per cell is the standard; his cell means are averaged with the league's shares (renormalised over the
  cells he has swings in). value_sum = n x that standardized mean; value_sq_sum uses the same weights on the squared values.
Eras: seasons before 2026 get coord_era '2023-2025', 2026 gets '2026'. Zone-based metrics are never pooled across eras (the page shows seasons separately).

CHECKS (printed): spray groups add up to batted balls; league bat speed by hand against Savant's own leaderboard (same hand split); counts per metric.

USAGE
  python3 scripts/build_batter_platoon.py --start 2026-09-01 --end 2026-09-21 --first-season 2026      # dry run, a short window
  python3 scripts/build_batter_platoon.py --first-season 2026                                          # dry run, the season
  python3 scripts/build_batter_platoon.py --write                                                      # 2024..current, writes
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
CACHE_VERSION = 'v2'   # v2: adds the contact-point histogram ('cp') to each day's aggregate
# Contact-point histogram: 4-inch cells over intercept x 22 to 58 in (9 columns) and intercept y 14 to 62 in (12 rows); the edge cells take everything beyond them.
CP_X0, CP_Y0, CP_STEP, CP_NX, CP_NY = 22, 14, 4, 9, 12
CONCURRENCY = 4
BATCH = 100
MIN_BAT_SPEED = 60.0            # a full swing, mph
X0, Y0 = 126.5, 199.0           # spray origin (see build_contact_profile.py)
SECTOR = 15.0
HALF, PAD = 0.83, 0.12          # zone half-width and ball padding, ft (same grid as the swing-decision tables)
SWING = {'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play'}
TAKE = {'ball', 'called_strike', 'blocked_ball'}
WHIFF = {'swinging_strike', 'swinging_strike_blocked'}
USECOLS = ['batter', 'game_date', 'stand', 'p_throws', 'description', 'events', 'type', 'bb_type', 'plate_x', 'plate_z', 'sz_top', 'sz_bot',
           'bat_speed', 'swing_path_tilt', 'attack_direction', 'intercept_ball_minus_batter_pos_x_inches', 'intercept_ball_minus_batter_pos_y_inches',
           'hc_x', 'hc_y', 'launch_speed_angle', 'woba_value', 'woba_denom', 'estimated_woba_using_speedangle']
URL = ('https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C'
       '&game_date_gt={d}&game_date_lt={d}&player_type=batter')
LB = 'https://baseballsavant.mlb.com/leaderboard/bat-tracking'
KEYS = ['batter', 'stand', 'p_throws']


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
    raise RuntimeError(f'could not fetch {d} after 6 tries')  # a silent gap would skew every sum


def aggregate(df: pd.DataFrame):
    """One game day -> sums per (batter, stand, p_throws): swing cells, decisions, spray, plate appearances."""
    df = df[df['stand'].isin(['R', 'L']) & df['p_throws'].isin(['R', 'L'])].copy()
    if df.empty:
        return None
    # ---- zone and cell, in the batter's frame ----
    px = df['plate_x'].to_numpy(dtype=float)
    x_in = np.where(df['stand'] == 'R', px, -px)
    u = (x_in + HALF) / (2 * HALF / 3)
    c = np.where(u < 0, 0, np.where(u >= 3, 4, 1 + np.floor(np.nan_to_num(u)))).astype(int)
    top = df['sz_top'].fillna(3.5).to_numpy(dtype=float) + PAD
    bot = df['sz_bot'].fillna(1.5).to_numpy(dtype=float) - PAD
    v = (df['plate_z'].to_numpy(dtype=float) - bot) / (top - bot) * 3
    r = np.where(v < 0, 4, np.where(v >= 3, 0, 3 - np.floor(np.nan_to_num(v)))).astype(int)
    df['r'], df['c'] = r, c
    located = df['plate_x'].notna() & df['plate_z'].notna()
    df['inzone'] = (df['r'].between(1, 3) & df['c'].between(1, 3))
    d = df['description']
    swing, take, whiff = d.isin(SWING), d.isin(TAKE), d.isin(WHIFF)

    # ---- A. full swings with bat tracking, by cell ----
    s = df[swing & located & df['bat_speed'].notna() & (df['bat_speed'] >= MIN_BAT_SPEED)].copy()
    cols = {'bs': 'bat_speed', 'tl': 'swing_path_tilt', 'dr': 'attack_direction', 'ix': 'intercept_ball_minus_batter_pos_x_inches', 'iy': 'intercept_ball_minus_batter_pos_y_inches'}
    for k, src in cols.items():
        s[k] = s[src].astype(float)
        s[k + '2'] = s[k] ** 2
    s['n'] = 1
    cells = s.groupby(KEYS + ['r', 'c'], as_index=False)[['n'] + [k for k in cols] + [k + '2' for k in cols]].sum() if len(s) else None

    cp = None
    sc = s[s['ix'].notna() & s['iy'].notna()]
    if len(sc):
        sc = sc.assign(bx=np.clip(np.floor((sc['ix'] - CP_X0) / CP_STEP), 0, CP_NX - 1).astype(int), by=np.clip(np.floor((sc['iy'] - CP_Y0) / CP_STEP), 0, CP_NY - 1).astype(int))
        cp = sc.groupby(KEYS + ['bx', 'by'], as_index=False).size().rename(columns={'size': 'cnt'})

    # ---- B. chase and zone contact ----
    dec = df[(swing | take) & located].copy()
    dec['sw'] = swing.loc[dec.index].astype(int)
    dec['ct'] = (swing & ~whiff).loc[dec.index].astype(int)
    out = dec[~dec['inzone']].groupby(KEYS, as_index=False).agg(out_n=('sw', 'size'), out_sw=('sw', 'sum'))
    zin = dec[dec['inzone'] & (dec['sw'] == 1)].groupby(KEYS, as_index=False).agg(in_sw=('sw', 'size'), in_ct=('ct', 'sum'))

    # ---- C. spray ----
    bb = df[(df['type'] == 'X') & df['launch_speed_angle'].notna() & df['bb_type'].notna() & df['hc_x'].notna() & df['hc_y'].notna()].copy()
    xm = np.where(bb['stand'] == 'L', 2 * X0 - bb['hc_x'], bb['hc_x'])
    ang = np.degrees(np.arctan2(xm - X0, Y0 - bb['hc_y']))
    bb['dir'] = np.where(ang < -SECTOR, 'pull', np.where(ang > SECTOR, 'oppo', 'straight'))
    bb['typ'] = np.where(bb['bb_type'] == 'ground_ball', 'gb', 'air')
    spray = bb.groupby(KEYS + ['typ', 'dir'], as_index=False).size().rename(columns={'size': 'cnt'}) if len(bb) else None

    # ---- D. plate appearances ----
    pa = df[df['events'].notna() & (df['events'] != 'truncated_pa')].copy()
    pa['k'] = pa['events'].isin(['strikeout', 'strikeout_double_play']).astype(int)
    pa['bbw'] = pa['events'].isin(['walk', 'intent_walk']).astype(int)
    pa['one'] = 1
    w = pa[pa['woba_denom'].fillna(0) >= 1].copy()
    w['wv'] = w['woba_value'].fillna(0).astype(float)
    w['xv'] = np.where((w['type'] == 'X') & w['estimated_woba_using_speedangle'].notna(), w['estimated_woba_using_speedangle'], w['woba_value'].fillna(0)).astype(float)
    pa_ev = pa.groupby(KEYS, as_index=False).agg(pa=('one', 'sum'), k=('k', 'sum'), bbw=('bbw', 'sum'))
    pa_w = w.assign(wv2=w['wv'] ** 2, xv2=w['xv'] ** 2, dn=1).groupby(KEYS, as_index=False).agg(dn=('dn', 'sum'), wv=('wv', 'sum'), wv2=('wv2', 'sum'), xv=('xv', 'sum'), xv2=('xv2', 'sum'))
    return {'cells': cells, 'cp': cp, 'out': out, 'zin': zin, 'spray': spray, 'pa': pa_ev, 'paw': pa_w}


def cat(parts, key):
    frames = [p[key] for p in parts if p is not None and p.get(key) is not None and len(p[key])]
    return pd.concat(frames, ignore_index=True) if frames else None


def sum_by(df, keys):
    if df is None:
        return None
    num = [c for c in df.columns if c not in keys]
    return df.groupby(keys, as_index=False)[num].sum()


def savant_squared_up(season: int):
    """Per (batter, bat side, pitcher hand): bat contacts and squared-up contacts from Savant's leaderboard (season-level)."""
    out = []
    for bat in ('L', 'R'):
        for hand in ('L', 'R'):
            params = {'type': 'batter', 'csv': 'true', 'seasonStart': season, 'seasonEnd': season, 'minSwings': 1, 'batSide': bat, 'pitchHand': hand}
            for attempt in range(6):
                try:
                    rr = requests.get(LB, params=params, timeout=(10, 90))
                    text = rr.content.decode('utf-8-sig')
                    if rr.status_code == 200 and text.lstrip().startswith('"id"'):
                        d = pd.read_csv(io.StringIO(text))
                        if len(d):
                            out.append(pd.DataFrame({'batter': d['id'], 'stand': bat, 'p_throws': hand, 'n': d['contact'],
                                                     'sq': (d['squared_up_per_bat_contact'] * d['contact']).round(), 'bs_lb': d['avg_bat_speed'], 'sw_lb': d['swings_competitive']}))
                        break
                except requests.RequestException as e:
                    print(f'  squared-up {season} {bat}/{hand}: {e}, retry {attempt + 1}')
                time.sleep(6 * (attempt + 1))
            else:
                raise RuntimeError(f'could not fetch squared-up {season} {bat}/{hand}')
            time.sleep(0.4)
    return pd.concat(out, ignore_index=True) if out else None


def build_rows(season: int, parts: list, sq: pd.DataFrame | None, started: datetime):
    era = '2026' if season >= 2026 else '2023-2025'
    cells = sum_by(cat(parts, 'cells'), KEYS + ['r', 'c'])
    out = sum_by(cat(parts, 'out'), KEYS)
    zin = sum_by(cat(parts, 'zin'), KEYS)
    spray = sum_by(cat(parts, 'spray'), KEYS + ['typ', 'dir'])
    cp = sum_by(cat(parts, 'cp'), KEYS + ['bx', 'by'])
    pa_ev = sum_by(cat(parts, 'pa'), KEYS)
    pa_w = sum_by(cat(parts, 'paw'), KEYS)
    rows = []

    def add(b, side, hand, metric, n, vs, vq):
        if n and n > 0:
            rows.append({'batter_id': int(b), 'season': season, 'coord_era': era, 'bat_side': side, 'p_throws': hand, 'metric': metric,
                         'n': int(n), 'value_sum': round(float(vs), 4), 'value_sq_sum': round(float(vq), 4), 'updated_at': started.isoformat()})
    # process means; bat speed location-matched
    if cells is not None:
        share = cells.groupby(['r', 'c'])['n'].sum()
        share = share / share.sum()
        for (b, side, hand), g in cells.groupby(KEYS):
            n = int(g['n'].sum())
            for k, metric in (('tl', 'swing_tilt'), ('iy', 'contact_depth'), ('ix', 'contact_x'), ('dr', 'attack_direction')):
                add(b, side, hand, metric, n, g[k].sum(), g[k + '2'].sum())
            wts = np.array([share.get((int(r), int(c)), 0.0) for r, c in zip(g['r'], g['c'])])
            if wts.sum() > 0:
                m1 = (wts * (g['bs'].to_numpy() / g['n'].to_numpy())).sum() / wts.sum()
                m2 = (wts * (g['bs2'].to_numpy() / g['n'].to_numpy())).sum() / wts.sum()
                add(b, side, hand, 'bat_speed', n, n * m1, n * m2)
    if out is not None:
        for x in out.itertuples(index=False):
            add(x.batter, x.stand, x.p_throws, 'chase', x.out_n, x.out_sw, x.out_sw)
    if zin is not None:
        for x in zin.itertuples(index=False):
            add(x.batter, x.stand, x.p_throws, 'zone_contact', x.in_sw, x.in_ct, x.in_ct)
    if spray is not None:
        tot = spray.groupby(KEYS)['cnt'].sum()
        for x in spray.itertuples(index=False):
            add(x.batter, x.stand, x.p_throws, f'spray_{x.typ}_{x.dir}', tot[(x.batter, x.stand, x.p_throws)], x.cnt, x.cnt)
    if cp is not None:
        for x in cp.itertuples(index=False):
            add(x.batter, x.stand, x.p_throws, f'cp_{x.bx}_{x.by}', x.cnt, x.cnt, x.cnt)
    if pa_ev is not None:
        for x in pa_ev.itertuples(index=False):
            add(x.batter, x.stand, x.p_throws, 'k_pct', x.pa, x.k, x.k)
            add(x.batter, x.stand, x.p_throws, 'bb_pct', x.pa, x.bbw, x.bbw)
    if pa_w is not None:
        for x in pa_w.itertuples(index=False):
            add(x.batter, x.stand, x.p_throws, 'woba', x.dn, x.wv, x.wv2)
            add(x.batter, x.stand, x.p_throws, 'xwoba', x.dn, x.xv, x.xv2)
    if sq is not None:
        for x in sq.itertuples(index=False):
            add(x.batter, x.stand, x.p_throws, 'squared_up', x.n, x.sq, x.sq)
    # league rows
    df = pd.DataFrame(rows)
    lg = df.groupby(['bat_side', 'p_throws', 'metric'], as_index=False)[['n', 'value_sum', 'value_sq_sum']].sum()
    for x in lg.itertuples(index=False):
        rows.append({'batter_id': 0, 'season': season, 'coord_era': era, 'bat_side': x.bat_side, 'p_throws': x.p_throws, 'metric': x.metric,
                     'n': int(x.n), 'value_sum': round(float(x.value_sum), 4), 'value_sq_sum': round(float(x.value_sq_sum), 4), 'updated_at': started.isoformat()})
    return rows


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
    cache_dir = os.path.join(tempfile.gettempdir(), 'theedge-savant-cache', 'platoon-' + CACHE_VERSION)
    os.makedirs(cache_dir, exist_ok=True)

    def read_day(day: date):
        path = os.path.join(cache_dir, day.isoformat() + '.pkl')
        if not args.no_cache and os.path.exists(path):
            with open(path, 'rb') as fh:
                return day, pickle.load(fh)
        raw = fetch_day(day)
        out = None if raw is None or raw.empty else aggregate(raw)
        if day < today - timedelta(days=1):
            with open(path, 'wb') as fh:
                pickle.dump(out, fh)
        return day, out

    by_season: dict[int, list] = {}
    seen, total_days = 0, len(days)
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futs = [pool.submit(read_day, x) for x in days]
        for f in as_completed(futs):
            day, p = f.result()
            seen += 1
            for m in (20, 40, 60, 80, 100):
                if seen * 100 >= m * total_days and (seen - 1) * 100 < m * total_days:
                    print(f'MILESTONE reading {m}% ({seen}/{total_days} days)', flush=True)
            if p is not None:
                by_season.setdefault(day.year, []).append(p)
    if not by_season:
        print('No data read; nothing to write.')
        sys.exit(1)

    rows = []
    lb_check: dict[int, pd.DataFrame] = {}
    for season in sorted(by_season):
        sq = savant_squared_up(season)
        if sq is not None:
            lb_check[season] = sq
        r = build_rows(season, by_season[season], sq, started)
        print(f'  {season}: {len(r):,} rows')
        rows += r

    df = pd.DataFrame(rows)
    # ---- checks ----
    print('\nCHECKS')
    for season, g in df[df['batter_id'] > 0].groupby('season'):
        sp = g[g['metric'].str.startswith('spray_')]
        okk = (sp.groupby(['batter_id', 'bat_side', 'p_throws'])['value_sum'].sum().round() == sp.groupby(['batter_id', 'bat_side', 'p_throws'])['n'].first()).all()
        print(f'  {season}: spray groups add up to batted balls for every batter-side-hand: {bool(okk)}')
        cpg = g[g['metric'].str.startswith('cp_')].groupby(['batter_id', 'bat_side', 'p_throws'])['n'].sum()
        cd = g[g['metric'] == 'contact_depth'].set_index(['batter_id', 'bat_side', 'p_throws'])['n']
        j = pd.concat([cpg.rename('cp'), cd.rename('cd')], axis=1).dropna()
        print(f'  {season}: contact-point cells never exceed that side-hand\'s swings (and match them for {float((j["cp"] == j["cd"]).mean()) * 100:.1f}% of groups; the rest lack an intercept reading): {bool((j["cp"] <= j["cd"]).all())}')
    lg = df[(df['batter_id'] == 0)]
    print('\nVALIDATION against Savant\'s own leaderboard (competitive-swing bat speed, swing-weighted league mean, by pitcher hand):')
    for season, sq in sorted(lb_check.items()):
        for hand in ('L', 'R'):
            g = sq[sq['p_throws'] == hand]
            mine = df[(df['batter_id'] == 0) & (df['season'] == season) & (df['metric'] == 'bat_speed') & (df['p_throws'] == hand)]
            if len(g) and len(mine):
                print(f'  {season} vs {hand}HP: Savant {np.average(g["bs_lb"], weights=g["sw_lb"]):.2f} mph ({int(g["sw_lb"].sum()):,} swings) | ours (location-matched, full swings) {mine["value_sum"].sum() / mine["n"].sum():.2f} mph ({int(mine["n"].sum()):,})')
    print('\nSANITY (league rows, latest season):')
    last = lg['season'].max()
    for metric in ['bat_speed', 'swing_tilt', 'contact_depth', 'attack_direction', 'chase', 'zone_contact', 'squared_up', 'k_pct', 'bb_pct', 'woba', 'xwoba']:
        line = []
        for hand in ('L', 'R'):
            g = lg[(lg['season'] == last) & (lg['metric'] == metric) & (lg['p_throws'] == hand)]
            if len(g):
                n, vs = g['n'].sum(), g['value_sum'].sum()
                line.append(f'vs {hand}HP {vs / n:.3f} (n {int(n):,})')
        print(f'  {metric:17s}', ' | '.join(line))
    print(f'\n{len(df):,} rows ({int((df["batter_id"] > 0).sum()):,} batter rows + {int((df["batter_id"] == 0).sum())} league rows)')
    print('\n5-row sample (most plate appearances, latest season):')
    sm = df[(df['season'] == last) & (df['batter_id'] > 0) & (df['metric'] == 'woba')].sort_values('n', ascending=False).head(5)
    print(sm.drop(columns=['updated_at']).to_string(index=False))
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
    print(f'\nWriting {len(rows):,} rows to batter_platoon_process in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    conflict = 'batter_id,season,coord_era,bat_side,p_throws,metric'
    for i in range(0, len(rows), BATCH):
        sb.table('batter_platoon_process').upsert(rows[i:i + BATCH], on_conflict=conflict).execute()
        done = min(i + BATCH, len(rows))
        for m in (20, 40, 60, 80, 100):
            if done * 100 >= m * len(rows) and i * 100 < m * len(rows):
                print(f'MILESTONE writing {m}% ({done:,}/{len(rows):,} rows)', flush=True)
    seasons = sorted({r['season'] for r in rows})
    stale = sb.table('batter_platoon_process').select('batter_id', count='exact').in_('season', seasons).lt('updated_at', started.isoformat()).limit(1).execute().count or 0
    if stale > max(3, len(rows) // 2):
        print(f'REFUSING to delete {stale} stale rows (only {len(rows)} written): something is wrong.')
        sys.exit(1)
    sb.table('batter_platoon_process').delete().in_('season', seasons).lt('updated_at', started.isoformat()).execute()
    print(f'  removed {stale} stale rows', flush=True)
    sb.table('cron_run_log').insert({'job': 'build_batter_platoon', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
                                     'rows_written': len(rows), 'status': 'ok', 'note': f'seasons {seasons}'}).execute()
    print('Done.')


if __name__ == '__main__':
    main()
