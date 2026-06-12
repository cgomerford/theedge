#!/usr/bin/env python3
"""
scripts/backfill_nfl_2025_games.py

Backdates 2025 NFL season game data from ESPN API.
Fetches all 18 weeks of regular season results + box scores.
Writes to nfl_game_data table in Supabase.

Run:
  python3 scripts/backfill_nfl_2025_games.py
  python3 scripts/backfill_nfl_2025_games.py --week 1
  python3 scripts/backfill_nfl_2025_games.py --re-enrich   # fix box scores only
"""

import os
import sys
import json
import time
import argparse
import requests
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

SLUG_MAP = {
    'BUF': 'buffalo-bills', 'MIA': 'miami-dolphins', 'NE': 'new-england-patriots', 'NYJ': 'new-york-jets',
    'BAL': 'baltimore-ravens', 'CIN': 'cincinnati-bengals', 'CLE': 'cleveland-browns', 'PIT': 'pittsburgh-steelers',
    'HOU': 'houston-texans', 'IND': 'indianapolis-colts', 'JAX': 'jacksonville-jaguars', 'TEN': 'tennessee-titans',
    'DEN': 'denver-broncos', 'KC': 'kansas-city-chiefs', 'LV': 'las-vegas-raiders', 'LAC': 'los-angeles-chargers',
    'DAL': 'dallas-cowboys', 'NYG': 'new-york-giants', 'PHI': 'philadelphia-eagles', 'WSH': 'washington-commanders',
    'CHI': 'chicago-bears', 'DET': 'detroit-lions', 'GB': 'green-bay-packers', 'MIN': 'minnesota-vikings',
    'ATL': 'atlanta-falcons', 'CAR': 'carolina-panthers', 'NO': 'new-orleans-saints', 'TB': 'tampa-bay-buccaneers',
    'ARI': 'arizona-cardinals', 'LAR': 'los-angeles-rams', 'SF': 'san-francisco-49ers', 'SEA': 'seattle-seahawks',
}

def build_slug(away_abbr: str, home_abbr: str, date: str) -> str:
    away = SLUG_MAP.get(away_abbr, away_abbr.lower())
    home = SLUG_MAP.get(home_abbr, home_abbr.lower())
    return f"{away}-at-{home}-{date[:10]}"


def fetch_week(season: int, week: int) -> list:
    url = f"{ESPN}/scoreboard?seasontype=2&week={week}&dates={season}"
    try:
        r = requests.get(url, timeout=15)
        if not r.ok:
            print(f"    ✗ Week {week} fetch failed: {r.status_code}")
            return []
        return r.json().get('events', [])
    except Exception as e:
        print(f"    ✗ Week {week} error: {e}")
        return []


def fetch_game_summary(event_id: str) -> Optional[dict]:
    url = f"{ESPN}/summary?event={event_id}"
    try:
        r = requests.get(url, timeout=15)
        if not r.ok:
            return None
        return r.json()
    except:
        return None


