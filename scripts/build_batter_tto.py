"""
scripts/build_batter_tto.py

Builds `batter_tto`: Three True Outcomes (strikeout, walk, home run) per batter x season, with the in-play split and the
rolling 100-plate-appearance TTO% sampled every 25 PA. Behind the Batting Lab Outcomes tab and the Three True Outcomes page.

TABLE OWNERSHIP: this script (via .github/workflows/batter-tto.yml) is the ONLY writer of batter_tto.

DRY RUN BY DEFAULT: nothing is written unless --write is passed. A dry run reads Savant, checks that every outcome group adds
up to pa, prints sanity numbers and a 5-row sample, and stops. --write then waits --wait seconds (Ctrl-C to abort) first.

SOURCE (verified against a live 2026 pull of five game days): the Savant pitch CSV carries one `events` row per plate appearance
(no (game, at_bat_number) has two), ordered within a game by at_bat_number. Events seen: field_out, strikeout, single, walk,
double, home_run, grounded_into_double_play, force_out, hit_by_pitch, field_error, sac_fly, triple, sac_bunt, truncated_pa,
double_play, fielders_choice, intent_walk, fielders_choice_out, catcher_interf, strikeout_double_play.
  k = strikeout, strikeout_double_play     bb = walk, intent_walk     hr = home_run     hbp = hit_by_pitch
  gb/ld/fb/pu = in-play PAs by bb_type of the PA-ending pitch (type X); rolling_k_n / rolling_bb_n / rolling_hr_n = the same rolling window per outcome
  hit_in_play = single, double, triple     other_in_play = every other event except truncated_pa (a game cut short; not a plate
  appearance)      pa = the sum of all of them      TTO% = (k + bb + hr) / pa
Rolling: plate appearances in order (game_date, game_pk, at_bat_number); rolling_tto_n = [TTO count in the last 100 PA at PA 100,
125, 150, ...]; rolling_tto_sd = standard deviation of those samples / 100 (null with fewer than 3 samples = under 150 PA).
batter_id 0 is the league row (sums; no rolling series). A batter's team is his latest batting team of that season.

USAGE
  python3 scripts/build_batter_tto.py --start 2026-09-01 --end 2026-09-21 --first-season 2026   # dry run, a short window
  python3 scripts/build_batter_tto.py --first-season 2026                                       # dry run, the season
  python3 scripts/build_batter_tto.py --write                                                   # 2024..current, writes
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
CACHE_VERSION = 'v3'
CONCURRENCY = 4
BATCH = 100
MIN_PA = 25                    # a hitter-season with fewer plate appearances is not stored
ROLL = 100                     # rolling window, plate appearances
STEP = 25                      # sample every STEP plate appearances
MIN_SAMPLES = 3                # an SD needs at least this many rolling samples
CAT = {'strikeout': 1, 'strikeout_double_play': 1, 'walk': 2, 'intent_walk': 2, 'home_run': 3, 'hit_by_pitch': 4,
       'single': 5, 'double': 5, 'triple': 5}          # everything else (except truncated_pa) is category 0, other in play
NAMES = {1: 'k', 2: 'bb', 3: 'hr', 4: 'hbp', 5: 'hit_in_play', 0: 'other_in_play'}
USECOLS = ['batter', 'game_date', 'game_pk', 'at_bat_number', 'events', 'home_team', 'away_team', 'inning_topbot', 'type', 'bb_type']
BBT = {'ground_ball': 'gb', 'line_drive': 'ld', 'fly_ball': 'fb', 'popup': 'pu'}
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
    raise RuntimeError(f'could not fetch {d} after 6 tries')  # a silent gap would drop plate appearances


def aggregate(df: pd.DataFrame):
    """One game day -> one row per plate appearance (batter, date, game, at-bat, category) and each batter's team."""
    pa = df[df['events'].notna() & (df['events'] != 'truncated_pa')].copy()
    if pa.empty:
        return None
    pa['team'] = np.where(pa['inning_topbot'] == 'Top', pa['away_team'], pa['home_team'])
    pa['cat'] = pa['events'].map(CAT).fillna(0).astype(int)
    # batted-ball type of an in-play PA that is NOT a home run (home runs are already in the TTO slice of "where the rest lies")
    pa['bbt'] = np.where((pa['type'] == 'X') & (pa['events'] != 'home_run'), pa['bb_type'].map(BBT).fillna(''), '')
    return pa[['batter', 'game_date', 'game_pk', 'at_bat_number', 'cat', 'team', 'bbt']]


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


