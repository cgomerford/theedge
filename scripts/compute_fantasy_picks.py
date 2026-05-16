"""
scripts/compute_fantasy_picks.py

Computes the four pick types for the /fantasy page:
  - Streamers (best pitchers to stream tonight)
  - Movers   (games where edge_score swung sharply since first snapshot)
  - Fallers  (fantasy stars in tough matchups tonight)
  - Sleepers (regression candidates with hidden value)

Writes ~12 rows total to `daily_fantasy_picks` (3 per type × 4 types).

Runs once per day at ~11:00 UTC (after the 10:00 predictions cron and snapshot).
This is the single source of truth for the /fantasy page — the page just SELECTS
from this table, never recomputes.

CHEAP: ~30-60 seconds total. No Statcast pulls. Pure DB read + aggregate.
"""
import os
import sys
import requests
from datetime import datetime, timedelta
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ─── Constants (mirrors src/lib/streamer.ts) ─────────────────────────────────
LEAGUE_AVG_FIP = 4.20
LEAGUE_AVG_K9  = 8.8
LEAGUE_AVG_WRC = 100
LEAGUE_AVG_RPG = 4.5


def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


def slugify_game(away_team, home_team, game_date):
    """Match the JS slugifyGame format exactly."""
    def s(t):
        return t.lower().replace(' ', '-').replace('.', '')
    return f'{s(away_team)}-at-{s(home_team)}-{game_date}'


def format_uk_time(game_date_iso):
    """Format an MLB-API gameDate (UTC ISO) as UK time HH:MM."""
    try:
        dt = datetime.fromisoformat(game_date_iso.replace('Z', '+00:00'))
        # Naive UK conversion (BST = UTC+1 May-Oct, GMT rest of year)
        # For simplicity, add 1 hour during the season window.
        dt_uk = dt + timedelta(hours=1)
        return dt_uk.strftime('%H:%M')
    except Exception:
        return ''


def short_name(team_name):
    """Match the JS shortName helper roughly — use last word."""
    if not team_name:
        return ''
    parts = team_name.split()
    return parts[-1] if parts else team_name


# ─── Streamer scoring (port of src/lib/streamer.ts) ──────────────────────────
def score_pitcher_quality(stats):
    if not stats:
        return 50
    era = float(stats.get('era')) if stats.get('era') else None
    fip = float(stats.get('fip')) if stats.get('fip') else None
    k9  = float(stats.get('k_per_9')) if stats.get('k_per_9') else None

    anchor = fip if fip is not None else (era if era is not None else LEAGUE_AVG_FIP)
    era_score = clamp(50 + ((LEAGUE_AVG_FIP - anchor) / LEAGUE_AVG_FIP) * 120)
    k9_score = clamp(50 + ((k9 - LEAGUE_AVG_K9) / LEAGUE_AVG_K9) * 80) if k9 else 50

    return round(era_score * 0.65 + k9_score * 0.35)


def score_opponent_offence(stats):
    if not stats:
        return 50
    if stats.get('wrc_plus') is not None:
        return clamp(50 + ((LEAGUE_AVG_WRC - float(stats['wrc_plus'])) / LEAGUE_AVG_WRC) * 100)
    if stats.get('runs_per_game_l30') is not None:
        return clamp(50 + ((LEAGUE_AVG_RPG - float(stats['runs_per_game_l30'])) / LEAGUE_AVG_RPG) * 80)
    return 50


def score_stuff(pitch_mix):
    if not pitch_mix:
        return 50, None
    weighted = 0
    total_usage = 0
    top_pitch = None
    top_whiff = 0
    for p in pitch_mix:
        whiff = float(p.get('whiff_percent') or 0)
        usage = float(p.get('percentage') or 0)
        weighted += whiff * usage
        total_usage += usage
        if whiff > top_whiff:
            top_whiff = whiff
            top_pitch = f"{p.get('pitch_name')} ({whiff:.0f}% whiff)"
    avg_whiff = weighted / total_usage if total_usage else 24
    return round(clamp(50 + ((avg_whiff - 24) / 24) * 120)), top_pitch


# ─── Helpers to load related data ────────────────────────────────────────────
def fetch_schedule(date_str):
    """Pull today's games from MLB Stats API."""
    url = f'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date_str}&hydrate=probablePitcher'
    r = requests.get(url, timeout=15)
    games = []
    for d in r.json().get('dates', []):
        for g in d.get('games', []):
            if g.get('status', {}).get('codedGameState') in {'S', 'P'}:  # Scheduled or Pre
                games.append(g)
    return games


def get_pitcher_stats(pid):
    """Try the pitcher_stats table first; return None if not present."""
    resp = supabase.table('pitcher_stats')\
        .select('era, fip, k_per_9, whip, l3_innings')\
        .eq('player_id', pid).limit(1).execute()
    return resp.data[0] if resp.data else None


