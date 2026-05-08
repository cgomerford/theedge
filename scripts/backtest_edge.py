"""
Backtest a simplified Edge Score against the last 30 days of MLB games.

Uses 4 of the 8 V2 components (the ones we can reliably reconstruct from history):
- Starting Pitcher (ERA-based, not xFIP-)
- Form (L10 record + run differential to date)
- Park Factor (3-year averages)
- Home Field Advantage

Output: overall accuracy + calibration by confidence tier.
"""
import os
import sys
import json
from datetime import datetime, timedelta
import requests
from collections import defaultdict

# ============================================================
# PARK FACTORS (3-year averages, runs)
# ============================================================
PARK_FACTORS = {
    'Coors Field': 1.18, 'Great American Ball Park': 1.10, 'Yankee Stadium': 1.07,
    'Globe Life Field': 1.06, 'Citizens Bank Park': 1.05, 'Wrigley Field': 1.04,
    'Fenway Park': 1.04, 'Truist Park': 1.02, 'Chase Field': 1.02,
    'Rogers Centre': 1.01, 'PNC Park': 1.01, 'Minute Maid Park': 1.00,
    'Target Field': 1.00, 'Citi Field': 0.99, 'American Family Field': 0.99,
    'Nationals Park': 0.99, 'Camden Yards': 0.98, 'Busch Stadium': 0.98,
    'Comerica Park': 0.97, 'Progressive Field': 0.97, 'Angel Stadium': 0.96,
    'Kauffman Stadium': 0.96, 'Dodger Stadium': 0.95, 'Sutter Health Park': 0.95,
    'Petco Park': 0.94, 'Oracle Park': 0.92, 'T-Mobile Park': 0.92,
    'Tropicana Field': 0.93, 'Steinbrenner Field': 0.95,
}

MLB_API = 'https://statsapi.mlb.com/api/v1'
SEASON = 2026

def fetch_completed_games(start_date, end_date):
    """Pull all completed games in date range."""
    url = f'{MLB_API}/schedule?sportId=1&startDate={start_date}&endDate={end_date}&hydrate=team,linescore,probablePitcher'
    print(f'Fetching games from {start_date} to {end_date}...')
    r = requests.get(url)
    r.raise_for_status()
    data = r.json()
    
    games = []
    for date_block in data.get('dates', []):
        for g in date_block.get('games', []):
            # Only completed games with final scores
            if g.get('status', {}).get('abstractGameState') != 'Final':
                continue
            home_score = g.get('teams', {}).get('home', {}).get('score')
            away_score = g.get('teams', {}).get('away', {}).get('score')
            if home_score is None or away_score is None:
                continue
            # Skip postponed/suspended weirdness
            detailed = g.get('status', {}).get('detailedState', '')
            if any(x in detailed for x in ['Postponed', 'Cancelled', 'Suspended']):
                continue
            games.append(g)
    
    print(f'Got {len(games)} completed games')
    return games


def fetch_pitcher_stats_before(pitcher_id, before_date):
    """Get pitcher's season stats UP TO (but not including) before_date."""
    if not pitcher_id:
        return None
    url = f'{MLB_API}/people/{pitcher_id}/stats?stats=byDateRange&group=pitching&season={SEASON}&endDate={before_date}'
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return None
        data = r.json()
        for stat_block in data.get('stats', []):
            for split in stat_block.get('splits', []):
                stat = split.get('stat', {})
                era = stat.get('era')
                if era is not None and era != '-.--':
                    return {
                        'era': float(era),
                        'whip': float(stat.get('whip', 0)),
                        'innings': float(stat.get('inningsPitched', 0)),
                    }
    except Exception as e:
        return None
    return None


