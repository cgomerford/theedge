import csv, io, requests

url = 'https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=batter&pitchType=&team=&min=10&year=2026&csv=true'
resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
print('status:', resp.status_code)
print('first 300 chars of raw text:')
print(repr(resp.text[:300]))
print()

reader = csv.DictReader(io.StringIO(resp.text))
rows = list(reader)
print('row count:', len(rows))
if rows:
    print('keys:', list(rows[0].keys()))
    print('first row:', rows[0])
    print()
    print('pa value:', repr(rows[0].get('pa')))
    print('player_id value:', repr(rows[0].get('player_id')))
