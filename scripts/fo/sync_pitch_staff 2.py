"""
scripts/fo/sync_pitch_staff.py

Pitching Desk · staff board. Works for any club (--team); the Front Office is Phillies (143) today.

TABLE OWNERSHIP (single writer):
  fo_pitch_staff, fo_league_pitch_context  <- this script and nothing else.
  (stuff_grade / method_version on fo_pitch_staff belong to the future Stuff Grade job; this script never writes them.)

Reads (nothing is fetched from a render path; this is the cron side):
  MLB Stats API   /teams/{id}/roster?rosterType=40Man&hydrate=person      roster, hand, age
                  /people/{id}/stats?stats=gameLog&group=pitching&season  per-appearance lines
                  /teams/stats?stats=season&group=pitching&sportIds=1     league totals (FIP constant, LOB%)
  Savant CSV      leaderboard/expected_statistics (xERA, ERA)             year=season, min=1
                  leaderboard/pitch-arsenals avg_speed (last season's fastball velo)
  Parquet         models/data/pitches_{season}.parquet (fetch_pitches.py): batted-ball types, CSW, whiff, velocity
All field names above were printed from live responses on 2026-10-15.

UNITS: every *_pct column and hr_fb are 0-100. babip is a decimal (.290). ip is decimal innings (12.2 -> 12.667).

WINDOWS: 'season'; 'l30' / 'l15' = appearances on or after (last game date in the Parquet - 30 / 15 days);
'l5' = the pitcher's last five appearances. The anchor is the last game in the data, not today, so the
windows stay meaningful in the off-season. A window with no appearances writes NO row.

FORMULAS (the same public formulas everywhere; nothing here is FanGraphs data)
  cFIP   = lgERA - (13*lgHR + 3*(lgBB+lgHBP) - 2*lgK) / lgIP            lgERA = 9*lgER/lgIP, from team totals
  FIP    = (13*HR + 3*(BB+HBP) - 2*K) / IP + cFIP
  xFIP   = (13*(FB * lgHR/FB) + 3*(BB+HBP) - 2*K) / IP + cFIP           FB = fly_ball + popup (Savant bb_type)
  SIERA  = 6.145 - 16.986*k + 11.434*b - 1.858*g + 7.653*k^2 + s*6.664*g^2 + 10.130*k*g - 5.195*b*g
           k = K/PA, b = BB/PA, g = (GB - FB - PU)/PA   (FB here excludes popups, PU = popups; GB-FB-PU equals
           GB minus our combined FB), s = -1 if g > 0 else +1 (the published "+/-"; Baseball Prospectus,
           "Introducing SIERA", part 5).
  BABIP  = (H - HR) / (AB - K - HR + SF)
  LOB%   = (H + BB + HBP - R) / (H + BB + HBP - 1.4*HR)   (clamped to 0-100)
  HR/FB  = HR / FB.   GB% = GB / BIP, BIP = balls with a Savant bb_type.
  CSW%   = (called strikes + whiffs + foul tips) / pitches.  Whiff% = whiffs / swings.   (features.py sets)
  fb_velo_delta = mean velo of his season-primary fastball type in the window minus the same pitch type's
                  average last season (Savant arsenal leaderboard). NULL when he had none last season.

League context rows (season, role in all / SP / RP): pooled rates from the Parquet; SDs across pitchers with
>= 50 BF (ERA / xERA SDs across pitchers with >= 100 PA). lob_pct, era and fip_constant come from team totals.

Run:  models/venv/bin/python scripts/fo/sync_pitch_staff.py --team 143 --dry-run
"""
from __future__ import annotations

import argparse
import math
from datetime import date, timedelta
from pathlib import Path
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from common import (MLB, SAVANT_LB, clean, confirm_abort, ip_to_dec, load_pitches, mlb_get, num, savant_csv, upsert)  # noqa: E402
import features as F  # noqa: E402  (models/src/features.py, the single shared module)

K_EV = {'strikeout', 'strikeout_double_play'}
BB_EV = {'walk', 'intent_walk'}
HIT_EV = {'single', 'double', 'triple'}
NOT_BABIP_DEN = {'home_run', 'sac_bunt', 'sac_bunt_double_play', 'catcher_interf', 'strikeout', 'strikeout_double_play'}
WINDOWS = ('season', 'l30', 'l15', 'l5')
MIN_BF_SD, MIN_PA_SD = 50, 100


