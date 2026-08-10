#!/usr/bin/env python3
"""
scripts/fetch_player_form.py

Populates `player_form_signals` — the table behind the 'cooler' and 'riser'
picks on /fantasy, and the Scout Report's batter streak board. This is the
validated-but-honest version of the original head-and-shoulders idea:
backtest_head_and_shoulders.py killed the three-peak pattern (too rare — 1
in 25 qualified hitters over a full season — and the one instance didn't
even confirm). What DID show signal in that same run was the boring
version: any local peak in rolling OPS tends to give some back (54% of 221
peaks regressed, mean -0.028 OPS). This script ships that.

IMPORTANT — VALIDATION SCOPE: the 54%-regression backtest was run ONLY
against rolling OPS. AVG and SLG use the exact same peak/trough detection
machinery (REVISION NOTE 5 below), which is structurally sound, but that
specific empirical claim has NOT been re-run against AVG or SLG series.
Treat AVG/SLG 'validated' rows as "a real, isolated local peak/trough by
the same rigorous definition as the OPS ones" — NOT as "backed by the same
54%-regression evidence." Only OPS carries that specific claim. If someone
runs the AVG/SLG equivalent of the backtest later, update this note.

NOT validated the same way either: the trough/rebound side of ANY metric
(mirror-image logic, same mechanism — regression to the mean cuts both
directions — but only the OPS fade side was actually backtested). Treat
'heating' picks as a reasonable bet, not a proven one.

WHY THIS IS A SEPARATE SCRIPT, not folded into compute_fantasy_picks.py:
That script is cheap (~30-60s) because it never fetches per-player game logs.
This script does — one gameLog call per player in the pool — so it's slower
and belongs on its own schedule, not in the same fast path as the daily picks.

POOL: top hitters by plate appearances + top starters by games started, for
the current season. Not scoped to tonight's slate — lineups aren't posted
until a few hours before first pitch, well after this needs to run.

REVISION NOTE: the first version of this script flagged ~99% of both pools
on a real run. The cause: detect_current_state only checked the trailing
10-window's max/min against today, not a real isolated peak/trough — which a
plain random walk satisfies almost automatically (confirmed at 96% on pure
synthetic noise). Fixed by reusing the SAME globally-pruned extrema finder
the backtest used (minimum spacing enforced across the whole season, not
just a trailing slice), then only flagging when the most recent such extremum
is recent. Re-tuned against synthetic noise to land near a 15-20% pool flag
rate — config below reflects that, not the original backtest's constants.

REVISION NOTE 2: the first live run also found 0 pitcher signals (vs 47
batter signals) because MIN_PEAK_DISTANCE_PITCHER=6 required series_len>=17,
which needs 21+ starts — nobody clears that mid-season (a 5-man rotation
starter has ~16 starts by late June). Retuned to MIN_PEAK_DISTANCE_PITCHER=3
/ MIN_PROMINENCE_ERA=1.8, fits series_len>=11 (~15 starts), re-confirmed
against noise (~20% fire rate) and the genuine fade/rebound test cases.

Also fixed in the same pass: save_signals() was upsert-only, which silently
left stale rows in the table from an earlier same-day run when a later run
found fewer or different qualifying players (exactly what happened with the
89 leftover pitcher rows above). Now deletes today's rows before writing.

REVISION NOTE 3: adding the AAA scan (player_type='milb_batter') broke the
live table's CHECK constraint, which only allowed ('batter','pitcher') — see
migration_player_form_signals_add_milb.sql. Worse: because the old
save_signals() did one single insert for all rows together, the constraint
violation killed the WHOLE batch — batter and pitcher rows that would have
saved fine were lost too, and the final "✓ Done" message still printed a
success count based on what was COMPUTED, not what actually SAVED. Split
into clear_today() + save_signals_batch() per player type, so one bad batch
can't sink the others, and the final line now reports real saved counts.

REVISION NOTE 4 (2026-08-09, superseded by NOTE 5 below): first pass at
guaranteeing a minimum per team padded the SAME metric (OPS) with a lower-
confidence "trending vs season median" tier. Replaced same day per product
direction: instead of 3x OPS-flavoured rows, show 1 OPS + 1 AVG + 1 SLG per
team — genuinely different information per row, not three confidence tiers
of the same one.

REVISION NOTE 5 (2026-08-09): scan_batters() now runs the SAME validated
peak/trough detector independently against three series per batter — rolling
OPS, rolling AVG, rolling SLG — and picks the strongest validated pick per
team per metric. If a team has no validated peak/trough for a given metric,
falls back to a lower-confidence "current vs season median" comparison for
that metric only (signal_quality='trending'), so every team gets 1 OPS + 1
AVG + 1 SLG row whenever the underlying batter pool supports it. See the
VALIDATION SCOPE note above for what "validated" does and doesn't mean per
metric. Also added AVG/RBI/runs/walks as display context on every row
(same trailing window, no new API calls — fields already came back from the
gameLog endpoint and just weren't read out before).

USAGE
  python3 scripts/fetch_player_form.py --season 2026 --hitter-limit 150 --pitcher-limit 90 --milb-limit 80

RUNTIME: budget several minutes for the full pool (one API call per player).
Run once a day, not on every cron tick — e.g. alongside the existing
05:00 UTC stats refresh, not the 10:00/11:00 prediction/picks crons.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from statistics import median

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
supabase = None  # created lazily in main() so this module stays importable/testable without env vars


# ─── Config — retuned against synthetic noise, see REVISION NOTE above ──────
# Each metric's (min_distance, prominence, recency_max) was picked to land
# near a 15-20% flag rate on pure noise — see the test transcript for the
# exact numbers; these aren't arbitrary, but they're also not sacred. If
# real-world flag rates come back very different from ~15-20% of the pool,
# that's the first thing to revisit.
ROLLING_WINDOW_BATTER = 15      # games
ROLLING_WINDOW_PITCHER = 5      # starts — widened from 3; a 3-start ERA window was too noisy to ever settle down
MIN_PEAK_DISTANCE_BATTER = 12    # rolling-windows between two extrema, batters
MIN_PEAK_DISTANCE_PITCHER = 3    # retuned for mid-season reality: ~16 starts -> series_len 12. A wider spacing
                                  # (originally 6) needs series_len 17+, which nobody clears until well past the
                                  # All-Star break. This trades some false-positive rate for actually having data.

# Peak/trough prominence thresholds per batting metric. OPS's value (0.05)
# is the one that's actually backtested — see VALIDATION SCOPE note at the
# top of the file. AVG/SLG values below are estimates chosen to be roughly
# proportionate to each metric's typical range (AVG moves in a tighter band
# than OPS; SLG moves in a wider one), NOT independently validated.
MIN_PROMINENCE_OPS = 0.05
MIN_PROMINENCE_AVG = 0.035       # estimate — not backtested, see file header
MIN_PROMINENCE_SLG = 0.065       # estimate — not backtested, see file header
MIN_PROMINENCE_ERA = 1.8         # raised from 1.5 to compensate for the tighter min_distance above

# Trending-fallback thresholds — deliberately lower bar than the validated
# ones above, used ONLY when a team has no validated peak/trough for a given
# metric. Roughly half the validated prominence for each metric.
TREND_FALLBACK_PROMINENCE_OPS = 0.025
TREND_FALLBACK_PROMINENCE_AVG = 0.018
TREND_FALLBACK_PROMINENCE_SLG = 0.032

RECENCY_MIN = 2                  # extreme must be at least this many points back...
RECENCY_MAX_BATTER = 4           # ...and no more than this many (batters)
RECENCY_MAX_PITCHER = 3          # ...and no more than this many (pitchers — noisier metric, narrower window)
TREND_POINTS_SAVED = 8           # how many trailing rolling-window values to store for the sparkline

MILB_AAA_SPORT_ID = 11           # Triple-A, per documented MLB Stats API sportId convention.
                                  # UNVERIFIED: I can't reach statsapi.mlb.com from where I'm working, so
                                  # this hasn't actually been tested against a live response. If the AAA
                                  # scan below returns nothing or errors, this id is the first suspect.
MILB_MIN_PA = 80                 # lower than MLB's 100 — more roster churn (call-ups/demotions) at AAA
MILB_POOL_LIMIT_DEFAULT = 80


def short_name(team_name):
    if not team_name:
        return ''
    parts = team_name.split()
    return parts[-1] if parts else team_name


def parse_innings(ip_str) -> float:
    """MLB's innings-pitched format: '6.1' = 6 and 1/3, '6.2' = 6 and 2/3 (NOT decimal tenths)."""
    if ip_str is None:
        return 0.0
    s = str(ip_str)
    if '.' not in s:
        return float(s)
    whole, outs = s.split('.')
    return int(whole) + int(outs) / 3.0


