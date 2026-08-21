"""
scripts/fetch_pitcher_hot_zones.py

Fetches Statcast pitch-by-pitch data for every active MLB pitcher
and aggregates into:
  1. A heatmap (usage/BA-against/whiff by zone) -> pitcher_hot_zones
  2. A per-pitch-type zone breakdown -> pitcher_zone_arsenal
  3. NEW 2026-08-20: count-tendency (most-used pitch + location per
     ball-strike count) -> pitcher_count_tendency
  4. NEW 2026-08-20: pitch sequencing (what's thrown next after each
     pitch type, within the same at-bat) -> pitcher_pitch_sequencing

All four are computed from the SAME statcast_pitcher() pull per pitcher
— no extra Savant request added for the two new tables, same discipline
as lib/game-feed.ts's shared-fetch fix for the season-walk duplication
found earlier this week.

Three rows per pitcher per table: 'all', 'vs_lhb', 'vs_rhb'.

2026-08-20: zones 11-14 (Statcast's four out-of-zone "chase" quadrants —
11=up/in, 12=up/away, 13=down/in, 14=down/away) are now stored as their
OWN zone keys instead of being collapsed into their nearest in-zone
corner. go_to_zone_label/weak_zone_label logic stays scoped to the 1-9
core zones only — chase-zone tendency is a different question, not
folded into those two labels.

SEQUENCING ASSUMPTION — not independently curl/script-verified the way
balls/strikes/at_bat_number/pitch_number were: this assumes 'game_pk' is
also a real column in statcast_pitcher()'s output, needed so pitches are
only chained within the same at-bat of the SAME game (at_bat_number
resets every game, isn't globally unique across a season). It's as
standard a Statcast column as the ones already confirmed, but given
p_throws/game_date both needed real checking earlier this week rather
than assumption, aggregate_sequencing() below fails SAFE — returns {}
rather than crashing — if game_pk isn't present, so a wrong assumption
here degrades gracefully instead of breaking the whole script run.

Runs once a week via GitHub Actions.

Companion to fetch_batter_hot_zones.py — same core zone layout (batter
script not yet updated for 11-14 or the two new tables).
"""
import os
import sys
import time
from datetime import datetime
import pandas as pd
from pybaseball import statcast_pitcher, cache
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')
cache.enable()

