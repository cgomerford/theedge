-- Run this FIRST. Adds six empty columns to pitch_events for the Second Look and Game Plan Card features, then Claude reloads 2026 to fill them
-- (scripts/fetch_statcast_events.py, same weekly backfill as before). Nothing is deleted or changed; existing rows keep every value they have.
-- Names checked against a live Baseball Savant download (2026-10-26):
--   fielder_2            -> catcher_id         the catcher on that pitch
--   on_1b, on_2b, on_3b  -> on_1b, on_2b, on_3b the runner's player id on each base; null = the base is empty
--   delta_run_exp        -> delta_run_exp      change in run expectancy caused by that pitch (positive = better for the batting side)
--   n_thruorder_pitcher  -> times_through_order how many times the pitcher has faced this lineup (1, 2, 3 ...)
-- estimated_woba (estimated_woba_using_speedangle), woba_value and woba_denom are already stored.

alter table public.pitch_events
  add column if not exists catcher_id integer,
  add column if not exists on_1b integer,
  add column if not exists on_2b integer,
  add column if not exists on_3b integer,
  add column if not exists delta_run_exp numeric(6,3),
  add column if not exists times_through_order smallint;
