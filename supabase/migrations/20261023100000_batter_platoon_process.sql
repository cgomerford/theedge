-- batter_platoon_process: every Platoon Lab number per hitter, per side he batted from, per pitcher hand. COUNTS AND SUMS ONLY, so a page can
-- show every readout with the sample behind it. Behind the Batting Lab Platoon tab and the league view (/mlb/lab/platoon); nothing is computed
-- from Savant in a render path.
--
-- Single writer: .github/workflows/batter-platoon.yml (scripts/build_batter_platoon.py)
--
--   mean = value_sum / n          standard deviation = sqrt(value_sq_sum / n - mean^2)
--   For a rate (chase, K%, ...) each event is 0 or 1, so value_sum = the count of events and value_sq_sum = the same count.
--   batter_id 0 is the league row (every batter added up) for each season x bat_side x p_throws x metric.
--   bat_side = the side he batted from on those pitches (a switch hitter has both; sides are never mixed). p_throws = the pitcher's hand.
--   coord_era: '2026' (ABS-era zone coordinates) or '2023-2025'. Zone-based metrics (chase, zone_contact) are never pooled across eras.
--
-- metric (n is what the readout is "out of"):
--   bat_speed         n = full swings (bat_speed >= 60 mph) with bat tracking; value_sum = location-matched bat speed x n (each side's swings reweighted to the
--                     league's pitch-location mix over a 5x5 grid of the zone, direct standardization), value_sq_sum from the same weights
--   swing_tilt        swing_path_tilt, degrees, same swings (raw mean)
--   contact_depth     intercept_ball_minus_batter_pos_y_inches, same swings (raw mean)
--   contact_x         intercept_ball_minus_batter_pos_x_inches, same swings (raw mean; only the contact-point map reads it)
--   attack_direction  degrees, same swings (raw mean)
--   chase             n = pitches outside the rulebook zone that he swung at or took; value_sum = swings
--   zone_contact      n = swings at pitches in the zone; value_sum = swings that made contact
--   squared_up        n = bat contacts (Savant leaderboard "contact"); value_sum = squared-up contacts (Savant's own definition, from its leaderboard
--                     with batSide + pitchHand; season-level)
--   spray_gb_pull, spray_gb_straight, spray_gb_oppo, spray_air_pull, spray_air_straight, spray_air_oppo
--                     n = batted balls (launch_speed_angle, bb_type, hc_x, hc_y all present); value_sum = balls of that type and direction.
--                     Direction: angle = atan2(hc_x - 126.5, 199 - hc_y), hc_x mirrored for left-handed batting; pull < -15 deg <= straight <= +15 < oppo.
--                     Pull AIR% = spray_air_pull / n.
--   k_pct, bb_pct     n = plate appearances; value_sum = strikeouts / walks (intentional included)
--   xwoba, woba       n = plate appearances with a woba_denom; value_sum = sum of the PA's value (woba_value; for xwOBA, estimated_woba_using_speedangle on
--                     balls in play, woba_value otherwise); value_sq_sum = the sum of squares
create table if not exists batter_platoon_process (
  batter_id     int          not null,
  season        int          not null,
  coord_era     text         not null,
  bat_side      char(1)      not null,
  p_throws      char(1)      not null,
  metric        text         not null,
  n             int          not null,
  value_sum     numeric      not null,
  value_sq_sum  numeric      not null,
  updated_at    timestamptz  not null default now(),
  primary key (batter_id, season, coord_era, bat_side, p_throws, metric)
);
create index if not exists batter_platoon_process_season on batter_platoon_process (season, metric);
