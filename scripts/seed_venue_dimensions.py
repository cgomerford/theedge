from __future__ import annotations

import os
import sys
import time
from datetime import datetime

from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing Supabase env vars — check .env.local or Action secrets.')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

SOURCE = 'Andrew Clem ballpark dimensions table, provided by user 2026-08-17'
VERIFIED = '2026-08-17'

# Same 30 parks from fetch_venue_adjusted_spray.py, flattened for seeding.
# This dict is the LAST place these numbers should live as a Python literal —
# after this runs, venue_dimensions (Supabase) is the source of truth and
# fetch_venue_adjusted_spray.py should be refactored to query it, not this dict.

VENUE_DIMENSIONS: dict[str, dict] = {
    'yankee_stadium': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 318, 8, 'LF Line'), (-22.5, 382, 8, 'LF-CF Gap'), (0, 408, 8, 'CF'),
        (22.5, 360, 8, 'CF-RF Gap'), (45, 314, 8, 'RF Line')]},
    'wrigley_field': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 355, 11, 'LF Line'), (-22.5, 352, 11, 'LF-CF Gap'), (0, 395, 11, 'CF'),
        (22.5, 368, 11, 'CF-RF Gap'), (45, 353, 11, 'RF Line')]},
    't_mobile_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 331, 15, 'LF Line'), (-22.5, 367, 11, 'LF-CF Gap'), (0, 401, 7, 'CF'),
        (22.5, 367, 7, 'CF-RF Gap'), (45, 326, 7, 'RF Line')]},
    'truist_park': {'source': SOURCE, 'verified_date': VERIFIED,
        'note': 'LF fence listed as "6, 9" (varies by section) — used 6 as base.', 'points': [
        (-45, 335, 6, 'LF Line'), (-22.5, 385, 7.5, 'LF-CF Gap'), (0, 400, 9, 'CF'),
        (22.5, 375, 12.5, 'CF-RF Gap'), (45, 325, 16, 'RF Line')]},
    'tropicana_field': {'source': SOURCE, 'verified_date': VERIFIED,
        'note': 'Confirmed as Rays\u2019 active 2026 home venue.', 'points': [
        (-45, 315, 11, 'LF Line'), (-22.5, 370, 10, 'LF-CF Gap'), (0, 404, 9, 'CF'),
        (22.5, 370, 10, 'CF-RF Gap'), (45, 322, 11, 'RF Line')]},
    'target_field': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 339, 8, 'LF Line'), (-22.5, 377, 8, 'LF-CF Gap'), (0, 404, 8, 'CF'),
        (22.5, 367, 15.5, 'CF-RF Gap'), (45, 328, 23, 'RF Line')]},
    'sutter_health_park': {'source': SOURCE, 'verified_date': None,
        'note': 'BLOCKED: source lists LF/CF/RF distances only (330/403/325) — heights and '
                'LC/RC gaps unknown in source. Do not use for live flips until sourced.',
        'points': []},
    'rogers_centre': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 328, 8, 'LF Line'), (-22.5, 368, 8, 'LF-CF Gap'), (0, 400, 8, 'CF'),
        (22.5, 359, 8, 'CF-RF Gap'), (45, 328, 8, 'RF Line')]},
    'rate_field': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 335, 8, 'LF Line'), (-22.5, 365, 8, 'LF-CF Gap'), (0, 400, 8, 'CF'),
        (22.5, 365, 8, 'CF-RF Gap'), (45, 330, 8, 'RF Line')]},
    'progressive_field': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 325, 19, 'LF Line'), (-22.5, 360, 14, 'LF-CF Gap'), (0, 405, 9, 'CF'),
        (22.5, 375, 9, 'CF-RF Gap'), (45, 325, 9, 'RF Line')]},
    'pnc_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 325, 6, 'LF Line'), (-22.5, 388, 8, 'LF-CF Gap'), (0, 399, 10, 'CF'),
        (22.5, 365, 15.5, 'CF-RF Gap'), (45, 320, 21, 'RF Line')]},
    'petco_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 334, 4, 'LF Line'), (-22.5, 380, 5.5, 'LF-CF Gap'), (0, 396, 7, 'CF'),
        (22.5, 372, 8.5, 'CF-RF Gap'), (45, 322, 10, 'RF Line')]},
    'oracle_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 339, 8, 'LF Line'), (-22.5, 365, 8, 'LF-CF Gap'), (0, 399, 8, 'CF'),
        (22.5, 385, 16.5, 'CF-RF Gap'), (45, 309, 25, 'RF Line')]},
    'nationals_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 336, 10, 'LF Line'), (-22.5, 377, 10, 'LF-CF Gap'), (0, 402, 10, 'CF'),
        (22.5, 370, 13, 'CF-RF Gap'), (45, 335, 16, 'RF Line')]},
    'loandepot_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 344, 12, 'LF Line'), (-22.5, 386, 10.5, 'LF-CF Gap'), (0, 407, 9, 'CF'),
        (22.5, 392, 10.5, 'CF-RF Gap'), (45, 335, 12, 'RF Line')]},
    'kauffman_stadium': {'source': SOURCE + ' + estimated 2026 renovation adjustment', 'verified_date': None,
        'note': 'ESTIMATE ONLY: source predates confirmed 2026 fence change (brought in ~10ft, '
                'walls lowered to 8.5ft). Placeholder -10ft/8.5ft applied. Needs official Royals figures.',
        'points': [
        (-45, 320, 8.5, 'LF Line'), (-22.5, 375, 8.5, 'LF-CF Gap'), (0, 400, 8.5, 'CF'),
        (22.5, 375, 8.5, 'CF-RF Gap'), (45, 320, 8.5, 'RF Line')]},
    'great_american_ball_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 328, 12, 'LF Line'), (-22.5, 368, 10, 'LF-CF Gap'), (0, 404, 8, 'CF'),
        (22.5, 370, 8, 'CF-RF Gap'), (45, 325, 8, 'RF Line')]},
    'globe_life_field': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 329, 8, 'LF Line'), (-22.5, 372, 8, 'LF-CF Gap'), (0, 407, 8, 'CF'),
        (22.5, 374, 8, 'CF-RF Gap'), (45, 326, 8, 'RF Line')]},
    'fenway_park': {'source': SOURCE, 'verified_date': VERIFIED,
        'note': 'Roughest approximation of the 30 — Green Monster corner geometry breaks the '
                'smooth radial assumption linear interpolation relies on.',
        'points': [
        (-45, 310, 37, 'LF Line'), (-22.5, 335, 27.5, 'LF-CF Gap'), (0, 390, 18, 'CF'),
        (22.5, 378, 11.5, 'CF-RF Gap'), (45, 302, 5, 'RF Line')]},
    'dodger_stadium': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 330, 4, 'LF Line'), (-22.5, 375, 6, 'LF-CF Gap'), (0, 395, 8, 'CF'),
        (22.5, 375, 6, 'CF-RF Gap'), (45, 330, 4, 'RF Line')]},
    'daikin_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 315, 21, 'LF Line'), (-22.5, 335, 15, 'LF-CF Gap'), (0, 409, 9, 'CF'),
        (22.5, 373, 8, 'CF-RF Gap'), (45, 326, 7, 'RF Line')]},
    'coors_field': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 347, 8, 'LF Line'), (-22.5, 390, 8, 'LF-CF Gap'), (0, 415, 8, 'CF'),
        (22.5, 375, 12.5, 'CF-RF Gap'), (45, 350, 17, 'RF Line')]},
    'comerica_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 345, 7, 'LF Line'), (-22.5, 370, 8, 'LF-CF Gap'), (0, 420, 9, 'CF'),
        (22.5, 388, 9, 'CF-RF Gap'), (45, 330, 9, 'RF Line')]},
    'citizens_bank_park': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 329, 11, 'LF Line'), (-22.5, 360, 8.5, 'LF-CF Gap'), (0, 401, 6, 'CF'),
        (22.5, 355, 9.5, 'CF-RF Gap'), (45, 330, 13, 'RF Line')]},
    'citi_field': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 335, 8, 'LF Line'), (-22.5, 362, 8, 'LF-CF Gap'), (0, 408, 8, 'CF'),
        (22.5, 375, 8, 'CF-RF Gap'), (45, 330, 8, 'RF Line')]},
    'chase_field': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 330, 8, 'LF Line'), (-22.5, 376, 16.5, 'LF-CF Gap'), (0, 407, 25, 'CF'),
        (22.5, 376, 16.5, 'CF-RF Gap'), (45, 335, 8, 'RF Line')]},
    'camden_yards': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 333, 8, 'LF Line'), (-22.5, 363, 7.5, 'LF-CF Gap'), (0, 400, 7, 'CF'),
        (22.5, 373, 14, 'CF-RF Gap'), (45, 318, 21, 'RF Line')]},
    'busch_stadium': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 336, 8, 'LF Line'), (-22.5, 375, 8, 'LF-CF Gap'), (0, 400, 8, 'CF'),
        (22.5, 375, 8, 'CF-RF Gap'), (45, 335, 8, 'RF Line')]},
    'angel_stadium': {'source': SOURCE, 'verified_date': VERIFIED,
        'note': 'RF fence listed as "18, 8" (varies by section) — used 18 as base.', 'points': [
        (-45, 330, 8, 'LF Line'), (-22.5, 390, 8, 'LF-CF Gap'), (0, 400, 8, 'CF'),
        (22.5, 370, 13, 'CF-RF Gap'), (45, 330, 18, 'RF Line')]},
    'american_family_field': {'source': SOURCE, 'verified_date': VERIFIED, 'note': None, 'points': [
        (-45, 344, 8, 'LF Line'), (-22.5, 370, 8, 'LF-CF Gap'), (0, 400, 8, 'CF'),
        (22.5, 374, 8, 'CF-RF Gap'), (45, 345, 8, 'RF Line')]},
}


