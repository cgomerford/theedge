"""
scripts/compute_roster_blueprint.py

Front Office · Roster Blueprint precompute.

TABLE OWNERSHIP (single writer):
  roster_acquisitions, team_blueprint_snapshot  <- this script and nothing else.

What it does
  1. Pulls season WAR for every MLB player from the MLB Stats API
     (stats=sabermetrics, hitting + pitching, paginated 500/page; each player
     appears once, with the club he is on now).
  2. For each player, reads his transaction history
     (/transactions?playerId=) and finds the transaction that brought him to
     that club, then labels it: draft / international / trade / mlb_fa /
     milb_fa / waiver / rule5.
  3. Writes one roster_acquisitions row per player and one
     team_blueprint_snapshot row per club (WAR summed by acquisition type,
     each player's WAR floored at 0 so a below-replacement player can't
     shrink a segment).

Endpoints and field names curl-verified 2026-10-14:
  /stats?stats=sabermetrics&group=hitting|pitching&playerPool=ALL&limit&offset  -> splits[].stat.war, .team.id, .player.id
  /transactions?playerId=  -> typeCode TR SFA SGN DR CLW R5 (others ignored), toTeam.id, fromTeam, date
  /people?personIds=a,b&hydrate=draft -> birthCountry, mlbDebutDate, drafts[].team.id

Known limits (printed in the run summary, shown on the page footnote):
  * A player traded mid-season has all his season WAR credited to his current club.
  * Players with no acquiring transaction in the feed are stored in the
    snapshot as 'unclassified', never guessed.
  * Undrafted US/Puerto Rico signings are labelled milb_fa. Amateur international
    signings arrive in the feed as SFA before the player's MLB debut (verified
    on Julio Rodriguez), so pre-debut SFA is classified by birth country.

Cron: daily 08:00 UTC. Depends on nothing upstream (reads the public Stats API
only). Run `python scripts/compute_roster_blueprint.py --dry-run` to print the
sample without writing.
"""
from __future__ import annotations

import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

MLB = 'https://statsapi.mlb.com/api/v1'
MAX_CONCURRENT = 6  # CLAUDE.md: the Stats API resets bursts above ~6 in flight
DOMESTIC = {'USA', 'Puerto Rico'}  # draft-eligible; Canada-born amateurs sign through the international route
ACQUIRING = {'TR', 'SFA', 'SGN', 'DR', 'CLW', 'R5'}
TYPES = ['draft', 'international', 'trade', 'mlb_fa', 'milb_fa', 'waiver', 'rule5']