def get_team_stats(team_name):
    """Get opponent offence stats by team name. None if missing."""
    resp = supabase.table('team_stats')\
        .select('runs_per_game_l30, ops_l30')\
        .eq('team_name', team_name).limit(1).execute()
    return resp.data[0] if resp.data else None


def get_pitch_mix(pid):
    season = datetime.now().year
    resp = supabase.table('pitch_arsenals')\
        .select('pitch_name, pitch_type, percentage, whiff_percent, avg_velocity')\
        .eq('player_id', pid).eq('season', season).order('percentage', desc=True).execute()
    return resp.data or []


# ─── Compute each pick type ──────────────────────────────────────────────────
def compute_streamers(games, today):
    """Top 3 pitchers to stream tonight."""
    candidates = []
    for game in games:
        away = game['teams']['away']
        home = game['teams']['home']
        for pitcher_info, team_side, opponent_team in [
            (away.get('probablePitcher'), away['team']['name'], home['team']['name']),
            (home.get('probablePitcher'), home['team']['name'], away['team']['name']),
        ]:
            if not pitcher_info:
                continue
            pid = pitcher_info.get('id')
            name = pitcher_info.get('fullName')
            if not pid or not name:
                continue

            pstats   = get_pitcher_stats(pid)
            opp_stats = get_team_stats(opponent_team)
            mix      = get_pitch_mix(pid)

            quality   = score_pitcher_quality(pstats)
            opponent  = score_opponent_offence(opp_stats)
            stuff, top_pitch = score_stuff(mix)
            park = 55  # neutral default since we don't have park component handy here

            score = round(quality * 0.40 + opponent * 0.30 + park * 0.15 + stuff * 0.15)
            tier  = 'strong' if score >= 70 else 'viable' if score >= 55 else 'avoid'

            if tier == 'avoid':
                continue

            era = pstats.get('era') if pstats else None
            k9  = pstats.get('k_per_9') if pstats else None

            # Build a clean one-liner
            parts = []
            if k9:
                parts.append(f'{float(k9):.1f} K/9')
            if top_pitch and stuff >= 65:
                parts.append(top_pitch)
            parts.append(f'vs {short_name(opponent_team)}')
            one_liner = ' · '.join(parts)

            candidates.append({
                'game_pk':       game['gamePk'],
                'game_slug':     slugify_game(away['team']['name'], home['team']['name'], today),
                'game_time':     format_uk_time(game['gameDate']),
                'player_id':     pid,
                'player_name':   name,
                'team_name':     short_name(team_side),
                'opponent_name': short_name(opponent_team),
                'signal_score':  score,
                'tier':          tier,
                'details': {
                    'tier':       tier,
                    'top_pitch':  top_pitch,
                    'era':        era,
                    'k_per_9':    k9,
                    'quality':    quality,
                    'opponent':   opponent,
                    'stuff':      stuff,
                },
                'headline':  f'{name} · {short_name(team_side)} vs {short_name(opponent_team)}',
                'one_liner': one_liner,
            })

    candidates.sort(key=lambda x: -x['signal_score'])
    return candidates[:3]


def compute_movers(today):
    """Top 3 games where edge_score swung sharply during the day."""
    # Pull all today's snapshots
    resp = supabase.table('prediction_history')\
        .select('game_pk, edge_score, predicted_winner, snapshot_at')\
        .eq('game_date', today).order('snapshot_at').execute()

    if not resp.data:
        return []

    # Group by game_pk, get first + last
    by_game = {}
    for row in resp.data:
        gp = row['game_pk']
        if gp not in by_game:
            by_game[gp] = {'first': row, 'last': row}
        else:
            by_game[gp]['last'] = row

    # Compute swings
    movers = []
    for gp, snaps in by_game.items():
        first_score = float(snaps['first']['edge_score'])
        last_score  = float(snaps['last']['edge_score'])
        swing       = last_score - first_score
        if abs(swing) < 8:   # not a real mover
            continue
        movers.append({
            'game_pk':       gp,
            'previous_score': round(first_score),
            'current_score':  round(last_score),
            'swing':          round(swing, 1),
            'direction':      'up' if swing > 0 else 'down',
        })

    movers.sort(key=lambda x: -abs(x['swing']))
    return movers[:3]


