"""
fetch_series_context.py — V4 Day 3

Fetches series context for every active MLB series and upserts into
the `series_context` Supabase table.

What it captures:
  - Series score (home wins, away wins)
  - Games played in this series
  - Total games in series
  - Series opener date
  - Whether team is in elimination spot (series deciding game)
  - Last game winner and margin
  - Home team is on a series win streak
  - Away team is on a series win streak

Run: python scripts/fetch_series_context.py
Cron: daily at 05:30 UTC (after schedule fetcher, before log-predictions)

Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
"""

import os
import sys
import time
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
    sys.exit(1)

supa: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
MLB_API = 'https://statsapi.mlb.com/api/v1'


def get_todays_games() -> list[dict]:
    """Fetch today's scheduled games with series info."""
    today = datetime.now().strftime('%Y-%m-%d')
    url = f'{MLB_API}/schedule?sportId=1&date={today}&hydrate=team,seriesStatus,linescore'
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    data = r.json()

    games = []
    for date_block in data.get('dates', []):
        for g in date_block.get('games', []):
            # Skip non-regular season
            if g.get('gameType') not in ('R', 'F', 'D', 'L', 'W'):
                continue
            games.append(g)
    return games


def get_recent_series_games(home_team_id: int, away_team_id: int, before_date: str) -> list[dict]:
    """
    Look back up to 7 days to find the start of this series between these
    two teams. Returns a list of completed games in order.
    """
    start = (datetime.strptime(before_date, '%Y-%m-%d') - timedelta(days=7)).strftime('%Y-%m-%d')
    url = (
        f'{MLB_API}/schedule?sportId=1'
        f'&startDate={start}&endDate={before_date}'
        f'&hydrate=team,linescore'
        f'&teamId={home_team_id}'
    )
    r = requests.get(url, timeout=15)
    r.raise_for_status()
    data = r.json()

    # Filter to games between THESE two teams
    matching = []
    for date_block in data.get('dates', []):
        for g in date_block.get('games', []):
            ht = g.get('teams', {}).get('home', {}).get('team', {}).get('id')
            at = g.get('teams', {}).get('away', {}).get('team', {}).get('id')
            if set([ht, at]) == set([home_team_id, away_team_id]):
                matching.append(g)

    # Sort ascending by date/gamePk
    matching.sort(key=lambda g: (g.get('officialDate', ''), g.get('gamePk', 0)))
    return matching