def parse_box_score(summary: dict) -> dict:
    """
    ESPN summary structure:
    boxscore.teams[n].statistics = list of groups
    Each group has: name (stat key), displayValue, value
    e.g. { "name": "netPassingYards", "displayValue": "286", "value": 286 }
    """
    result = {
        'home_pass_yards': None, 'home_rush_yards': None, 'home_total_yards': None,
        'home_turnovers': None, 'home_third_down_pct': None, 'home_red_zone_pct': None,
        'home_time_of_possession': None,
        'away_pass_yards': None, 'away_rush_yards': None, 'away_total_yards': None,
        'away_turnovers': None, 'away_third_down_pct': None, 'away_red_zone_pct': None,
        'away_time_of_possession': None,
    }

    try:
        box = summary.get('boxscore', {})
        teams = box.get('teams', [])

        for team_data in teams:
            is_home = team_data.get('homeAway') == 'home'
            prefix = 'home_' if is_home else 'away_'

            # Build flat stat dict from the group list
            # Each item in statistics is a group WITH displayValue directly
            stats = {}
            for group in team_data.get('statistics', []):
                name = group.get('name', '')
                display = group.get('displayValue', '')
                value = group.get('value')
                stats[name] = {'display': display, 'value': value}

            def get_float(key: str) -> Optional[float]:
                s = stats.get(key, {})
                v = s.get('value')
                if v is not None:
                    try:
                        return float(v)
                    except:
                        pass
                d = s.get('display', '')
                if d:
                    try:
                        return float(d.replace(',', ''))
                    except:
                        pass
                return None

            def get_display(key: str) -> Optional[str]:
                return stats.get(key, {}).get('display') or None

            result[f'{prefix}pass_yards']        = get_float('netPassingYards')
            result[f'{prefix}rush_yards']         = get_float('rushingYards')
            result[f'{prefix}total_yards']        = get_float('totalYards')
            result[f'{prefix}turnovers']          = get_float('turnovers')
            result[f'{prefix}third_down_pct']     = get_display('thirdDownEff')
            result[f'{prefix}red_zone_pct']       = get_display('redZoneAttempts')
            result[f'{prefix}time_of_possession'] = get_display('possessionTime')

    except Exception as e:
        print(f"      ⚠ box score parse error: {e}")

    return result


def parse_event(event: dict, week: int, season: int) -> Optional[dict]:
    comp = event.get('competitions', [{}])[0]
    competitors = comp.get('competitors', [])
    if len(competitors) < 2:
        return None

    home = next((c for c in competitors if c.get('homeAway') == 'home'), None)
    away = next((c for c in competitors if c.get('homeAway') == 'away'), None)
    if not home or not away:
        return None

    home_team = home.get('team', {})
    away_team = away.get('team', {})
    home_abbr = home_team.get('abbreviation', '')
    away_abbr = away_team.get('abbreviation', '')
    date = event.get('date', '')
    slug = build_slug(away_abbr, home_abbr, date)

    status_type = event.get('status', {}).get('type', {})
    is_final = status_type.get('completed', False)
    status = 'final' if is_final else 'scheduled'

    home_score = int(float(home.get('score', 0) or 0)) if is_final else None
    away_score = int(float(away.get('score', 0) or 0)) if is_final else None

    venue = comp.get('venue', {})

    return {
        'event_id': event.get('id'),
        'slug': slug,
        'season': season,
        'week': week,
        'date': date,
        'status': status,
        'home_team_id': home_team.get('id'),
        'home_team_abbr': home_abbr,
        'home_team_name': home_team.get('displayName', ''),
        'home_team_logo': home_team.get('logos', [{}])[0].get('href', '') if home_team.get('logos') else '',
        'away_team_id': away_team.get('id'),
        'away_team_abbr': away_abbr,
        'away_team_name': away_team.get('displayName', ''),
        'away_team_logo': away_team.get('logos', [{}])[0].get('href', '') if away_team.get('logos') else '',
        'home_score': home_score,
        'away_score': away_score,
        'venue_name': venue.get('fullName', ''),
        'venue_city': venue.get('address', {}).get('city', ''),
        'is_dome': venue.get('indoor', False),
        'broadcast': comp.get('broadcasts', [{}])[0].get('names', [''])[0] if comp.get('broadcasts') else '',
        'home_record': home.get('records', [{}])[0].get('summary', '') if home.get('records') else '',
        'away_record': away.get('records', [{}])[0].get('summary', '') if away.get('records') else '',
        # Box score nulls — filled by enrich step
        'home_pass_yards': None, 'home_rush_yards': None, 'home_total_yards': None,
        'home_turnovers': None, 'home_third_down_pct': None, 'home_red_zone_pct': None,
        'home_time_of_possession': None,
        'away_pass_yards': None, 'away_rush_yards': None, 'away_total_yards': None,
        'away_turnovers': None, 'away_third_down_pct': None, 'away_red_zone_pct': None,
        'away_time_of_possession': None,
        'updated_at': 'now()',
    }