def enrich_movers(movers, games_by_pk, today):
    """Add team names + slugs from MLB Stats API data."""
    out = []
    for m in movers:
        game = games_by_pk.get(m['game_pk'])
        if not game:
            continue
        away = game['teams']['away']['team']['name']
        home = game['teams']['home']['team']['name']

        # Which team did the edge move TOWARD?
        # If swing > 0 and predicted_winner was 'home' all along, home got stronger.
        # We just describe it factually:
        if m['direction'] == 'up':
            mover_team = home   # positive edge_score = home favoured
        else:
            mover_team = away

        out.append({
            'game_pk':       m['game_pk'],
            'game_slug':     slugify_game(away, home, today),
            'game_time':     format_uk_time(game['gameDate']),
            'player_name':   short_name(mover_team),   # for movers, the "subject" is the team
            'team_name':     short_name(mover_team),
            'opponent_name': short_name(away if mover_team == home else home),
            'signal_score':  m['swing'],
            'details': m,
            'headline':  f'{short_name(mover_team)} · {short_name(away)} at {short_name(home)}',
            'one_liner': f"Edge {('strengthened' if m['direction'] == 'up' else 'weakened')} by {abs(m['swing']):.0f} points since this morning",
        })
    return out


def compute_fallers(games, today):
    """
    Fantasy stars in tough matchups tonight.

    Simplified V1 approach:
    For each game, look at the opposing pitcher's strength.
    If the pitcher is elite (score >= 65 via our pitcher_quality formula)
    AND the opposing team has notable batters in their lineup (assumed presence),
    label one of the team's top lineup spots as a "Faller for tonight".

    We don't have per-batter lineup vulnerability YET (Phase 2 work),
    so we use TEAM OPS as a proxy — a high-OPS team facing an elite arm
    suggests their fantasy stars are in trouble.
    """
    candidates = []
    for game in games:
        away = game['teams']['away']
        home = game['teams']['home']

        for pitcher_info, pitcher_team, opp_team_name in [
            (away.get('probablePitcher'), away['team']['name'], home['team']['name']),
            (home.get('probablePitcher'), home['team']['name'], away['team']['name']),
        ]:
            if not pitcher_info:
                continue
            pid = pitcher_info.get('id')
            if not pid:
                continue

            pstats = get_pitcher_stats(pid)
            opp_stats = get_team_stats(opp_team_name)
            mix = get_pitch_mix(pid)

            pitcher_quality = score_pitcher_quality(pstats)
            stuff, top_pitch = score_stuff(mix)

            # Only flag if pitcher is genuinely elite
            if pitcher_quality < 65 and stuff < 65:
                continue

            # Only flag if the opposing team is a real offence (otherwise it's just an easy win)
            opp_ops = float(opp_stats.get('ops_l30')) if opp_stats and opp_stats.get('ops_l30') is not None else None
            if opp_ops is None or opp_ops < 0.720:
                continue

            era = pstats.get('era') if pstats else None
            era_str = f'{float(era):.2f} ERA' if era else 'this season'

            why_parts = []
            if pstats and pstats.get('era'):
                why_parts.append(era_str)
            if top_pitch and stuff >= 65:
                why_parts.append(top_pitch)

            why = ', '.join(why_parts) if why_parts else 'elite arm'

            candidates.append({
                'game_pk':       game['gamePk'],
                'game_slug':     slugify_game(away['team']['name'], home['team']['name'], today),
                'game_time':     format_uk_time(game['gameDate']),
                'player_id':     None,                       # team-level for now
                'player_name':   short_name(opp_team_name),  # the team WHOSE bats are in trouble
                'team_name':     short_name(opp_team_name),
                'opponent_name': pitcher_info.get('fullName', short_name(pitcher_team)),
                'signal_score':  pitcher_quality + stuff,
                'details': {
                    'pitcher_name':     pitcher_info.get('fullName'),
                    'pitcher_quality':  pitcher_quality,
                    'pitcher_stuff':    stuff,
                    'top_pitch':        top_pitch,
                    'opp_team_ops':     opp_ops,
                },
                'headline': f'{short_name(opp_team_name)} bats · vs {pitcher_info.get("fullName")}',
                'one_liner': f'Strong-offence club, but {pitcher_info.get("fullName")} ({why}) is a real obstacle tonight',
            })

    candidates.sort(key=lambda x: -x['signal_score'])
    return candidates[:3]


