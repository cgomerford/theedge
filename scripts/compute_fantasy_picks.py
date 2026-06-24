"""
scripts/compute_fantasy_picks.py

Computes the seven pick types for the /fantasy page:
  - Streamers (best pitchers to stream tonight)
  - Movers   (games where edge_score swung sharply since first snapshot)
  - Fallers  (elite pitchers who are tough matchups for opposing fantasy hitters)
  - Sleepers (regression candidates with hidden value)
  - Coolers  (batters/pitchers fading off a recent strong stretch)
  - Risers   (batters/pitchers rebounding off a recent weak stretch)
  - Prospects (AAA hitters heating up — same mechanism, heating-only, see below)

Writes ~30 rows total to `daily_fantasy_picks` (3 per type x 4 types, up to 6
each for cooler/riser split across batters/pitchers, up to 6 for prospects).

Runs once per day at ~11:00 UTC (after the 10:00 predictions cron and snapshot).
This is the single source of truth for the /fantasy page — the page just SELECTs
from this table, never recomputes.

CHEAP: ~30-60 seconds total. No Statcast pulls, no per-player game-log fetches.
Pure DB read + aggregate — INCLUDING the new cooler/riser types, which read
from `player_form_signals` (populated separately, see scripts/fetch_player_form.py).
That script is the slow one (one game-log API call per player in the pool);
keeping it out of this file is what keeps this file's runtime budget intact.

BACKGROUND ON COOLERS/RISERS:
The original idea here was a head-and-shoulders chart pattern — see
scripts/backtest_head_and_shoulders.py. That backtest killed it: 1 qualifying
shape in 25 qualified hitters over a full season, and that one instance didn't
even confirm. What the SAME backtest validated instead was the boring version:
any local peak in rolling OPS tends to give some back (54% of 221 peaks
regressed, mean -0.028 OPS). Coolers/risers ship that simpler, validated
mechanism. The riser (rebound) side is the same mechanism mirrored, not
separately backtested — treat it as a reasonable bet, not a proven one.

PROSPECTS reuse the exact same detector and batter thresholds, just pointed
at the AAA pool (sportId 11) instead of MLB — see fetch_player_form.py's
scan_milb_prospects(). Heating-only: a cooling AAA hitter isn't an actionable
pickup signal. This is "good recent AAA form," not a scouting grade — there's
no prospect-ranking data source wired in here, and the copy should never
imply there is.

FIXES applied (June 1 2026):
  1. Faller scores normalised to 0-100 (was pitcher_quality + stuff = up to 200)
  2. Fallers show elite PITCHER name, not opposing team name
  3. Park factor uses real venue data (was hardcoded at 55)
  4. save_picks() uses upsert, not delete-then-insert
"""
import os
import sys
import requests
from datetime import datetime, timedelta
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ─── Constants (mirrors src/lib/streamer.ts) ─────────────────────────────────
LEAGUE_AVG_FIP = 4.20
LEAGUE_AVG_K9  = 8.8
LEAGUE_AVG_BB9 = 3.1
LEAGUE_AVG_WRC = 100
LEAGUE_AVG_RPG = 4.5


# ─── FIX 3: Park factors (3yr run factor) ────────────────────────────────────
# Source: same data as scripts/backtest_edge.py + park_factors table
# Values > 1.0 = hitter-friendly, < 1.0 = pitcher-friendly
PARK_FACTORS = {
    'Coors Field': 1.18,
    'Great American Ball Park': 1.10,
    'Yankee Stadium': 1.07,
    'Globe Life Field': 1.06,
    'Citizens Bank Park': 1.05,
    'Wrigley Field': 1.04,
    'Fenway Park': 1.04,
    'Truist Park': 1.02,
    'Chase Field': 1.02,
    'Rogers Centre': 1.01,
    'PNC Park': 1.01,
    'Minute Maid Park': 1.00,
    'Target Field': 1.00,
    'Citi Field': 0.99,
    'American Family Field': 0.99,
    'Nationals Park': 0.99,
    'Camden Yards': 0.98,
    'Busch Stadium': 0.98,
    'Comerica Park': 0.97,
    'Progressive Field': 0.97,
    'Angel Stadium': 0.96,
    'Kauffman Stadium': 0.96,
    'Dodger Stadium': 0.95,
    'Sutter Health Park': 0.95,
    'Petco Park': 0.94,
    'Oracle Park': 0.92,
    'T-Mobile Park': 0.92,
    'Tropicana Field': 0.93,
    'loanDepot park': 0.95,
    'Guaranteed Rate Field': 1.01,
}


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


