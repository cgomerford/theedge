"""
scripts/fetch_team_transactions.py

Fetches the last 30 days of MLB transactions for all 30 teams.
Categorises each into: IL, ACTIVATION, CALLUP, OPTION, DFA, RELEASE, OTHER.
Extracts injury reason from description text for IL moves.
Writes to `team_transactions` table in Supabase.

Runs daily via GitHub Actions (suggested: 11:00 UTC, after morning roster moves).
"""
import os
import sys
import re
import time
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')
load_dotenv('../.env.local')  # fallback if running from scripts/

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL', '')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('Missing Supabase env vars')
    sys.exit(1)

supa = create_client(SUPABASE_URL, SUPABASE_KEY)
MLB_API = 'https://statsapi.mlb.com/api/v1'

# ── All 30 MLB team IDs ────────────────────────────────────────────────────
MLB_TEAM_IDS = [
    108, 109, 110, 111, 112, 113, 114, 115, 116, 117,
    118, 119, 120, 121, 133, 134, 135, 136, 137, 138,
    139, 140, 141, 142, 143, 144, 145, 146, 147, 158,
]

TEAM_ID_TO_NAME = {
    108: 'Los Angeles Angels',    109: 'Arizona Diamondbacks',
    110: 'Baltimore Orioles',     111: 'Boston Red Sox',
    112: 'Chicago Cubs',          113: 'Cincinnati Reds',
    114: 'Cleveland Guardians',   115: 'Colorado Rockies',
    116: 'Detroit Tigers',        117: 'Houston Astros',
    118: 'Kansas City Royals',    119: 'Los Angeles Dodgers',
    120: 'Washington Nationals',  121: 'New York Mets',
    133: 'Athletics',             134: 'Pittsburgh Pirates',
    135: 'San Diego Padres',      136: 'Seattle Mariners',
    137: 'San Francisco Giants',  138: 'St. Louis Cardinals',
    139: 'Tampa Bay Rays',        140: 'Texas Rangers',
    141: 'Toronto Blue Jays',     142: 'Minnesota Twins',
    143: 'Philadelphia Phillies', 144: 'Atlanta Braves',
    145: 'Chicago White Sox',     146: 'Miami Marlins',
    147: 'New York Yankees',      158: 'Milwaukee Brewers',
}

# ── Type code → category mapping ──────────────────────────────────────────
# SC needs description parsing to distinguish IL placement vs activation
TYPE_MAP = {
    'SE':  'CALLUP',      # Selected from MiLB
    'CU':  'CALLUP',      # Recalled
    'OPT': 'OPTION',      # Optioned to MiLB
    'DES': 'DFA',         # Designated for Assignment
    'REL': 'RELEASE',     # Released
    'OUT': 'OUTRIGHTED',  # Outrighted to MiLB
    'TR':  'TRADE',       # Trade
    'FA':  'SIGNING',     # Free agent signing
    'SC':  'STATUS',      # Status change — parse description
}

# IL day patterns
IL_PATTERNS = [
    (r'60-day injured list', 60),
    (r'15-day injured list', 15),
    (r'10-day injured list', 10),
    (r'7-day injured list', 7),
    (r'injured list', 15),  # fallback
]

# Injury reason extraction — pull the reason after the IL placement phrase
INJURY_REASON_PATTERN = re.compile(
    r'(?:injured list|IL)[\.\s]*(?:retroactive[^\.]+)?[\.]\s*(.+?)[\.\s]*$',
    re.IGNORECASE
)


def parse_status_change(description: str, type_code: str):
    """
    For SC (Status Change) entries, determine:
    - category: 'IL' | 'ACTIVATION' | 'STATUS'
    - il_days: 10 | 15 | 60 | None
    - injury_reason: string | None
    """
    desc_lower = description.lower()

    # IL placement
    if 'injured list' in desc_lower and ('placed' in desc_lower or 'transferred' in desc_lower):
        il_days = 15  # default
        for pattern, days in IL_PATTERNS:
            if re.search(pattern, desc_lower):
                il_days = days
                break

        # Extract injury reason
        injury_reason = None
        # Try to get text after the last period in the description
        parts = description.strip().rstrip('.').split('.')
        if len(parts) > 1:
            candidate = parts[-1].strip()
            if len(candidate) > 3 and len(candidate) < 100:
                injury_reason = candidate
        # Fallback: look for capitalised injury description
        if not injury_reason:
            match = re.search(r'\.\s+([A-Z][^\.]{3,80}?)\.?\s*$', description)
            if match:
                injury_reason = match.group(1).strip()

        return 'IL', il_days, injury_reason

    # Activation from IL
    if 'activated' in desc_lower and 'injured list' in desc_lower:
        return 'ACTIVATION', None, None

    # Suspension
    if 'suspended' in desc_lower:
        return 'SUSPENSION', None, None

    return 'STATUS', None, None