def compute_sleepers(games, today):
    """
    Regression-candidate pitchers — ugly ERA, underlying numbers say otherwise.

    Logic:
    - ERA >= 4.50  (looks bad on the surface)
    - AND FIP < 4.00 (true talent is much better)
    - OR facing a bottom-5 offence tonight
    Returns up to 3 pitchers with the largest ERA-FIP gap.
    """
    candidates = []
    for game in games:
        away = game['teams']['away']
        home = game['teams']['home']
        for pitcher_info, team, opp in [
            (away.get('probablePitcher'), away['team']['name'], home['team']['name']),
            (home.get('probablePitcher'), home['team']['name'], away['team']['name']),
        ]:
            if not pitcher_info:
                continue
            pid = pitcher_info.get('id')
            name = pitcher_info.get('fullName')
            if not pid:
                continue

            pstats = get_pitcher_stats(pid)
            if not pstats:
                continue

            era = float(pstats.get('era')) if pstats.get('era') else None
            fip = float(pstats.get('fip')) if pstats.get('fip') else None
            if era is None or fip is None:
                continue

            gap = era - fip   # positive = positive regression candidate
            opp_stats = get_team_stats(opp)
            opp_rpg = float(opp_stats.get('runs_per_game_l30')) if opp_stats and opp_stats.get('runs_per_game_l30') else 4.5

           # Sleeper if: meaningful era-fip gap OR facing weak offence
            # Looser than V1 to ensure soft-launch sections populate.
            # Quality bar still meaningful — not just any pitcher qualifies.
            is_regression = era >= 4.20 and fip < 4.20 and gap >= 0.6
            is_easy_spot  = opp_rpg < 4.1

            if not (is_regression or is_easy_spot):
                continue

            # Reason text
            if is_regression and is_easy_spot:
                reason = f'{era:.2f} ERA hides a {fip:.2f} FIP, and {short_name(opp)} are weak offensively'
                signal = 50 + gap * 10 + (4.5 - opp_rpg) * 5
            elif is_regression:
                reason = f'{era:.2f} ERA but {fip:.2f} FIP — regression incoming'
                signal = 50 + gap * 12
            else:
                reason = f'{short_name(opp)} averaging just {opp_rpg:.1f} runs/game over last 30'
                signal = 50 + (4.5 - opp_rpg) * 12

            candidates.append({
                'game_pk':       game['gamePk'],
                'game_slug':     slugify_game(away['team']['name'], home['team']['name'], today),
                'game_time':     format_uk_time(game['gameDate']),
                'player_id':     pid,
                'player_name':   name,
                'team_name':     short_name(team),
                'opponent_name': short_name(opp),
                'signal_score':  round(signal),
                'details': {
                    'era':            era,
                    'fip':            fip,
                    'gap':            round(gap, 2),
                    'opp_rpg':        opp_rpg,
                    'regression':     is_regression,
                    'easy_matchup':   is_easy_spot,
                },
                'headline':  f'{name} · {short_name(team)} vs {short_name(opp)}',
                'one_liner': reason,
            })

    candidates.sort(key=lambda x: -x['signal_score'])
    return candidates[:3]


# ─── Persist ─────────────────────────────────────────────────────────────────
def save_picks(today, pick_type, picks):
    """Replace today's picks of this type."""
    # Clear existing
    supabase.table('daily_fantasy_picks')\
        .delete()\
        .eq('game_date', today)\
        .eq('pick_type', pick_type).execute()

    rows = []
    for i, p in enumerate(picks):
        rows.append({
            'game_date':     today,
            'pick_type':     pick_type,
            'rank':          i + 1,
            'player_id':     p.get('player_id'),
            'player_name':   p['player_name'],
            'team_name':     p.get('team_name'),
            'opponent_name': p.get('opponent_name'),
            'game_pk':       p.get('game_pk'),
            'game_slug':     p.get('game_slug'),
            'game_time':     p.get('game_time'),
            'details':       p.get('details', {}),
            'headline':      p['headline'],
            'one_liner':     p['one_liner'],
            'signal_score':  p.get('signal_score'),
        })

    if rows:
        supabase.table('daily_fantasy_picks').insert(rows).execute()

    print(f'  Saved {len(rows)} {pick_type} pick(s)')


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    today = datetime.utcnow().strftime('%Y-%m-%d')
    print(f'Computing fantasy picks for {today}')

    print('\nFetching today\'s games...')
    games = fetch_schedule(today)
    print(f'Found {len(games)} games')

    games_by_pk = {g['gamePk']: g for g in games}

    print('\n[1/4] Computing streamers...')
    streamers = compute_streamers(games, today)
    save_picks(today, 'streamer', streamers)

    print('\n[2/4] Computing movers...')
    movers_raw = compute_movers(today)
    movers = enrich_movers(movers_raw, games_by_pk, today)
    save_picks(today, 'mover', movers)

    print('\n[3/4] Computing fallers...')
    fallers = compute_fallers(games, today)
    save_picks(today, 'faller', fallers)

    print('\n[4/4] Computing sleepers...')
    sleepers = compute_sleepers(games, today)
    save_picks(today, 'sleeper', sleepers)

    print(f'\n✓ Done — {len(streamers)} streamers, {len(movers)} movers, {len(fallers)} fallers, {len(sleepers)} sleepers')


if __name__ == '__main__':
    main()