def _dedup_candidates(candidates):
    """Remove duplicate pitchers within a single pick type's candidate list."""
    seen = set()
    out = []
    for c in candidates:
        pid = c.get('player_id')
        if pid is None:
            out.append(c)          # no id to key on — include but don't track
        elif pid not in seen:
            out.append(c)
            seen.add(pid)
    return out


def get_park_score(venue_name):
    """
    FIX 3: Convert venue run_factor to a 0-100 pitcher-friendliness score.
    50 = neutral (run_factor 1.00)
    Higher = better for pitchers (low run_factor)
    Lower = worse for pitchers (high run_factor, e.g. Coors)

    Formula: park_score = clamp(50 + (1.0 - run_factor) * 180)
    Examples:
      Coors (1.18):  50 + (1.0 - 1.18) * 180 = 50 - 32.4 = 17.6 → 18
      Petco (0.94):  50 + (1.0 - 0.94) * 180 = 50 + 10.8 = 60.8 → 61
      Neutral (1.0): 50 + 0 = 50
    """
    run_factor = PARK_FACTORS.get(venue_name, 1.0)
    return round(clamp(50 + (1.0 - run_factor) * 180))


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


def score_opponent_strength(stats):
    """
    For fallers: how dangerous is the opposing lineup?
    Higher = stronger offence = bigger faller signal.
    0-100 scale. 50 = league average.
    """
    if not stats:
        return 50
    ops = float(stats.get('ops_l30')) if stats.get('ops_l30') is not None else None
    rpg = float(stats.get('runs_per_game_l30')) if stats.get('runs_per_game_l30') is not None else None
    wrc = float(stats.get('wrc_plus')) if stats.get('wrc_plus') is not None else None

    if wrc is not None:
        return round(clamp(50 + ((wrc - LEAGUE_AVG_WRC) / LEAGUE_AVG_WRC) * 80))
    if ops is not None:
        return round(clamp(50 + ((ops - 0.730) / 0.730) * 100))
    if rpg is not None:
        return round(clamp(50 + ((rpg - LEAGUE_AVG_RPG) / LEAGUE_AVG_RPG) * 80))
    return 50


# ─── Helpers to load related data ────────────────────────────────────────────
def fetch_schedule(date_str):
    """Pull today's games from MLB Stats API."""
    url = f'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date={date_str}&hydrate=probablePitcher'
    r = requests.get(url, timeout=15)
    games = []
    for d in r.json().get('dates', []):
        for g in d.get('games', []):
            if g.get('status', {}).get('codedGameState') in {'S', 'P'}:
                games.append(g)
    return games


def get_pitcher_stats(pid):
    """Try the pitcher_stats table first; return None if not present."""
    resp = supabase.table('pitcher_stats').select('*').eq('player_id', pid).execute()
    return resp.data[0] if resp.data else None


def get_team_stats(team_name):
    """Try team_stats by full name, then by short name."""
    resp = supabase.table('team_stats').select('*').eq('team_name', team_name).execute()
    if resp.data:
        return resp.data[0]
    resp2 = supabase.table('team_stats').select('*').ilike('team_name', f'%{short_name(team_name)}%').execute()
    return resp2.data[0] if resp2.data else None


def get_pitch_mix(pid):
    """Fetch pitch arsenal from pitch_arsenals table."""
    resp = supabase.table('pitch_arsenals').select('*').eq('player_id', pid).execute()
    return resp.data if resp.data else None


