-- pitch_shape_pitcher: one row per pitcher x pitch type x season — his average shape, a sample of
-- his actual pitches for the movement-map dots, and the small per-pitcher splits the Pitching Lab
-- Shape tab shows. Pages read these rows; nothing is computed in a render path.
--
-- Single writer: .github/workflows/shape-pitcher.yml (scripts/build_pitch_shape_pitcher.py)
--
-- Source: Baseball Savant pitch feed, same verified fields and conversions as pitch_shape_bins
-- (see scripts/build_pitch_shape_bins.py): hb is arm-side-positive inches (left-handers flipped),
-- ivb is inches, slot is arm_angle degrees. Rows with fewer than 50 pitches are not written.
--
--   velo/ivb/hb/slot   mean over his pitches of this type in the season
--   sd_hb / sd_ivb     population standard deviation (the ±1 SD ring on the map)
--   n_swings/n_whiffs  his own swing and whiff counts (definitions as in pitch_shape_bins)
--   points             up to 60 sampled pitches: [{"hb": 8.9, "ivb": 17.4}, ...]
--   counts             [{"label": "Ahead in count"|"Even count"|"Behind in count", "swings": n, "whiffs": n}]
--   batter_sides       [{"label": "vs left-handed"|"vs right-handed", "bbe": n, "xwoba_sum": x}]
--   monthly            [{"label": "Apr", "velo": 94.2, "pitches": n}]  (month order)
-- Gates (150 swings / 100 batted balls / 50 pitches per month) are applied by the app, not here.

create table if not exists pitch_shape_pitcher (
  season        smallint     not null,
  pitcher_id    int          not null,
  pitch_type    text         not null,
  pitcher_name  text         not null,
  team_abbr     text,
  p_throws      char(1)      not null,
  n_pitches     int          not null,
  velo          numeric      not null,   -- numeric comes back as a string: Number() it
  ivb           numeric      not null,
  hb            numeric      not null,
  slot          numeric      not null,
  sd_hb         numeric      not null,
  sd_ivb        numeric      not null,
  n_swings      int          not null default 0,
  n_whiffs      int          not null default 0,
  points        jsonb        not null default '[]'::jsonb,
  counts        jsonb,
  batter_sides  jsonb,
  monthly       jsonb,
  updated_at    timestamptz  not null default now(),
  primary key (season, pitcher_id, pitch_type)
);

create index if not exists idx_pitch_shape_pitcher_pitcher on pitch_shape_pitcher (pitcher_id, season);