# ── Step 1: player pool ───────────────────────────────────────────────────────

def fetch_top_hitters(season: int, limit: int, min_pa: int = 100, sport_id: int = 1):
    url = "https://statsapi.mlb.com/api/v1/stats"
    params = {"stats": "season", "group": "hitting", "season": season, "sportId": sport_id,
              "limit": 300, "sortStat": "plateAppearances"}
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    splits = r.json()["stats"][0]["splits"]
    out = []
    for s in splits:
        pa = int(s["stat"].get("plateAppearances", 0) or 0)
        if pa >= min_pa:
            out.append({
                'id': s["player"]["id"],
                'name': s["player"]["fullName"],
                'team': s.get("team", {}).get("name"),
            })
        if len(out) >= limit:
            break
    return out


def fetch_top_pitchers(season: int, limit: int, min_starts: int = 4):
    url = "https://statsapi.mlb.com/api/v1/stats"
    params = {"stats": "season", "group": "pitching", "season": season, "sportId": 1,
              "limit": 300, "sortStat": "gamesStarted"}
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    splits = r.json()["stats"][0]["splits"]
    out = []
    for s in splits:
        gs = int(s["stat"].get("gamesStarted", 0) or 0)
        if gs >= min_starts:
            out.append({
                'id': s["player"]["id"],
                'name': s["player"]["fullName"],
                'team': s.get("team", {}).get("name"),
            })
        if len(out) >= limit:
            break
    return out