def project_pitcher_line(pstats, opponent_score, park_score):
    """
    Real per-start projection for tonight, used by Platform Scoring.
    Previously that table had no real projection at all — every pitcher fell
    through to the same hardcoded (6 IP, 7 K, 2 ER, 2 BB) defaults because
    compute_streamers()'s details dict never had proj_* keys, so every row
    scored identically. This is what actually feeds it now.

    proj_ip:  season_ip_pace if present (already a recent per-start pace),
              else innings_pitched/starts, else a league-average default.
    proj_k:   proj_ip scaled by the pitcher's own k_per_9 (already used
              elsewhere in this file) — falls back to league average.
    proj_bb:  same idea, bb_per_9.
    proj_er:  season ERA scaled to proj_ip, then adjusted by tonight's
              opponent/park scores (already computed for the streamer score
              itself, so this reuses real signal rather than inventing a
              second, disconnected projection).
    """
    if not pstats:
        pstats = {}

    ip_pace = pstats.get('season_ip_pace')
    starts = pstats.get('starts') or 0
    innings = pstats.get('innings_pitched')
    if ip_pace:
        proj_ip = float(ip_pace)
    elif innings and starts:
        proj_ip = float(innings) / float(starts)
    else:
        proj_ip = 5.5
    proj_ip = clamp(proj_ip, 3.0, 7.5)

    k9 = float(pstats['k_per_9']) if pstats.get('k_per_9') else LEAGUE_AVG_K9
    bb9 = float(pstats['bb_per_9']) if pstats.get('bb_per_9') else LEAGUE_AVG_BB9
    era = float(pstats['era']) if pstats.get('era') else LEAGUE_AVG_FIP

    proj_k = proj_ip * (k9 / 9)
    proj_bb = proj_ip * (bb9 / 9)

    base_er = proj_ip * (era / 9)
    # opponent/park are already 0-100 "good for the pitcher" scores; 50 = neutral.
    # Adjustment is intentionally mild (capped 0.7-1.3x) — this nudges a real
    # season ERA toward tonight's matchup, it doesn't override it.
    matchup_adj = clamp(1 - ((opponent_score - 50) + (park_score - 50)) / 300, 0.7, 1.3)
    proj_er = base_er * matchup_adj

    return {
        'proj_ip': round(proj_ip, 1),
        'proj_k': round(proj_k, 1),
        'proj_er': round(proj_er, 1),
        'proj_bb': round(proj_bb, 1),
    }


# ─── Compute: Streamers ─────────────────────────────────────────────────────
def compute_streamers(games, today):
    """
    Best pitchers to stream tonight.
    Score = quality*0.40 + opponent*0.30 + park*0.15 + stuff*0.15
    FIX 3: Park now uses real venue data instead of hardcoded 55.
    """
    candidates = []
    for game in games:
        away = game['teams']['away']
        home = game['teams']['home']
        venue_name = game.get('venue', {}).get('name', '')
        park = get_park_score(venue_name)  # FIX 3: real park data

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
            projection = project_pitcher_line(pstats, opponent, park)

            score = round(quality * 0.40 + opponent * 0.30 + park * 0.15 + stuff * 0.15)
            tier  = 'strong' if score >= 70 else 'viable' if score >= 55 else 'avoid'

            if tier == 'avoid':
                continue

            era = pstats.get('era') if pstats else None
            k9  = pstats.get('k_per_9') if pstats else None

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
                    'tier':            tier,
                    'top_pitch':       top_pitch,
                    'era':             era,
                    'k_per_9':         k9,
                    'pitcher_quality': quality,   # renamed from 'quality' for consistency
                    'opponent':        opponent,
                    'stuff':           stuff,
                    'park':            park,
                    'venue':           venue_name,
                    **projection,      # proj_ip, proj_k, proj_er, proj_bb — what Platform Scoring actually reads
                },
                'headline':  f'{name} · {short_name(team_side)} vs {short_name(opponent_team)}',
                'one_liner': one_liner,
            })

    candidates = _dedup_candidates(candidates)
    candidates.sort(key=lambda x: -x['signal_score'])
    return candidates[:3]