def fetch_team_record_before(team_id, before_date):
    """Get team's W-L and L10 form up to before_date."""
    # Pull last 30 days before the game date for L10
    start = (datetime.strptime(before_date, '%Y-%m-%d') - timedelta(days=21)).strftime('%Y-%m-%d')
    url = f'{MLB_API}/schedule?sportId=1&teamId={team_id}&startDate={start}&endDate={before_date}&hydrate=team,linescore'
    try:
        r = requests.get(url, timeout=10)
        if r.status_code != 200:
            return None
        data = r.json()
        
        finished = []
        for date_block in data.get('dates', []):
            for g in date_block.get('games', []):
                if g.get('status', {}).get('abstractGameState') != 'Final':
                    continue
                hs = g.get('teams', {}).get('home', {}).get('score')
                as_ = g.get('teams', {}).get('away', {}).get('score')
                if hs is None or as_ is None:
                    continue
                # Make sure this game is BEFORE the target date (no data leakage)
                game_date_str = g.get('officialDate') or g.get('gameDate', '')[:10]
                if game_date_str >= before_date:
                    continue
                finished.append(g)
        
        # Take L10
        last10 = finished[-10:]
        if not last10:
            return None
        
        wins, losses, rs, ra = 0, 0, 0, 0
        for g in last10:
            is_home = g['teams']['home']['team']['id'] == team_id
            us = g['teams']['home'] if is_home else g['teams']['away']
            them = g['teams']['away'] if is_home else g['teams']['home']
            our_score = us.get('score') or 0
            their_score = them.get('score') or 0
            rs += our_score
            ra += their_score
            if our_score > their_score:
                wins += 1
            elif their_score > our_score:
                losses += 1
        
        return {
            'l10_wins': wins,
            'l10_losses': losses,
            'l10_runs_per_game': rs / len(last10),
            'l10_runs_allowed_per_game': ra / len(last10),
            'l10_run_diff': (rs - ra) / len(last10),
        }
    except Exception:
        return None


def calculate_edge_score(game_data):
    """
    Compute simplified 4-component Edge Score.
    Returns: (edge_score, predicted_winner, confidence, component_breakdown)
    Positive = home favored, negative = away favored.
    """
    components = {}
    
    # 1. STARTING PITCHER (weight 0.40)
    home_pitcher = game_data['home_pitcher']
    away_pitcher = game_data['away_pitcher']
    
    if home_pitcher and away_pitcher and home_pitcher['innings'] >= 10 and away_pitcher['innings'] >= 10:
        # Lower ERA = better. Negative ERA diff = home pitcher better
        era_diff = away_pitcher['era'] - home_pitcher['era']
        components['pitcher'] = era_diff * 18  # 1.5 ERA gap = ~27 pts
    else:
        components['pitcher'] = 0
    
    # 2. FORM (weight 0.30)
    home_form = game_data['home_form']
    away_form = game_data['away_form']
    
    if home_form and away_form:
        l10_diff = (home_form['l10_wins'] - away_form['l10_wins'])  # -10 to +10
        run_diff_delta = home_form['l10_run_diff'] - away_form['l10_run_diff']
        components['form'] = (l10_diff * 4) + (run_diff_delta * 6)
    else:
        components['form'] = 0
    
    # 3. PARK FACTOR (weight 0.15) — slight edge to better-aligned team
    park = game_data['park']
    park_factor = PARK_FACTORS.get(park, 1.0)
    
    if home_form and away_form:
        if park_factor > 1.03:  # hitter park
            # whoever scores more gets bump
            if home_form['l10_runs_per_game'] > away_form['l10_runs_per_game']:
                components['park'] = 4
            else:
                components['park'] = -4
        elif park_factor < 0.97:  # pitcher park
            if home_pitcher and away_pitcher and home_pitcher['era'] < away_pitcher['era']:
                components['park'] = 3
            else:
                components['park'] = -3
        else:
            components['park'] = 0
    else:
        components['park'] = 0
    
    # 4. HOME FIELD ADVANTAGE (weight 0.15)
    components['home_advantage'] = 4
    
    # SUM
    edge_score = sum(components.values())
    edge_score = max(-100, min(100, edge_score))
    edge_score = round(edge_score, 1)
    
    if edge_score > 0:
        predicted_winner = 'home'
    elif edge_score < 0:
        predicted_winner = 'away'
    else:
        predicted_winner = 'home'  # tiebreaker
    
    abs_edge = abs(edge_score)
    if abs_edge >= 25:
        confidence = 'Strong'
    elif abs_edge >= 12:
        confidence = 'Moderate'
    elif abs_edge >= 5:
        confidence = 'Slight'
    else:
        confidence = 'TossUp'
    
    return edge_score, predicted_winner, confidence, components


