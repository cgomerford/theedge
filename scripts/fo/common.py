"""
scripts/fo/common.py

Shared plumbing for the Pitching Desk sync scripts (sync_pitch_*.py). No table is written here.

  * env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local) or
         SUPABASE_URL + SUPABASE_SERVICE_KEY (GitHub Actions), whichever is set.
  * MLB Stats API: sequential, throttled, retried (the API resets concurrent bursts).
  * the pitch Parquet and models/src/features.py (the ONLY place pitch-shape maths lives).
  * every upsert goes through confirm_abort(): sample rows printed, then a 5-second window to Ctrl-C.
"""
from __future__ import annotations

import math
import os
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

REPO = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO / 'models' / 'src'))   # so `import features` is the single shared module
load_dotenv(REPO / '.env.local')

MLB = 'https://statsapi.mlb.com/api/v1'
SAVANT_LB = 'https://baseballsavant.mlb.com/leaderboard'
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

_last_call = 0.0


def get_supabase():
    from supabase import create_client
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SystemExit('[get_supabase] Supabase URL / service key not set (see scripts/fo/common.py header)')
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def mlb_get(path: str, params: dict | None = None, tries: int = 4) -> dict | None:
    """GET {MLB}{path}; returns parsed JSON or None. Sequential with a small gap between calls."""
    global _last_call
    for attempt in range(tries):
        wait = 0.12 - (time.time() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.time()
        try:
            r = requests.get(f'{MLB}{path}', params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            print(f'[mlb_get] {r.status_code} {path}')
        except requests.RequestException as e:
            print(f'[mlb_get] {type(e).__name__} {path}')
        time.sleep(1.5 * (attempt + 1))
    return None


def savant_csv(url: str, params: dict) -> list[dict] | None:
    """A Savant leaderboard CSV as a list of dicts, or None (HTML back = wrong URL / blocked)."""
    import csv, io
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=90, headers={'User-Agent': 'Mozilla/5.0'})
            text = r.content.decode('utf-8-sig')
            if r.status_code == 200 and 'csv' in r.headers.get('content-type', '') and not text.lstrip().startswith('<'):
                return list(csv.DictReader(io.StringIO(text)))
            print(f'[savant_csv] {r.status_code} {r.headers.get("content-type")} {url}')
        except requests.RequestException as e:
            print(f'[savant_csv] {type(e).__name__} {url}')
        time.sleep(2 * (attempt + 1))
    return None


def num(v: Any) -> float | None:
    try:
        if v in (None, '', '-.--', '.---'):
            return None
        x = float(v)
        return None if math.isnan(x) or math.isinf(x) else x
    except (TypeError, ValueError):
        return None


def ip_to_dec(ip: Any) -> float:
    """MLB writes 12.2 for 12 and 2/3 innings."""
    try:
        whole, _, frac = str(ip).partition('.')
        return int(whole) + (int(frac or 0) / 3.0)
    except ValueError:
        return 0.0


def clean(v: Any) -> Any:
    """numpy / pandas scalars and NaN -> plain JSON values (NaN becomes None)."""
    try:
        import numpy as np
        if isinstance(v, np.generic):
            v = v.item()
    except ImportError:
        pass
    if isinstance(v, float):
        return None if (math.isnan(v) or math.isinf(v)) else round(v, 4)
    if isinstance(v, dict):
        return {str(k): clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [clean(x) for x in v]
    if isinstance(v, date):
        return v.isoformat()
    return v


def clean_rows(rows: list[dict]) -> list[dict]:
    return [{k: clean(v) for k, v in r.items()} for r in rows]


def load_pitches(season: int):
    """The season Parquet from models/src/fetch_pitches.py, or exit with the command to build it."""
    import pandas as pd
    p = REPO / 'models' / 'data' / f'pitches_{season}.parquet'
    if not p.exists():
        raise SystemExit(f'[load_pitches] {p} missing. Run: models/venv/bin/python models/src/fetch_pitches.py --season {season}')
    return pd.read_parquet(p)


def confirm_abort(table: str, rows: list[dict], dry_run: bool, seconds: int = 5) -> bool:
    """Print a 5-row sample, then (unless --dry-run) a short window to Ctrl-C. True = go ahead and write."""
    print(f'\n--- {table}: {len(rows)} rows. First 5: ---')
    for r in rows[:5]:
        print({k: (v if not isinstance(v, (dict, list)) else f'<{type(v).__name__} len={len(v)}>') for k, v in r.items()})
    if dry_run:
        print(f'[dry-run] {table}: not written')
        return False
    if not rows:
        print(f'[{table}] nothing to write')
        return False
    print(f'Writing {len(rows)} rows to {table} in {seconds}s. Ctrl-C to abort.')
    time.sleep(seconds)
    return True


def upsert(table: str, rows: list[dict], on_conflict: str, chunk: int = 500) -> bool:
    """Chunked upsert. Returns False (and logs) on the first Supabase error; earlier chunks stay written."""
    sb = get_supabase()
    rows = clean_rows(rows)
    for i in range(0, len(rows), chunk):
        try:
            sb.table(table).upsert(rows[i:i + chunk], on_conflict=on_conflict).execute()
        except Exception as e:  # supabase raises APIError with the PostgREST message
            print(f'[upsert] {table} Supabase error: {e}')
            return False
    print(f'[upsert] {table}: {len(rows)} rows written')
    return True
