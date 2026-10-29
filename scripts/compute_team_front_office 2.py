"""
scripts/compute_team_front_office.py

Front Office · team snapshot (roster, WAR, age profile, prospects). Built for one
club at a time; defaults to the Phillies (team 143).

TABLE OWNERSHIP (single writer):
  team_front_office_snapshot  <- this script and nothing else.

What it does
  1. 40-man roster with season stats + sabermetrics (WAR, wRC+, FIP) in ONE call:
       /teams/{id}/roster?rosterType=40Man&hydrate=person(stats(group=[hitting,pitching],type=[season,sabermetrics]))
  2. Minor-league system: fullSeason rosters of the AAA / AA / High-A / A affiliates,
     one /people call per affiliate with that level's season stats. Keeps players
     aged <= PROSPECT_MAX_AGE who are not on the 40-man, with a minimum sample.
     This is a statistical view of the system, NOT a scouting ranking: FV grades and
     org ranks are editorial products with no free API (see src/lib/team-minors.ts).
  3. Writes one jsonb payload row to team_front_office_snapshot.

Fields curl-verified 2026-10-15: roster[].person.{id,fullName,birthDate,currentAge,
primaryPosition,batSide,pitchHand}, status.code, stats[type=sabermetrics].splits[0].stat.war|wRcPlus|fip,
stats[type=season].splits[0].stat.{plateAppearances,ops,inningsPitched,era,...}.

Contracts are NOT here: the Stats API publishes none. They come from
player_contract_seasons, loaded by scripts/load_contracts_csv.py.

Cron: daily 08:30 UTC (after the 08:00 roster-blueprint job; reads only the public
Stats API, so there is no hard dependency). `--dry-run` prints the sample without writing.
"""
from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / '.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

MLB = 'https://statsapi.mlb.com/api/v1'
TEAM_ID = 143  # Phillies
LEVELS = [(11, 'AAA'), (12, 'AA'), (13, 'High-A'), (14, 'A')]
PROSPECT_MAX_AGE = 25
MIN_PA, MIN_IP = 50, 15.0


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


def num(v):
    try:
        return None if v in (None, '', '-.--', '.---') else float(v)
    except (TypeError, ValueError):
        return None


def ip_to_dec(ip) -> float:
    """MLB writes 12.2 for 12 and 2/3 innings."""
    try:
        whole, _, frac = str(ip).partition('.')
        return int(whole) + (int(frac or 0) / 3)
    except ValueError:
        return 0.0


def stat_of(person: dict, kind: str, group: str) -> dict | None:
    for s in person.get('stats', []):
        if s['type']['displayName'] == kind and s['group']['displayName'] == group and s.get('splits'):
            return s['splits'][0]['stat']
    return None


def line_for(person: dict, is_pitcher: bool, with_war: bool) -> dict:
    """One compact stat line. Hitters and pitchers get different keys; missing stays None."""
    group = 'pitching' if is_pitcher else 'hitting'
    s = stat_of(person, 'season', group) or {}
    out: dict = {}
    if is_pitcher:
        out.update(g=s.get('gamesPlayed'), gs=s.get('gamesStarted'), ip=ip_to_dec(s.get('inningsPitched')) if s else None,
                   era=num(s.get('era')), whip=num(s.get('whip')), so=s.get('strikeOuts'), bb=s.get('baseOnBalls'),
                   sv=s.get('saves'), bf=s.get('battersFaced'))
    else:
        out.update(g=s.get('gamesPlayed'), pa=s.get('plateAppearances'), avg=num(s.get('avg')), obp=num(s.get('obp')),
                   slg=num(s.get('slg')), ops=num(s.get('ops')), hr=s.get('homeRuns'), rbi=s.get('rbi'),
                   sb=s.get('stolenBases'), so=s.get('strikeOuts'), bb=s.get('baseOnBalls'))
    if with_war:
        sab = stat_of(person, 'sabermetrics', group) or {}
        out['war'] = round(float(sab['war']), 2) if sab.get('war') is not None else None
        out['wrc_plus'] = round(float(sab['wRcPlus'])) if sab.get('wRcPlus') is not None else None
        out['fip'] = round(float(sab['fip']), 2) if sab.get('fip') is not None else None
    return out