def build_series_context(today_game: dict) -> 'dict | None':
    """
    Build series context record for a single today game.
    Returns a dict ready to upsert into series_context table.
    """
    game_pk = today_game.get('gamePk')
    game_date = today_game.get('officialDate', datetime.now().strftime('%Y-%m-%d'))

    home_team = today_game.get('teams', {}).get('home', {})
    away_team = today_game.get('teams', {}).get('away', {})

    home_team_id = home_team.get('team', {}).get('id')
    away_team_id = away_team.get('team', {}).get('id')
    home_team_name = home_team.get('team', {}).get('name', '')
    away_team_name = away_team.get('team', {}).get('name', '')

    if not home_team_id or not away_team_id:
        return None

    # --- Series metadata from MLB API seriesStatus ---
    series_status = today_game.get('seriesStatus', {})
    series_description = series_status.get('shortDescription', '')  # e.g. "Game 2 of 3"
    series_game_number = series_status.get('gameNumber', 1)
    series_total_games = series_status.get('totalGames', 3)

    # "Game 3 of 3" = series decider
    is_series_decider = (series_game_number == series_total_games and series_total_games >= 2)

    # --- Fetch previous games in this series ---
    prior_games = get_recent_series_games(home_team_id, away_team_id, game_date)
    completed_prior = [
        g for g in prior_games
        if g.get('status', {}).get('abstractGameState') == 'Final'
        and g.get('gamePk') != game_pk
    ]

    home_series_wins = 0
    away_series_wins = 0
    last_winner_id = None
    last_game_margin = None
    series_opener_date = None

    if completed_prior:
        series_opener_date = completed_prior[0].get('officialDate')
        for g in completed_prior:
            hs = g.get('teams', {}).get('home', {}).get('score')
            as_ = g.get('teams', {}).get('away', {}).get('score')
            ht_id = g.get('teams', {}).get('home', {}).get('team', {}).get('id')
            at_id = g.get('teams', {}).get('away', {}).get('team', {}).get('id')

            if hs is None or as_ is None:
                continue

            if hs > as_:
                if ht_id == home_team_id:
                    home_series_wins += 1
                else:
                    away_series_wins += 1
                last_winner_id = ht_id
                last_game_margin = hs - as_
            elif as_ > hs:
                if at_id == away_team_id:
                    away_series_wins += 1
                else:
                    home_series_wins += 1
                last_winner_id = at_id
                last_game_margin = as_ - hs

    last_winner = None
    if last_winner_id == home_team_id:
        last_winner = 'home'
    elif last_winner_id == away_team_id:
        last_winner = 'away'

    # Home or away leading series?
    series_leader = None
    if home_series_wins > away_series_wins:
        series_leader = 'home'
    elif away_series_wins > home_series_wins:
        series_leader = 'away'
    # else: tied

    # Is this an elimination game (trailing team must win)?
    home_faces_elimination = (
        away_series_wins > home_series_wins
        and (away_series_wins + home_series_wins + 1) >= series_total_games
    )
    away_faces_elimination = (
        home_series_wins > away_series_wins
        and (home_series_wins + away_series_wins + 1) >= series_total_games
    )

    games_played_in_series = home_series_wins + away_series_wins

    return {
        'game_pk': game_pk,
        'game_date': game_date,
        'home_team_id': home_team_id,
        'away_team_id': away_team_id,
        'home_team_name': home_team_name,
        'away_team_name': away_team_name,
        'series_game_number': series_game_number,
        'series_total_games': series_total_games,
        'series_description': series_description,
        'series_opener_date': series_opener_date,
        'home_series_wins': home_series_wins,
        'away_series_wins': away_series_wins,
        'games_played_in_series': games_played_in_series,
        'series_leader': series_leader,
        'is_series_decider': is_series_decider,
        'home_faces_elimination': home_faces_elimination,
        'away_faces_elimination': away_faces_elimination,
        'last_winner': last_winner,
        'last_game_margin': last_game_margin,
        'updated_at': datetime.now().isoformat(),
    }


def main():
    print('=== Series Context Fetcher — V4 Day 3 ===')
    today = datetime.now().strftime('%Y-%m-%d')
    print(f'Date: {today}\n')

    games = get_todays_games()
    print(f'Found {len(games)} games today\n')

    records = []
    for g in games:
        game_pk = g.get('gamePk')
        home = g.get('teams', {}).get('home', {}).get('team', {}).get('name', '?')
        away = g.get('teams', {}).get('away', {}).get('team', {}).get('name', '?')
        print(f'Processing: {away} @ {home} (pk={game_pk})')

        try:
            record = build_series_context(g)
            if record:
                records.append(record)
                print(
                    f'  → Series {record["series_game_number"]} of {record["series_total_games"]} | '
                    f'Home wins: {record["home_series_wins"]} Away wins: {record["away_series_wins"]}'
                )
                if record['is_series_decider']:
                    print('  ⚠️  SERIES DECIDER')
            else:
                print('  ⚠️  Skipped (missing team data)')
        except Exception as e:
            print(f'  ERROR: {e}')

        time.sleep(0.3)  # Be gentle with MLB API

    if not records:
        print('\nNo records to upsert.')
        return

    print(f'\nUpserting {len(records)} records to series_context table...')
    result = supa.table('series_context').upsert(records, on_conflict='game_pk').execute()
    print(f'Done. {len(result.data)} records written.')

    # Summary
    deciders = [r for r in records if r['is_series_decider']]
    if deciders:
        print(f'\n🔥 Series deciders today ({len(deciders)}):')
        for r in deciders:
            print(f'  {r["away_team_name"]} @ {r["home_team_name"]}')


if __name__ == '__main__':
    main()