def rolling(flags: np.ndarray) -> list[int]:
    """TTO count inside the last ROLL plate appearances at PA ROLL, ROLL+STEP, ... (empty under ROLL PA)."""
    cum = np.concatenate([[0], np.cumsum(flags)])
    return [int(cum[i] - cum[i - ROLL]) for i in range(ROLL, len(flags) + 1, STEP)]


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
    cache_dir = os.path.join(tempfile.gettempdir(), 'theedge-savant-cache', 'tto-' + CACHE_VERSION)
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

    parts, seen, total_days = [], 0, len(days)
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futs = [pool.submit(read_day, x) for x in days]
        for f in as_completed(futs):
            p = f.result()
            seen += 1
            for m in (20, 40, 60, 80, 100):
                if seen * 100 >= m * total_days and (seen - 1) * 100 < m * total_days:
                    print(f'MILESTONE reading {m}% ({seen}/{total_days} days)', flush=True)
            if p is not None:
                parts.append(p)
    if not parts:
        print('No data read; nothing to write.')
        sys.exit(1)
    pas = pd.concat(parts, ignore_index=True)
    pas['season'] = pd.to_datetime(pas['game_date']).dt.year
    pas = pas.sort_values(['batter', 'season', 'game_date', 'game_pk', 'at_bat_number']).reset_index(drop=True)

    rows, league = [], {}
    teams = pas.groupby(['batter', 'season'])['team'].last()
    for (bid, season), g in pas.groupby(['batter', 'season'], sort=False):
        n = len(g)
        if n < MIN_PA:
            continue
        cat = g['cat'].to_numpy()
        row = {'batter_id': int(bid), 'season': int(season), 'team': teams.get((bid, season)), 'pa': int(n),
               **{NAMES[c]: int((cat == c).sum()) for c in NAMES}}
        bbt = g['bbt'].to_numpy()
        row.update({t: int((bbt == t).sum()) for t in BBT.values()})
        roll = rolling(np.isin(cat, (1, 2, 3)).astype(int))
        row['rolling_tto_n'] = roll
        row['rolling_k_n'], row['rolling_bb_n'], row['rolling_hr_n'] = (rolling((cat == c).astype(int)) for c in (1, 2, 3))
        row['rolling_tto_sd'] = round(float(np.std(np.array(roll) / ROLL, ddof=1)), 4) if len(roll) >= MIN_SAMPLES else None
        rows.append(row)
        L = league.setdefault(int(season), {'batter_id': 0, 'season': int(season), 'name': 'League', 'team': None, 'pa': 0, 'k': 0, 'bb': 0, 'hr': 0, 'hbp': 0,
                                            'hit_in_play': 0, 'other_in_play': 0, 'rolling_tto_n': None, 'rolling_tto_sd': None})
        for c in ('pa', 'k', 'bb', 'hr', 'hbp', 'hit_in_play', 'other_in_play', 'gb', 'ld', 'fb', 'pu'):
            L[c] = L.get(c, 0) + row[c]
    # the league row counts EVERY plate appearance, including those of hitters under MIN_PA
    for season, g in pas.groupby('season'):
        L = league.setdefault(int(season), {'batter_id': 0, 'season': int(season), 'name': 'League', 'team': None, 'rolling_tto_n': None, 'rolling_tto_sd': None})
        L['pa'] = int(len(g))
        for c in NAMES:
            L[NAMES[c]] = int((g['cat'] == c).sum())
        for t in BBT.values():
            L[t] = int((g['bbt'] == t).sum())

    bad = [r for r in rows + list(league.values()) if r['pa'] != r['k'] + r['bb'] + r['hr'] + r['hbp'] + r['hit_in_play'] + r['other_in_play']
           or r['gb'] + r['ld'] + r['fb'] + r['pu'] > r['hit_in_play'] + r['other_in_play']]
    if bad:
        print(f'ABORT: {len(bad)} rows whose outcome groups do not add up to pa (or whose in-play types exceed in-play PAs)'); print(bad[:3]); sys.exit(1)
    print(f'\nCHECK: every outcome group adds up to pa in all {len(rows) + len(league):,} rows')
    names = resolve_names(sorted({r['batter_id'] for r in rows}))
    for r in rows:
        r['name'] = names.get(r['batter_id'])
        r['updated_at'] = started.isoformat()
    for r in league.values():
        r['updated_at'] = started.isoformat()
    miss = sum(r['name'] is None for r in rows)
    if miss:
        print(f'WARNING: {miss} rows have no name from the MLB API (stored null)')
    allrows = rows + list(league.values())

    print(f'\n{len(pas):,} plate appearances -> {len(rows):,} hitter-season rows + {len(league)} league rows')
    print('\nSANITY (league):')
    for s, L in sorted(league.items()):
        p = L['pa']
        ip = L['gb'] + L['ld'] + L['fb'] + L['pu']
        print(f'  {s}: in-play types {ip:,} of {L["hit_in_play"] + L["other_in_play"]:,} in-play PAs | gb {L["gb"] / ip:.1%} ld {L["ld"] / ip:.1%} fb {L["fb"] / ip:.1%} pu {L["pu"] / ip:.1%}')
        print(f'  {s}: pa {p:,} | TTO {(L["k"] + L["bb"] + L["hr"]) / p:.1%} = K {L["k"] / p:.1%} + BB {L["bb"] / p:.1%} + HR {L["hr"] / p:.1%} | HBP {L["hbp"] / p:.1%} | hits in play {L["hit_in_play"] / p:.1%} | other in play {L["other_in_play"] / p:.1%}')
    sd = [r['rolling_tto_sd'] for r in rows if r['rolling_tto_sd'] is not None]
    if sd:
        print(f'  rolling_tto_sd across {len(sd):,} hitters (150+ PA): median {np.median(sd):.3f}, 10th pct {np.percentile(sd, 10):.3f}, 90th pct {np.percentile(sd, 90):.3f}')
    print('\n5-row sample (most plate appearances):')
    show = sorted(rows, key=lambda r: -r['pa'])[:5]
    print(pd.DataFrame([{**{k: v for k, v in r.items() if k not in ('updated_at', 'rolling_tto_n')}, 'samples': len(r['rolling_tto_n'])} for r in show]).to_string(index=False))
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
    print(f'\nWriting {len(allrows):,} rows to batter_tto in {args.wait}s. Ctrl-C to abort.')
    time.sleep(args.wait)
    for i in range(0, len(allrows), BATCH):
        sb.table('batter_tto').upsert(allrows[i:i + BATCH], on_conflict='batter_id,season').execute()
        done = min(i + BATCH, len(allrows))
        print(f'  wrote {done:,}/{len(allrows):,} ({done * 100 // len(allrows)}%)', flush=True)
        for m in (20, 40, 60, 80, 100):
            if done * 100 >= m * len(allrows) and i * 100 < m * len(allrows):
                print(f'MILESTONE writing {m}% ({done:,}/{len(allrows):,} rows)', flush=True)
    seasons = sorted({r['season'] for r in allrows})
    stale = sb.table('batter_tto').select('batter_id', count='exact').in_('season', seasons).lt('updated_at', started.isoformat()).limit(1).execute().count or 0
    if stale > max(3, len(allrows) // 2):
        print(f'REFUSING to delete {stale} stale rows (only {len(allrows)} written): something is wrong.')
        sys.exit(1)
    sb.table('batter_tto').delete().in_('season', seasons).lt('updated_at', started.isoformat()).execute()
    print(f'  removed {stale} stale rows', flush=True)
    sb.table('cron_run_log').insert({'job': 'build_batter_tto', 'started_at': started.isoformat(), 'finished_at': datetime.now(timezone.utc).isoformat(),
                                     'rows_written': len(allrows), 'status': 'ok', 'note': f'seasons {seasons}'}).execute()
    print('Done.')


if __name__ == '__main__':
    main()