def main():
    rows = []
    for venue_id, v in VENUE_DIMENSIONS.items():
        if not v['points']:
            print(f'  SKIP {venue_id}: no points (blocked, see note)')
            continue
        for angle_deg, distance_ft, height_ft, label in v['points']:
            rows.append({
                'venue_id': venue_id,
                'angle_deg': angle_deg,
                'label': label,
                'wall_distance_ft': distance_ft,
                'wall_height_ft': height_ft,
                'source': v['source'],
                'verified_date': v['verified_date'],  # None stays None — NOT production-ready
                'note': v.get('note'),
                'updated_at': datetime.utcnow().isoformat(),
            })

    verified_venues = {r['venue_id'] for r in rows if r['verified_date']}
    unverified_venues = {r['venue_id'] for r in rows if not r['verified_date']}

    print(f'\n{len(rows)} rows across {len(VENUE_DIMENSIONS)} venues.')
    print(f'  Verified & usable: {len(verified_venues)} venues')
    print(f'  Unverified (kauffman_stadium estimate): {len(unverified_venues)} venues')
    print(f'  Fully blocked (no rows): sutter_health_park')
    print('\nFirst 5 rows:')
    for row in rows[:5]:
        print(f"  {row['venue_id']} @ {row['angle_deg']}°: {row['wall_distance_ft']}ft / {row['wall_height_ft']}ft wall")
    print('\nWriting in 5 seconds — Ctrl+C to abort...')
    time.sleep(5)

    BATCH = 500
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        supabase.table('venue_dimensions').upsert(batch, on_conflict='venue_id,angle_deg').execute()

    print(f'\n✓ DONE — {len(rows)} rows seeded to venue_dimensions.')
    print('  Next: refactor fetch_venue_adjusted_spray.py to query this table instead of its local dict.')


if __name__ == '__main__':
    main()