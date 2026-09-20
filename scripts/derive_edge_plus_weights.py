"""
derive_edge_plus_weights.py

Not part of the app runtime — a re-runnable, real regression to derive
data-driven weights for Edge+'s "stuff" components (spin rate, release
extension, velocity, movement) instead of hand-picked ones. Re-run this
each season (or whenever the underlying weights in src/lib/edge-plus.ts
should be refreshed) and copy the printed "Scaled into a 0.42 weight
budget" numbers into EDGE_PLUS_WEIGHTS there — this script does not write
to the app itself.

Usage:
    python3 scripts/derive_edge_plus_weights.py

Method: pull Baseball Savant's real aggregated per-pitcher-per-pitch-type
leaderboard (same live endpoint used by src/lib/pitch-physical-percentiles.ts),
for every common pitch type. Within EACH pitch type's own pool, convert
spin/extension/velocity/movement/xwOBA to percentile ranks (0-100) — this
is the same normalization Edge+ already does, and it's what makes it valid
to pool every pitch type together afterward (a slider's raw spin and a
four-seam's raw spin aren't comparable, but "88th percentile among
sliders" and "88th percentile among four-seams" are).

Then run one OLS regression, across every pooled row from every pitch
type: xwOBA percentile (higher = better outcome, already inverted) on the
four stuff percentiles. The resulting standardized coefficients say how
much each one actually moves real outcomes, league-wide — that becomes
the real, disclosed basis for Edge+'s stuff-component weights.
"""

import csv
import io
import subprocess
import sys
import numpy as np

PITCH_TYPES = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS', 'SV']
SEASON = 2026
MIN_PITCHES = 20

def fetch(pitch_type):
    url = (
        'https://baseballsavant.mlb.com/statcast_search/csv'
        f'?all=true&hfGT=R%7C&hfSea={SEASON}%7C&player_type=pitcher'
        f'&hfPT={pitch_type}%7C'
        f'&game_date_gt={SEASON}-01-01&game_date_lt={SEASON}-12-31'
        '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches'
        '&player_event_sort=api_p_release_speed&sort_order=desc'
    )
    # Shell out to curl (same tool already verified to work against this
    # endpoint in this environment) — this Python install's own SSL certs
    # fail cert verification here, curl's don't.
    text = subprocess.run(
        ['curl', '-s', url, '-H', 'User-Agent: Mozilla/5.0'],
        capture_output=True, timeout=30, check=True,
    ).stdout.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)

def safe_float(v):
    try:
        f = float(v)
        return None if f != f else f
    except (TypeError, ValueError):
        return None

def percentile_rank(values, v):
    if v is None:
        return None
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    if n < 5:
        return None
    rank = sum(1 for x in sorted_vals if x <= v) / n
    return rank * 100

all_rows = []
z_rows = []
for pt in PITCH_TYPES:
    try:
        rows = fetch(pt)
    except Exception as e:
        print(f'{pt}: fetch failed ({e})', file=sys.stderr)
        continue

    parsed = []
    for r in rows:
        pitches = safe_float(r.get('pitches'))
        if pitches is None or pitches < MIN_PITCHES:
            continue
        spin = safe_float(r.get('spin_rate'))
        ext = safe_float(r.get('release_extension'))
        velo = safe_float(r.get('velocity'))
        bz = safe_float(r.get('api_break_z_induced'))
        bx = safe_float(r.get('api_break_x_arm'))
        xwoba = safe_float(r.get('xwoba'))
        if None in (spin, ext, velo, bz, bx, xwoba):
            continue
        movement = (bz ** 2 + bx ** 2) ** 0.5
        parsed.append({'spin': spin, 'ext': ext, 'velo': velo, 'movement': movement, 'xwoba': xwoba})

    if len(parsed) < 20:
        print(f'{pt}: only {len(parsed)} qualified rows, skipping', file=sys.stderr)
        continue

    spins = [p['spin'] for p in parsed]
    exts = [p['ext'] for p in parsed]
    velos = [p['velo'] for p in parsed]
    movements = [p['movement'] for p in parsed]
    xwobas = [p['xwoba'] for p in parsed]

    def z(vals, v):
        m = np.mean(vals); s = np.std(vals)
        return (v - m) / s if s > 0 else 0.0

    for p in parsed:
        spin_pct = percentile_rank(spins, p['spin'])
        ext_pct = percentile_rank(exts, p['ext'])
        velo_pct = percentile_rank(velos, p['velo'])
        move_pct = percentile_rank(movements, p['movement'])
        # xwOBA: lower raw = better, so invert to percentile-of-goodness
        xwoba_rank_bad = percentile_rank(xwobas, p['xwoba'])
        xwoba_pct_good = 100 - xwoba_rank_bad if xwoba_rank_bad is not None else None
        if None in (spin_pct, ext_pct, velo_pct, move_pct, xwoba_pct_good):
            continue
        all_rows.append([spin_pct, ext_pct, velo_pct, move_pct, xwoba_pct_good])

        # Z-score version (within pitch type), preserves magnitude instead
        # of collapsing to rank — run as a second model to compare R^2.
        z_rows.append([
            z(spins, p['spin']), z(exts, p['ext']), z(velos, p['velo']), z(movements, p['movement']),
            -z(xwobas, p['xwoba']),  # negate so higher = better, matches percentile-good direction
        ])

    print(f'{pt}: {len(parsed)} qualified rows pooled', file=sys.stderr)