def build_roster(team_id: int, season: int) -> list[dict]:
    hydrate = 'person(stats(group=[hitting,pitching],type=[season,sabermetrics],season=%d))' % season
    d = get_json(f'{MLB}/teams/{team_id}/roster', dict(rosterType='40Man', season=season, hydrate=hydrate))
    if not d:
        print('[build_roster] roster call failed')
        sys.exit(1)
    rows = []
    for e in d.get('roster', []):
        p = e['person']
        pos = e['position']['abbreviation']
        is_p = pos == 'P'
        # Two-way players (e.g. a DH who pitches) keep their listed position; WAR is summed across groups.
        line = line_for(p, is_p, with_war=True)
        other = stat_of(p, 'sabermetrics', 'hitting' if is_p else 'pitching')
        if other and other.get('war') is not None and line.get('war') is not None:
            line['war'] = round(line['war'] + float(other['war']), 2)
        rows.append(dict(
            id=p['id'], name=p['fullName'], pos=pos, is_pitcher=is_p, age=p.get('currentAge'),
            birth_date=p.get('birthDate'), bats=(p.get('batSide') or {}).get('code'),
            throws=(p.get('pitchHand') or {}).get('code'), status=e['status']['code'],
            status_text=e['status']['description'], **line))
    return rows


def build_prospects(team_id: int, season: int, on_40: set[int]) -> list[dict]:
    teams: dict[int, tuple[int, str]] = {}
    for sport_id, label in LEVELS:
        d = get_json(f'{MLB}/teams', dict(sportId=sport_id, season=season))
        for t in (d or {}).get('teams', []):
            if t.get('parentOrgId') == team_id:
                teams[t['id']] = (sport_id, label)
    out: list[dict] = []
    for aff_id, (sport_id, label) in teams.items():
        r = get_json(f'{MLB}/teams/{aff_id}/roster', dict(rosterType='fullSeason', season=season))
        ids = sorted({x['person']['id'] for x in (r or {}).get('roster', [])} - on_40)
        for i in range(0, len(ids), 100):
            chunk = ids[i:i + 100]
            hyd = f'stats(group=[hitting,pitching],type=season,season={season},sportId={sport_id})'
            d = get_json(f'{MLB}/people', dict(personIds=','.join(map(str, chunk)), hydrate=hyd))
            for p in (d or {}).get('people', []):
                age = p.get('currentAge')
                if age is None or age > PROSPECT_MAX_AGE:
                    continue
                pos = (p.get('primaryPosition') or {}).get('abbreviation')
                is_p = pos == 'P'
                line = line_for(p, is_p, with_war=False)
                if is_p and not (line.get('ip') or 0) >= MIN_IP:
                    continue
                if not is_p and not (line.get('pa') or 0) >= MIN_PA:
                    continue
                out.append(dict(id=p['id'], name=p['fullName'], pos=pos, is_pitcher=is_p, age=age, level=label,
                                level_sport_id=sport_id, affiliate=aff_id, bats=(p.get('batSide') or {}).get('code'),
                                throws=(p.get('pitchHand') or {}).get('code'), **line))
    return out


def main() -> None:
    dry = '--dry-run' in sys.argv
    if not dry and (not SUPABASE_URL or not SUPABASE_KEY):
        print('Missing Supabase env vars')
        sys.exit(1)
    season = datetime.now().year

    roster = build_roster(TEAM_ID, season)
    prospects = build_prospects(TEAM_ID, season, {r['id'] for r in roster})
    prospects.sort(key=lambda r: (r['level_sport_id'], r['name']))
    missing_war = [r['name'] for r in roster if r.get('war') is None]

    print(f'40-man: {len(roster)}  (no WAR row: {len(missing_war)})  prospects kept: {len(prospects)}')
    print('Sanity sample (5 roster rows by WAR):')
    for r in sorted(roster, key=lambda r: -(r.get('war') or -99))[:5]:
        print(f"  {r['name']:<22} {r['pos']:<3} age {r['age']}  WAR {r.get('war')}  {r['status']}")
    print('Sanity sample (5 prospects):')
    for r in prospects[:5]:
        print(f"  {r['name']:<22} {r['pos']:<3} age {r['age']}  {r['level']}  PA {r.get('pa')} IP {r.get('ip')}")

    if dry:
        print('\n--dry-run: nothing written')
        return
    print('\nWriting in 10 seconds — Ctrl-C to abort...')
    time.sleep(10)

    from supabase import create_client
    supa = create_client(SUPABASE_URL, SUPABASE_KEY)
    supa.table('team_front_office_snapshot').upsert(dict(
        team_id=TEAM_ID, season=season, as_of=datetime.now(timezone.utc).isoformat(),
        roster=roster, prospects=prospects), on_conflict='team_id,season').execute()
    print('Wrote 1 team_front_office_snapshot row.')


if __name__ == '__main__':
    main()
