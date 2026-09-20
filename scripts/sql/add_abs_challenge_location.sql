-- ABS page: score challenges by HOW CLOSE the pitch was to the zone edge (a 0.1in miss is a much better
-- challenge than a 2in miss). Stores the raw plate location + zone from MLB's live feed; the distance itself
-- is computed in the app (src/lib/abs-challenge-log.ts) so the formula can change without a backfill.
-- Run once in the Supabase SQL editor, then refill with
--   python3 scripts/fetch_abs_challenge_log.py --start-date 2026-03-25 --end-date <yesterday>
-- (safe to re-run: upserts on play_id).
--
-- NOTE: numeric columns come back from PostgREST as STRINGS - coerce with Number() when reading.

alter table abs_challenge_log
  add column if not exists plate_x     numeric(6,3),  -- feet left/right of plate center (sign = side; the distance calc only needs abs())
  add column if not exists plate_z     numeric(6,3),  -- feet above ground
  add column if not exists sz_top      numeric(5,3),  -- batter's zone top, feet (feed strikeZoneTop)
  add column if not exists sz_bot      numeric(5,3),  -- batter's zone bottom, feet (feed strikeZoneBottom)
  add column if not exists sz_width_in numeric(4,1),  -- zone width, inches (17)
  add column if not exists final_call  text;          -- call AFTER review: 'C' called strike | 'B' ball