# ── pure formulas ───────────────────────────────────────────────────────────

def fip_constant(lg: dict) -> float:
    return lg['era'] - (13 * lg['hr'] + 3 * (lg['bb'] + lg['hbp']) - 2 * lg['k']) / lg['ip']


def calc_fip(hr, bb, hbp, k, ip, c):
    return None if ip <= 0 else (13 * hr + 3 * (bb + hbp) - 2 * k) / ip + c


def calc_xfip(fb, bb, hbp, k, ip, lg_hr_fb, c):
    return None if ip <= 0 else (13 * (fb * lg_hr_fb) + 3 * (bb + hbp) - 2 * k) / ip + c


def calc_siera(k, bb, gb, fb_total, pa):
    if pa <= 0:
        return None
    kk, b, g = k / pa, bb / pa, (gb - fb_total) / pa
    s = -1.0 if g > 0 else 1.0
    return (6.145 - 16.986 * kk + 11.434 * b - 1.858 * g + 7.653 * kk ** 2 + s * 6.664 * g ** 2
            + 10.130 * kk * g - 5.195 * b * g)


# ── league side ─────────────────────────────────────────────────────────────

def league_totals(season: int) -> dict | None:
    d = mlb_get('/teams/stats', {'stats': 'season', 'group': 'pitching', 'season': season, 'sportIds': 1, 'gameType': 'R'})
    try:
        splits = d['stats'][0]['splits']
    except (TypeError, KeyError, IndexError):
        print('[league_totals] unexpected response shape')
        return None
    t = {k: 0.0 for k in ('ip', 'er', 'hr', 'bb', 'hbp', 'k', 'h', 'r')}
    for s in splits:
        st = s['stat']
        t['ip'] += ip_to_dec(st['inningsPitched'])
        for key, f in (('er', 'earnedRuns'), ('hr', 'homeRuns'), ('bb', 'baseOnBalls'), ('hbp', 'hitByPitch'),
                       ('k', 'strikeOuts'), ('h', 'hits'), ('r', 'runs')):
            t[key] += float(st[f])
    if t['ip'] <= 0:
        return None
    t['era'] = 9 * t['er'] / t['ip']
    t['lob'] = 100 * (t['h'] + t['bb'] + t['hbp'] - t['r']) / (t['h'] + t['bb'] + t['hbp'] - 1.4 * t['hr'])
    t['teams'] = len(splits)
    return t


def pitcher_table(pq: pd.DataFrame) -> pd.DataFrame:
    """One row per pitcher in the Parquet: counts used for league pooling and SDs."""
    d = pq
    ev = d['events']
    t = pd.DataFrame({
        'pitcher': d['pitcher'],
        'bf': ev.notna(), 'k': ev.isin(K_EV), 'bb': ev.isin(BB_EV), 'hr': ev.eq('home_run'),
        'hit_b': ev.isin(HIT_EV), 'bab_den': ev.notna() & d['type'].eq('X') & ~ev.isin(NOT_BABIP_DEN),
        'gb': d['bb_type'].eq('ground_ball'), 'fb': d['bb_type'].isin(['fly_ball', 'popup']), 'bip': d['bb_type'].notna(),
        'csw': d['description'].isin(F.CSW_DESCS), 'whiff': d['description'].isin(F.WHIFF_DESCS),
        'swing': d['description'].isin(F.SWING_DESCS), 'n': 1,
    })
    g = t.groupby('pitcher').sum()
    # role: starter = threw the first pitch for his team in the game
    top = d['inning_topbot'].eq('Top')
    fielding = np.where(top, d['home_team'], d['away_team'])
    first = d.assign(_team=fielding).sort_values(['game_pk', 'at_bat_number', 'pitch_number']).groupby(['game_pk', '_team']).head(1)
    gs = first.groupby('pitcher').size().rename('gs')
    games = d.groupby('pitcher')['game_pk'].nunique().rename('g')
    g = g.join(games).join(gs).fillna({'gs': 0})
    g['role'] = np.where(g['gs'] >= g['g'] / 2.0, 'SP', 'RP')
    return g


