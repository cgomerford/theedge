"""
scripts/build_umpire_profile.py

Pro Lab — #6: umpire leniency.

For a given player (batter or pitcher), walks every game they appeared in
this season, pulls the plate umpire + every "taken" pitch (called ball or
called strike — swings excluded, they're not the umpire's call), determines
whether each pitch was genuinely in the rulebook zone using pX/pZ vs the
game's strikeZoneTop/strikeZoneBottom, and aggregates per umpire:

  - taken_pitches: total called pitches faced with this ump behind the plate
  - correct_call_pct: taken pitches where the call matched the rulebook zone
  - edge_strike_pct: of pitches in the OUTER 15% band of the zone width
    (the genuinely borderline ones, not the whole strike zone), what % got
    called a strike. This is "leniency" — a hitter-friendly ump calls fewer
    of these strikes, a pitcher-friendly one calls more.

⚠ VERIFICATION REQUIRED BEFORE THIS WRITES TO SUPABASE FOR REAL:
  1. Confirm the live feed pitch object actually has pX/pZ/strikeZoneTop/
     strikeZoneBottom at the paths coded below (liveData.plays.allPlays[].
     playEvents[].pitchData.coordinates / .pitchData). This has never been
     hit in this codebase before.
  2. Confirm officials[].officialType uses the exact string "Home Plate" —
     coded as a guess.
  3. Run against ONE known game first (--game-pk flag) and print the raw
     pitch objects before trusting the aggregation across a full season.

Follows house pattern: prints a sanity check + abort window before writing.
Target Python 3.9 — no `|` union syntax without __future__ import.
"""
from __future__ import annotations
import os
import sys
import time
import argparse
from typing import Optional
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

MLB_API = 'https://statsapi.mlb.com/api/v1'
MLB_API_V11 = 'https://statsapi.mlb.com/api/v1.1'
PLATE_WIDTH_FT = 17 / 12  # 17 inches, rulebook plate width
EDGE_BAND_FRACTION = 0.15  # outer 15% of zone width/height counts as "borderline"

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')


def get_player_game_pks(player_id: int, player_type: str, season: int) -> list:
    """player_type: 'pitching' or 'hitting'."""
    url = f'{MLB_API}/people/{player_id}/stats?stats=gameLog&group={player_type}&season={season}'
    r = requests.get(url)
    r.raise_for_status()
    data = r.json()
    splits = data.get('stats', [{}])[0].get('splits', [])
    return [s['game']['gamePk'] for s in splits if s.get('game', {}).get('gamePk')]


def get_plate_umpire(game_feed: dict) -> Optional[str]:
    officials = game_feed.get('liveData', {}).get('boxscore', {}).get('officials', [])
    for o in officials:
        # GUESS: exact string unconfirmed — could be 'Home Plate' or similar.
        if o.get('officialType') == 'Home Plate':
            return o.get('official', {}).get('fullName')
    return None


def extract_taken_pitches(game_feed: dict, player_id: int, player_type: str) -> list:
    """
    Returns list of dicts: {called_strike: bool, in_zone: bool, is_edge: bool}
    for every ball/called-strike pitch involving player_id as batter or pitcher.
    """
    out = []
    plays = game_feed.get('liveData', {}).get('plays', {}).get('allPlays', [])
    for play in plays:
        matter = play.get('matchup', {})
        batter_id = matter.get('batter', {}).get('id')
        pitcher_id = matter.get('pitcher', {}).get('id')
        if player_type == 'hitting' and batter_id != player_id:
            continue
        if player_type == 'pitching' and pitcher_id != player_id:
            continue

        for event in play.get('playEvents', []):
            if event.get('type') != 'pitch':
                continue
            details = event.get('details', {})
            call_code = details.get('call', {}).get('code')  # GUESS: 'B' / 'C' (called strike) / 'S' etc — unconfirmed
            if call_code not in ('B', 'C'):
                continue  # only umpire-decided pitches — swings/fouls aren't the ump's call

            pitch_data = event.get('pitchData', {})
            coords = pitch_data.get('coordinates', {})
            pX = coords.get('pX')
            pZ = coords.get('pZ')
            sz_top = pitch_data.get('strikeZoneTop')
            sz_bot = pitch_data.get('strikeZoneBottom')
            if pX is None or pZ is None or sz_top is None or sz_bot is None:
                continue  # missing tracking data — skip rather than guess

            half_plate = PLATE_WIDTH_FT / 2
            in_zone = (-half_plate <= pX <= half_plate) and (sz_bot <= pZ <= sz_top)

            zone_height = sz_top - sz_bot
            edge_h = zone_height * EDGE_BAND_FRACTION
            edge_w = PLATE_WIDTH_FT * EDGE_BAND_FRACTION
            # "Edge" = within the outer band on any side, whether just in or just out
            near_horizontal_edge = (half_plate - edge_w) <= abs(pX) <= (half_plate + edge_w)
            near_vertical_edge = (sz_top - edge_h) <= pZ <= (sz_top + edge_h) or (sz_bot - edge_h) <= pZ <= (sz_bot + edge_h)
            is_edge = near_horizontal_edge or near_vertical_edge

            out.append({
                'called_strike': call_code == 'C',
                'in_zone': in_zone,
                'is_edge': is_edge,
            })
    return out