def main():
    today = datetime.now()
    end_date = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    start_date = (today - timedelta(days=30)).strftime('%Y-%m-%d')
    
    print(f'\n{"="*70}')
    print('EDGE SCORE BACKTEST — Last 30 days')
    print(f'{"="*70}\n')
    
    # Step 1: Get completed games
    games = fetch_completed_games(start_date, end_date)
    
    if not games:
        print('No games found. Exiting.')
        return
    
    print(f'\nProcessing {len(games)} games (this takes ~15-20 min due to MLB API rate)...\n')
    
    # Step 2: For each game, build pre-game data and predict
    results = []
    for i, g in enumerate(games):
        game_date = g.get('officialDate') or g.get('gameDate', '')[:10]
        home_team = g['teams']['home']['team']['name']
        away_team = g['teams']['away']['team']['name']
        home_score = g['teams']['home']['score']
        away_score = g['teams']['away']['score']
        actual_winner = 'home' if home_score > away_score else 'away'
        
        home_pitcher_id = g['teams']['home'].get('probablePitcher', {}).get('id')
        away_pitcher_id = g['teams']['away'].get('probablePitcher', {}).get('id')
        
        # Fetch pre-game data
        home_pitcher = fetch_pitcher_stats_before(home_pitcher_id, game_date)
        away_pitcher = fetch_pitcher_stats_before(away_pitcher_id, game_date)
        home_form = fetch_team_record_before(g['teams']['home']['team']['id'], game_date)
        away_form = fetch_team_record_before(g['teams']['away']['team']['id'], game_date)
        park = g.get('venue', {}).get('name', '')
        
        # Skip games where we don't have enough data
        if not home_form or not away_form:
            continue
        
        game_data = {
            'home_pitcher': home_pitcher,
            'away_pitcher': away_pitcher,
            'home_form': home_form,
            'away_form': away_form,
            'park': park,
        }
        
        edge_score, predicted_winner, confidence, components = calculate_edge_score(game_data)
        
        is_correct = (predicted_winner == actual_winner) if confidence != 'TossUp' else None
        
        results.append({
            'date': game_date,
            'matchup': f'{away_team} @ {home_team}',
            'edge_score': edge_score,
            'predicted_winner': predicted_winner,
            'confidence': confidence,
            'actual_winner': actual_winner,
            'is_correct': is_correct,
            'components': components,
            'home_score': home_score,
            'away_score': away_score,
        })
        
        if (i + 1) % 25 == 0:
            print(f'  Processed {i+1}/{len(games)} games...')
    
    print(f'\n{"="*70}')
    print('RESULTS')
    print(f'{"="*70}\n')
    
    print(f'Total games analyzed: {len(results)}')
    
    predictions = [r for r in results if r['confidence'] != 'TossUp']
    correct = sum(1 for r in predictions if r['is_correct'])
    print(f'Toss-ups (no prediction): {len(results) - len(predictions)}')
    print(f'Predictions made: {len(predictions)}')
    print(f'\nOVERALL ACCURACY: {correct}/{len(predictions)} = {100*correct/len(predictions):.1f}%')
    
    # Calibration by confidence tier
    print(f'\nBy confidence tier:')
    for tier in ['Strong', 'Moderate', 'Slight']:
        tier_results = [r for r in predictions if r['confidence'] == tier]
        if not tier_results:
            continue
        tier_correct = sum(1 for r in tier_results if r['is_correct'])
        print(f'  {tier:10s} ({len(tier_results):3d} games): {tier_correct}/{len(tier_results)} = {100*tier_correct/len(tier_results):.1f}%')
    
    # Save results to file for later analysis
    output_file = f'backtest_results_{end_date}.json'
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f'\nDetailed results saved to: {output_file}')
    
    # Calibration interpretation
    print(f'\n{"="*70}')
    print('INTERPRETATION')
    print(f'{"="*70}\n')
    
    overall = 100 * correct / len(predictions)
    if overall >= 60:
        print('✅ STRONG SIGNAL — Simplified model already at 60%+. Full V2 should hit 62-67%.')
        print('   Recommendation: ship V2 with current weight structure.')
    elif overall >= 56:
        print('🟢 GOOD SIGNAL — Simplified model at 56-60%. Full V2 should hit 60-64%.')
        print('   Recommendation: ship V2, monitor live accuracy, tune weights post-launch.')
    elif overall >= 52:
        print('🟡 MARGINAL — Simplified model at 52-56%. Full V2 may hit 56-60%.')
        print('   Recommendation: review component weights before shipping.')
    else:
        print('❌ CONCERNING — Simplified model below 52%. Approach needs review.')
        print('   Recommendation: do not ship V2 until weights are reworked.')


if __name__ == '__main__':
    main()