# ─── Compute: Movers ─────────────────────────────────────────────────────────
def compute_movers(today):
    """Top 3 games where edge_score swung sharply during the day."""
    resp = supabase.table('prediction_history')\
        .select('game_pk, edge_score, predicted_winner, snapshot_at')\
        .eq('game_date', today).order('snapshot_at').execute()

    if not resp.data:
        return []

    by_game = {}
    for row in resp.data:
        gp = row['game_pk']
        if gp not in by_game:
            by_game[gp] = {'first': row, 'last': row}
        else:
            by_game[gp]['last'] = row

    movers = []
    for gp, snaps in by_game.items():
        first_score = float(snaps['first']['edge_score'])
        last_score  = float(snaps['last']['edge_score'])
        swing       = last_score - first_score
        if abs(swing) < 8:
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

        if m['direction'] == 'up':
            mover_team = home
        else:
            mover_team = away

        out.append({
            'game_pk':       m['game_pk'],
            'game_slug':     slugify_game(away, home, today),
            'game_time':     format_uk_time(game['gameDate']),
            'player_name':   short_name(mover_team),
            'team_name':     short_name(mover_team),
            'opponent_name': short_name(away if mover_team == home else home),
            'signal_score':  m['swing'],
            'details': {
                'prev_score':     m['previous_score'],   # enables ▲/▼ pills
                'current_score':  m['current_score'],
                'swing':          m['swing'],
                'direction':      m['direction'],
            },
            'headline':  f'{short_name(mover_team)} · {short_name(away)} at {short_name(home)}',
            'one_liner': f"Edge {'strengthened' if m['direction'] == 'up' else 'weakened'} "
                         f"by {abs(m['swing']):.0f} points since this morning",
        })
    return out


