-- Swing Lab (Batting Lab "Decisions" tab): did the hitter make the league-average choice, pitch by pitch?
-- Pages read these rows; nothing is computed from Savant in a render path.
--
-- Single writer for ALL THREE tables: .github/workflows/swing-decisions.yml (scripts/build_swing_decisions.py).
-- One pass over the regular-season Savant CSVs fills them together, so they always describe the same pitches.
--
-- SOURCE (verified against a live pull of 2026-09-15): delta_run_exp is present and is from the BATTER's side
-- (called strike three -0.233, ball +0.054). Used as the run value of a pitch's outcome.
--   swing = swinging_strike, swinging_strike_blocked, foul, foul_tip, hit_into_play
--   take  = ball, called_strike, blocked_ball
--   everything else (bunts, hit_by_pitch, pitchout, automatic_ball/strike) is not a decision and is left out.
--
-- GRID: 5 x 5 around the strike zone, in the BATTER's frame. zone_r 0 = above the zone .. 4 = below (the inner three
-- rows are thirds of that batter's own sz_top..sz_bot, padded 0.12 ft for the ball). zone_c 0 = wide inside .. 4 = wide
-- away: plate_x is flipped for left-handed batters so "inside" is always column 0. The inner 3 columns span +-0.83 ft.
-- count_group: even = 0-0,1-1 | hitters = 1-0,2-0,3-0,2-1,3-1 | two_strike = any two-strike count. (0-1 is in
-- none of the three; it appears only on the count ladder.)
-- family: fastball = FF SI FC | breaking = SL ST CU KC SV | offspeed = CH FS FO.
-- coord_era: same value and meaning as pitch_shape_bins ('2026'); eras are never pooled.

-- League baseline, one row per count_group x family x pitcher hand x cell.
create table if not exists swing_decision_league (
  coord_era       text         not null,
  count_group     text         not null,
  family          text         not null,
  p_throws        char(1)      not null,
  zone_r          smallint     not null,
  zone_c          smallint     not null,
  n               int          not null,   -- decision pitches in the cell (swings + takes)
  n_swing         int          not null,
  n_take          int          not null,
  swing_rate      numeric      not null,
  rv_swing_mean   numeric,                 -- mean delta_run_exp of swings in the cell (null if none)
  rv_take_mean    numeric,
  updated_at      timestamptz  not null default now(),
  primary key (coord_era, count_group, family, p_throws, zone_r, zone_c)
);

-- League swing rate per exact count, for the count ladder.
create table if not exists swing_decision_league_count (
  coord_era   text         not null,
  balls       smallint     not null,
  strikes     smallint     not null,
  family      text         not null,
  p_throws    char(1)      not null,
  n           int          not null,
  n_swing     int          not null,
  updated_at  timestamptz  not null default now(),
  primary key (coord_era, balls, strikes, family, p_throws)
);

-- One row per batter x season x window. win = 'season' (whole regular season) or 'l30' (the 30 days up to the last
-- game day read). Only batters with >= 100 decision pitches in the window are stored. Counts only: the app turns
-- them into decision_value_per100 with the league table above, so a rebuild of the league never needs a rebuild here.
--   cells   flat integer array, 7 numbers per occupied cell:
--             [count_group, family, p_throws, zone_r, zone_c, n_pitches, n_swings, ...]
--             count_group 0 even / 1 hitters / 2 two_strike; family 0 fastball / 1 breaking / 2 offspeed;
--             p_throws 0 = R / 1 = L
--   counts  flat integer array, 6 numbers per entry (all 12 counts, location not required):
--             [balls, strikes, family, p_throws, n_pitches, n_swings, ...]
--   n_pitches = every decision pitch he saw in the window (the 300-pitch season gate reads this)
create table if not exists batter_swing_decisions (
  batter_id   int          not null,
  season      int          not null,
  win         text         not null,
  coord_era   text         not null,
  n_pitches   int          not null,
  cells       jsonb        not null,
  counts      jsonb        not null,
  updated_at  timestamptz  not null default now(),
  primary key (batter_id, season, win, coord_era)
);
