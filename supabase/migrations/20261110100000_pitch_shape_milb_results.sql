-- Pitch Shape Lab, minor leagues, part 2: outcomes. Run after 20261109120000_pitch_shape_milb.sql.
--
-- DRAFT FOR GEORGE TO REVIEW AND RUN. Additive only: two new tables, nothing existing is touched.
--
-- pitch_shape_results_milb          what pitches at each shape produced at one level and season: runs, wOBA, xwOBA, average, slugging and whiffs, at 0.1 in on the
--                                   movement map. The same fourteen-number cell layout as pitch_shape_results (see supabase/migrations/20261106130000_pitch_shape_results.sql),
--                                   so the Lab's existing results maths reads it unchanged. It drives the map's "colour by" choices at Triple-A and the Florida State League.
-- pitch_shape_results_pitcher_milb  one pitcher's own outcomes on one pitch type at one level and season, to set against what his shape has produced at that level.
--
-- Level-only by construction: every row carries its level and is only ever read against rows of the same level. Run value is Statcast's delta_run_exp as the minor-league
-- feed supplies it (present on 99.8% of Triple-A and 99.6% of Florida State League pitches in the 2026 sample); wOBA and xwOBA use the feed's woba_value and
-- estimated_woba_using_speedangle, so a level's run value is not on the same scale as MLB's and is never compared with it.
--
-- Single writer: scripts/import-milb-pitch-shape.ts. Private to the service role like the other minor-league tables (RLS on, no policies).

create table if not exists pitch_shape_results_milb (
  level       text         not null check (level in ('aaa', 'fsl')),
  span        text         not null,   -- the season, e.g. '2026'
  pitch_type  text         not null,
  p_throws    char(1)      not null,
  n_pitches   int          not null,
  cells       jsonb        not null,   -- [hb10, ivb10, pitches, swings, whiffs, rv_n, rv*1000, pa, ab, hits, tb, woba_den, woba_sum*1000, xwoba_sum*1000, ...]
  updated_at  timestamptz  not null default now(),
  primary key (level, span, pitch_type, p_throws)
);

create table if not exists pitch_shape_results_pitcher_milb (
  level       text         not null check (level in ('aaa', 'fsl')),
  season      int          not null,
  pitcher_id  int          not null,
  pitch_type  text         not null,
  p_throws    char(1)      not null,
  n_pitches   int          not null,
  n_swings    int          not null,
  n_whiffs    int          not null,
  rv_n        int          not null,
  rv          numeric      not null,   -- sum of delta_run_exp (batting side); numeric comes back as a string: Number() it
  pa          int          not null,
  ab          int          not null,
  hits        int          not null,
  tb          int          not null,
  woba_den    numeric      not null,
  woba_sum    numeric      not null,
  xwoba_sum   numeric      not null,
  updated_at  timestamptz  not null default now(),
  primary key (level, season, pitcher_id, pitch_type)
);
create index if not exists idx_pitch_shape_results_pitcher_milb_type on pitch_shape_results_pitcher_milb (level, season, pitch_type, p_throws);

alter table pitch_shape_results_milb enable row level security;
alter table pitch_shape_results_pitcher_milb enable row level security;