# ── Step 2: rolling series ────────────────────────────────────────────────────

def fetch_batter_game_log(player_id: int, season: int, sport_id: int = 1):
    url = f"https://statsapi.mlb.com/api/v1/people/{player_id}/stats"
    params = {"stats": "gameLog", "group": "hitting", "season": season, "sportId": sport_id}
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    splits = r.json()["stats"][0]["splits"]
    games = []
    for s in splits:
        st = s["stat"]
        games.append({
            'date': s.get('date'),
            'ab': int(st.get('atBats', 0) or 0), 'h': int(st.get('hits', 0) or 0),
            '2b': int(st.get('doubles', 0) or 0), '3b': int(st.get('triples', 0) or 0),
            'hr': int(st.get('homeRuns', 0) or 0), 'bb': int(st.get('baseOnBalls', 0) or 0),
            'hbp': int(st.get('hitByPitch', 0) or 0), 'sf': int(st.get('sacFlies', 0) or 0),
            'rbi': int(st.get('rbi', 0) or 0), 'r': int(st.get('runs', 0) or 0),
        })
    games.sort(key=lambda g: g['date'] or '')
    return games


def fetch_pitcher_game_log(player_id: int, season: int):
    url = f"https://statsapi.mlb.com/api/v1/people/{player_id}/stats"
    params = {"stats": "gameLog", "group": "pitching", "season": season}
    r = requests.get(url, params=params, timeout=20)
    r.raise_for_status()
    splits = r.json()["stats"][0]["splits"]
    starts = []
    for s in splits:
        st = s["stat"]
        if not st.get('gamesStarted'):
            continue  # skip relief outings — we're tracking rotation form
        starts.append({
            'date': s.get('date'),
            'er': int(st.get('earnedRuns', 0) or 0),
            'ip': parse_innings(st.get('inningsPitched')),
        })
    starts.sort(key=lambda g: g['date'] or '')
    return starts


def rolling_ops_series(games: list[dict], window: int) -> list[float]:
    out = []
    for i in range(len(games)):
        if i < window - 1:
            continue
        chunk = games[i - window + 1: i + 1]
        ab = sum(g['ab'] for g in chunk); h = sum(g['h'] for g in chunk)
        b2 = sum(g['2b'] for g in chunk); b3 = sum(g['3b'] for g in chunk)
        hr = sum(g['hr'] for g in chunk); bb = sum(g['bb'] for g in chunk)
        hbp = sum(g['hbp'] for g in chunk); sf = sum(g['sf'] for g in chunk)
        tb = h + b2 + 2 * b3 + 3 * hr
        obp_den = ab + bb + hbp + sf
        obp = (h + bb + hbp) / obp_den if obp_den else 0.0
        slg = tb / ab if ab else 0.0
        out.append(round(obp + slg, 4))
    return out


