"""
models/src/features.py

ONE source of truth for pitch-shape maths. The Pitching Desk sync scripts and the
future Stuff Grade training and scoring code all import from here; nothing may copy
these formulas. (Stuff Grade spec: docs/pitch-and-bat-models-build-spec.md.)

Input is the pitch-level frame written by fetch_pitches.py. Every column used below was
confirmed in the live 2026 Savant header (2026-10-15).

Conventions
  * Distances in the Savant CSV are feet; pfx_x / pfx_z are feet of movement. We publish INCHES.
  * pfx_x and release_pos_x are from the catcher's view. For a right-hander the arm side is
    negative x, for a left-hander it is positive x. We mirror so ARM SIDE IS POSITIVE for
    everyone: x_mirrored = ARM_SIDE_SIGN * x, with sign -1 for R and +1 for L.
  * Statcast's initial-condition coordinates are at y = 50 ft from the plate (vy0 < 0, ay > 0).

Approach angle (VAA / HAA) at the front of the plate, y_f = 17 in = 17/12 ft:
    vy_f = -sqrt(vy0^2 + 2 * ay * (y_f - 50))
    t    = (vy_f - vy0) / ay
    vz_f = vz0 + az * t          vx_f = vx0 + ax * t
    VAA  = atan(vz_f / -vy_f)  in degrees   (vy_f < 0 toward the plate, so -vy_f is the forward speed; a descending
           ball has vz_f < 0, so VAA is negative: about -5 for a four-seamer, flatter = closer to 0)
    HAA  = atan(vx_f / -vy_f)  in degrees   (catcher's-view x; not mirrored)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

PLATE_FRONT_FT = 17.0 / 12.0
RELEASE_Y_FT = 50.0

# Pitch groups for the Stuff Grade model (spec) and for the desk's primary-fastball logic.
FASTBALLS = ('FF', 'SI', 'FC')
BREAKING = ('SL', 'ST', 'CU', 'KC', 'SV', 'CS')
OFFSPEED = ('CH', 'FS', 'FO', 'SC')
PITCH_GROUP = {**{p: 'fastball' for p in FASTBALLS}, **{p: 'breaking' for p in BREAKING}, **{p: 'offspeed' for p in OFFSPEED}}

# Outcome codes in `description` (every distinct value in the 2026 season file is accounted for here or is a ball /
# hit-by-pitch / automatic call). Checked 2026-10-15 against the Savant pitch-arsenal-stats leaderboard for
# C. Sanchez: WHIFF including foul_tip matched Savant's whiff_percent to the decimal on all three pitch types.
WHIFF_DESCS = frozenset({'swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt', 'swinging_pitchout'})
SWING_DESCS = frozenset({
    'swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt', 'swinging_pitchout',
    'foul', 'foul_bunt', 'bunt_foul_tip', 'hit_into_play',
})
CALLED_STRIKE_DESCS = frozenset({'called_strike'})
CSW_DESCS = CALLED_STRIKE_DESCS | WHIFF_DESCS      # called strikes + whiffs, over all pitches
# Run value: rv_per_100 = -sum(delta_run_exp) / pitches * 100 is positive when good for the pitcher, matching
# Savant's run_value_per_100 exactly (checked on the same three pitch types).


def arm_side_sign(p_throws: pd.Series) -> pd.Series:
    """-1 for right-handers, +1 for left-handers (catcher's-view x: arm side is negative for R)."""
    return np.where(p_throws == 'L', 1.0, -1.0)


def add_shape_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy with: hb_in, ivb_in (inches, arm side positive), rel_x_arm, rel_z (ft),
    spin_axis_mirror, vaa, haa. Rows missing tracking values keep NaN, never a filled value."""
    out = df.copy()
    sgn = arm_side_sign(out['p_throws'])
    out['hb_in'] = out['pfx_x'] * 12.0 * sgn
    out['ivb_in'] = out['pfx_z'] * 12.0
    out['rel_x_arm'] = out['release_pos_x'] * sgn
    out['rel_z'] = out['release_pos_z']
    out['spin_axis_mirror'] = np.where(out['p_throws'] == 'L', 360.0 - out['spin_axis'], out['spin_axis'])
    out['vaa'], out['haa'] = approach_angles(out)
    return out


def approach_angles(df: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    vy0, vz0, vx0, ay, az, ax = (df[c] for c in ('vy0', 'vz0', 'vx0', 'ay', 'az', 'ax'))
    disc = vy0 ** 2 + 2.0 * ay * (PLATE_FRONT_FT - RELEASE_Y_FT)
    vy_f = -np.sqrt(disc.where(disc > 0))
    t = (vy_f - vy0) / ay
    vz_f = vz0 + az * t
    vx_f = vx0 + ax * t
    return np.degrees(np.arctan(vz_f / -vy_f)), np.degrees(np.arctan(vx_f / -vy_f))


# ── Stuff Grade features (spec: docs/pitch-and-bat-models-build-spec.md) ─────────────────────────────────────────
# Physical traits only. Plate location and the count are deliberately NOT features: they belong to a later Location
# model, and leaving them out keeps the grade about the pitch, not where it was thrown.
STUFF_RAW = ['release_speed', 'release_spin_rate', 'spin_axis_mirror', 'hb_in', 'ivb_in', 'release_extension', 'rel_x_arm', 'rel_z',
             'arm_angle', 'vaa', 'haa', 'p_throws_l', 'stand_l']
STUFF_DIFF = ['velo_gap', 'ivb_gap', 'hb_gap']     # versus his season-primary fastball (breaking and offspeed models only)
GROUP_FEATURES = {'fastball': STUFF_RAW, 'breaking': STUFF_RAW + STUFF_DIFF, 'offspeed': STUFF_RAW + STUFF_DIFF}
_TRACKING = ['release_speed', 'release_spin_rate', 'spin_axis', 'pfx_x', 'pfx_z', 'release_extension', 'release_pos_x', 'release_pos_z',
             'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az']


def add_stuff_features(df: pd.DataFrame) -> pd.DataFrame:
    """Rows the Stuff Grade can score, with every STUFF_RAW / STUFF_DIFF column plus `season` and `group`.
    Dropped: pitch types outside the three groups (pitchouts, eephus, knuckleballs, unlabelled) and rows missing tracking.
    arm_angle may be NaN (absent before 2024); tree models take NaN as is. Never fills a missing tracking value."""
    d = df[df['pitch_type'].isin(PITCH_GROUP)].copy()
    d = d.dropna(subset=_TRACKING)
    d = add_shape_columns(d)
    d = d.dropna(subset=['vaa', 'haa'])
    d['group'] = d['pitch_type'].map(PITCH_GROUP)
    d['season'] = pd.to_datetime(d['game_date']).dt.year
    d['p_throws_l'] = (d['p_throws'] == 'L').astype(float)
    d['stand_l'] = (d['stand'] == 'L').astype(float)
    # Season-primary fastball per pitcher: most-thrown of FF/SI/FC, and its mean velocity / IVB / HB.
    fb = d[d['pitch_type'].isin(FASTBALLS)]
    n = fb.groupby(['pitcher', 'season', 'pitch_type']).size().rename('n').reset_index()
    primary = n.sort_values(['pitcher', 'season', 'n'], ascending=[True, True, False]).groupby(['pitcher', 'season']).head(1)[['pitcher', 'season', 'pitch_type']]
    base = fb.merge(primary, on=['pitcher', 'season', 'pitch_type']).groupby(['pitcher', 'season']).agg(
        fb_velo=('release_speed', 'mean'), fb_ivb=('ivb_in', 'mean'), fb_hb=('hb_in', 'mean')).reset_index()
    d = d.merge(base, on=['pitcher', 'season'], how='left')
    d['velo_gap'] = d['fb_velo'] - d['release_speed']
    d['ivb_gap'] = d['fb_ivb'] - d['ivb_in']
    d['hb_gap'] = d['fb_hb'] - d['hb_in']
    return d


def primary_fastball(pitcher_pitches: pd.DataFrame) -> str | None:
    """Most-thrown of FF / SI / FC, or None if he threw none."""
    fb = pitcher_pitches[pitcher_pitches['pitch_type'].isin(FASTBALLS)]['pitch_type'].value_counts()
    return None if fb.empty else str(fb.index[0])


def is_swing(description: pd.Series) -> pd.Series:
    return description.isin(SWING_DESCS)


def is_whiff(description: pd.Series) -> pd.Series:
    return description.isin(WHIFF_DESCS)


if __name__ == '__main__':  # quick self-check against a season file: python models/src/features.py 2026
    import sys
    from pathlib import Path
    path = Path(__file__).resolve().parent.parent / 'data' / f'pitches_{sys.argv[1] if len(sys.argv) > 1 else 2026}.parquet'
    d = add_shape_columns(pd.read_parquet(path))
    print(d.groupby(['p_throws', 'pitch_type'])[['hb_in', 'ivb_in', 'rel_x_arm', 'vaa', 'haa']].mean().round(2).loc[(slice(None), ['FF', 'CH', 'SL']), :])