def fastball_velo(pq: pd.DataFrame, min_n: int = 100) -> pd.DataFrame:
    """Per pitcher: season-primary fastball type (most-thrown of FF/SI/FC) and its mean velo."""
    fb = pq[pq['pitch_type'].isin(F.FASTBALLS) & pq['release_speed'].notna()]
    counts = fb.groupby(['pitcher', 'pitch_type']).size().rename('n').reset_index()
    counts = counts.sort_values(['pitcher', 'n'], ascending=[True, False]).groupby('pitcher').head(1)
    velo = fb.groupby(['pitcher', 'pitch_type'])['release_speed'].mean().rename('velo').reset_index()
    out = counts.merge(velo, on=['pitcher', 'pitch_type'])
    return out[out['n'] >= min_n].set_index('pitcher')


def prior_velos(season: int) -> dict[tuple[int, str], float]:
    rows = savant_csv(f'{SAVANT_LB}/pitch-arsenals', {'year': season - 1, 'min': 10, 'type': 'avg_speed', 'hand': '', 'csv': 'true'})
    out: dict[tuple[int, str], float] = {}
    for r in rows or []:
        for pt in F.FASTBALLS:
            v = num(r.get(f'{pt.lower()}_avg_speed'))
            if v is not None:
                out[(int(r['pitcher']), pt)] = v
    if not rows:
        print('[prior_velos] no prior-season leaderboard; fb_velo_delta will be NULL')
    return out


def rate(num_, den, mult=100.0):
    return np.where(den > 0, mult * num_ / den.where(den > 0), np.nan)


def league_context_rows(season: int, pq: pd.DataFrame, P: pd.DataFrame, lg: dict, c_fip: float,
                        xstats: list[dict] | None, fbv: pd.DataFrame, prior: dict) -> list[dict]:
    P = P.copy()
    # fastball delta per pitcher (season window) for its SD
    delta = {}
    for pid, r in fbv.iterrows():
        pv = prior.get((int(pid), r['pitch_type']))
        if pv is not None:
            delta[int(pid)] = r['velo'] - pv
    P['fb_velo_delta'] = pd.Series(delta)
    xs = {}
    for r in xstats or []:
        pid, era, xera, pa = int(r['player_id']), num(r['era']), num(r['xera']), num(r['pa'])
        if era is not None and xera is not None and pa is not None:
            xs[pid] = (era, xera, pa)
    rows = []
    for role in ('all', 'SP', 'RP'):
        sub = P if role == 'all' else P[P['role'] == role]
        pool = sub[sub['bf'] >= MIN_BF_SD]
        tot = sub.sum(numeric_only=True)
        if tot['bf'] <= 0:
            continue
        per = pd.DataFrame({
            'k_pct': rate(pool['k'], pool['bf']), 'bb_pct': rate(pool['bb'], pool['bf']),
            'csw_pct': rate(pool['csw'], pool['n']), 'whiff_pct': rate(pool['whiff'], pool['swing']),
            'gb_pct': rate(pool['gb'], pool['bip']), 'fb_velo_delta': pool['fb_velo_delta'].values,
        }, index=pool.index)
        per['kbb_pct'] = per['k_pct'] - per['bb_pct']
        sd = {k: (None if per[k].dropna().size < 5 else float(per[k].std())) for k in per.columns}
        # The jsonb column also carries the pooled MEAN of each metric as mean_<metric>, because the staff board
        # shades each cell as (value - mean) / sd and the table has no column for whiff% or xERA means.
        sd.update(mean_k_pct=100 * tot['k'] / tot['bf'], mean_bb_pct=100 * tot['bb'] / tot['bf'],
                  mean_kbb_pct=100 * (tot['k'] - tot['bb']) / tot['bf'], mean_csw_pct=100 * tot['csw'] / tot['n'],
                  mean_whiff_pct=100 * tot['whiff'] / tot['swing'] if tot['swing'] else None,
                  mean_gb_pct=100 * tot['gb'] / tot['bip'] if tot['bip'] else None,
                  mean_fb_velo_delta=float(per['fb_velo_delta'].mean()) if per['fb_velo_delta'].notna().sum() >= 5 else None)
        pool_x = [(era, xera) for pid, (era, xera, pa) in xs.items()
                  if pa >= MIN_PA_SD and pid in sub.index]
        if len(pool_x) >= 5:
            e, x = np.array(pool_x).T
            sd.update(era=float(e.std(ddof=1)), xera=float(x.std(ddof=1)), era_minus_xera=float((e - x).std(ddof=1)),
                      mean_era=float(e.mean()), mean_xera=float(x.mean()), mean_era_minus_xera=float((e - x).mean()))
        rows.append({
            'season': season, 'role': role,
            'k_pct': 100 * tot['k'] / tot['bf'], 'bb_pct': 100 * tot['bb'] / tot['bf'],
            'kbb_pct': 100 * (tot['k'] - tot['bb']) / tot['bf'], 'csw_pct': 100 * tot['csw'] / tot['n'],
            'babip': tot['hit_b'] / tot['bab_den'] if tot['bab_den'] else None,
            'hr_fb': 100 * tot['hr'] / tot['fb'] if tot['fb'] else None,
            'gb_pct': 100 * tot['gb'] / tot['bip'] if tot['bip'] else None,
            'lob_pct': lg['lob'] if role == 'all' else None, 'era': lg['era'] if role == 'all' else None,
            'fip_constant': c_fip, 'sd': {k: v for k, v in sd.items()},
        })
    return rows


