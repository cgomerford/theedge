#!/bin/bash
# scripts/backfill_statcast.sh
#
# Backfills pitch_events / batted_ball_events for the season so far by
# calling fetch_statcast_events.py in 7-day chunks. Chunked deliberately —
# pulling multiple months from Baseball Savant in one pybaseball statcast()
# call is slow and prone to timing out; weekly chunks are the standard
# workaround. A short sleep between chunks avoids hammering Savant.
#
# Usage: bash scripts/backfill_statcast.sh 2026-03-27 2026-08-16
#        (first arg = season start, second arg = last date to backfill)

START_DATE=$1
END_DATE=$2

if [ -z "$START_DATE" ] || [ -z "$END_DATE" ]; then
  echo "Usage: bash scripts/backfill_statcast.sh YYYY-MM-DD YYYY-MM-DD"
  exit 1
fi

current="$START_DATE"

while [ "$(date -j -f %Y-%m-%d "$current" +%s 2>/dev/null || date -d "$current" +%s)" -le "$(date -j -f %Y-%m-%d "$END_DATE" +%s 2>/dev/null || date -d "$END_DATE" +%s)" ]; do
  chunk_end=$(date -j -v+6d -f %Y-%m-%d "$current" +%Y-%m-%d 2>/dev/null || date -d "$current + 6 days" +%Y-%m-%d)
  if [[ "$chunk_end" > "$END_DATE" ]]; then
    chunk_end="$END_DATE"
  fi

  echo ""
  echo "=== Backfilling $current to $chunk_end ==="
  python3 scripts/fetch_statcast_events.py --start-date "$current" --end-date "$chunk_end"

  current=$(date -j -v+7d -f %Y-%m-%d "$current" +%Y-%m-%d 2>/dev/null || date -d "$current + 7 days" +%Y-%m-%d)

  echo "Pausing 10s before next chunk..."
  sleep 10
done

echo ""
echo "=== Backfill complete: $START_DATE to $END_DATE ==="