#!/usr/bin/env python3
"""
scripts/nfl/verify_ftn_charting.py

Verify FTN charting's real column names before any ingestion script
gets written against them. FTN charting is nflreadpy's play-level
source for coverage type (man/zone, Cover 0-9), which is what
nfl_team_coverage_efficacy was almost certainly built from at the
team-season level -- this checks whether the same source has game_id
and is joinable to a specific QB's specific game.

Run: python3 scripts/nfl/verify_ftn_charting.py
"""
import nflreadpy as nfl

ftn = nfl.load_ftn_charting(seasons=[2025])

print("Columns:", list(ftn.columns))
print()
print("Row count:", ftn.shape[0] if hasattr(ftn, 'shape') else len(ftn))
print()

# Look specifically for game/play linkage and coverage-type fields
game_cols = [c for c in ftn.columns if 'game' in c.lower() or 'play_id' in c.lower()]
coverage_cols = [c for c in ftn.columns if 'cover' in c.lower() or 'man' in c.lower() or 'zone' in c.lower()]
print("Game/play linkage columns:", game_cols)
print("Coverage-related columns:", coverage_cols)
print()

sample = ftn.head(3)
print("Sample rows:")
print(sample)