print(f'\nTotal pooled rows across all pitch types: {len(all_rows)}', file=sys.stderr)

data = np.array(all_rows)
X_raw = data[:, :4]  # spin, ext, velo, movement percentiles
y = data[:, 4]       # xwOBA-goodness percentile

# Standardize predictors (z-score) so coefficients are comparable
X_mean = X_raw.mean(axis=0)
X_std = X_raw.std(axis=0)
X_z = (X_raw - X_mean) / X_std

# OLS via normal equations, with intercept
X_design = np.column_stack([np.ones(len(X_z)), X_z])
coeffs, residuals, rank, sv = np.linalg.lstsq(X_design, y, rcond=None)
intercept, b_spin, b_ext, b_velo, b_move = coeffs

y_pred = X_design @ coeffs
ss_res = np.sum((y - y_pred) ** 2)
ss_tot = np.sum((y - y.mean()) ** 2)
r2 = 1 - ss_res / ss_tot

print('\n=== OLS: xwOBA-goodness percentile ~ spin + extension + velo + movement (all percentiles, standardized) ===')
print(f'N = {len(all_rows)}, R^2 = {r2:.4f}')
print(f'Intercept: {intercept:.3f}')
print(f'  spin coefficient:      {b_spin:.4f}')
print(f'  extension coefficient: {b_ext:.4f}')
print(f'  velo coefficient:      {b_velo:.4f}')
print(f'  movement coefficient:  {b_move:.4f}')

coefs = {'spin': b_spin, 'extension': b_ext, 'velo': b_velo, 'movement': b_move}
abs_sum = sum(abs(v) for v in coefs.values())
print('\nNormalized relative importance (abs value / sum of abs values):')
for k, v in coefs.items():
    print(f'  {k}: {abs(v) / abs_sum:.4f}')

STUFF_BUDGET = 0.42
print(f'\nScaled into a {STUFF_BUDGET} weight budget (matching current movement+velo+extension+spin total):')
for k, v in coefs.items():
    print(f'  {k}: {round(abs(v) / abs_sum * STUFF_BUDGET, 4)}')

# --- Second model: same pooled design, but z-scores instead of percentile
# ranks (preserves magnitude info a rank transform throws away) ---
zdata = np.array(z_rows)
Xz_raw = zdata[:, :4]
yz = zdata[:, 4]
Xz_design = np.column_stack([np.ones(len(Xz_raw)), Xz_raw])
zcoeffs, *_ = np.linalg.lstsq(Xz_design, yz, rcond=None)
zintercept, zb_spin, zb_ext, zb_velo, zb_move = zcoeffs
yz_pred = Xz_design @ zcoeffs
zr2 = 1 - np.sum((yz - yz_pred) ** 2) / np.sum((yz - yz.mean()) ** 2)

print('\n=== OLS (z-score version): xwOBA-goodness z ~ spin + extension + velo + movement (within-type z-scores) ===')
print(f'N = {len(z_rows)}, R^2 = {zr2:.4f}')
print(f'  spin coefficient:      {zb_spin:.4f}')
print(f'  extension coefficient: {zb_ext:.4f}')
print(f'  velo coefficient:      {zb_velo:.4f}')
print(f'  movement coefficient:  {zb_move:.4f}')
zcoefs = {'spin': zb_spin, 'extension': zb_ext, 'velo': zb_velo, 'movement': zb_move}
zabs_sum = sum(abs(v) for v in zcoefs.values())
print('Normalized relative importance:')
for k, v in zcoefs.items():
    print(f'  {k}: {abs(v) / zabs_sum:.4f}')

# --- Pairwise correlations, for sanity ---
print('\n=== Pairwise correlation of each stuff percentile with xwOBA-goodness percentile ===')
labels = ['spin', 'extension', 'velo', 'movement']
for i, label in enumerate(labels):
    corr = np.corrcoef(X_raw[:, i], y)[0, 1]
    print(f'  {label}: r = {corr:.4f}')
