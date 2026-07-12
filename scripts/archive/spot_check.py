from dotenv import load_dotenv
load_dotenv('.env.local')
import sys
sys.path.insert(0, 'scripts')
import fetch_player_form as fpf

pool = fpf.fetch_top_pitchers(2026, 90)
target = next((p for p in pool if p['name'] == 'Foster Griffin'), None)
if not target:
    print('Not found in pool')
else:
    starts = fpf.fetch_pitcher_game_log(target['id'], 2026)
    print(f"{target['name']} — {len(starts)} starts this season:")
    for s in starts:
        era_this_start = (s['er']*9/s['ip']) if s['ip'] > 0 else 99
        print(f"  {s['date']}  IP={s['ip']:.1f}  ER={s['er']}  single-start ERA={era_this_start:.2f}")
