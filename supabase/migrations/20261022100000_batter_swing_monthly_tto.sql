-- Batting Lab "Nerve Centre", step 1 tables. Pages read these rows; nothing is computed from Savant in a render path.
--
-- batter_swing_monthly : how a hitter's swing changed month by month (bat speed, attack angle, squared-up, stance)
--   Single writer: .github/workflows/swing-monthly.yml (scripts/build_batter_swing_monthly.py)
-- batter_tto           : Three True Outcomes (strikeout, walk, home run) per hitter-season, plus the in-play split
--   Single writer: .github/workflows/batter-tto.yml (scripts/build_batter_tto.py)
-- batter_id 0 is the league row (every batter added up) in both tables.

-- SOURCE of batter_swing_monthly (verified against live Savant, 2026-10-22): three leaderboard CSVs, each asked for one calendar
-- month with seasonStart/seasonEnd + dateStart/dateEnd + minSwings=1 (works for 2024, 2025 and 2026):
--   leaderboard/bat-tracking?type=batter&csv=true            -> swings_competitive, contact, avg_bat_speed, squared_up_per_swing, batted_ball_events
--   leaderboard/bat-tracking/swing-path-attack-angle?type=batter&csv=true -> attack_angle (and swing_tilt, attack_direction)
--   visuals/batting-stance?csv=true                          -> avg_foot_sep (inches), avg_stance_angle (degrees)
-- These are Savant's own "competitive swing" and "squared-up" definitions, which the pitch CSV cannot reproduce, so the
-- numbers are taken from Savant, not rebuilt. squared_up_n = round(squared_up_per_swing x swings_competitive) (an exact
-- integer in the data: 0.2295390404 x 1063 = 244.0).
create table if not exists batter_swing_monthly (
  batter_id           int          not null,
  season              int          not null,
  month               smallint     not null,   -- calendar month 3..11
  n_swings            int          not null,   -- Savant swings_competitive: the swings every mean below is taken over
  n_contact           int,                     -- Savant "contact" (bat contact, fouls included): squared-up% = squared_up_n / n_contact
  n_bbe               int,                     -- Savant batted_ball_events
  bat_speed_mean      numeric,                 -- mph
  attack_angle_mean   numeric,                 -- degrees
  squared_up_n        int,
  stance_angle_mean   numeric,                 -- degrees, as Savant reports it (null when Savant has no stance row for him that month)
  stance_width_mean   numeric,                 -- inches (Savant avg_foot_sep)
  updated_at          timestamptz  not null default now(),
  primary key (batter_id, season, month)
);
create index if not exists batter_swing_monthly_window on batter_swing_monthly (season, month);

-- batter_tto: counts per hitter-season from the Savant pitch CSV (one `events` row per plate appearance; truncated_pa left out).
--   k  = strikeout, strikeout_double_play          bb = walk, intent_walk          hr = home_run          hbp = hit_by_pitch
--   hit_in_play = single, double, triple           other_in_play = every other plate appearance (field outs, double plays, force outs,
--   sacrifices, fielder's choices, errors, catcher interference)       pa = k + bb + hr + hbp + hit_in_play + other_in_play
--   TTO% = (k + bb + hr) / pa
--   rolling_tto_n   the TTO count inside the last 100 PA, sampled every 25 PA starting at PA 100: [n@100, n@125, n@150, ...]
--                   (so n / 100 is the rolling TTO%)
--   rolling_tto_sd  standard deviation of those sampled rolling TTO% values (null with fewer than 3 samples, i.e. under 150 PA).
--                   A steadier hitter has a smaller number.
create table if not exists batter_tto (
  batter_id        int          not null,
  season           int          not null,
  name             text,
  team             text,        -- his latest batting team of that season
  pa               int          not null,
  k                int          not null,
  bb               int          not null,
  hr               int          not null,
  hbp              int          not null,
  hit_in_play      int          not null,
  other_in_play    int          not null,
  rolling_tto_n    jsonb,
  rolling_tto_sd   numeric,
  updated_at       timestamptz  not null default now(),
  primary key (batter_id, season)
);