def classify_transaction(tx: dict):
    """
    Takes a raw transaction dict from MLB API.
    Returns a cleaned row ready for Supabase, or None if we should skip it.
    """
    type_code = tx.get('typeCode', '')
    description = tx.get('description', '')
    person = tx.get('person', {})
    to_team = tx.get('toTeam', {})
    from_team = tx.get('fromTeam', {})

    player_id = person.get('id')
    player_name = person.get('fullName')
    if not player_id or not player_name:
        return None

    # Determine which MLB team this affects
    to_team_id = to_team.get('id')
    from_team_id = from_team.get('id')

    # The affected MLB team is whichever is in our team list
    affected_team_id = None
    if to_team_id in MLB_TEAM_IDS:
        affected_team_id = to_team_id
    elif from_team_id in MLB_TEAM_IDS:
        affected_team_id = from_team_id

    if not affected_team_id:
        return None

    # Classify
    category = TYPE_MAP.get(type_code, 'OTHER')
    il_days = None
    injury_reason = None
    is_milb_move = False

    if type_code == 'SC':
        category, il_days, injury_reason = parse_status_change(description, type_code)

    # Flag MiLB origin/destination
    if from_team_id and from_team_id not in MLB_TEAM_IDS:
        is_milb_move = True
    if to_team_id and to_team_id not in MLB_TEAM_IDS:
        is_milb_move = True

    # Skip pure minor league transactions with no MLB team involved
    if category == 'OTHER' and is_milb_move:
        return None

    effective_date = tx.get('effectiveDate') or tx.get('date')

    return {
        'transaction_id':   tx['id'],
        'team_id':          affected_team_id,
        'team_name':        TEAM_ID_TO_NAME.get(affected_team_id, str(affected_team_id)),
        'player_id':        player_id,
        'player_name':      player_name,
        'type_code':        type_code,
        'category':         category,
        'il_days':          il_days,
        'injury_reason':    injury_reason,
        'description':      description,
        'transaction_date': effective_date,
        'from_team_id':     from_team_id,
        'from_team_name':   from_team.get('name'),
        'to_team_id':       to_team_id,
        'to_team_name':     to_team.get('name'),
        'is_milb_move':     is_milb_move,
        'updated_at':       datetime.utcnow().isoformat(),
    }


def fetch_team_transactions(team_id: int, start_date: str, end_date: str) -> list:
    url = f'{MLB_API}/transactions'
    params = {
        'teamId': team_id,
        'startDate': start_date,
        'endDate': end_date,
        'sportId': 1,
    }
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        return r.json().get('transactions', [])
    except Exception as e:
        print(f'  Failed for team {team_id}: {e}')
        return []


def main():
    today = datetime.now()
    start_date = (today - timedelta(days=30)).strftime('%Y-%m-%d')
    end_date = today.strftime('%Y-%m-%d')

    print(f'Fetching transactions {start_date} → {end_date} for all 30 teams')

    all_rows = []
    seen_ids = set()
    skipped = 0
    failed = 0

    for i, team_id in enumerate(MLB_TEAM_IDS):
        team_name = TEAM_ID_TO_NAME.get(team_id, str(team_id))
        txs = fetch_team_transactions(team_id, start_date, end_date)

        team_rows = 0
        for tx in txs:
            tx_id = tx.get('id')
            if tx_id in seen_ids:
                continue
            seen_ids.add(tx_id)

            row = classify_transaction(tx)
            if row is None:
                skipped += 1
                continue

            all_rows.append(row)
            team_rows += 1

        print(f'  [{i+1}/30] {team_name}: {team_rows} transactions')
        time.sleep(0.2)  # gentle rate limiting

    print(f'\nTotal: {len(all_rows)} rows to upsert ({skipped} skipped, {failed} errors)')

    if not all_rows:
        print('Nothing to upsert — exiting')
        return

    # Upsert in batches of 200
    BATCH = 200
    for i in range(0, len(all_rows), BATCH):
        batch = all_rows[i:i + BATCH]
        supa.table('team_transactions').upsert(
            batch,
            on_conflict='transaction_id'
        ).execute()
        print(f'  Upserted batch {i // BATCH + 1} ({len(batch)} rows)')

    print(f'\n✓ DONE — {len(all_rows)} transactions written')


if __name__ == '__main__':
    main()