# ─── FIX 1 + FIX 2: Compute Fallers ─────────────────────────────────────────
def compute_fallers(games, today):
    """
    Elite pitchers who represent tough matchups for opposing fantasy hitters.

    FIXES:
    - FIX 1: Score normalised to 0-100 using weighted average (was quality + stuff = up to 200)
    - FIX 2: player_name is now the ELITE PITCHER, not the opposing team
             The card reads: "Zack Wheeler · Phillies vs Diamondbacks"
             One-liner explains why opposing hitters should be benched.
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
            pitcher_name = pitcher_info.get('fullName')
            if not pid or not pitcher_name:
                continue

            pstats = get_pitcher_stats(pid)
            opp_stats = get_team_stats(opp_team_name)
            mix = get_pitch_mix(pid)

            pitcher_quality = score_pitcher_quality(pstats)
            stuff, top_pitch = score_stuff(mix)
            opp_strength = score_opponent_strength(opp_stats)

            # Only flag if pitcher is genuinely elite
            if pitcher_quality < 65 and stuff < 65:
                continue

            # Only flag if the opposing team has real offensive talent
            opp_ops = float(opp_stats.get('ops_l30')) if opp_stats and opp_stats.get('ops_l30') is not None else None
            if opp_ops is None or opp_ops < 0.720:
                continue

            # FIX 1: Normalised score — weighted average, clamped 0-100
            # Higher = tougher matchup for opposing hitters (which is what we want to flag)
            score = round(clamp(
                pitcher_quality * 0.45 +
                stuff * 0.30 +
                opp_strength * 0.25    # stronger offence = bigger deal that they face this arm
            ))

            era = pstats.get('era') if pstats else None

            # Build one-liner explaining the sit recommendation
            why_parts = []
            if era:
                why_parts.append(f'{float(era):.2f} ERA')
            if top_pitch and stuff >= 65:
                why_parts.append(top_pitch)
            why = ', '.join(why_parts) if why_parts else 'elite arm'

            # Card subject is WHO needs the action — the opposing team's bats.
            # Pitcher name lives in details + one_liner as the *threat*, not the subject.
            opp_short = short_name(opp_team_name)
            candidates.append({
                'game_pk':       game['gamePk'],
                'game_slug':     slugify_game(away['team']['name'], home['team']['name'], today),
                'game_time':     format_uk_time(game['gameDate']),
                'player_id':     pid,                            # pitcher id (for dedup + game link)
                'player_name':   f'{opp_short} Bats',            # who you sit
                'team_name':     opp_short,                      # bats' team
                'opponent_name': pitcher_name,                   # who they face
                'signal_score':  score,
                'details': {
                    'pitcher_name':     pitcher_name,
                    'pitcher_team':     short_name(pitcher_team),
                    'pitcher_quality':  pitcher_quality,
                    'stuff':            stuff,
                    'opp_strength':     opp_strength,
                    'top_pitch':        top_pitch,
                    'opp_team_ops':     opp_ops,
                },
                'headline':  f'{opp_short} bats · vs {pitcher_name}',
                'one_liner': f'{pitcher_name} ({why}) — bench your {opp_short} bats tonight',
            })

    candidates = _dedup_candidates(candidates)
    candidates.sort(key=lambda x: -x['signal_score'])
    return candidates[:3]


# ─── Compute: Sleepers ───────────────────────────────────────────────────────
def compute_sleepers(games, today):
    """
    Regression-candidate pitchers — ugly ERA, underlying numbers say otherwise.
    Signal score clamped to 0-100.
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
            if not pid or not name:
                continue

            pstats = get_pitcher_stats(pid)
            if not pstats:
                continue

            era = float(pstats.get('era')) if pstats.get('era') else None
            fip = float(pstats.get('fip')) if pstats.get('fip') else None
            if era is None or fip is None:
                continue

            gap = era - fip

            opp_stats = get_team_stats(opp)
            opp_rpg = float(opp_stats.get('runs_per_game_l30')) if opp_stats and opp_stats.get('runs_per_game_l30') else LEAGUE_AVG_RPG

            is_regression = era >= 4.20 and fip < 4.20 and gap >= 0.6
            is_easy_spot  = opp_rpg < 4.1

            if not (is_regression or is_easy_spot):
                continue

            # Normalised to 0-100 scale with clamp
            if is_regression and is_easy_spot:
                reason = f'{era:.2f} ERA hides a {fip:.2f} FIP, and {short_name(opp)} are weak offensively'
                signal = clamp(50 + gap * 10 + (4.5 - opp_rpg) * 5)
            elif is_regression:
                reason = f'{era:.2f} ERA but {fip:.2f} FIP — regression incoming'
                signal = clamp(50 + gap * 12)
            else:
                reason = f'{short_name(opp)} averaging just {opp_rpg:.1f} runs/game over last 30'
                signal = clamp(50 + (4.5 - opp_rpg) * 12)

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

    candidates = _dedup_candidates(candidates)
    candidates.sort(key=lambda x: -x['signal_score'])
    return candidates[:3]


# ─── NEW: Compute Coolers / Risers ───────────────────────────────────────────
def get_latest_form_date(today):
    """
    fetch_player_form.py runs on its own schedule and may not have a row for
    `today` yet (or ever, if it failed). Fall back to the most recent date
    available, same spirit as the yesterday-fallback in src/lib/fantasy.ts.
    """
    resp = supabase.table('player_form_signals')\
        .select('computed_date')\
        .lte('computed_date', today)\
        .order('computed_date', desc=True)\
        .limit(1).execute()
    return resp.data[0]['computed_date'] if resp.data else None


def _form_one_liner(row):
    pt = row['player_type']
    cur, ext = float(row['current_value']), float(row['extreme_value'])
    if pt == 'batter':
        if row['signal'] == 'cooling':
            return f"Rolling OPS down to {cur:.3f} from a recent high of {ext:.3f} — sell while it's still warm"
        return f"Rolling OPS up to {cur:.3f} from a recent low of {ext:.3f} — buy before it shows up in the box score"
    else:
        if row['signal'] == 'cooling':
            return f"Rolling ERA up to {cur:.2f} from a {ext:.2f} stretch — last start was better than what's coming"
        return f"Rolling ERA down to {cur:.2f} from a {ext:.2f} stretch — buy-low window before results catch up to form"


