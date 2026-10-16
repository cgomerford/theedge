"""
models/src/validate_stuff.py

Validation report for Stuff Grade stuff_v1.0, following the acceptance tests in the build spec. Reads the saved
artifacts, scores 2024-2026, and writes models/reports/stuff_v1.0.md plus two CSVs (2026 pitch-type and pitcher grades).

Tests run here (spec section "Validation and acceptance criteria"):
  1 Stickiness   year-to-year correlation of pitcher grade (>= 500 pitches both years) vs the same pitchers' ERA, xERA, K-BB%
  2 Predictive   season N grade vs season N+1 K-BB% and xERA, against season N ERA doing the same job
  4 Face validity top / bottom pitch types and pitchers of 2026
  5 Calibration  mean predicted run value vs mean (luck-removed) target and mean raw run value, by pitch group, 2026
Not run yet: 3 Early-season signal (needs per-pitcher chronological xERA).
In-sample note: 2024 is a training season and 2025 chose the boosting round, so the 2024->2025 pair is not out-of-sample;
2025->2026 is the clean pair.

Run from the repo root:  models/venv/bin/python models/src/validate_stuff.py
"""
from __future__ import annotations

import csv
import io
import sys

import numpy as np
import pandas as pd
import requests

import features as F
import stuff as S

MIN_PITCHES = 500
SEASONS = [y for y in (2024, 2025, 2026) if (S.DATA / f'pitches_{y}.parquet').exists()]   # whichever are on disk


def savant_xstats(year: int) -> pd.DataFrame:
    r = requests.get('https://baseballsavant.mlb.com/leaderboard/expected_statistics',
                     params={'type': 'pitcher', 'year': year, 'position': '', 'team': '', 'min': 1, 'csv': 'true'},
                     headers={'User-Agent': 'Mozilla/5.0'}, timeout=90)
    text = r.content.decode('utf-8-sig')
    if r.status_code != 200 or text.lstrip().startswith('<'):
        raise SystemExit(f'[savant_xstats] {year}: HTTP {r.status_code}, not a CSV')
    rows = list(csv.DictReader(io.StringIO(text)))
    df = pd.DataFrame({'pitcher': [int(x['player_id']) for x in rows], 'era': pd.to_numeric([x['era'] for x in rows], errors='coerce'),
                       'xera': pd.to_numeric([x['xera'] for x in rows], errors='coerce'), 'pa': pd.to_numeric([x['pa'] for x in rows], errors='coerce')})
    return df


def kbb(season: int) -> pd.DataFrame:
    raw = pd.read_parquet(S.DATA / f'pitches_{season}.parquet', columns=['pitcher', 'events'])
    ev = raw['events']
    g = pd.DataFrame({'pitcher': raw['pitcher'], 'bf': ev.notna(), 'k': ev.isin({'strikeout', 'strikeout_double_play'}), 'bb': ev.isin({'walk', 'intent_walk'})}).groupby('pitcher').sum()
    g['kbb'] = 100 * (g['k'] - g['bb']) / g['bf'].where(g['bf'] > 0)
    return g.reset_index()[['pitcher', 'bf', 'kbb']]


def r(a: pd.Series, b: pd.Series) -> float:
    ok = a.notna() & b.notna()
    return float(np.corrcoef(a[ok], b[ok])[0, 1]) if ok.sum() > 5 else float('nan')


