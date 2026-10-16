"""
scripts/fo/sync_pitch_tto_decay.py

STUB. Not implemented, not scheduled, writes nothing. Times-through-order and velocity decay.

TABLE OWNERSHIP (single writer, when built):
  fo_pitch_tto, fo_pitch_velo_decay  <- this script and nothing else.

Plan: docs/claude-code-prompts-pitching-desk.md, Prompt 7.
Inputs when built: models/data/pitches_{season}.parquet via scripts/fo/common.py load_pitches(); shape maths only
from models/src/features.py. Same rules as the other sync scripts: 5-row sample + abort window before any upsert,
dual env fallback, no fabricated rows.

TODO
  - fo_pitch_tto: xwOBA by n_thruorder_pitcher (1, 2, 3+) per pitcher-season, with BF.
  - fo_pitch_velo_decay: primary fastball velo by pitch-count bucket (1-25, 26-50, 51-75, 76-100, 100+).
"""
raise SystemExit('sync_pitch_tto_decay.py is a stub (see the TODO in its header); nothing was run or written.')