SUPABASE_URL = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip()
SUPABASE_SERVICE_KEY = (os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ─── Zone set — core 1-9 PLUS chase quadrants 11-14, no longer collapsed ──────
CORE_ZONES = list(range(1, 10))
CHASE_ZONES = [11, 12, 13, 14]
ALL_ZONES = CORE_ZONES + CHASE_ZONES

ZONE_LABELS = {
    1: 'high inside',   2: 'high middle',   3: 'high outside',
    4: 'middle inside', 5: 'middle middle', 6: 'middle outside',
    7: 'low inside',    8: 'low middle',    9: 'low outside',
    11: 'chase up/in',  12: 'chase up/away',
    13: 'chase down/in', 14: 'chase down/away',
}

# ─── Pitch-type config ────────────────────────────────────────────────────────
PITCH_NAME = {
    'FF': '4-seam',   'SI': 'Sinker',    'FC': 'Cutter',
    'SL': 'Slider',   'ST': 'Sweeper',   'SV': 'Slurve',
    'CU': 'Curveball','KC': 'Knuckle-curve', 'CS': 'Slow curve',
    'CH': 'Changeup', 'FS': 'Splitter',  'FO': 'Forkball',
    'EP': 'Eephus',   'KN': 'Knuckleball','SC': 'Screwball',
}

MIN_PITCHES_PER_TYPE = 50
MIN_PITCHES_PER_ZONE = 15

# NEW — thresholds for the two new tables
VALID_COUNTS = [f'{b}-{s}' for b in range(4) for s in range(3)]  # '0-0' .. '3-2', 12 combos
MIN_COUNT_SAMPLE = 15       # min pitches thrown IN a given count to trust that count's tendency
MIN_SEQUENCING_SAMPLE = 20  # min times a pitch type was followed by another, to trust its "next pitch" tendency


def normalize_zone(z):
    """No longer collapses 11-14 into a core zone — returns them as-is.
    Only returns None for genuinely invalid/missing zone values."""
    try:
        z = int(z)
    except (ValueError, TypeError):
        return None
    if z in ALL_ZONES:
        return z
    return None


def aggregate_zones(pitches_df):
    zones = {str(z): {
        'pitches': 0, 'swings': 0, 'whiffs': 0,
        'ab': 0, 'hits': 0,
    } for z in ALL_ZONES}

    if pitches_df is None or pitches_df.empty:
        return zones, 0

    total_pitches = 0

    for _, row in pitches_df.iterrows():
        zone = normalize_zone(row.get('zone'))
        if zone is None:
            continue

        key = str(zone)
        zones[key]['pitches'] += 1
        total_pitches += 1

        desc = str(row.get('description', '')).lower()
        is_swing = desc in {
            'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip',
            'hit_into_play', 'foul_bunt', 'missed_bunt',
        }
        is_whiff = desc in {'swinging_strike', 'swinging_strike_blocked', 'swinging_pitchout'}

        if is_swing:
            zones[key]['swings'] += 1
        if is_whiff:
            zones[key]['whiffs'] += 1

        events = row.get('events')
        if events and pd.notna(events):
            events_str = str(events).lower()
            zones[key]['ab'] += 1
            if events_str in {'single', 'double', 'triple', 'home_run'}:
                zones[key]['hits'] += 1

    out = {}
    for z, d in zones.items():
        usage_pct  = round((d['pitches'] / total_pitches) * 100, 1) if total_pitches > 0 else 0
        ba_against = round(d['hits'] / d['ab'], 3) if d['ab']     > 0 else None
        whiff_pct  = round((d['whiffs'] / d['swings']) * 100, 1) if d['swings'] > 0 else None
        out[z] = {
            'usage_pct':  usage_pct,
            'ba_against': ba_against,
            'whiff_pct':  whiff_pct,
            'pitches':    d['pitches'],
            'swings':     d['swings'],
            'whiffs':     d['whiffs'],
            'ab':         d['ab'],
        }
    return out, total_pitches


def aggregate_zone_arsenal(pitches_df):
    if pitches_df is None or pitches_df.empty:
        return {}

    split_total = 0
    by_pitch = {}

    for _, row in pitches_df.iterrows():
        zone = normalize_zone(row.get('zone'))
        if zone is None:
            continue

        ptype = row.get('pitch_type')
        if ptype is None or pd.isna(ptype) or str(ptype).strip() == '':
            continue
        ptype = str(ptype).strip().upper()

        if ptype not in by_pitch:
            by_pitch[ptype] = {
                'pitches': 0, 'velo_sum': 0.0, 'velo_n': 0,
                'zones': {str(z): {'pitches': 0, 'swings': 0, 'whiffs': 0,
                                   'ab': 0, 'hits': 0} for z in ALL_ZONES},
            }

        bucket = by_pitch[ptype]
        key = str(zone)
        bucket['pitches'] += 1
        bucket['zones'][key]['pitches'] += 1
        split_total += 1

        velo = row.get('release_speed')
        if velo is not None and pd.notna(velo):
            bucket['velo_sum'] += float(velo)
            bucket['velo_n'] += 1

        desc = str(row.get('description', '')).lower()
        is_swing = desc in {
            'swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip',
            'hit_into_play', 'foul_bunt', 'missed_bunt',
        }
        is_whiff = desc in {'swinging_strike', 'swinging_strike_blocked', 'swinging_pitchout'}

        if is_swing:
            bucket['zones'][key]['swings'] += 1
        if is_whiff:
            bucket['zones'][key]['whiffs'] += 1

        events = row.get('events')
        if events and pd.notna(events):
            bucket['zones'][key]['ab'] += 1
            if str(events).lower() in {'single', 'double', 'triple', 'home_run'}:
                bucket['zones'][key]['hits'] += 1

    out = {}
    for ptype, b in by_pitch.items():
        if b['pitches'] < MIN_PITCHES_PER_TYPE:
            continue

        zones_out = {}
        for z, d in b['zones'].items():
            zones_out[z] = {
                'usage_pct':  round((d['pitches'] / b['pitches']) * 100, 1) if b['pitches'] > 0 else 0,
                'ba_against': round(d['hits'] / d['ab'], 3) if d['ab'] > 0 else None,
                'whiff_pct':  round((d['whiffs'] / d['swings']) * 100, 1) if d['swings'] > 0 else None,
                'pitches':    d['pitches'],
                'swings':     d['swings'],
                'whiffs':     d['whiffs'],
                'ab':         d['ab'],
                'low_sample': d['pitches'] < MIN_PITCHES_PER_ZONE,
            }

        out[ptype] = {
            'pitch_name':    PITCH_NAME.get(ptype, ptype),
            'usage_pct':     round((b['pitches'] / split_total) * 100, 1) if split_total > 0 else 0,
            'avg_velo':      round(b['velo_sum'] / b['velo_n'], 1) if b['velo_n'] > 0 else None,
            'total_pitches': b['pitches'],
            'zones':         zones_out,
        }
    return out


def aggregate_count_tendency(pitches_df):
    """
    For each ball-strike count (12 valid in-progress combos), which pitch
    type gets thrown most, and where does that pitch tend to go (most
    common zone for that pitch type within that count).
    """
    if pitches_df is None or pitches_df.empty:
        return {}

    buckets = {c: {} for c in VALID_COUNTS}
    totals = {c: 0 for c in VALID_COUNTS}

    for _, row in pitches_df.iterrows():
        b, s = row.get('balls'), row.get('strikes')
        if b is None or s is None or pd.isna(b) or pd.isna(s):
            continue
        b, s = int(b), int(s)
        if b > 3 or s > 2:
            continue  # not a real pre-pitch count — guard against any stray value
        key = f'{b}-{s}'

        ptype = row.get('pitch_type')
        if ptype is None or pd.isna(ptype) or str(ptype).strip() == '':
            continue
        ptype = str(ptype).strip().upper()
        zone = normalize_zone(row.get('zone'))

        bucket = buckets[key]
        if ptype not in bucket:
            bucket[ptype] = {'n': 0, 'zones': {}}
        bucket[ptype]['n'] += 1
        if zone is not None:
            zk = str(zone)
            bucket[ptype]['zones'][zk] = bucket[ptype]['zones'].get(zk, 0) + 1
        totals[key] += 1

    out = {}
    for count_key, pitch_dict in buckets.items():
        total = totals[count_key]
        if total < MIN_COUNT_SAMPLE or not pitch_dict:
            continue

        pitch_summaries = []
        for ptype, d in pitch_dict.items():
            top_zone_key = max(d['zones'].items(), key=lambda kv: kv[1])[0] if d['zones'] else None
            pitch_summaries.append({
                'pitch_type':     ptype,
                'pitch_name':     PITCH_NAME.get(ptype, ptype),
                'count_n':        d['n'],
                'pct':            round((d['n'] / total) * 100, 1),
                'top_zone':       top_zone_key,
                'top_zone_label': ZONE_LABELS.get(int(top_zone_key)) if top_zone_key else None,
            })
        pitch_summaries.sort(key=lambda x: x['pct'], reverse=True)

        out[count_key] = {
            'total_pitches': total,
            'pitches':       pitch_summaries,
            'top_pitch':     pitch_summaries[0]['pitch_type'] if pitch_summaries else None,
        }
    return out


def aggregate_sequencing(pitches_df):
    """
    Given a pitch type just thrown, what's thrown next (within the same
    at-bat, same game)? See SEQUENCING ASSUMPTION note at top of file re:
    game_pk — fails safe (empty dict) if that column isn't present rather
    than guessing at a substitute.
    """
    if pitches_df is None or pitches_df.empty:
        return {}
    required = {'pitch_type', 'game_pk', 'at_bat_number', 'pitch_number'}
    if not required.issubset(set(pitches_df.columns)):
        return {}

    df = pitches_df.dropna(subset=['pitch_type', 'game_pk', 'at_bat_number', 'pitch_number']).copy()
    if df.empty:
        return {}
    df = df.sort_values(['game_pk', 'at_bat_number', 'pitch_number'])

    transitions = {}   # from_type -> {to_type: count}
    from_totals = {}

    prev_key = None
    prev_type = None
    for _, row in df.iterrows():
        key = (row['game_pk'], row['at_bat_number'])
        ptype = str(row['pitch_type']).strip().upper()

        if prev_key == key and prev_type is not None:
            transitions.setdefault(prev_type, {})
            transitions[prev_type][ptype] = transitions[prev_type].get(ptype, 0) + 1
            from_totals[prev_type] = from_totals.get(prev_type, 0) + 1

        prev_key = key
        prev_type = ptype

    out = {}
    for from_type, total in from_totals.items():
        if total < MIN_SEQUENCING_SAMPLE:
            continue
        to_counts = transitions[from_type]
        to_list = [
            {
                'pitch_type': t,
                'pitch_name': PITCH_NAME.get(t, t),
                'count':      n,
                'pct':        round((n / total) * 100, 1),
            }
            for t, n in to_counts.items()
        ]
        to_list.sort(key=lambda x: x['pct'], reverse=True)
        out[from_type] = {
            'pitch_name':     PITCH_NAME.get(from_type, from_type),
            'total_followed': total,
            'next_pitches':   to_list,
            'top_next':       to_list[0]['pitch_type'] if to_list else None,
        }
    return out


def label_extremes(zones):
    """go_to_zone/weak_zone — explicitly scoped to CORE_ZONES only, even
    though `zones` now also contains chase-zone (11-14) entries."""
    core_keys = {str(z) for z in CORE_ZONES}

    usage_candidates = [
        (int(z), d['usage_pct'])
        for z, d in zones.items()
        if z in core_keys and d['pitches'] >= 30
    ]
    usage_candidates.sort(key=lambda x: x[1], reverse=True)
    go_to_zone = ZONE_LABELS.get(usage_candidates[0][0]) if usage_candidates else None

    weak_candidates = [
        (int(z), d['ba_against'])
        for z, d in zones.items()
        if z in core_keys and d.get('ab', 0) >= 15 and d.get('ba_against') is not None
    ]
    weak_candidates.sort(key=lambda x: x[1], reverse=True)
    weak_zone = ZONE_LABELS.get(weak_candidates[0][0]) if weak_candidates else None

    return go_to_zone, weak_zone


def get_active_pitchers():
    season = datetime.now().year

    response = supabase.table('pitch_arsenals')\
        .select('player_id, player_name')\
        .eq('season', season)\
        .execute()

    if response.data:
        seen = {}
        for row in response.data:
            pid = row['player_id']
            if pid not in seen:
                seen[pid] = {
                    'id': pid,
                    'name': row.get('player_name', 'Unknown'),
                    'team_id': None,
                }
        return list(seen.values())

    print('No pitch_arsenals data — falling back to roster API')
    import requests
    teams_url = f'https://statsapi.mlb.com/api/v1/teams?sportId=1&season={season}'
    r = requests.get(teams_url, timeout=10)
    teams = r.json().get('teams', [])

    pitchers = {}
    for team in teams:
        team_id = team['id']
        roster_url = f'https://statsapi.mlb.com/api/v1/teams/{team_id}/roster?rosterType=Active'
        try:
            rr = requests.get(roster_url, timeout=10)
            for p in rr.json().get('roster', []):
                pos = p.get('position', {}).get('abbreviation', '')
                if pos != 'P':
                    continue
                pid = p['person']['id']
                if pid not in pitchers:
                    pitchers[pid] = {
                        'id':     pid,
                        'name':   p['person']['fullName'],
                        'team_id': team_id,
                    }
            time.sleep(0.1)
        except Exception as e:
            print(f'  Failed to fetch roster for team {team_id}: {e}')
    return list(pitchers.values())


def main():
    season = datetime.now().year
    today = datetime.now().strftime('%Y-%m-%d')
    season_start = f'{season}-03-15'

    print(f'Fetching pitcher hot zones + count tendency + sequencing for {season} season')
    print(f'Date range: {season_start} to {today}')
    print('13-zone mode: 9 core + 4 chase quadrants (11-14)')

    print('\nFetching active pitcher list...')
    pitchers = get_active_pitchers()
    print(f'Found {len(pitchers)} pitchers to process')

    success = 0
    skipped = 0
    failed  = 0
    arsenal_saved = 0
    count_tendency_saved = 0
    sequencing_saved = 0

    for i, p in enumerate(pitchers):
        progress = f'[{i+1}/{len(pitchers)}]'
        pid  = p['id']
        name = p['name']
        team_id = p.get('team_id')

        try:
            df = statcast_pitcher(season_start, today, player_id=pid)

            if df is None or df.empty or len(df) < 50:
                print(f'  {progress} {name}: skipped (insufficient data, {len(df) if df is not None else 0} pitches)')
                skipped += 1
                continue

            rows_to_upsert = []
            arsenal_rows = []
            count_tendency_rows = []
            sequencing_rows = []

            for split_key, split_filter in [
                ('all',    df),
                ('vs_lhb', df[df['stand'] == 'L']),
                ('vs_rhb', df[df['stand'] == 'R']),
            ]:
                zones, total_pitches = aggregate_zones(split_filter)
                if total_pitches < 30:
                    continue
                go_to_label, weak_label = label_extremes(zones)
                rows_to_upsert.append({
                    'player_id':         pid,
                    'player_name':       name,
                    'team_id':           team_id,
                    'season':            season,
                    'split':             split_key,
                    'total_pitches':     total_pitches,
                    'zones':             zones,
                    'go_to_zone_label':  go_to_label,
                    'weak_zone_label':   weak_label,
                    'updated_at':        datetime.utcnow().isoformat(),
                })

                arsenal = aggregate_zone_arsenal(split_filter)
                if arsenal:
                    arsenal_rows.append({
                        'player_id':     pid,
                        'player_name':   name,
                        'team_id':       team_id,
                        'season':        season,
                        'split':         split_key,
                        'total_pitches': total_pitches,
                        'arsenal':       arsenal,
                        'updated_at':    datetime.utcnow().isoformat(),
                    })

                count_tendency = aggregate_count_tendency(split_filter)
                if count_tendency:
                    count_tendency_rows.append({
                        'player_id':   pid,
                        'player_name': name,
                        'team_id':     team_id,
                        'season':      season,
                        'split':       split_key,
                        'counts':      count_tendency,
                        'updated_at':  datetime.utcnow().isoformat(),
                    })

                sequencing = aggregate_sequencing(split_filter)
                if sequencing:
                    sequencing_rows.append({
                        'player_id':   pid,
                        'player_name': name,
                        'team_id':     team_id,
                        'season':      season,
                        'split':       split_key,
                        'transitions': sequencing,
                        'updated_at':  datetime.utcnow().isoformat(),
                    })

            if arsenal_rows:
                supabase.table('pitcher_zone_arsenal').upsert(
                    arsenal_rows, on_conflict='player_id,season,split',
                ).execute()
                arsenal_saved += 1

            if count_tendency_rows:
                supabase.table('pitcher_count_tendency').upsert(
                    count_tendency_rows, on_conflict='player_id,season,split',
                ).execute()
                count_tendency_saved += 1

            if sequencing_rows:
                supabase.table('pitcher_pitch_sequencing').upsert(
                    sequencing_rows, on_conflict='player_id,season,split',
                ).execute()
                sequencing_saved += 1

            if rows_to_upsert:
                supabase.table('pitcher_hot_zones').upsert(
                    rows_to_upsert, on_conflict='player_id,season,split',
                ).execute()
                success += 1
                print(f'  {progress} {name}: {len(rows_to_upsert)} splits saved'
                      f' (arsenal={len(arsenal_rows)} count_tend={len(count_tendency_rows)} seq={len(sequencing_rows)})')
            else:
                skipped += 1
                print(f'  {progress} {name}: skipped (no valid splits)')

            time.sleep(0.6)

        except Exception as e:
            print(f'  {progress} {name}: ERROR — {str(e)[:120]}')
            failed += 1
            time.sleep(1.5)

    print(f'\n=== DONE ===')
    print(f'  Success:        {success}')
    print(f'  Arsenal:        {arsenal_saved}')
    print(f'  Count tendency: {count_tendency_saved}')
    print(f'  Sequencing:     {sequencing_saved}')
    print(f'  Skipped:        {skipped}')
    print(f'  Failed:         {failed}')


if __name__ == '__main__':
    main()