# ── team side ───────────────────────────────────────────────────────────────

def appearances(pid: int, season: int) -> list[dict]:
    d = mlb_get(f'/people/{pid}/stats', {'stats': 'gameLog', 'group': 'pitching', 'season': season})
    try:
        splits = d['stats'][0]['splits']
    except (TypeError, KeyError, IndexError):
        print(f'[appearances] no game log for {pid}')
        return []
    out = []
    for s in splits:
        if s.get('gameType') != 'R':
            continue
        st = s['stat']
        out.append({'date': s['date'], 'game_pk': int(s['game']['gamePk']), 'ip': ip_to_dec(st['inningsPitched']),
                    **{k: int(st.get(f, 0) or 0) for k, f in (('bf', 'battersFaced'), ('k', 'strikeOuts'), ('bb', 'baseOnBalls'),
                       ('hbp', 'hitByPitch'), ('hr', 'homeRuns'), ('er', 'earnedRuns'), ('h', 'hits'), ('r', 'runs'),
                       ('ab', 'atBats'), ('sf', 'sacFlies'), ('gs', 'gamesStarted'))}})
    return sorted(out, key=lambda a: (a['date'], a['game_pk']))


def window_apps(apps: list[dict], win: str, anchor: date) -> list[dict]:
    if win == 'season':
        return apps
    if win == 'l5':
        return apps[-5:]
    days = 30 if win == 'l30' else 15
    cut = (anchor - timedelta(days=days)).isoformat()
    return [a for a in apps if a['date'] >= cut]


def build_line(pid: int, apps: list[dict], pq_p: pd.DataFrame, lg_hr_fb: float, c_fip: float,
               prime: tuple[str, float | None] | None) -> dict | None:
    """One window's stat line. `apps` are the appearances in the window, `pq_p` this pitcher's pitches (all season)."""
    if not apps:
        return None
    s = {k: sum(a[k] for a in apps) for k in ('ip', 'bf', 'k', 'bb', 'hbp', 'hr', 'er', 'h', 'r', 'ab', 'sf')}
    games = {a['game_pk'] for a in apps}
    sub = pq_p[pq_p['game_pk'].isin(games)]
    bb_type = sub['bb_type']
    gb, bip = int((bb_type == 'ground_ball').sum()), int(bb_type.notna().sum())
    fb = int(bb_type.isin(['fly_ball', 'popup']).sum())
    n = len(sub)
    swings = int(sub['description'].isin(F.SWING_DESCS).sum())
    csw = 100 * sub['description'].isin(F.CSW_DESCS).sum() / n if n else None
    whiff = 100 * sub['description'].isin(F.WHIFF_DESCS).sum() / swings if swings else None
    bab_den = s['ab'] - s['k'] - s['hr'] + s['sf']
    lob_den = s['h'] + s['bb'] + s['hbp'] - 1.4 * s['hr']
    delta = None
    if prime and prime[1] is not None:
        v = sub[(sub['pitch_type'] == prime[0])]['release_speed'].mean()
        delta = None if math.isnan(v) else float(v - prime[1])
    return {
        'ip': s['ip'], 'bf': s['bf'], 'k': s['k'], 'bb': s['bb'], 'hbp': s['hbp'], 'hr': s['hr'],
        'gb': gb if n else None, 'fb': fb if n else None, 'bip': bip if n else None,
        'era': 9 * s['er'] / s['ip'] if s['ip'] > 0 else None,
        'fip': calc_fip(s['hr'], s['bb'], s['hbp'], s['k'], s['ip'], c_fip),
        'xfip': calc_xfip(fb, s['bb'], s['hbp'], s['k'], s['ip'], lg_hr_fb, c_fip) if n else None,
        'siera': calc_siera(s['k'], s['bb'], gb, fb, s['bf']) if n and s['bf'] else None,
        'k_pct': 100 * s['k'] / s['bf'] if s['bf'] else None, 'bb_pct': 100 * s['bb'] / s['bf'] if s['bf'] else None,
        'kbb_pct': 100 * (s['k'] - s['bb']) / s['bf'] if s['bf'] else None,
        'csw_pct': csw, 'whiff_pct': whiff,
        'babip': (s['h'] - s['hr']) / bab_den if bab_den > 0 else None,
        'lob_pct': min(max(100 * (s['h'] + s['bb'] + s['hbp'] - s['r']) / lob_den, 0.0), 100.0) if lob_den > 0 else None,
        'hr_fb': 100 * s['hr'] / fb if n and fb else None,
        'fb_velo_delta': delta,
    }