def compute_form_picks(today, signal_type):
    """
    signal_type: 'cooling' (-> 'cooler' picks) or 'heating' (-> 'riser' picks).
    Queries batters and pitchers SEPARATELY (top 3 each, so up to 6 rows) —
    a single combined top-3-by-magnitude query could (and on a real run did)
    return all batters and zero pitchers on a given day, which doesn't match
    "batters trending + pitchers trending" as two distinct sections.
    Cheap SELECT against player_form_signals — see scripts/fetch_player_form.py
    for how that table gets populated and why this is a separate script.
    """
    form_date = get_latest_form_date(today)
    if not form_date:
        return []

    out = []
    for player_type in ('batter', 'pitcher'):
        resp = supabase.table('player_form_signals')\
            .select('*')\
            .eq('computed_date', form_date)\
            .eq('signal', signal_type)\
            .eq('player_type', player_type)\
            .order('magnitude', desc=True)\
            .limit(3).execute()
        for row in resp.data or []:
            out.append({
                'game_pk': None, 'game_slug': None, 'game_time': None,
                'player_id':     row['player_id'],
                'player_name':   row['player_name'],
                'team_name':     row.get('team_name'),
                'opponent_name': None,
                'signal_score':  round(float(row['magnitude']), 3),
                'details': {
                    'player_type':   row['player_type'],
                    'current_value': row['current_value'],
                    'extreme_value': row['extreme_value'],
                    'trend':         row['trend'],
                    'form_date':     form_date,
                },
                'headline':  f"{row['player_name']} · {row.get('team_name') or ''}".strip(' ·'),
                'one_liner': _form_one_liner(row),
            })
    return out


def compute_coolers(today):
    return compute_form_picks(today, 'cooling')


def compute_risers(today):
    return compute_form_picks(today, 'heating')


def compute_prospects(today):
    """
    Top AAA hitters currently heating up — same form-trend mechanism as
    coolers/risers, pointed at scripts/fetch_player_form.py's AAA scan.
    Heating-only by design (see that script for why). NOT a scouting grade —
    just "good recent form in the high minors." one_liner below should never
    imply more certainty than that.
    """
    form_date = get_latest_form_date(today)
    if not form_date:
        return []

    resp = supabase.table('player_form_signals')\
        .select('*')\
        .eq('computed_date', form_date)\
        .eq('signal', 'heating')\
        .eq('player_type', 'milb_batter')\
        .order('magnitude', desc=True)\
        .limit(6).execute()

    out = []
    for row in resp.data or []:
        cur, ext = float(row['current_value']), float(row['extreme_value'])
        out.append({
            'game_pk': None, 'game_slug': None, 'game_time': None,
            'player_id':     row['player_id'],
            'player_name':   row['player_name'],
            'team_name':     row.get('team_name'),
            'opponent_name': None,
            'signal_score':  round(float(row['magnitude']), 3),
            'details': {
                'player_type':   'milb_batter',
                'current_value': row['current_value'],
                'extreme_value': row['extreme_value'],
                'trend':         row['trend'],
                'form_date':     form_date,
            },
            'headline':  f"{row['player_name']} · {row.get('team_name') or ''} (AAA)".strip(' ·'),
            'one_liner': f"Rolling OPS up to {cur:.3f} from a recent low of {ext:.3f} in Triple-A — "
                         f"good recent form, not a scouting grade.",
        })
    return out