def rolling_avg_series(games: list[dict], window: int) -> list[float]:
    out = []
    for i in range(len(games)):
        if i < window - 1:
            continue
        chunk = games[i - window + 1: i + 1]
        ab = sum(g['ab'] for g in chunk); h = sum(g['h'] for g in chunk)
        out.append(round(h / ab, 4) if ab else 0.0)
    return out


def rolling_slg_series(games: list[dict], window: int) -> list[float]:
    out = []
    for i in range(len(games)):
        if i < window - 1:
            continue
        chunk = games[i - window + 1: i + 1]
        ab = sum(g['ab'] for g in chunk)
        h = sum(g['h'] for g in chunk); b2 = sum(g['2b'] for g in chunk)
        b3 = sum(g['3b'] for g in chunk); hr = sum(g['hr'] for g in chunk)
        tb = h + b2 * 1 + b3 * 2 + hr * 3  # h already counts the single; add extra bases only
        out.append(round(tb / ab, 4) if ab else 0.0)
    return out


def windowed_batting_line(games: list[dict], window: int) -> dict:
    """
    Counting stats (AVG, RBI, runs, walks) over the SAME trailing window used
    for the rolling series above — display context shown on every row
    regardless of which metric (ops/avg/slg) actually drove that row's
    signal. Not computed per-window across the whole series, only for the
    current window (games[-window:]).
    """
    chunk = games[-window:] if len(games) >= window else games
    ab = sum(g['ab'] for g in chunk)
    h = sum(g['h'] for g in chunk)
    bb = sum(g['bb'] for g in chunk)
    rbi = sum(g.get('rbi', 0) for g in chunk)
    r = sum(g.get('r', 0) for g in chunk)
    return {
        'avg': round(h / ab, 3) if ab else 0.0,
        'rbi': rbi,
        'runs': r,
        'walks': bb,
        'games': len(chunk),
    }


def rolling_era_series(starts: list[dict], window: int) -> list[float]:
    out = []
    for i in range(len(starts)):
        if i < window - 1:
            continue
        chunk = starts[i - window + 1: i + 1]
        er = sum(g['er'] for g in chunk)
        ip = sum(g['ip'] for g in chunk)
        era = (er * 9 / ip) if ip > 0 else 99.0
        out.append(round(era, 3))
    return out


# ── Step 3: globally-pruned extrema, then "is the latest one still recent" ──

def find_local_extrema(series: list[float], min_distance: int, min_prominence: float):
    """
    Same algorithm as backtest_head_and_shoulders.py — a local max/min counts
    only if it clears min_prominence against its surrounding min_distance
    window, and two extrema of the same type within min_distance of each
    other are merged (keeping the more extreme one). This is what makes an
    extremum here mean the same thing it meant in the backtest, rather than
    "highest point in whatever window I happened to look at."
    """
    n = len(series)
    cmax, cmin = [], []
    for i in range(1, n - 1):
        if series[i] > series[i - 1] and series[i] >= series[i + 1]:
            cmax.append(i)
        if series[i] < series[i - 1] and series[i] <= series[i + 1]:
            cmin.append(i)

    def filt(idxs, is_max):
        kept = []
        for i in idxs:
            lo, hi = max(0, i - min_distance), min(n, i + min_distance + 1)
            window = series[lo:hi]
            prom = (series[i] - min(window)) if is_max else (max(window) - series[i])
            if prom >= min_prominence:
                kept.append(i)
        kept.sort()
        pruned = []
        for i in kept:
            if pruned and i - pruned[-1] < min_distance:
                if is_max and series[i] > series[pruned[-1]]:
                    pruned[-1] = i
                elif not is_max and series[i] < series[pruned[-1]]:
                    pruned[-1] = i
            else:
                pruned.append(i)
        return pruned

    return filt(cmax, True), filt(cmin, False)