def build_profile(player_id: int, player_type: str, season: int, verbose: bool = False) -> dict:
    """player_type: 'pitching' or 'hitting'."""
    game_pks = get_player_game_pks(player_id, player_type, season)
    print(f'Found {len(game_pks)} games for player {player_id} ({player_type}), season {season}')

    by_ump: dict = {}

    for i, pk in enumerate(game_pks):
        url = f'{MLB_API_V11}/game/{pk}/feed/live'
        r = requests.get(url)
        if not r.ok:
            print(f'  [skip] gamePk {pk}: fetch failed ({r.status_code})')
            continue
        feed = r.json()

        ump = get_plate_umpire(feed)
        if not ump:
            print(f'  [skip] gamePk {pk}: no plate umpire resolved')
            continue

        pitches = extract_taken_pitches(feed, player_id, player_type)
        if not pitches:
            continue

        if ump not in by_ump:
            by_ump[ump] = {'games': set(), 'taken': 0, 'correct': 0, 'edge_pitches': 0, 'edge_strikes': 0}
        by_ump[ump]['games'].add(pk)
        for p in pitches:
            by_ump[ump]['taken'] += 1
            if p['called_strike'] == p['in_zone']:
                by_ump[ump]['correct'] += 1
            if p['is_edge']:
                by_ump[ump]['edge_pitches'] += 1
                if p['called_strike']:
                    by_ump[ump]['edge_strikes'] += 1

        if verbose:
            print(f'  gamePk {pk}: ump={ump}, taken_pitches={len(pitches)}')
        time.sleep(0.1)  # be polite to the API across a full season of games

    profile = {}
    for ump, agg in by_ump.items():
        if agg['taken'] < 10:
            continue  # too few taken pitches for this ump to mean anything — omit, don't report noise
        profile[ump] = {
            'games': len(agg['games']),
            'taken_pitches': agg['taken'],
            'correct_call_pct': round(100 * agg['correct'] / agg['taken'], 1),
            'edge_strike_pct': round(100 * agg['edge_strikes'] / agg['edge_pitches'], 1) if agg['edge_pitches'] >= 5 else None,
        }
    return profile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--player-id', type=int, required=True)
    parser.add_argument('--player-type', choices=['pitching', 'hitting'], required=True)
    parser.add_argument('--season', type=int, default=2026)
    parser.add_argument('--dry-run', action='store_true', help='Print results, do not write to Supabase')
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args()

    profile = build_profile(args.player_id, args.player_type, args.season, verbose=args.verbose)

    print('\n--- Umpire profile (min 10 taken pitches) ---')
    for ump, stats in sorted(profile.items(), key=lambda kv: -kv[1]['taken_pitches']):
        edge = f"{stats['edge_strike_pct']}%" if stats['edge_strike_pct'] is not None else 'n/a (too few edge pitches)'
        print(f"  {ump}: {stats['games']} games, {stats['taken_pitches']} taken pitches, "
              f"correct call {stats['correct_call_pct']}%, edge-strike rate {edge}")

    if args.dry_run:
        print('\n--dry-run set — not writing to Supabase.')
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        print('Missing Supabase env vars — cannot write. Re-run with --dry-run to just inspect output.')
        sys.exit(1)

    print(f'\nAbout to write {len(profile)} umpire rows for player {args.player_id} to Supabase.')
    print('Ctrl+C within 5 seconds to abort...')
    time.sleep(5)

    supa = create_client(SUPABASE_URL, SUPABASE_KEY)
    rows = [
        {
            'player_id': args.player_id,
            'player_type': args.player_type,
            'season': args.season,
            'umpire_name': ump,
            **stats,
        }
        for ump, stats in profile.items()
    ]
    # Table 'umpire_player_profile' does not exist yet — create it before
    # running this for real. Single writer: this script owns this table.
    supa.table('umpire_player_profile').upsert(
        rows, on_conflict='player_id,player_type,season,umpire_name'
    ).execute()
    print('Done.')


if __name__ == '__main__':
    main()