# ─── FIX 4: Upsert instead of delete-then-insert ────────────────────────────
def save_picks(today, pick_type, picks):
    """
    Upsert today's picks of this type.
    Requires unique constraint: (game_date, pick_type, rank)
    Run the migration SQL first: migration_fantasy_upsert.sql
    """
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
        try:
            supabase.table('daily_fantasy_picks').upsert(
                rows,
                on_conflict='game_date,pick_type,rank'
            ).execute()
            print(f'  Saved {len(rows)} {pick_type} pick(s)')
        except Exception as e:
            print(f'  ERROR saving {pick_type}: {e}')
            # Fallback: try delete-then-insert if upsert fails
            # (e.g. if migration hasn't been run yet)
            print(f'  Falling back to delete+insert...')
            try:
                supabase.table('daily_fantasy_picks')\
                    .delete()\
                    .eq('game_date', today)\
                    .eq('pick_type', pick_type).execute()
                supabase.table('daily_fantasy_picks').insert(rows).execute()
                print(f'  Fallback succeeded — {len(rows)} {pick_type} pick(s)')
            except Exception as e2:
                print(f'  FALLBACK ALSO FAILED: {e2}')
    else:
        print(f'  No {pick_type} picks today')


def deduplicate(streamers, movers, fallers, sleepers, coolers, risers):
    """
    A player should only appear in one pick type per day.
    Priority order: streamer > faller > sleeper > cooler > riser
    (existing baseball-specific calls beat the new, less-validated trend signal —
    e.g. a pitcher already flagged as a sleeper on ERA-vs-FIP shouldn't also
    show up as a cooler/riser on rolling ERA, that's the same idea said twice.)
    Movers are game-level (no player_id) so they're excluded from dedup.
    """
    seen_pids = set()

    def filter_picks(picks):
        out = []
        for p in picks:
            pid = p.get('player_id')
            if pid is None or pid not in seen_pids:
                out.append(p)
                if pid is not None:
                    seen_pids.add(pid)
        return out

    streamers_clean = filter_picks(streamers)
    seen_pids.update(p['player_id'] for p in streamers_clean if p.get('player_id'))

    fallers_clean = filter_picks(fallers)
    seen_pids.update(p['player_id'] for p in fallers_clean if p.get('player_id'))

    sleepers_clean = filter_picks(sleepers)
    seen_pids.update(p['player_id'] for p in sleepers_clean if p.get('player_id'))

    coolers_clean = filter_picks(coolers)
    seen_pids.update(p['player_id'] for p in coolers_clean if p.get('player_id'))

    risers_clean = filter_picks(risers)

    return streamers_clean, fallers_clean, sleepers_clean, coolers_clean, risers_clean


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    today = datetime.utcnow().strftime('%Y-%m-%d')
    print(f'Computing fantasy picks for {today}')

    print('\nFetching today\'s games...')
    games = fetch_schedule(today)
    print(f'Found {len(games)} games')

    games_by_pk = {g['gamePk']: g for g in games}

    print('\n[1/7] Computing streamers...')
    streamers = compute_streamers(games, today)

    print('\n[2/7] Computing movers...')
    movers_raw = compute_movers(today)
    movers = enrich_movers(movers_raw, games_by_pk, today)

    print('\n[3/7] Computing fallers...')
    fallers = compute_fallers(games, today)

    print('\n[4/7] Computing sleepers...')
    sleepers = compute_sleepers(games, today)

    print('\n[5/7] Computing coolers (peak-fade)...')
    coolers = compute_coolers(today)

    print('\n[6/7] Computing risers (trough-rebound)...')
    risers = compute_risers(today)

    print('\n[7/7] Computing prospects (AAA heating up)...')
    prospects = compute_prospects(today)

    print('\nDeduplicating across pick types...')
    streamers, fallers, sleepers, coolers, risers = deduplicate(
        streamers, movers, fallers, sleepers, coolers, risers)

    save_picks(today, 'streamer', streamers)
    save_picks(today, 'mover', movers)
    save_picks(today, 'faller', fallers)
    save_picks(today, 'sleeper', sleepers)
    save_picks(today, 'cooler', coolers)
    save_picks(today, 'riser', risers)
    save_picks(today, 'prospect', prospects)

    print(f'\n✓ Done — {len(streamers)} streamers, {len(movers)} movers, '
          f'{len(fallers)} fallers, {len(sleepers)} sleepers, '
          f'{len(coolers)} coolers, {len(risers)} risers, {len(prospects)} prospects')


if __name__ == '__main__':
    main()