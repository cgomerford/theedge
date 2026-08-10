# scripts/fetch_pitcher_tto_splits_v2.py
#
# Times-through-the-order splits, rebuilt from scratch (2026-08-09).
#
# WHY THIS EXISTS: the original fetch_pitcher_tto_splits.py (pybaseball/
# Statcast-based) was found on 2026-07-14 to undercount plate appearances
# by ~30%+ league-wide (confirmed against MLB's official battersFaced —
# e.g. Dustin May showed 259 TTO-tracked PA vs a real battersFaced of 389).
# It also wrote xwOBA into columns literally named tto1_era/tto2_era/tto3_era,
# which is its own separate landmine — narrative.ts reads a still-different
# column (tto1_xwoba) that nothing has ever written to.
#
# This version:
#   1. Sources from MLB Stats API play-by-play, not Statcast — same source
#      that caught the original bug, and the one the rest of this codebase
#      already leans on for reliability.
#   2. Computes REAL wOBA from official outcome types (singles, doubles,
#      walks, etc.) using fixed linear weights — no exit-velocity/launch-
#      angle model dependency, so no Statcast data quality risk at all.
#   3. Self-verifies: sums each pitcher's bucketed PA and compares against
#      their real season battersFaced (straight from MLB's own gamelog).
#      Only writes if they reconcile within tolerance. If they don't, it
#      skips and logs — same "never fabricate, empty beats wrong" rule as
#      the rest of this pipeline.
#   4. Writes to NEW, honestly-named columns (tto1_woba etc, confirmed to
#      already exist in pitcher_stats as of 2026-08-09) — does not touch
#      the old tto1_era/tto1_xwoba columns, so nothing downstream breaks
#      until we deliberately cut TypeScript over to the new fields.
#
# Python 3.9 compatible per project convention.

from __future__ import annotations

import os
import sys
import time
from datetime import datetime
from typing import Optional

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv('.env.local')

MLB_API = 'https://statsapi.mlb.com/api/v1'

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY — check .env.local')

supa: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# 2024 FanGraphs wOBA linear weights. Already on the OBP-like scale
# (~.310 league average) — no separate scaling factor needed. Year-to-year
# drift in these constants is rounding-error-level, not worth re-deriving
# every season.
W_BB = 0.690
W_HBP = 0.722
W_1B = 0.888
W_2B = 1.271
W_3B = 1.616
W_HR = 2.101

# Outcome events that count as an official at-bat for wOBA's denominator.
AB_OUT_EVENTS = {
    'strikeout', 'strikeout_double_play', 'field_out', 'force_out',
    'grounded_into_double_play', 'double_play', 'triple_play',
    'fielders_choice', 'fielders_choice_out', 'other_out',
}
HIT_EVENT_WEIGHT = {'single': W_1B, 'double': W_2B, 'triple': W_3B, 'home_run': W_HR}
HIT_EVENT_KEY = {'single': '1b', 'double': '2b', 'triple': '3b', 'home_run': 'hr'}

MIN_STARTS = 3            # same gate the old script used
MIN_BUCKET_PA = 10         # below this, a bucket's wOBA is too noisy to show
PA_RECONCILE_TOLERANCE = 0.04   # allow up to 4% drift vs real battersFaced


def fetch_pitcher_gamelog(player_id: int, season: int) -> list:
    url = f'{MLB_API}/people/{player_id}/stats?stats=gameLog&group=pitching&season={season}'
    r = requests.get(url, timeout=15)
    if not r.ok:
        return []
    data = r.json()
    stats = data.get('stats') or [{}]
    return stats[0].get('splits', [])


def fetch_play_by_play(game_pk: int) -> list:
    url = f'{MLB_API}/game/{game_pk}/playByPlay'
    r = requests.get(url, timeout=15)
    if not r.ok:
        return []
    return r.json().get('allPlays', [])


