"""
models/src/train_stuff.py

Train the three Stuff Grade models (stuff_v1.0): train on --train seasons, choose the boosting round on --valid, report
on --test. Offline (offseason); the nightly job only scores with the saved artifacts.

  models/venv/bin/python models/src/train_stuff.py                      # 2023-24 train, 2025 valid, 2026 test, saves
  models/venv/bin/python models/src/train_stuff.py --smoke              # code check on 2026 only; saves NOTHING

Run from the repo root.
"""
from __future__ import annotations

import argparse
import sys
import time

import numpy as np

import stuff as S


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--train', type=int, nargs='+', default=[2023, 2024])
    ap.add_argument('--valid', type=int, default=2025)
    ap.add_argument('--test', type=int, default=2026)
    ap.add_argument('--smoke', action='store_true', help='train and validate on 2026 halves (NOT a real result), save nothing')
    a = ap.parse_args()

    if a.smoke:
        d = S.load_seasons([2026])
        iso = S.fit_bip_map(d)
        d = S.add_target(d, iso).sort_values(['game_date', 'game_pk'])
        cut = d['game_date'].iloc[int(len(d) * .6)]
        train, valid, test = d[d['game_date'] <= cut], d[d['game_date'] > cut], d[d['game_date'] > cut]
    else:
        tr_raw, va_raw, te_raw = S.load_seasons(a.train), S.load_seasons([a.valid]), S.load_seasons([a.test])
        iso = S.fit_bip_map(tr_raw)                      # the BIP mapping is fitted on training seasons only
        train, valid, test = (S.add_target(x, iso) for x in (tr_raw, va_raw, te_raw))
    print(f'rows: train {len(train):,}  valid {len(valid):,}  test {len(test):,}')

    fits = {}
    for g in S.GROUPS:
        t = time.time()
        fits[g] = S.train_group(g, train, valid)
        f = fits[g]
        te = test[test['group'] == g]
        pred = f.model.predict(te[S.F.GROUP_FEATURES[g]])
        mse = float(np.mean((te['y'].values - pred) ** 2))
        const = float(np.mean((te['y'].values - train[train['group'] == g]['y'].mean()) ** 2))
        r2 = 1 - mse / const
        print(f'{g:9} rounds={f.best_iter:3d}  valid MSE {f.val_mse:.5f} (constant {f.val_const_mse:.5f})  '
              f'test MSE {mse:.5f} (constant {const:.5f})  R2 {r2:+.4f}  corr {np.corrcoef(pred, te["y"])[0, 1]:.3f}  '
              f'mean pred {pred.mean():+.5f} vs mean target {te["y"].mean():+.5f}  [{time.time() - t:.0f}s]')

    if a.smoke:
        print('SMOKE RUN: not saved, not a result.')
        return 0
    S.save(fits, iso, {'method_version': S.METHOD_VERSION, 'train': a.train, 'valid': a.valid, 'test': a.test,
                       'rounds': {g: f.best_iter for g, f in fits.items()}, 'features': {g: S.F.GROUP_FEATURES[g] for g in S.GROUPS},
                       'model': 'sklearn HistGradientBoostingRegressor (LightGBM unavailable: no libomp)'})
    print('saved to models/artifacts/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