def detect_current_state(series: list[float], higher_is_better: bool,
                          min_distance: int, prominence: float, recency_max: int):
    """
    Finds real, globally-isolated peaks and troughs across the WHOLE series,
    then checks only whether the MOST RECENT one is still close enough to
    "now" to count as in-progress:
      - cooling: latest real peak (best stretch) is RECENCY_MIN-recency_max
        points old, and the series has since faded from it by >= prominence.
      - heating: same check against the latest real trough.
    'peak'/'trough' both already account for higher_is_better — a pitcher's
    low-ERA point is a peak in performance, not a trough, even though it's
    numerically a minimum.
    Returns (signal: 'cooling' | 'heating' | None, extreme_idx, magnitude).
    If both directions somehow qualify, the larger-magnitude move wins.
    """
    n = len(series)
    quality = series if higher_is_better else [-v for v in series]
    peaks, troughs = find_local_extrema(quality, min_distance, prominence)
    current = quality[-1]

    candidates = []
    if peaks:
        age = (n - 1) - peaks[-1]
        if RECENCY_MIN <= age <= recency_max:
            moved = quality[peaks[-1]] - current
            if moved >= prominence:
                candidates.append(('cooling', peaks[-1], round(moved, 4)))
    if troughs:
        age = (n - 1) - troughs[-1]
        if RECENCY_MIN <= age <= recency_max:
            moved = current - quality[troughs[-1]]
            if moved >= prominence:
                candidates.append(('heating', troughs[-1], round(moved, 4)))

    if not candidates:
        return None, None, None
    candidates.sort(key=lambda c: -c[2])
    return candidates[0]


# ── Main scan ──────────────────────────────────────────────────────────────

METRIC_CONFIG = {
    'ops': {'prominence': MIN_PROMINENCE_OPS, 'trend_prominence': TREND_FALLBACK_PROMINENCE_OPS},
    'avg': {'prominence': MIN_PROMINENCE_AVG, 'trend_prominence': TREND_FALLBACK_PROMINENCE_AVG},
    'slg': {'prominence': MIN_PROMINENCE_SLG, 'trend_prominence': TREND_FALLBACK_PROMINENCE_SLG},
}


def scan_batters(season: int, limit: int):
    """
    For each of OPS / AVG / SLG independently: run the validated peak/trough
    detector across the whole pool, pick the single strongest validated
    pick per team, and if a team has none for that metric, fall back to a
    lower-confidence "current vs season median" pick for that metric only.
    Result: up to 1 OPS + 1 AVG + 1 SLG row per team (fewer only if the
    team's pool of qualifying batters is itself thin — see file header).
    """
    pool = fetch_top_hitters(season, limit)
    print(f'  pool: {len(pool)} hitters')

    # ── Fetch + compute all three series once per batter ──
    computed = []
    for i, p in enumerate(pool):
        if (i + 1) % 25 == 0:
            print(f'    {i + 1}/{len(pool)}...')
        try:
            games = fetch_batter_game_log(p['id'], season)
        except Exception as e:
            print(f'    skip {p["name"]} — fetch failed: {e}')
            continue
        ops_series = rolling_ops_series(games, ROLLING_WINDOW_BATTER)
        min_len = MIN_PEAK_DISTANCE_BATTER * 2 + RECENCY_MAX_BATTER + 2
        if len(ops_series) < min_len:
            continue
        computed.append({
            'player': p,
            'games': games,
            'series': {
                'ops': ops_series,
                'avg': rolling_avg_series(games, ROLLING_WINDOW_BATTER),
                'slg': rolling_slg_series(games, ROLLING_WINDOW_BATTER),
            },
        })

    all_teams = sorted(set(short_name(c['player']['team']) for c in computed))
    all_rows = []

    for metric, cfg in METRIC_CONFIG.items():
        # ── Pass 1: validated peak/trough for this metric ──
        by_team_candidates: dict[str, list] = {}
        for c in computed:
            series = c['series'][metric]
            signal, extreme_idx, magnitude = detect_current_state(
                series, higher_is_better=True,
                min_distance=MIN_PEAK_DISTANCE_BATTER, prominence=cfg['prominence'],
                recency_max=RECENCY_MAX_BATTER)
            if signal is None:
                continue
            team = short_name(c['player']['team'])
            by_team_candidates.setdefault(team, []).append(
                {'c': c, 'signal': signal, 'extreme_idx': extreme_idx, 'magnitude': magnitude}
            )

        chosen_by_team: dict[str, dict] = {}
        for team, cands in by_team_candidates.items():
            cands.sort(key=lambda x: -x['magnitude'])
            chosen_by_team[team] = cands[0]

        # ── Pass 2: trending fallback, only for teams with no validated pick on this metric ──
        for team in all_teams:
            if team in chosen_by_team:
                continue
            team_batters = [c for c in computed if short_name(c['player']['team']) == team]
            scored = []
            for c in team_batters:
                series = c['series'][metric]
                if not series:
                    continue
                baseline = median(series)
                current = series[-1]
                delta = round(current - baseline, 4)
                if abs(delta) < cfg['trend_prominence']:
                    continue
                scored.append((abs(delta), c, delta, baseline))
            if not scored:
                continue
            scored.sort(key=lambda x: -x[0])
            _, c, delta, baseline = scored[0]
            chosen_by_team[team] = {
                'c': c, 'signal': 'heating' if delta > 0 else 'cooling',
                'extreme_idx': None, 'magnitude': abs(delta),
                '_trending': True, '_baseline': baseline,
            }

        # ── Build rows for this metric ──
        for team, chosen in chosen_by_team.items():
            c = chosen['c']
            p, games = c['player'], c['games']
            series = c['series'][metric]
            is_trending = chosen.get('_trending', False)
            extreme_value = chosen['_baseline'] if is_trending else series[chosen['extreme_idx']]
            line = windowed_batting_line(games, ROLLING_WINDOW_BATTER)
            all_rows.append({
                'player_id': p['id'], 'player_name': p['name'], 'team_name': team,
                'player_type': 'batter', 'signal': chosen['signal'],
                'signal_quality': 'trending' if is_trending else 'validated',
                'metric': metric,
                'current_value': series[-1], 'extreme_value': round(extreme_value, 4),
                'magnitude': round(chosen['magnitude'], 4), 'trend': series[-TREND_POINTS_SAVED:],
                **line,
            })

    validated_n = sum(1 for r in all_rows if r['signal_quality'] == 'validated')
    trending_n = sum(1 for r in all_rows if r['signal_quality'] == 'trending')
    by_metric = {m: sum(1 for r in all_rows if r['metric'] == m) for m in METRIC_CONFIG}
    print(f'  {validated_n} validated + {trending_n} trending = {len(all_rows)} total '
          f'(ops={by_metric["ops"]}, avg={by_metric["avg"]}, slg={by_metric["slg"]}) '
          f'across {len(all_teams)} teams')
    return all_rows


