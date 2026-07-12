"""
Verify pybaseball.statcast_pitcher returns release_speed
"""
from pybaseball import statcast_pitcher, cache
from datetime import datetime, timedelta
import pandas as pd

cache.enable()

# Test with Aaron Nola (player_id: 605400) — known active starter
# Pull last 30 days of pitches
end = datetime.now().date()
start = end - timedelta(days=30)

print(f'Fetching pitches for Aaron Nola ({start} to {end})...')
df = statcast_pitcher(start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d'), 605400)

print(f'\nReturned {len(df)} pitches')
print(f'\nColumns ({len(df.columns)}):')
for col in df.columns[:30]:
    print(f'  {col}')
print(f'  ... (showing first 30)')

print(f'\n=== Speed/Velocity columns ===')
for col in df.columns:
    if any(kw in col.lower() for kw in ['speed', 'velocity', 'mph', 'velo']):
        print(f'\n  Column: {col}')
        print(f'  Sample values: {df[col].head(5).tolist()}')
        print(f'  Null count: {df[col].isnull().sum()} / {len(df)}')

print(f'\n=== Pitch type column ===')
if 'pitch_type' in df.columns:
    print(f'  Sample pitch types: {df["pitch_type"].head(10).tolist()}')
    print(f'  Unique types: {df["pitch_type"].unique()}')