def worked_example(name: str, apps: list[dict], line: dict, lg: dict, c_fip: float, lg_hr_fb: float) -> None:
    s = {k: sum(a[k] for a in apps) for k in ('ip', 'bf', 'k', 'bb', 'hbp', 'hr', 'er')}
    print(f'\n=== WORKED EXAMPLE: {name} (season) ===')
    print(f"League: ERA {lg['era']:.3f} = 9*{lg['er']:.0f}/{lg['ip']:.1f};  HR {lg['hr']:.0f} BB {lg['bb']:.0f} HBP {lg['hbp']:.0f} K {lg['k']:.0f}")
    print(f"cFIP = {lg['era']:.3f} - (13*{lg['hr']:.0f} + 3*({lg['bb']:.0f}+{lg['hbp']:.0f}) - 2*{lg['k']:.0f}) / {lg['ip']:.1f} = {c_fip:.3f}")
    print(f"Pitcher: IP {s['ip']:.2f}  BF {s['bf']}  K {s['k']}  BB {s['bb']}  HBP {s['hbp']}  HR {s['hr']}  ER {s['er']}  GB {line['gb']}  FB(fly+popup) {line['fb']}")
    print(f"FIP  = (13*{s['hr']} + 3*({s['bb']}+{s['hbp']}) - 2*{s['k']}) / {s['ip']:.2f} + {c_fip:.3f} = {line['fip']:.3f}")
    print(f"xFIP = (13*({line['fb']}*{lg_hr_fb:.4f}) + 3*({s['bb']}+{s['hbp']}) - 2*{s['k']}) / {s['ip']:.2f} + {c_fip:.3f} = {line['xfip']:.3f}   [lg HR/FB {lg_hr_fb:.4f}]")
    g = (line['gb'] - line['fb']) / s['bf']
    print(f"SIERA: k={s['k']/s['bf']:.4f} b={s['bb']/s['bf']:.4f} g=(GB-FB-PU)/PA={g:.4f} (sign of g^2 term: {'-' if g > 0 else '+'}) -> {line['siera']:.3f}")
    print(f"ERA {line['era']:.2f}  K% {line['k_pct']:.1f}  BB% {line['bb_pct']:.1f}  CSW% {line['csw_pct']:.1f}  Whiff% {line['whiff_pct']:.1f}  BABIP {line['babip']:.3f}  LOB% {line['lob_pct']:.1f}  HR/FB {line['hr_fb']:.1f}")