def re_enrich_existing(supa, season: int):
    """Re-fetch box scores for all final games that have null pass yards."""
    print(f'\n─── Re-enriching box scores for {season} season ───')

    result = supa.table('nfl_game_data') \
        .select('event_id, slug, home_team_abbr, away_team_abbr') \
        .eq('season', season) \
        .eq('status', 'final') \
        .is_('home_pass_yards', 'null') \
        .execute()

    games = result.data or []
    print(f'  Found {len(games)} games with missing box scores')

    success = 0
    failed = 0

    for game in games:
        event_id = game['event_id']
        slug = game['slug']
        print(f'  Enriching {game["away_team_abbr"]} @ {game["home_team_abbr"]}...', end=' ', flush=True)

        summary = fetch_game_summary(event_id)
        if not summary:
            print('✗ no summary')
            failed += 1
            time.sleep(0.3)
            continue

        box = parse_box_score(summary)

        # Check we actually got data
        if box.get('home_pass_yards') is None and box.get('away_pass_yards') is None:
            print('✗ empty box score')
            failed += 1
            time.sleep(0.3)
            continue

        update_result = supa.table('nfl_game_data') \
            .update(box) \
            .eq('event_id', event_id) \
            .execute()

        if update_result.data:
            hp = box.get('home_pass_yards', '?')
            ap = box.get('away_pass_yards', '?')
            print(f'✓ pass: {ap}/{hp}')
            success += 1
        else:
            print('✗ update failed')
            failed += 1

        time.sleep(0.25)

    print(f'\n─── Complete ───')
    print(f'  Success: {success}')
    print(f'  Failed:  {failed}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--season', type=int, default=2025)
    parser.add_argument('--week', type=int, action='append')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--re-enrich', action='store_true',
                        help='Re-fetch box scores for existing rows with null stats')
    args = parser.parse_args()

    season = args.season

    if not SUPABASE_URL or not SUPABASE_KEY:
        print('✗ Missing Supabase env vars')
        sys.exit(1)

    supa = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Re-enrich mode — fix box scores without re-inserting everything
    if args.re_enrich:
        re_enrich_existing(supa, season)
        return

    weeks = args.week if args.week else list(range(1, 19))

    print(f'─── Backfilling NFL {season} season ───')
    print(f'    Weeks: {weeks}')
    print(f'    Dry run: {args.dry_run}')

    total_success = 0
    total_failed = 0

    for week in weeks:
        print(f'\n  Week {week}:')
        events = fetch_week(season, week)

        if not events:
            print(f'    No games found')
            continue

        print(f'    {len(events)} games found')

        for event in events:
            row = parse_event(event, week, season)
            if not row:
                continue

            slug = row['slug']
            home = row['home_team_abbr']
            away = row['away_team_abbr']
            score_str = f"{away} {row.get('away_score', '?')} – {home} {row.get('home_score', '?')}" \
                if row.get('home_score') is not None else 'TBD'

            # Enrich with box score if final
            if row['status'] == 'final' and row.get('event_id'):
                time.sleep(0.2)
                summary = fetch_game_summary(row['event_id'])
                if summary:
                    box = parse_box_score(summary)
                    row.update(box)

            if args.dry_run:
                print(f'    DRY: {slug} ({score_str})')
                total_success += 1
                continue

            result = supa.table('nfl_game_data').upsert(
                row, on_conflict='event_id'
            ).execute()

            if result.data:
                hp = row.get('home_pass_yards')
                ap = row.get('away_pass_yards')
                box_str = f" | pass: {ap}/{hp}" if hp else ""
                print(f'    ✓ {away} @ {home} — {score_str}{box_str}')
                total_success += 1
            else:
                print(f'    ✗ {slug} — upsert failed')
                total_failed += 1

            time.sleep(0.3)

    print(f'\n─── Complete ───')
    print(f'  Success: {total_success}')
    print(f'  Failed:  {total_failed}')


if __name__ == '__main__':
    main()