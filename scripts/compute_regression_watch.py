#!/usr/bin/env python3
"""
scripts/compute_regression_watch.py

Surfaces players whose surface-level stat (AVG for batters, ERA for pitchers)
diverges meaningfully from their underlying/expected metric (xwOBA-derived
proxy for batters, FIP for pitchers).

Two independent passes:
  PITCHERS — reuses the exact era/fip gap signal already proven in
             compute_fantasy_picks.py's compute_fallers(). No new logic,
             just a different surface (its own panel instead of folded
             into Fantasy Fallers).
  BATTERS  — joins `ultimate_team_players` (surface: season AVG/OPS) against
             an aggregated player-level xwOBA pulled from `batter_hot_zones`
             (split='all'), averaged across the 9 zones weighted by sample
             size (ab) per zone. This is a real signal, not illustrative —
             it's the same xwOBA Statcast already writes per zone.

Writes to `regression_watch` table (game_date, direction, rows ordered by
gap magnitude). Table is small and cheap — full replace each run via
delete-then-insert is fine here because there's no foreign key relying on
row identity day-to-day (unlike edge_predictions / grading).

Run daily, after fetch_ultimate_team_pool.py and after batter_hot_zones is
fresh (weekly job) — order doesn't need to be same-day-strict since hot
zones only update weekly anyway.

Compatible with Python 3.9.
"""

import os
import sys
import datetime
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing env vars. Need either:')
    print('  - SUPABASE_URL + SUPABASE_SERVICE_KEY (CI), OR')
    print('  - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local)')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

LEAGUE_AVG_XWOBA = 0.315   # same constant used in edge.ts Offense component — keep in sync
MIN_AB_PER_ZONE = 5        # ignore zones with too few at-bats to be meaningful
MIN_TOTAL_AB = 40          # ignore batters with too small a season sample overall
TOP_N_PER_DIRECTION = 8    # how many "due to rise" / "due to drop" rows to keep


# ── Pitchers: era/fip gap (mirrors compute_fantasy_picks.py logic exactly) ──

def compute_pitcher_regression():
    """
    Same signal as compute_fallers(): era >= fip + gap means the pitcher's
    real performance (FIP) is better than the ERA shows — expect ERA to
    drop (i.e. they're 'due to rise' in value). The inverse also applies:
    era well below fip means a correction upward is likely.

    NOTE: pitcher_stats has no `team_short` or `innings_pitched` column —
    confirmed against the actual upsert payload in fetch_pitcher_stats.py,
    which only writes player_id, player_name, season, fip, era, k_per_9,
    bb_per_9. We cross-reference team_short from ultimate_team_players
    (which DOES have it) by player_id, and use k_per_9 presence as a crude
    "has pitched enough to matter" filter instead of an innings floor.
    """
    resp = supa.table('pitcher_stats') \
        .select('player_id, player_name, season, era, fip, k_per_9') \
        .not_.is_('era', 'null') \
        .not_.is_('fip', 'null') \
        .order('season', desc=True) \
        .execute()

    raw_rows = resp.data or []
    if not raw_rows:
        return []

    # Defensive de-dup: if pitcher_stats holds multiple seasons per player
    # (on_conflict='player_id,season' in fetch_pitcher_stats.py implies it
    # can), keep only the most-recent-season row per player_id. Sorted desc
    # by season above, so first occurrence wins.
    rows = []
    seen_player_ids = set()
    for r in raw_rows:
        if r['player_id'] in seen_player_ids:
            continue
        seen_player_ids.add(r['player_id'])
        rows.append(r)

    # Cross-reference team_short + games_played (sample-size proxy) from the pool table
    player_ids = [r['player_id'] for r in rows]
    pool_resp = supa.table('ultimate_team_players') \
        .select('player_id, team_short, games_played') \
        .in_('player_id', player_ids) \
        .execute()
    pool_lookup = {p['player_id']: p for p in (pool_resp.data or [])}

    candidates = []
    for r in rows:
        era = r.get('era')
        fip = r.get('fip')
        if era is None or fip is None:
            continue

        pool_info = pool_lookup.get(r['player_id'])
        # games_played is a rough proxy here since innings_pitched isn't stored —
        # a starter with fewer than 4 games is too small a sample to trust ERA/FIP gap.
        if not pool_info or (pool_info.get('games_played') or 0) < 4:
            continue

        gap = float(era) - float(fip)
        if abs(gap) < 0.5:
            continue   # not meaningful enough to flag

        direction = 'rise' if gap > 0 else 'drop'  # ERA > FIP → expect ERA to fall → value rises
       candidates.append({
            'player_id':     r['player_id'],
            'player_name':   r['player_name'],
            'team_short':    pool_info.get('team_short'),
            'position':      'P',
            'surface_label': f"{float(era):.2f} ERA",
            'true_label':    f"{float(fip):.2f} FIP",
            'gap':           round(gap, 2),
            'direction':     direction,
            'detail':        build_pitcher_detail(gap, float(era), float(fip)),
        })

    candidates.sort(key=lambda c: -abs(c['gap']))
    return candidates


def build_pitcher_detail(gap: float, era: float, fip: float) -> str:
    if gap > 0:
        return f"FIP says this ERA won't last — strand rate or BABIP normalising should pull it down toward {fip:.2f}."
    return f"FIP running well above ERA — defense and luck are propping up the ERA. Expect regression toward {fip:.2f}."


# ── Batters: AVG/OPS surface vs aggregated zone xwOBA ────────────────────────