def run(team_id: int, season: int, dry_run: bool, example_id: int | None) -> int:
    pq = load_pitches(season)
    anchor = pd.to_datetime(pq['game_date'].max()).date()
    print(f'Parquet: {len(pq):,} pitches through {anchor}')
    lg = league_totals(season)
    if not lg:
        print('[run] league totals unavailable; aborting (no FIP constant, no fabricated one)')
        return 1
    c_fip = fip_constant(lg)
    P = pitcher_table(pq)
    lg_hr_fb = float(P['hr'].sum() / P['fb'].sum())
    xstats = savant_csv(f'{SAVANT_LB}/expected_statistics', {'type': 'pitcher', 'year': season, 'position': '', 'team': '', 'min': 1, 'csv': 'true'})
    if not xstats:
        print('[run] xERA leaderboard unavailable; xera will be NULL and league ERA/xERA SDs omitted')
    xera_by = {int(r['player_id']): num(r['xera']) for r in xstats or []}
    fbv = fastball_velo(pq)
    prior = prior_velos(season)
    ctx = league_context_rows(season, pq, P, lg, c_fip, xstats, fbv, prior)

    r = mlb_get(f'/teams/{team_id}/roster', {'rosterType': '40Man', 'hydrate': 'person'})
    roster = [x for x in (r or {}).get('roster', []) if x.get('position', {}).get('type') == 'Pitcher']
    print(f'Team {team_id}: {len(roster)} pitchers on the 40-man')
    by_pitcher = {pid: g for pid, g in pq.groupby('pitcher')}
    staff, example = [], None
    for x in roster:
        p = x['person']
        pid = int(p['id'])
        apps = appearances(pid, season)
        if not apps or pid not in by_pitcher:
            continue
        pq_p = by_pitcher[pid]
        gs, g = sum(a['gs'] for a in apps), len(apps)
        role = 'SP' if gs >= g / 2.0 else 'RP'
        prime = None
        if pid in fbv.index:
            pt = fbv.loc[pid, 'pitch_type']
            prime = (pt, prior.get((pid, pt)))
        for win in WINDOWS:
            wa = window_apps(apps, win, anchor)
            line = build_line(pid, wa, pq_p, lg_hr_fb, c_fip, prime)
            if line is None:
                continue
            if win == 'season':
                line['xera'] = xera_by.get(pid)
                if example is None or pid == example_id or (example_id is None and line['ip'] > example[3]['ip']):
                    example = (p['fullName'], apps, wa, line)
            row = {'team_id': team_id, 'player_id': pid, 'season': season, 'win': win, 'player_name': p['fullName'],
                   'role': role, 'throws': (p.get('pitchHand') or {}).get('code'), 'age': p.get('currentAge'), **line}
            row.setdefault('xera', None)
            staff.append(row)
    if example:
        worked_example(example[0], example[1], example[3], lg, c_fip, lg_hr_fb)
        chk = mlb_get(f"/people/{[x['person']['id'] for x in roster if x['person']['fullName'] == example[0]][0]}/stats",
                      {'stats': 'season', 'group': 'pitching', 'season': season})
        try:
            api = chk['stats'][0]['splits'][0]['stat']
            print(f"Reconcile vs season API line: ERA {api['era']} (ours {example[3]['era']:.2f}), IP {api['inningsPitched']}, BF {api['battersFaced']} (ours {example[3]['bf']})")
        except (TypeError, KeyError, IndexError):
            print('[reconcile] season line unavailable')
    season_rows = sorted((r_ for r_ in staff if r_['win'] == 'season'), key=lambda r_: -(r_['ip'] or 0))
    print(f"\nStaff rows: {len(staff)} ({len(season_rows)} pitchers). Season window, by IP:")
    cols = ['player_name', 'role', 'age', 'ip', 'k_pct', 'bb_pct', 'csw_pct', 'whiff_pct', 'era', 'xera', 'fip', 'xfip', 'siera', 'fb_velo_delta']
    print(pd.DataFrame(season_rows)[cols].round(2).to_string(index=False))

    ok = True
    if confirm_abort('fo_league_pitch_context', ctx, dry_run):
        ok &= upsert('fo_league_pitch_context', ctx, 'season,role')
    if confirm_abort('fo_pitch_staff', staff, dry_run):
        ok &= upsert('fo_pitch_staff', staff, 'player_id,season,win')
    return 0 if ok else 1


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--team', type=int, default=143)
    ap.add_argument('--season', type=int, default=2026)
    ap.add_argument('--example', type=int, default=None, help='MLBAM id for the worked example (default: top IP)')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    sys.exit(run(a.team, a.season, a.dry_run, a.example))
