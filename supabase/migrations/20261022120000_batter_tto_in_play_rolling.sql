-- batter_tto additions for the Contact Lab's Three True Outcomes section (migration 20261022100000 made the table; it is empty).
--   gb, ld, fb, pu     in-play plate appearances by batted-ball type (bb_type ground_ball, line_drive, fly_ball, popup) of the
--                      PA-ending pitch, home runs left out (they are in the TTO slice). They add up to hit_in_play + other_in_play less the few in-play PAs with no bb_type.
--   rolling_k_n, rolling_bb_n, rolling_hr_n   the strikeout / walk / home-run count inside the last 100 PA, at the same sample
--                      points as rolling_tto_n ([at PA 100, at PA 125, ...]); rolling_tto_n is their sum.
alter table batter_tto
  add column if not exists gb            int,
  add column if not exists ld            int,
  add column if not exists fb            int,
  add column if not exists pu            int,
  add column if not exists rolling_k_n   jsonb,
  add column if not exists rolling_bb_n  jsonb,
  add column if not exists rolling_hr_n  jsonb;
