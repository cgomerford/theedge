-- pitch_shape_flights: a few REAL pitches per pitcher x pitch type x season x month, with the full Statcast
-- flight fields, so the 3D pitch view can draw a real path and the month-by-month ghosts. The pages read these
-- rows; nothing is computed in a render path.
--
-- Single writer: .github/workflows/shape-flights.yml (scripts/build_pitch_shape_flights.py)
--
-- rank 1..3 = the pitches of that month closest to the month's average (z-scored release x/z, plate x/z and
-- velocity), so rank 1 is the most typical pitch, not the best or the worst. A (pitcher, type, month) with
-- fewer than 10 pitches is not written.
--
-- Units, straight from Baseball Savant (verified against a live pull of 2026-09-15): feet, mph, rpm, degrees.
--   release_pos_x/y/z  release point (catcher view: +x toward 1B side... as Savant reports it); y is distance from the plate
--   vx0/vy0/vz0 (ft/s) and ax/ay/az (ft/s^2): constant-acceleration terms, valid from y = 50 ft
--   plate_x / plate_z  where it crossed the front of the plate (y = 17/12 ft)
-- numeric comes back as a string: Number() it.

create table if not exists pitch_shape_flights (
  season            smallint     not null,
  pitcher_id        int          not null,
  pitch_type        text         not null,
  month             smallint     not null,
  rank              smallint     not null,
  n_in_month        int          not null,
  p_throws          char(1)      not null,
  stand             char(1),
  game_date         date         not null,
  game_pk           int          not null,
  at_bat_number     int          not null,
  pitch_number      int          not null,
  balls             smallint,
  strikes           smallint,
  release_speed     numeric      not null,
  release_spin_rate numeric,
  spin_axis         numeric,
  release_pos_x     numeric      not null,
  release_pos_y     numeric      not null,
  release_pos_z     numeric      not null,
  release_extension numeric,
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
  updated_at        timestamptz  not null default now(),
  primary key (season, pitcher_id, pitch_type, month, rank)
);

create index if not exists idx_pitch_shape_flights_pitcher on pitch_shape_flights (pitcher_id, season, pitch_type);
