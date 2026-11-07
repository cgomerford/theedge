#!/usr/bin/env python3
"""
build_league_player_stats.py

Fills league_player_stats: every batter and pitcher's Baseball Savant season line (the same custom leaderboards the admin chart builder reads), plus team and
position from the MLB Stats API, one JSON row per player per season per role. The My x9Lab dashboard reads it, so nothing fetches Savant while a page renders.

TABLE OWNERSHIP (single writer): this script is the only writer of league_player_stats.
Runs from GitHub Actions (league-player-stats.yml). Depends on nothing else.

Usage:
  python3 scripts/build_league_player_stats.py [--season 2026] [--wait 5] [--dry-run]
  python3 scripts/build_league_player_stats.py --json .dev-cache/league_player_stats.json   # local dev: write a file instead of the table
"""
from __future__ import annotations

import argparse
import io
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

import pandas as pd
import requests

try:  # local runs read .env.local; GitHub Actions passes secrets as environment variables
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / '.env.local')
    load_dotenv()
except ImportError:
    pass

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
ROOT = Path(__file__).resolve().parent.parent
# the column lists live in the TypeScript chart builder so the two never drift; read them from there
SCATTER = (ROOT / 'src' / 'lib' / 'scatter-data.ts').read_text()
BAT_SEL = re.search(r"const BAT_SEL = '([^']+)'", SCATTER).group(1)
PIT_SEL = re.search(r"const PIT_SEL = '([^']+)'", SCATTER).group(1)
SAVANT = 'https://baseballsavant.mlb.com/leaderboard'
SKIP = {'last_name, first_name', 'player_id', 'year'}
BATCH = 100


def savant(kind: str, sel: str, season: int) -> pd.DataFrame:
    url = f'{SAVANT}/custom?year={season}&type={kind}&filter=&min=1&selections={sel}&chart=false&x=xba&y=xba&r=no&chartType=beeswarm&csv=true'
    r = requests.get(url, headers={'User-Agent': UA}, timeout=(10, 90))
    r.raise_for_status()
    return pd.read_csv(io.StringIO(r.content.decode('utf-8-sig')))  # strip the BOM Savant sometimes sends


def roster(season: int) -> dict[int, dict]:
    teams = requests.get('https://statsapi.mlb.com/api/v1/teams?sportId=1', timeout=60).json()['teams']
    abbr = {t['id']: t['abbreviation'] for t in teams}
    people = requests.get(f'https://statsapi.mlb.com/api/v1/sports/1/players?season={season}', timeout=60).json()['people']
    return {p['id']: {'team': abbr.get((p.get('currentTeam') or {}).get('id')), 'pos': (p.get('primaryPosition') or {}).get('abbreviation')} for p in people}


def clean(name: str) -> str:
    """'Crow-Armstrong, Pete' -> 'Pete Crow-Armstrong'."""
    parts = [x.strip() for x in str(name).split(',')]
    return f'{parts[1]} {parts[0]}' if len(parts) == 2 else str(name)


def rows_for(df: pd.DataFrame, role: str, season: int, ros: dict[int, dict]) -> list[dict]:
    out = []
    cols = [c for c in df.columns if c not in SKIP]
    for rec in df.to_dict('records'):
        pid = int(rec['player_id'])
        stats = {}
        for c in cols:
            v = rec.get(c)
            if v is None or (isinstance(v, float) and pd.isna(v)):
                continue
            if isinstance(v, (int, float)):
                stats[c] = float(v)
        if 'p_formatted_ip' in stats:   # Savant writes 19.1 for 19 and 1/3 innings; store real innings so rates and sorting are right
            whole = int(stats['p_formatted_ip']); thirds = round((stats['p_formatted_ip'] - whole) * 10)
            stats['p_ip'] = round(whole + thirds / 3, 2)
        if role == 'pitcher':   # Savant leaves its own K%, BB% and hits-allowed columns empty for pitchers, so build the rates from counts
            pa, so, bb, ip = stats.get('pa'), stats.get('p_strikeout'), stats.get('p_walk'), stats.get('p_ip')
            if pa and so is not None and bb is not None:
                stats['k_pct'] = round(so / pa * 100, 1); stats['bb_pct'] = round(bb / pa * 100, 1); stats['k_bb_pct'] = round((so - bb) / pa * 100, 1)
            if ip and so is not None and bb is not None:
                stats['k9'] = round(so * 9 / ip, 2); stats['bb9'] = round(bb * 9 / ip, 2)
        r = ros.get(pid, {})
        out.append({'season': season, 'player_id': pid, 'role': role, 'name': clean(rec['last_name, first_name']),
                    'team_abbr': r.get('team'), 'position': r.get('pos'), 'stats': stats})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--season', type=int, default=date.today().year)
    ap.add_argument('--wait', type=int, default=5, help='seconds to read the sample before writing')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--json', help='write the rows to this file instead of Supabase (local development; the dev server reads it when the table is missing)')
    a = ap.parse_args()

    ros = roster(a.season)
    bat = rows_for(savant('batter', BAT_SEL, a.season), 'batter', a.season, ros)
    pit = rows_for(savant('pitcher', PIT_SEL, a.season), 'pitcher', a.season, ros)
    rows = bat + pit
    print(f'season {a.season}: {len(bat)} batters, {len(pit)} pitchers, roster {len(ros)}')
    if not rows:
        print('nothing fetched; leaving the table alone')
        return 1
    print('sample:')
    for r in rows[:2] + rows[len(bat):len(bat) + 3]:
        keys = list(r['stats'].items())[:4]
        print(' ', r['role'], r['player_id'], r['name'], r['team_abbr'], r['position'], keys)
    if a.dry_run:
        return 0
    if a.json:
        import json
        out = Path(a.json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({'season': a.season, 'updated': date.today().isoformat(), 'rows': rows}))
        print(f'wrote {len(rows)} rows to {out}')
        return 0
    print(f'writing in {a.wait}s (Ctrl-C to abort)')
    time.sleep(a.wait)

    url = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print('missing Supabase URL or service key')
        return 1
    from supabase import create_client
    db = create_client(url, key)
    done = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i + BATCH]
        db.table('league_player_stats').upsert(chunk, on_conflict='season,role,player_id').execute()
        done += len(chunk)
        if done % 500 < BATCH:
            print(f'  {done}/{len(rows)}')
    n = db.table('league_player_stats').select('player_id', count='exact').eq('season', a.season).execute().count
    print(f'done: wrote {done}; table now holds {n} rows for {a.season}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
