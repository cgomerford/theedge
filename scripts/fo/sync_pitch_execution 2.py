"""
scripts/fo/sync_pitch_execution.py

STUB. Not implemented, not scheduled, writes nothing. Location, discipline and count mix.

TABLE OWNERSHIP (single writer, when built):
  fo_pitch_location, fo_pitch_discipline, fo_pitch_count_mix  <- this script and nothing else.

Plan: docs/claude-code-prompts-pitching-desk.md, Prompt 5.
Inputs when built: models/data/pitches_{season}.parquet via scripts/fo/common.py load_pitches(); shape maths only
from models/src/features.py. Same rules as the other sync scripts: 5-row sample + abort window before any upsert,
dual env fallback, no fabricated rows.

TODO
  - Show the description-code mapping for zone/chase/z-contact/swstr/CSW/first-pitch strike BEFORE coding it.
  - 5x5 grid per pitch type x window x side, scaled to each batter's sz_top/sz_bot (inner 3x3 = zone); store counts,
    swings, whiffs, xwoba_sum so the UI can switch metric without refetching.
  - Count mix by state: first, ahead, even, behind, two_strikes.
"""
raise SystemExit('sync_pitch_execution.py is a stub (see the TODO in its header); nothing was run or written.')
