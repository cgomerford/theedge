"""
scripts/fo/sync_pitch_comps.py

STUB. Not implemented, not scheduled, writes nothing. Shape comparables.

TABLE OWNERSHIP (single writer, when built):
  fo_pitch_comps  <- this script and nothing else.

Plan: docs/claude-code-prompts-pitching-desk.md, Prompt 6.
Inputs when built: models/data/pitches_{season}.parquet via scripts/fo/common.py load_pitches(); shape maths only
from models/src/features.py. Same rules as the other sync scripts: 5-row sample + abort window before any upsert,
dual env fallback, no fabricated rows.

TODO
  - Pool: pitcher-pitch types with >= 100 pitches. Features: velo, IVB, HB (mirrored), spin, extension, arm angle, VAA,
    z-scored within pitch type. 5 nearest neighbours (Euclidean, exclude himself); similarity = round(100*exp(-distance)).
  - Needs scikit-learn in the venv. Weekly cadence is enough.
"""
raise SystemExit('sync_pitch_comps.py is a stub (see the TODO in its header); nothing was run or written.')