def get_json(url: str, params: dict | None = None, tries: int = 4) -> dict | None:
    for attempt in range(tries):
        try:
            r = requests.get(url, params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            print(f'[get_json] {r.status_code} {url}')
        except requests.RequestException as e:
            print(f'[get_json] {type(e).__name__} {url}')
        time.sleep(1.5 * (attempt + 1))
    return None


def fetch_war(season: int) -> dict[int, dict]:
    """player_id -> {team_id, name, war}. Two-way players sum both groups."""
    out: dict[int, dict] = {}
    for group in ('hitting', 'pitching'):
        offset = 0
        while True:
            d = get_json(f'{MLB}/stats', dict(stats='sabermetrics', group=group, season=season,
                                               playerPool='ALL', limit=500, offset=offset, sportId=1))
            if not d:
                print(f'[fetch_war] aborting: {group} offset {offset} failed')
                sys.exit(1)
            splits = d['stats'][0]['splits']
            for s in splits:
                team = (s.get('team') or {}).get('id')
                war = s['stat'].get('war')
                if team is None or war is None:
                    continue
                pid = s['player']['id']
                row = out.setdefault(pid, dict(team_id=team, name=s['player'].get('fullName'), war=0.0, group=group))
                row['war'] += float(war)
            if len(splits) < 500:
                break
            offset += 500
    return out


def fetch_people(ids: list[int]) -> dict[int, dict]:
    people: dict[int, dict] = {}
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        d = get_json(f'{MLB}/people', dict(personIds=','.join(map(str, chunk)), hydrate='draft'))
        for p in (d or {}).get('people', []):
            people[p['id']] = p
    return people


def fetch_transactions(pid: int) -> list[dict]:
    d = get_json(f'{MLB}/transactions', dict(playerId=pid))
    if d is None:
        return []
    return [t for t in d.get('transactions', []) if t.get('typeCode') in ACQUIRING]


def classify(tx: dict, person: dict) -> str:
    code = tx['typeCode']
    if code == 'TR':
        return 'trade'
    if code == 'CLW':
        return 'waiver'
    if code == 'R5':
        return 'rule5'
    if code == 'SFA':
        debut = person.get('mlbDebutDate')
        if debut and debut < tx['date']:
            return 'mlb_fa'
    # SGN / DR / pre-debut SFA: amateur or minor-league signing
    to_id = (tx.get('toTeam') or {}).get('id')
    drafted_by = {d.get('team', {}).get('id') for d in person.get('drafts', [])}
    if code == 'DR' or (to_id is not None and to_id in drafted_by):
        return 'draft'
    return 'milb_fa' if person.get('birthCountry') in DOMESTIC else 'international'


def pick_acquisition(txs: list[dict], team_id: int) -> dict | None:
    """Latest acquiring transaction into this club; else the latest overall."""
    txs = sorted(txs, key=lambda t: t['date'])
    into = [t for t in txs if (t.get('toTeam') or {}).get('id') == team_id]
    return (into or txs or [None])[-1]


def main() -> None:
    dry = '--dry-run' in sys.argv
    if not dry and (not SUPABASE_URL or not SUPABASE_KEY):
        print('Missing Supabase env vars')
        sys.exit(1)
    season = datetime.now().year

    war = fetch_war(season)
    print(f'WAR rows: {len(war)}')
    people = fetch_people(list(war))
    with ThreadPoolExecutor(MAX_CONCURRENT) as ex:
        txs = dict(zip(war, ex.map(fetch_transactions, war)))

    rows, unclassified, fallbacks = [], defaultdict(list), 0
    for pid, w in war.items():
        person = people.get(pid, {})
        tx = pick_acquisition(txs[pid], w['team_id'])
        if tx is None:
            unclassified[w['team_id']].append(w)
            continue
        if (tx.get('toTeam') or {}).get('id') != w['team_id']:
            fallbacks += 1
        rows.append(dict(
            team_id=w['team_id'], player_id=pid, season=season, player_name=w['name'],
            position=(person.get('primaryPosition') or {}).get('abbreviation'),
            acquisition_type=classify(tx, person),
            acquired_from_team_id=(tx.get('fromTeam') or {}).get('id'),
            acquired_from_name=(tx.get('fromTeam') or {}).get('name'),
            acquired_date=tx['date'], war=round(w['war'], 2),
            updated_at=datetime.now(timezone.utc).isoformat(),
        ))

    snaps: dict[int, dict] = {}
    for tid in set(r['team_id'] for r in rows) | set(unclassified):
        snaps[tid] = dict(team_id=tid, season=season, as_of=datetime.now(timezone.utc).isoformat(),
                          war_by_type={t: 0.0 for t in TYPES}, counts_by_type={t: 0 for t in TYPES}, payroll_rank=None)
    for r in rows:
        s = snaps[r['team_id']]
        s['war_by_type'][r['acquisition_type']] = round(s['war_by_type'][r['acquisition_type']] + max(r['war'], 0), 2)
        s['counts_by_type'][r['acquisition_type']] += 1
    for tid, ws in unclassified.items():
        snaps[tid]['war_by_type']['unclassified'] = round(sum(max(x['war'], 0) for x in ws), 2)
        snaps[tid]['counts_by_type']['unclassified'] = len(ws)

    print(f'\nclassified {len(rows)}, unclassified {sum(len(v) for v in unclassified.values())}, '
          f'fell back to latest-overall transaction: {fallbacks}')
    print('Sanity sample (5 rows):')
    for r in sorted(rows, key=lambda r: -r['war'])[:5]:
        print(f"  {r['player_name']:<24} team {r['team_id']}  {r['acquisition_type']:<13} {r['acquired_date']}  WAR {r['war']}")
    print('Team sample (3 clubs):')
    for s in list(snaps.values())[:3]:
        print(f"  team {s['team_id']}: {s['war_by_type']}")

    if dry:
        print('\n--dry-run: nothing written')
        return
    print('\nWriting in 10 seconds — Ctrl-C to abort...')
    time.sleep(10)

    from supabase import create_client
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)
    # Full refresh for the season: delete stale stints (players who left a club) then upsert.
    supa.table('roster_acquisitions').delete().eq('season', season).execute()
    for i in range(0, len(rows), 500):
        supa.table('roster_acquisitions').upsert(rows[i:i + 500], on_conflict='team_id,player_id,season').execute()
    supa.table('team_blueprint_snapshot').upsert(list(snaps.values()), on_conflict='team_id,season').execute()
    print(f'Wrote {len(rows)} roster_acquisitions rows and {len(snaps)} team snapshots.')


if __name__ == '__main__':
    main()