def aggregate_player_xwoba(zones: dict) -> float:
    """
    zones is the JSONB `zones` column from batter_hot_zones — keys '1'-'9',
    each a dict with at least 'xwoba' and 'ab'. Weighted average by AB,
    skipping zones with too few at-bats to trust.
    """
    total_weight = 0.0
    weighted_sum = 0.0
    for cell in zones.values():
        if not isinstance(cell, dict):
            continue
        ab = cell.get('ab') or 0
        xwoba = cell.get('xwoba')
        if xwoba is None or ab < MIN_AB_PER_ZONE:
            continue
        weighted_sum += float(xwoba) * ab
        total_weight += ab

    if total_weight == 0:
        return None
    return weighted_sum / total_weight


def compute_batter_regression():
    # Pull top-200 pool hitters (surface stats already there)
    pool_resp = supa.table('ultimate_team_players') \
        .select('player_id, full_name, team_short, primary_position, avg, ops, games_played') \
        .eq('player_type', 'hitter') \
        .execute()
    pool = {p['player_id']: p for p in (pool_resp.data or [])}

    if not pool:
        print('  No hitters in ultimate_team_players — run fetch_ultimate_team_pool.py first.')
        return []

    # Pull season-aggregate hot zones (split='all') for those same players
    player_ids = list(pool.keys())
    zones_resp = supa.table('batter_hot_zones') \
        .select('player_id, zones, total_pa') \
        .eq('split', 'all') \
        .in_('player_id', player_ids) \
        .execute()

    candidates = []
    for row in (zones_resp.data or []):
        pid = row['player_id']
        player = pool.get(pid)
        if not player:
            continue

        total_pa = row.get('total_pa') or 0
        if total_pa < MIN_TOTAL_AB:
            continue

        true_xwoba = aggregate_player_xwoba(row.get('zones') or {})
        if true_xwoba is None:
            continue

        avg = player.get('avg')
        ops = player.get('ops')
        if avg is None or ops is None:
            continue

        # Surface proxy: scale OPS down to wOBA-like range for a fair gap comparison.
        # League avg OPS ~0.720 maps to league avg xwOBA ~0.315 — linear scale.
        surface_proxy = 0.315 + (float(ops) - 0.720) * 0.42

        gap = surface_proxy - true_xwoba
        if abs(gap) < 0.025:
            continue   # not a meaningful divergence

        # Surface looks BETTER than true talent (gap > 0) → expect to drop.
        # Surface looks WORSE than true talent (gap < 0) → expect to rise.
        direction = 'drop' if gap > 0 else 'rise'

        candidates.append({
            'player_id':     pid,
            'player_name':   player['full_name'],
            'team_short':    player.get('team_short'),
            'position':      player.get('primary_position'),
            'surface_label': f".{int(round(float(avg) * 1000)):03d} AVG",
            'true_label':    f"{true_xwoba:.3f} xwOBA",
            'gap':           round(gap, 3),
            'direction':     direction,
            'detail':        build_batter_detail(direction, true_xwoba),
        })

    candidates.sort(key=lambda c: -abs(c['gap']))
    return candidates


def build_batter_detail(direction: str, true_xwoba: float) -> str:
    if direction == 'drop':
        return f"Zone-weighted xwOBA of {true_xwoba:.3f} is below league average — hard contact isn't showing up in the box score yet. Surface numbers look due for a pullback."
    return f"Zone-weighted xwOBA of {true_xwoba:.3f} outpaces the surface line — quality of contact says better results are coming."


# ── Save ──────────────────────────────────────────────────────────────────

def save_regression_watch(today: str, pitcher_rows: list, batter_rows: list):
    # Take top N per direction, per player type, to keep the panel scannable
    def top_n(rows, direction, n):
        filtered = [r for r in rows if r['direction'] == direction]
        return filtered[:n]

    all_rows = []
    for player_type, rows in (('pitcher', pitcher_rows), ('batter', batter_rows)):
        for direction in ('rise', 'drop'):
            picks = top_n(rows, direction, TOP_N_PER_DIRECTION)
            for rank, p in enumerate(picks, start=1):
                all_rows.append({
                    'game_date':     today,
                    'player_type':   player_type,
                    'direction':     direction,
                    'rank':          rank,
                    'player_id':     p.get('player_id'),
                    'player_name':   p['player_name'],
                    'team_short':    p.get('team_short'),
                    'position':      p.get('position'),
                    'surface_label': p['surface_label'],
                    'true_label':    p['true_label'],
                    'gap':           p['gap'],
                    'detail':        p['detail'],
                })

    if not all_rows:
        print('No regression candidates found today — nothing to save.')
        return

    # Delete today's rows first (small table, no downstream FK dependents)
    supa.table('regression_watch').delete().eq('game_date', today).execute()
    supa.table('regression_watch').insert(all_rows).execute()
    print(f'Saved {len(all_rows)} regression watch rows for {today}.')


def main():
    today = datetime.datetime.utcnow().strftime('%Y-%m-%d')
    print(f'=== compute_regression_watch.py — {today} ===')

    print('\n[1/2] Computing pitcher ERA/FIP regression...')
    pitcher_rows = compute_pitcher_regression()
    print(f'  {len(pitcher_rows)} pitcher candidates')

    print('\n[2/2] Computing batter AVG/xwOBA regression...')
    batter_rows = compute_batter_regression()
    print(f'  {len(batter_rows)} batter candidates')

    save_regression_watch(today, pitcher_rows, batter_rows)
    print('\nDone.')


if __name__ == '__main__':
    main()