def process_pitcher(player_id: int, player_name: str, season: int) -> Optional[dict]:
    gamelog = fetch_pitcher_gamelog(player_id, season)
    if len(gamelog) == 0:
        return None

    # Real battersFaced, straight from MLB — the verification target.
    real_bf_total = sum(int((g.get('stat') or {}).get('battersFaced') or 0) for g in gamelog)
    if real_bf_total == 0:
        return None

    buckets = {
        1: {'pa': 0, 'ab': 0, 'bb': 0, 'hbp': 0, '1b': 0, '2b': 0, '3b': 0, 'hr': 0},
        2: {'pa': 0, 'ab': 0, 'bb': 0, 'hbp': 0, '1b': 0, '2b': 0, '3b': 0, 'hr': 0},
        3: {'pa': 0, 'ab': 0, 'bb': 0, 'hbp': 0, '1b': 0, '2b': 0, '3b': 0, 'hr': 0},
    }
    computed_pa_total = 0

    for g in gamelog:
        game_pk = (g.get('game') or {}).get('gamePk')
        if not game_pk:
            continue

        plays = fetch_play_by_play(game_pk)
        batter_seen: dict = {}

        for play in plays:
            matchup = play.get('matchup') or {}
            if (matchup.get('pitcher') or {}).get('id') != player_id:
                continue
            if not (play.get('about') or {}).get('isComplete'):
                continue

            batter_id = (matchup.get('batter') or {}).get('id')
            if batter_id is None:
                continue

            event = ((play.get('result') or {}).get('eventType') or '').lower()
            if not event:
                continue

            count = batter_seen.get(batter_id, 0) + 1
            batter_seen[batter_id] = count
            bucket = min(count, 3)

            b = buckets[bucket]
            b['pa'] += 1
            computed_pa_total += 1

            if event in AB_OUT_EVENTS:
                b['ab'] += 1
            elif event in HIT_EVENT_WEIGHT:
                b['ab'] += 1
                b[HIT_EVENT_KEY[event]] += 1
            elif event == 'walk':
                b['bb'] += 1
            elif event == 'hit_by_pitch':
                b['hbp'] += 1
            # intent_walk, sac_fly, sac_bunt, catcher_interf: counted in
            # pa above (real PAs) but correctly excluded from the wOBA
            # denominator below since they're not in AB_OUT_EVENTS /
            # HIT_EVENT_WEIGHT / walk / hbp.

        time.sleep(0.3)  # polite pause between per-game play-by-play calls

    # ── Reconciliation gate — the whole point of this rewrite ─────────────
    drift = abs(computed_pa_total - real_bf_total) / real_bf_total
    if drift > PA_RECONCILE_TOLERANCE:
        print(f'  ✗ {player_name}: computed {computed_pa_total} PA vs real battersFaced '
              f'{real_bf_total} ({drift:.1%} drift) — SKIPPED, does not reconcile')
        return None

    result: dict = {
        'updated_at': datetime.utcnow().isoformat(),
        'tto_verified_at': datetime.utcnow().isoformat(),
    }
    any_bucket_written = False
    for i in (1, 2, 3):
        b = buckets[i]
        if b['pa'] < MIN_BUCKET_PA:
            continue
        denom = b['ab'] + b['bb'] + b['hbp']
        if denom == 0:
            continue
        woba = (W_BB * b['bb'] + W_HBP * b['hbp'] + W_1B * b['1b']
                + W_2B * b['2b'] + W_3B * b['3b'] + W_HR * b['hr']) / denom
        result[f'tto{i}_pa'] = b['pa']
        result[f'tto{i}_woba'] = round(woba, 3)
        any_bucket_written = True

    if not any_bucket_written:
        print(f'  · {player_name}: reconciled ({computed_pa_total}/{real_bf_total} PA) '
              f'but no bucket had {MIN_BUCKET_PA}+ PA')
        return None

    print(f'  ✓ {player_name}: reconciled {computed_pa_total}/{real_bf_total} PA ({drift:.1%} drift)')
    return result


def main():
    season = datetime.now().year
    result = supa.table('pitcher_stats').select('player_id, player_name, starts').execute()
    pitchers = [p for p in (result.data or []) if (p.get('starts') or 0) >= MIN_STARTS]

    # Test mode: python3 fetch_pitcher_tto_splits_v2.py 543037 605400
    test_ids = {int(a) for a in sys.argv[1:]} if len(sys.argv) > 1 else None
    if test_ids:
        pitchers = [p for p in pitchers if p['player_id'] in test_ids]
        print(f'TEST MODE: running against {len(pitchers)} pitcher(s) only\n')

    print(f'Processing {len(pitchers)} pitchers with {MIN_STARTS}+ starts\n')

    success, skipped, failed = 0, 0, 0
    for i, p in enumerate(pitchers):
        player_id = p['player_id']
        name = p.get('player_name', str(player_id))
        print(f'[{i + 1}/{len(pitchers)}] {name}')
        try:
            update = process_pitcher(player_id, name, season)
            if update:
                supa.table('pitcher_stats').update(update).eq('player_id', player_id).execute()
                success += 1
            else:
                skipped += 1
        except Exception as e:
            print(f'  ✗ {name}: ERROR {e}')
            failed += 1
        time.sleep(1)

    print(f'\n─── Complete ───\n  Success: {success}\n  Skipped: {skipped}\n  Failed:  {failed}')


if __name__ == '__main__':
    main()