def main() -> int:
    fits, iso = S.load()
    scored, pit, types, scales = {}, {}, {}, {}
    for s in SEASONS:
        d = S.load_seasons([s])
        d['xrv'] = S.predict(d, fits)
        scales[s] = S.season_scale(d)
        scored[s] = d
        pit[s] = S.pitcher_grades(d, scales[s]).merge(savant_xstats(s), on='pitcher', how='left').merge(kbb(s), on='pitcher', how='left')
        types[s] = S.pitch_type_grades(d, scales[s])
        print(f'{s}: scale mean {scales[s][0]:+.5f} sd {scales[s][1]:.5f}, {len(pit[s])} pitchers')

    md = [f'# Stuff Grade {S.METHOD_VERSION}: validation report', '',
          'Grade = 50 + 10 x (mean xRV - pitcher xRV) / sd xRV, over all scored pitches of the season. Higher = better for the pitcher.',
          'Model: scikit-learn HistGradientBoostingRegressor x3 (fastball / breaking / offspeed). Train 2023-24, round chosen on 2025, 2026 held out.', '']

    md += ['## 1. Stickiness: year-to-year correlation (pitchers with >= 500 pitches in both seasons)', '',
           '| Pair | n | Stuff Grade | ERA | xERA | K-BB% | Clean? |', '|---|---|---|---|---|---|---|']
    pred_rows = []
    for a, b in ((2024, 2025), (2025, 2026)):
        if a not in pit or b not in pit:
            continue
        m = pit[a].merge(pit[b], on='pitcher', suffixes=('_a', '_b'))
        m = m[(m['pitches_a'] >= MIN_PITCHES) & (m['pitches_b'] >= MIN_PITCHES)]
        md.append(f"| {a}->{b} | {len(m)} | {r(m['stuff_grade_a'], m['stuff_grade_b']):.3f} | {r(m['era_a'], m['era_b']):.3f} | {r(m['xera_a'], m['xera_b']):.3f} | {r(m['kbb_a'], m['kbb_b']):.3f} | {'yes' if b == 2026 else 'no (2024 trained, 2025 tuned)'} |")
        pred_rows.append((a, b, m))
    md += ['', '## 2. Predictive power: season N measure vs season N+1 outcome (correlation; sign set so higher = better for the pitcher)', '',
           '| Pair | n | Grade -> K-BB% | ERA -> K-BB% | xERA -> K-BB% | Grade -> xERA | ERA -> xERA |', '|---|---|---|---|---|---|---|']
    for a, b, m in pred_rows:
        md.append(f"| {a}->{b} | {len(m)} | {r(m['stuff_grade_a'], m['kbb_b']):+.3f} | {r(-m['era_a'], m['kbb_b']):+.3f} | {r(-m['xera_a'], m['kbb_b']):+.3f} "
                  f"| {r(m['stuff_grade_a'], -m['xera_b']):+.3f} | {r(-m['era_a'], -m['xera_b']):+.3f} |")

    d26, t26, p26 = scored[2026], types[2026], pit[2026]
    md += ['', '## 4. Face validity, 2026', '', '### Top 20 pitch types (>= 300 pitches)', '', '| # | Pitcher | Pitch | Pitches | Grade | xRV/100 |', '|---|---|---|---|---|---|']
    top = t26[t26['pitches'] >= 300].sort_values('stuff_grade', ascending=False)
    for i, x in enumerate(top.head(20).itertuples(), 1):
        md.append(f'| {i} | {x.player_name} | {x.pitch_type} | {x.pitches} | {x.stuff_grade:.1f} | {x.xrv_per_100:+.2f} |')
    md += ['', '### Bottom 10 pitch types (>= 300 pitches)', '', '| Pitcher | Pitch | Pitches | Grade |', '|---|---|---|---|']
    for x in top.tail(10).itertuples():
        md.append(f'| {x.player_name} | {x.pitch_type} | {x.pitches} | {x.stuff_grade:.1f} |')
    q = p26[p26['pitches'] >= 1000].sort_values('stuff_grade', ascending=False)
    md += ['', '### Top 20 pitchers (>= 1,000 pitches)', '', '| # | Pitcher | Pitches | Grade | ERA | xERA |', '|---|---|---|---|---|---|']
    for i, x in enumerate(q.head(20).itertuples(), 1):
        md.append(f'| {i} | {x.player_name} | {x.pitches} | {x.stuff_grade:.1f} | {x.era} | {x.xera} |')
    md += ['', '### Bottom 10 pitchers (>= 1,000 pitches)', '', '| Pitcher | Pitches | Grade | ERA | xERA |', '|---|---|---|---|---|']
    for x in q.tail(10).itertuples():
        md.append(f'| {x.player_name} | {x.pitches} | {x.stuff_grade:.1f} | {x.era} | {x.xera} |')
    pp = p26[p26['pitches'] >= 1000]['stuff_grade']
    md += ['', f'Pitcher grade spread, 2026, >= 1,000 pitches: min {pp.min():.1f}, 5th pct {pp.quantile(.05):.1f}, median {pp.median():.1f}, 95th pct {pp.quantile(.95):.1f}, max {pp.max():.1f}, SD {pp.std():.1f}.']
    by = t26[t26['pitches'] >= 100].groupby('pitch_type')['stuff_grade'].agg(['count', 'mean', 'std']).round(1)
    md += ['', '### Mean grade by pitch type (>= 100 pitches), 2026', '', '| Pitch | n | Mean | SD |', '|---|---|---|---|'] + [f'| {i} | {int(x["count"])} | {x["mean"]} | {x["std"]} |' for i, x in by.iterrows()]

    md += ['', '## 5. Calibration, 2026 (runs per pitch, batter view)', '', '| Group | Pitches | Mean predicted | Mean luck-removed target | Mean raw run value |', '|---|---|---|---|---|']
    d26t = S.add_target(d26, iso)
    for g in S.GROUPS:
        a = d26[d26['group'] == g]
        b = d26t[d26t['group'] == g]
        md.append(f"| {g} | {len(a):,} | {a['xrv'].mean():+.5f} | {b['y'].mean():+.5f} | {a['delta_run_exp'].mean():+.5f} |")
    md += ['', 'Not run: test 3 (early-season signal).', '']

    S.REP.mkdir(exist_ok=True)
    (S.REP / f'stuff_{"v1.0"}.md').write_text('\n'.join(md))
    t26.sort_values('stuff_grade', ascending=False).to_csv(S.REP / 'stuff_v1.0_2026_pitch_types.csv', index=False)
    p26.sort_values('stuff_grade', ascending=False).to_csv(S.REP / 'stuff_v1.0_2026_pitchers.csv', index=False)
    print('\n'.join(md))
    return 0


if __name__ == '__main__':
    sys.exit(main())
