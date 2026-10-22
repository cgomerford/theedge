-- pitch_shape_cells: league pitches at 0.1-inch resolution on the movement map (arm-side horizontal break x
-- induced vertical break), one row per pitch type x hand x span. The Shape tab's "How they win" heat map reads
-- these; nothing is computed from Savant in a render path.
--
-- Single writer: .github/workflows/shape-cells.yml (scripts/build_pitch_shape_cells.py)
--
-- A 0.1 in cell holds only a handful of pitches, so a single cell's rate means little; the app shows, for each
-- 0.1 in box, the rate of all pitches within a chosen radius of it, and leaves a box blank when that window is thin.
--
--   cells  flat integer array, five numbers per occupied cell:
--            [hb10, ivb10, pitches, swings, whiffs, hb10, ivb10, ...]
--          hb10 / ivb10 = tenths of an inch, round-half-up (floor(x + 0.5)); hb is arm-side positive
--          (left-handers flipped), ivb = pfx_z * 12. Pooled over every velocity and arm slot.
--   swings = swinging_strike, swinging_strike_blocked, foul, foul_tip, hit_into_play, foul_bunt, missed_bunt
--   whiffs = swinging_strike, swinging_strike_blocked, missed_bunt   (same as pitch_shape_bins)
create table if not exists pitch_shape_cells (
  span        text         not null,
  coord_era   text         not null,
  pitch_type  text         not null,
  p_throws    char(1)      not null,
  n_pitches   int          not null,
  n_swings    int          not null,
  n_whiffs    int          not null,
  cells       jsonb        not null,
  updated_at  timestamptz  not null default now(),
  primary key (span, coord_era, pitch_type, p_throws)
);
