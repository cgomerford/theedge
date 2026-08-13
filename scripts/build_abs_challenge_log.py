"""
scripts/build_abs_challenge_log.py

Pro Lab — #7: ABS challenge data.

⚠ HIGHEST-UNCERTAINTY FILE IN THE PRO LAB BUILD.
MLB's Automated Ball-Strike challenge system launched for the 2026 regular
season — after my training cutoff. I have no confirmed knowledge of how (or
whether) the live game feed represents challenge events. This script guesses
that challenges show up as a "review"/"replay"-shaped object on the relevant
pitch event, by analogy with how the existing Gumbo feed already structures
other in-game replay reviews (the pattern used elsewhere in MLB's API for
years). That analogy might just be wrong for ABS specifically.

RUN THIS WITH --probe FIRST. It doesn't try to parse anything — it just
fetches one game's live feed and dumps the raw JSON keys on every pitch
event for a game you know had a challenge in it, so you (or I, next
message) can see the actual shape before any parsing logic gets written.
Guessing the parse logic before seeing one real payload would be exactly
the fabricated-shortcut pattern this build has avoided everywhere else —
so the parsing functions below are intentionally left thin/speculative
pending that real output.

Fallback if the live feed doesn't carry it cleanly: MLB.com, ESPN, and
Baseball-Reference all publish ABS challenge leaderboards this season.
Baseball-Reference's /friv/abs-challenges.shtml page in particular looks
like structured per-pitch data. That would mean a scrape-based pipeline
instead of an API one — worth checking their terms before building
anything that hits it on a schedule, and slower/more fragile than a real
API, so it's the fallback, not the first attempt.
"""
from __future__ import annotations
import os
import sys
import json
import time
import argparse
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

MLB_API_V11 = 'https://statsapi.mlb.com/api/v1.1'
MLB_API = 'https://statsapi.mlb.com/api/v1'

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')


def probe_game(game_pk: int):
    """
    Dumps every playEvent's top-level keys for one game, plus the full JSON
    of any event whose keys hint at replay/challenge/review, so we can see
    the real shape without guessing. Run this against a game you know had
    at least one ABS challenge in it (check MLB.com's box score / the
    ESPN or Baseball-Reference tracker for a game+timestamp to target).
    """
    url = f'{MLB_API_V11}/game/{game_pk}/feed/live'
    r = requests.get(url)
    r.raise_for_status()
    feed = r.json()

    plays = feed.get('liveData', {}).get('plays', {}).get('allPlays', [])
    print(f'Game {game_pk}: {len(plays)} plate appearances\n')

    hint_words = ('review', 'replay', 'challenge', 'abs', 'overturn')
    found_any = False

    for play in plays:
        for event in play.get('playEvents', []):
            keys = list(event.keys())
            hinted_keys = [k for k in keys if any(h in k.lower() for h in hint_words)]
            details = event.get('details', {})
            detail_keys = [k for k in details.keys() if any(h in k.lower() for h in hint_words)]
            if hinted_keys or detail_keys:
                found_any = True
                print('--- possible challenge event ---')
                print(json.dumps(event, indent=2)[:3000])
                print()

    if not found_any:
        print('No keys matching', hint_words, 'found anywhere in this game\'s playEvents.')
        print('Either this game had no challenge, or the field lives somewhere')
        print('this probe isn\'t looking (e.g. a separate top-level feed section,')
        print('or a completely different key name). Next step if this comes back')
        print('empty on a game you KNOW had a challenge: dump the full raw feed')
        print('JSON and search it by hand for the known inning/pitch instead.')


# =====================================================
# SPECULATIVE parse path — do not trust until probe_game()
# has confirmed a real shape and this has been rewritten to match it.
# =====================================================

def extract_challenges_speculative(game_feed: dict) -> list:
    """
    GUESSED shape: assumes a challenge appears as event['reviewDetails']
    or event['challenge'] with fields resembling:
      { 'challenger': 'batter'|'pitcher'|'catcher',
        'originalCall': 'ball'|'strike', 'overturned': bool,
        'reviewingUmpire': str }
    This is almost certainly incomplete or wrong in field names — it exists
    so there's a starting shape to correct once probe_game() output is in
    hand, not because it's expected to work as-is.
    """
    out = []
    plays = game_feed.get('liveData', {}).get('plays', {}).get('allPlays', [])
    for play in plays:
        for event in play.get('playEvents', []):
            review = event.get('reviewDetails') or event.get('challenge')
            if not review:
                continue
            out.append({
                'challenger': review.get('challenger'),
                'original_call': review.get('originalCall'),
                'overturned': review.get('overturned'),
                'pitch_type': event.get('details', {}).get('type', {}).get('code'),
                'batter_id': play.get('matchup', {}).get('batter', {}).get('id'),
                'pitcher_id': play.get('matchup', {}).get('pitcher', {}).get('id'),
            })
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe', type=int, metavar='GAME_PK',
                         help='Dump raw challenge-hinting JSON for one game and exit — run this first')
    parser.add_argument('--player-id', type=int)
    parser.add_argument('--season', type=int, default=2026)
    args = parser.parse_args()

    if args.probe:
        probe_game(args.probe)
        return

    print('No --probe game_pk given. Nothing else in this file is safe to run')
    print('until a probe has confirmed the real challenge-event shape.')
    print('Usage: python build_abs_challenge_log.py --probe <gamePk>')
    print('Pick a gamePk you know had a challenge in it (check the ESPN or')
    print('Baseball-Reference ABS tracker for a recent example game).')
    sys.exit(0)


if __name__ == '__main__':
    main()