def scan_pitchers(season: int, limit: int):
    rows = []
    pool = fetch_top_pitchers(season, limit)
    print(f'  pool: {len(pool)} pitchers')
    for i, p in enumerate(pool):
        if (i + 1) % 25 == 0:
            print(f'    {i + 1}/{len(pool)}...')
        try:
            starts = fetch_pitcher_game_log(p['id'], season)
        except Exception as e:
            print(f'    skip {p["name"]} — fetch failed: {e}')
            continue
        series = rolling_era_series(starts, ROLLING_WINDOW_PITCHER)
        min_len = MIN_PEAK_DISTANCE_PITCHER * 2 + RECENCY_MAX_PITCHER + 2
        if len(series) < min_len:
            continue
        # higher_is_better=False for ERA — a LOW point is the pitcher's peak performance
        signal, extreme_idx, magnitude = detect_current_state(
            series, higher_is_better=False,
            min_distance=MIN_PEAK_DISTANCE_PITCHER, prominence=MIN_PROMINENCE_ERA,
            recency_max=RECENCY_MAX_PITCHER)
        if signal is None:
            continue
        rows.append({
            'player_id': p['id'], 'player_name': p['name'], 'team_name': short_name(p['team']),
            'player_type': 'pitcher', 'signal': signal, 'signal_quality': 'validated', 'metric': 'era',
            'current_value': series[-1], 'extreme_value': series[extreme_idx],
            'magnitude': magnitude, 'trend': series[-TREND_POINTS_SAVED:],
        })
    return rows


