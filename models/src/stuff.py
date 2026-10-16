"""
models/src/stuff.py

Stuff Grade, version stuff_v1.0: how good a pitch is from its physical traits alone, on the 20-80 scale.
Spec: docs/pitch-and-bat-models-build-spec.md. Feature maths lives in features.py (add_stuff_features); this module
holds the target, the three models (fastball / breaking / offspeed) and the grade scaling.

DEVIATION FROM THE SPEC: the model is scikit-learn's HistGradientBoostingRegressor, not LightGBM. LightGBM needs the
libomp system library, which this Mac does not have (no Homebrew). Both are histogram-based gradient-boosted trees; the
choice can be swapped without changing anything else here (fit / predict interface). Artifacts are joblib files.

TARGET (runs per pitch, batter's view, luck removed)
  * balls, called strikes, whiffs, fouls, hit-by-pitch: delta_run_exp as given.
  * balls in play: delta_run_exp is replaced by iso(estimated_woba_using_speedangle), where iso is a monotone
    (isotonic) fit of delta_run_exp on estimated wOBA over balls in play in the TRAINING seasons. Defence and BABIP luck
    drop out; the base-out context averages out. Contact with no estimate (bunts etc.) is dropped.
GRADE (spec): Grade = 50 + 10 * (mean_xRV - xRV) / sd_xRV, xRV = predicted run value per pitch (batter's view, so a
  lower xRV is better for the pitcher and the sign is flipped). mean and sd are over ALL scored pitches of the season.
  A pitcher-type or pitcher grade uses that slice's mean xRV in the same formula.
SPLIT (spec): train 2023-2024, early-stop on 2025, test 2026. Never a random split (it leaks a pitcher across sets).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression

import features as F

ROOT = Path(__file__).resolve().parent.parent
DATA, ART, REP = ROOT / 'data', ROOT / 'artifacts', ROOT / 'reports'
METHOD_VERSION = 'stuff_v1.0'
GROUPS = ('fastball', 'breaking', 'offspeed')
KEEP = ['pitcher', 'player_name', 'game_pk', 'game_date', 'at_bat_number', 'pitch_number', 'pitch_type', 'p_throws', 'stand',
        'type', 'description', 'events', 'estimated_woba_using_speedangle', 'delta_run_exp', 'woba_value', 'woba_denom',
        'season', 'group', *dict.fromkeys(F.STUFF_RAW + F.STUFF_DIFF)]


def load_seasons(seasons: list[int]) -> pd.DataFrame:
    frames = []
    for s in seasons:
        p = DATA / f'pitches_{s}.parquet'
        if not p.exists():
            raise SystemExit(f'[load_seasons] {p} missing. Run models/src/fetch_pitches.py --season {s}')
        frames.append(F.add_stuff_features(pd.read_parquet(p))[KEEP])
    return pd.concat(frames, ignore_index=True)


def fit_bip_map(d: pd.DataFrame) -> IsotonicRegression:
    bip = d[(d['type'] == 'X') & d['estimated_woba_using_speedangle'].notna() & d['delta_run_exp'].notna()]
    return IsotonicRegression(out_of_bounds='clip', increasing=True).fit(bip['estimated_woba_using_speedangle'], bip['delta_run_exp'])


def add_target(d: pd.DataFrame, iso: IsotonicRegression) -> pd.DataFrame:
    y = d['delta_run_exp'].astype(float).copy()
    bip = d['type'] == 'X'
    xw = d['estimated_woba_using_speedangle']
    has = bip & xw.notna()
    y[has] = iso.predict(xw[has])
    y[bip & xw.isna()] = np.nan
    out = d.assign(y=y)
    return out.dropna(subset=['y'])


def new_model(n_iter: int) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(loss='squared_error', max_iter=n_iter, learning_rate=0.05, max_leaf_nodes=31,
                                         min_samples_leaf=300, l2_regularization=1.0, early_stopping=False, random_state=0)


@dataclass
class Fit:
    model: HistGradientBoostingRegressor
    best_iter: int
    val_mse: float
    val_const_mse: float


def train_group(group: str, train: pd.DataFrame, valid: pd.DataFrame, max_iter: int = 600) -> Fit:
    """Fit on `train`, choose the iteration count that minimises validation MSE (a held-out SEASON), refit at that count."""
    cols = F.GROUP_FEATURES[group]
    tr, va = train[train['group'] == group], valid[valid['group'] == group]
    big = new_model(max_iter).fit(tr[cols], tr['y'])
    mses = [float(np.mean((va['y'].values - p) ** 2)) for p in big.staged_predict(va[cols])]
    best = int(np.argmin(mses)) + 1
    model = new_model(best).fit(tr[cols], tr['y'])
    return Fit(model, best, mses[best - 1], float(np.mean((va['y'].values - tr['y'].mean()) ** 2)))


def predict(d: pd.DataFrame, fits: dict[str, HistGradientBoostingRegressor]) -> pd.Series:
    out = pd.Series(np.nan, index=d.index)
    for g in GROUPS:
        m = d['group'] == g
        if m.any():
            out[m] = fits[g].predict(d.loc[m, F.GROUP_FEATURES[g]])
    return out


def save(fits: dict[str, Fit], iso: IsotonicRegression, meta: dict) -> None:
    ART.mkdir(exist_ok=True)
    for g, f in fits.items():
        joblib.dump(f.model, ART / f'stuff_{g}_{METHOD_VERSION}.joblib')
    joblib.dump(iso, ART / f'stuff_bip_map_{METHOD_VERSION}.joblib')
    (ART / f'stuff_{METHOD_VERSION}.json').write_text(json.dumps(meta, indent=2))


def load() -> tuple[dict[str, HistGradientBoostingRegressor], IsotonicRegression]:
    fits = {g: joblib.load(ART / f'stuff_{g}_{METHOD_VERSION}.joblib') for g in GROUPS}
    return fits, joblib.load(ART / f'stuff_bip_map_{METHOD_VERSION}.joblib')


# ── grades ──────────────────────────────────────────────────────────────────

def season_scale(d: pd.DataFrame) -> tuple[float, float]:
    """mean and sd of predicted run value per pitch over every scored pitch of the season (the spec's scale)."""
    return float(d['xrv'].mean()), float(d['xrv'].std())


def to_grade(mean_xrv, scale: tuple[float, float]):
    return 50 + 10 * (scale[0] - mean_xrv) / scale[1]


def pitch_type_grades(d: pd.DataFrame, scale: tuple[float, float]) -> pd.DataFrame:
    """One row per pitcher x pitch type for the season: pitches, xRV per 100 (pitcher's view, + = good), grade."""
    g = d.groupby(['pitcher', 'pitch_type'])
    t = pd.DataFrame({'player_name': g['player_name'].first(), 'pitches': g.size(), 'xrv_mean': g['xrv'].mean()}).reset_index()
    t['xrv_per_100'] = -t['xrv_mean'] * 100
    t['stuff_grade'] = to_grade(t['xrv_mean'], scale)
    return t


def pitcher_grades(d: pd.DataFrame, scale: tuple[float, float]) -> pd.DataFrame:
    """One row per pitcher: usage-weighted over his whole arsenal (the mean of his pitch-level xRV)."""
    g = d.groupby('pitcher')
    t = pd.DataFrame({'player_name': g['player_name'].first(), 'pitches': g.size(), 'xrv_mean': g['xrv'].mean()}).reset_index()
    t['stuff_grade'] = to_grade(t['xrv_mean'], scale)
    return t
