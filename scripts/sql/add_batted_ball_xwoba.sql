-- Postgame "Hitters: drop-off or turning a corner?" needs last-15-games baselines that include
-- expected results, not just exit velocity. Adds per-ball xwOBA, actual wOBA value and Statcast's
-- launch_speed_angle category (6 = barrel) to batted_ball_events.
-- Run once in the Supabase SQL editor, then refill history with
--   bash scripts/backfill_statcast.sh 2026-03-27 <yesterday> --batted-only
-- (safe to re-run: the script upserts on game_pk, at_bat_number, pitch_number).
--
-- NOTE: numeric columns come back from PostgREST as STRINGS - coerce with Number() when reading.

alter table batted_ball_events
  add column if not exists estimated_woba    numeric(5,3),  -- Savant estimated_woba_using_speedangle (NULL when Savant leaves it blank)
  add column if not exists woba_value        numeric(5,3),  -- actual wOBA value of the result (0 for an out, ~0.9 single ... ~2.0 HR)
  add column if not exists launch_speed_angle smallint;     -- 1 weak .. 5 solid, 6 barrel

-- The hitter check reads "one batter's balls in play, newest first" (last 15 games).
create index if not exists batted_ball_events_batter_date_idx
  on batted_ball_events (batter_id, game_date desc);

-- Same lookup for plate discipline (whiff / chase / pitches seen) from pitch_events.
create index if not exists pitch_events_batter_date_idx
  on pitch_events (batter_id, game_date desc);
