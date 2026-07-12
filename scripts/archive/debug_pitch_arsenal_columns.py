"""
Debug script: print exactly what pybaseball returns.
"""
import os
from pybaseball import statcast_pitcher_arsenal_stats, cache
import pandas as pd

cache.enable()

# Pandas display options to see all columns
pd.set_option('display.max_columns', None)
pd.set_option('display.max_colwidth', 50)
pd.set_option('display.width', 200)

print('Fetching 2026 pitcher arsenal stats...')
df = statcast_pitcher_arsenal_stats(year=2026, minPA=5)

print(f'\n=== Total rows: {len(df)} ===')
print(f'\n=== ALL COLUMNS ({len(df.columns)}) ===')
for col in df.columns:
    print(f'  {col}')

print(f'\n=== First 3 rows ===')
print(df.head(3).to_string())

print(f'\n=== Velocity-related columns ===')
velocity_keywords = ['speed', 'velocity', 'mph', 'velo', 'release']
for col in df.columns:
    if any(kw in col.lower() for kw in velocity_keywords):
        print(f'\n  Column: {col}')
        print(f'  Sample values: {df[col].head(5).tolist()}')
        print(f'  Null count: {df[col].isnull().sum()} / {len(df)}')