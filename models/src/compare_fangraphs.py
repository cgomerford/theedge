"""
models/src/compare_fangraphs.py

PRIVATE validation: how The Edge's Stuff Grade (stuff_v1.0) lines up with the FanGraphs Stuff+ leaderboard George pasted
(2026, 46 qualified starters). The FanGraphs numbers are read from models/data/external/ (gitignored), are never written
to Supabase, never reach the site, and the report is written to the same ignored folder. Do not publish or commit either.

Reads : models/data/external/fangraphs_stuff_2026_raw.txt (the pasted table; cells separated by 4-space gaps, an empty
        cell = a wider gap), models/reports/stuff_v1.0_2026_pitchers.csv and ..._2026_pitch_types.csv (validate_stuff.py).
Scale : FanGraphs is 100 = average, 10 per SD. Ours is 50 = average, 10 per SD. "FG on our scale" = 50 + (Stuff+ - 100).
Caveat: 46 qualified starters is a narrow, strong sample; restricted range pulls every correlation down.

  models/venv/bin/python models/src/compare_fangraphs.py --parse-only   # parse + name match only (no grades needed)
  models/venv/bin/python models/src/compare_fangraphs.py
"""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / 'data' / 'external'
COLS = ['rank', 'name', 'team', 'ip', 'FF', 'SI', 'FC', 'FS', 'SL', 'CU', 'CH', 'KC', 'FO', 'fg_stuff', 'fg_location', 'fg_pitching']
PITCH_COLS = ['FF', 'SI', 'FC', 'FS', 'SL', 'CU', 'CH', 'KC', 'FO']   # FanGraphs' FA is Savant's FF


def norm(name: str) -> str:
    """'Sánchez, Cristopher' and 'Cristopher Sánchez' -> 'cristopher sanchez'."""
    if ',' in name:
        last, first = [x.strip() for x in name.split(',', 1)]
        name = f'{first} {last}'
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z ]', '', name.lower()).strip()


