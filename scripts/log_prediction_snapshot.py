"""
scripts/log_prediction_snapshot.py

Append-only snapshot of all current edge_predictions to prediction_history.

WHY THIS EXISTS:
The Movers section on /fantasy needs to know how a game's edge_score has changed
during the day. edge_predictions is mutated in-place by each cron pass.
This script logs a snapshot every time predictions update so we can diff.

Runs after each /api/cron/log-predictions cron pass (~6x per day):
  10:00, 14:00, 17:00, 20:00, 23:00 UTC

This is intentionally an append-only log. We never UPDATE rows — just INSERT.
Old rows >30 days can be pruned with a separate maintenance task if size matters.
"""
import os
import sys
from datetime import datetime
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print('Missing env vars')
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def main():
    today = datetime.utcnow().strftime('%Y-%m-%d')
    print(f'Snapshotting predictions for {today}...')

    # Pull today's predictions
    resp = supabase.table('edge_predictions')\
        .select('game_pk, game_date, edge_score, predicted_winner, confidence_tier, components')\
        .eq('game_date', today)\
        .execute()

    if not resp.data:
        print('No predictions for today — nothing to snapshot')
        return

    rows = []
    for p in resp.data:
        rows.append({
            'game_pk':         p['game_pk'],
            'game_date':       p['game_date'],
            'edge_score':      float(p['edge_score']) if p['edge_score'] is not None else 0,
            'predicted_winner': p['predicted_winner'],
            'confidence_tier':  p['confidence_tier'],
            'components':      p.get('components'),
            'snapshot_at':     datetime.utcnow().isoformat(),
        })

    if rows:
        supabase.table('prediction_history').insert(rows).execute()
        print(f'✓ Snapshotted {len(rows)} predictions')
    else:
        print('No rows to insert')


if __name__ == '__main__':
    main()
