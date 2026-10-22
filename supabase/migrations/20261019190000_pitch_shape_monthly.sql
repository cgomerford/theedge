-- pitch_shape_monthly: one row per pitcher x pitch type x season x month — the MEAN release point, speed,
-- movement and Statcast flight terms, so the Pitching Lab Shape tab can draw "what changed" (release point,
-- month by month) and the pitch's path (speed, vertical break, horizontal break). Pages read these rows;
-- nothing is computed from Savant in a render path.
--
-- Single writer: .github/workflows/shape-monthly.yml (scripts/build_pitch_shape_monthly.py)
--
-- Units, straight from Baseball Savant (verified against a live pull of 2026-09-15): feet, mph, rpm.
--   release_pos_x/z   feet from the middle of the rubber / height; x is catcher's view (+ toward first base)
--   release_pos_y     distance from the plate (~53-54 ft); release_extension = 60.5 - release_pos_y (approx)
--   vx0..az           constant-acceleration terms (ft/s, ft/s^2), valid from y = 50 ft
--   plate_x/z         where it crossed the front of the plate; sz_top/bot the batter-specific zone, averaged
--   ivb               induced vertical break, inches (pfx_z*12)
--   hb                horizontal break, inches, ARM-SIDE POSITIVE (left-handers flipped, as in pitch_shape_pitcher)
-- A month with fewer than 10 pitches is not written; the app applies its own 50-pitch gate when it draws.
-- numeric comes back as a string: Number() it.

create table if not exists pitch_shape_monthly (
  season            smallint     not null,
  pitcher_id        int          not null,
  pitch_type        text         not null,
  month             smallint     not null,
  p_throws          char(1)      not null,
  n_pitches         int          not null,
  release_pos_x     numeric      not null,
  release_pos_y     numeric      not null,
  release_pos_z     numeric      not null,
  release_extension numeric,
  release_speed     numeric      not null,
  release_spin_rate numeric,
  vx0               numeric      not null,
  vy0               numeric      not null,
  vz0               numeric      not null,
  ax                numeric      not null,
  ay                numeric      not null,
  az                numeric      not null,
  plate_x           numeric      not null,
  plate_z           numeric      not null,
  sz_top            numeric      not null,
  sz_bot            numeric      not null,
  ivb               numeric      not null,
  hb                numeric      not null,
  updated_at        timestamptz  not null default now(),
  primary key (season, pitcher_id, pitch_type, month)
);

create index if not exists idx_pitch_shape_monthly_pitcher on pitch_shape_monthly (pitcher_id, season);