def scan_milb_prospects(season: int, limit: int):
    """
    Same rolling-OPS + same validated detector as scan_batters — just pointed
    at the AAA pool (sportId 11) instead of MLB. Deliberately HEATING ONLY:
    a fading AAA hitter isn't an actionable "go pick him up" signal the way a
    fading MLB starter's roster spot is, so cooling rows are computed but not
    persisted — no point cluttering the table with a direction nobody acts on.
    Honest framing: "good recent form in AAA" is a real, useful proxy, but it
    is NOT a scouting grade or a prospect ranking — there's no such data
    source wired in here. The one_liner below should never overstate that.
    """
    rows = []
    pool = fetch_top_hitters(season, limit, min_pa=MILB_MIN_PA, sport_id=MILB_AAA_SPORT_ID)
    print(f'  pool: {len(pool)} AAA hitters')
    for i, p in enumerate(pool):
        if (i + 1) % 25 == 0:
            print(f'    {i + 1}/{len(pool)}...')
        try:
            games = fetch_batter_game_log(p['id'], season, sport_id=MILB_AAA_SPORT_ID)
        except Exception as e:
            print(f'    skip {p["name"]} — fetch failed: {e}')
            continue
        series = rolling_ops_series(games, ROLLING_WINDOW_BATTER)
        min_len = MIN_PEAK_DISTANCE_BATTER * 2 + RECENCY_MAX_BATTER + 2
        if len(series) < min_len:
            continue
        signal, extreme_idx, magnitude = detect_current_state(
            series, higher_is_better=True,
            min_distance=MIN_PEAK_DISTANCE_BATTER, prominence=MIN_PROMINENCE_OPS,
            recency_max=RECENCY_MAX_BATTER)
        if signal != 'heating':   # cooling AAA hitters: computed, deliberately discarded
            continue
        rows.append({
            'player_id': p['id'], 'player_name': p['name'], 'team_name': short_name(p['team']),
            'player_type': 'milb_batter', 'signal': signal, 'signal_quality': 'validated', 'metric': 'ops',
            'current_value': series[-1], 'extreme_value': series[extreme_idx],
            'magnitude': magnitude, 'trend': series[-TREND_POINTS_SAVED:],
        })
    return rows


def clear_today(today: str) -> bool:
    try:
        supabase.table('player_form_signals').delete().eq('computed_date', today).execute()
        return True
    except Exception as e:
        print(f'WARNING: failed to clear existing rows for {today}: {e}')
        return False


def save_signals_batch(today: str, rows: list[dict], label: str) -> int:
    """Returns how many rows actually saved — NOT how many were computed."""
    if not rows:
        print(f'  No {label} signals to save.')
        return 0
    payload = [{**r, 'computed_date': today} for r in rows]
    try:
        supabase.table('player_form_signals').insert(payload).execute()
        print(f'  Saved {len(payload)} {label} signal(s).')
        return len(payload)
    except Exception as e:
        print(f'  ERROR saving {label} signals (these did NOT save): {e}')
        return 0


def main():
    global supabase
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print('Missing env vars')
        sys.exit(1)
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    ap = argparse.ArgumentParser()
    ap.add_argument('--season', type=int, default=datetime.utcnow().year)
    ap.add_argument('--hitter-limit', type=int, default=150)
    ap.add_argument('--pitcher-limit', type=int, default=90)
    ap.add_argument('--milb-limit', type=int, default=MILB_POOL_LIMIT_DEFAULT)
    args = ap.parse_args()

    today = datetime.utcnow().strftime('%Y-%m-%d')
    print(f'Computing player form signals for {today} (season {args.season})')

    print('\n[1/3] Scanning batters (OPS + AVG + SLG)...')
    batter_rows = scan_batters(args.season, args.hitter_limit)

    print('\n[2/3] Scanning pitchers...')
    pitcher_rows = scan_pitchers(args.season, args.pitcher_limit)
    cooling_p = sum(1 for r in pitcher_rows if r['signal'] == 'cooling')
    heating_p = sum(1 for r in pitcher_rows if r['signal'] == 'heating')
    print(f'  {len(pitcher_rows)} flagged ({cooling_p} cooling, {heating_p} heating)')

    print('\n[3/3] Scanning AAA prospects...')
    milb_rows = scan_milb_prospects(args.season, args.milb_limit)
    print(f'  {len(milb_rows)} flagged (heating only, by design)')

    computed = len(batter_rows) + len(pitcher_rows) + len(milb_rows)

    clear_today(today)
    saved = 0
    saved += save_signals_batch(today, batter_rows, 'batter')
    saved += save_signals_batch(today, pitcher_rows, 'pitcher')
    saved += save_signals_batch(today, milb_rows, 'AAA prospect')

    mark = '✓' if saved == computed else ('⚠' if saved > 0 else '✗')
    print(f'\n{mark} Done — {saved} of {computed} computed signals actually saved'
          + ('' if saved == computed else ' (see ERROR lines above — something did NOT make it into the table)'))


if __name__ == '__main__':
    main()