def parse_fg(path: Path) -> pd.DataFrame:
    rows = []
    for line in path.read_text(encoding='utf-8').splitlines()[1:]:
        if not line.strip():
            continue
        cells: list[str] = []
        for part in re.split(r'( {4,})', line.strip()):
            if part.strip() == '' and part:
                cells.extend([''] * (len(part) // 4 - 1))     # a gap of k tabs = k-1 empty cells
            elif part:
                cells.append(part.strip())
        if len(cells) != len(COLS):
            raise SystemExit(f'[parse_fg] {len(cells)} cells, expected {len(COLS)}: {line[:60]!r} -> {cells}')
        rows.append(cells)
    df = pd.DataFrame(rows, columns=COLS)
    for c in ['rank', 'ip', *PITCH_COLS, 'fg_stuff', 'fg_location', 'fg_pitching']:
        df[c] = pd.to_numeric(df[c].replace('', np.nan))
    df['key'] = df['name'].map(norm)
    return df


def corr(a: pd.Series, b: pd.Series, method: str = 'pearson') -> float:
    ok = a.notna() & b.notna()
    return float(a[ok].corr(b[ok], method=method)) if ok.sum() > 4 else float('nan')


def main() -> int:
    fg = parse_fg(EXT / 'fangraphs_stuff_2026_raw.txt')
    print(f'parsed {len(fg)} FanGraphs rows; Stuff+ range {fg.fg_stuff.min():.0f}-{fg.fg_stuff.max():.0f}, mean {fg.fg_stuff.mean():.1f}')
    chk = fg[PITCH_COLS].notna().sum(axis=1)
    print('pitch columns filled per row (min/median/max):', int(chk.min()), int(chk.median()), int(chk.max()))
    if '--parse-only' in sys.argv:
        names = pd.read_parquet(ROOT / 'data' / 'pitches_2026.parquet', columns=['pitcher', 'player_name']).drop_duplicates('pitcher')
        names['key'] = names['player_name'].map(norm)
        m = fg.merge(names, on='key', how='left')
        print('matched to a Savant pitcher id:', int(m['pitcher'].notna().sum()), 'of', len(fg))
        print('unmatched:', m[m['pitcher'].isna()]['name'].tolist())
        print('duplicate matches:', m[m.duplicated('name', keep=False)]['name'].tolist())
        return 0

    pit = pd.read_csv(ROOT / 'reports' / 'stuff_v1.0_2026_pitchers.csv')
    typ = pd.read_csv(ROOT / 'reports' / 'stuff_v1.0_2026_pitch_types.csv')
    pit['key'] = pit['player_name'].map(norm)
    typ['key'] = typ['player_name'].map(norm)
    m = fg.merge(pit[['key', 'pitcher', 'pitches', 'stuff_grade', 'era', 'xera', 'kbb']], on='key', how='left')
    miss = m[m['stuff_grade'].isna()]['name'].tolist()
    m = m[m['stuff_grade'].notna()].copy()
    m['fg_on_ours'] = 50 + (m['fg_stuff'] - 100)
    m['rank_fg'] = m['fg_stuff'].rank(ascending=False, method='min')
    m['rank_ours'] = m['stuff_grade'].rank(ascending=False, method='min')
    m['rank_gap'] = m['rank_ours'] - m['rank_fg']           # positive: we rank him lower than FanGraphs does

    md = ['# Stuff Grade stuff_v1.0 vs FanGraphs Stuff+ (2026) — PRIVATE, do not publish or commit', '',
          f'{len(m)} qualified starters matched' + (f' (unmatched: {", ".join(miss)})' if miss else '') + '. FanGraphs on our scale = 50 + (Stuff+ - 100).', '',
          '## Pitcher level (overall)', '',
          f"- Pearson r (our grade vs Stuff+): **{corr(m.stuff_grade, m.fg_stuff):.3f}**; Spearman (rank) **{corr(m.stuff_grade, m.fg_stuff, 'spearman'):.3f}**",
          f"- Spread across these {len(m)}: ours mean {m.stuff_grade.mean():.1f}, SD {m.stuff_grade.std():.1f}; FanGraphs on our scale mean {m.fg_on_ours.mean():.1f}, SD {m.fg_on_ours.std():.1f}",
          f"- Mean gap (ours minus FanGraphs-on-our-scale): {(m.stuff_grade - m.fg_on_ours).mean():+.1f}",
          f"- Top-10 overlap: {len(set(m.nsmallest(10, 'rank_fg')['name']) & set(m.nsmallest(10, 'rank_ours')['name']))} of 10 names in both top 10s",
          f"- Our Stuff Grade vs FanGraphs Pitching+ (their stuff and location combined): r {corr(m.stuff_grade, m.fg_pitching):.3f}; vs Location+ r {corr(m.stuff_grade, m.fg_location):.3f}", '',
          '### Largest rank disagreements', '', '| Pitcher | FG Stuff+ | FG rank | Our grade | Our rank | Gap |', '|---|---|---|---|---|---|']
    for x in pd.concat([m.nlargest(6, 'rank_gap'), m.nsmallest(6, 'rank_gap')]).itertuples():
        md.append(f'| {x.name} | {x.fg_stuff:.0f} | {x.rank_fg:.0f} | {x.stuff_grade:.1f} | {x.rank_ours:.0f} | {x.rank_gap:+.0f} |')

    md += ['', '## Against 2026 results, same 46 starters (descriptive, not predictive)', '',
           '| Measure | vs K-BB% | vs xERA (sign flipped: + = lower xERA) | vs ERA (sign flipped) |', '|---|---|---|---|']
    for lbl, col in (('Our Stuff Grade', 'stuff_grade'), ('FanGraphs Stuff+', 'fg_stuff'), ('FanGraphs Pitching+', 'fg_pitching'), ('FanGraphs Location+', 'fg_location')):
        md.append(f"| {lbl} | {corr(m[col], m.kbb):+.3f} | {corr(m[col], -m.xera):+.3f} | {corr(m[col], -m.era):+.3f} |")

    long = m.melt(id_vars=['key', 'name'], value_vars=PITCH_COLS, var_name='pitch_type', value_name='fg').dropna(subset=['fg'])
    long = long.merge(typ[['key', 'pitch_type', 'pitches', 'stuff_grade']], on=['key', 'pitch_type'], how='inner')
    long = long[long['pitches'] >= 100]
    long['fg_on_ours'] = 50 + (long['fg'] - 100)
    md += ['', '## Pitch-type level (pitcher x pitch, >= 100 of ours)', '',
           f"All {len(long)} pitches: Pearson **{corr(long.stuff_grade, long.fg):.3f}**, Spearman **{corr(long.stuff_grade, long.fg, 'spearman'):.3f}**; "
           f"mean gap (ours - FG on our scale) {(long.stuff_grade - long.fg_on_ours).mean():+.1f}", '',
           '| Pitch | n | Pearson | Spearman | Mean ours | Mean FG on our scale |', '|---|---|---|---|---|---|']
    for pt, g in long.groupby('pitch_type'):
        if len(g) >= 6:
            md.append(f"| {pt} | {len(g)} | {corr(g.stuff_grade, g.fg):.3f} | {corr(g.stuff_grade, g.fg, 'spearman'):.3f} | {g.stuff_grade.mean():.1f} | {g.fg_on_ours.mean():.1f} |")
    md += ['', 'Notes: FanGraphs folds sweepers into SL and may classify some pitches differently, so SL pairs are noisier. '
           'Our sweeper (ST) and slurve (SV) have no FanGraphs column and are not compared.', '']
    out = EXT / 'stuff_v1.0_vs_fangraphs.md'
    out.write_text('\n'.join(md))
    print('\n'.join(md))
    print(f'\nwritten to {out} (gitignored)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
