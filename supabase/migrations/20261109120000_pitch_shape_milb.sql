-- Pitch Shape Lab, minor leagues: Triple-A and the Florida State League.
--
-- DRAFT FOR GEORGE TO REVIEW AND RUN. Additive only: five new tables, no existing table, column, function or policy is touched, so MLB behaviour cannot change.
-- Separate tables (rather than a `level` column on the MLB ones) are deliberate: a minor-league row can never be read into an MLB cohort by a query that forgot a filter,
-- and the MLB tables' primary keys, indexes and writers stay exactly as they are.
--
-- level is 'aaa' (Triple-A: International League + Pacific Coast League) or 'fsl' (Florida State League, one of the three Single-A leagues). A check constraint keeps it
-- to those two, so Double-A, High-A and the other Single-A leagues cannot be stored by mistake.
--
-- Single writer for every table below: scripts/import-milb-pitch-shape.ts (run by hand with --write --confirm-project=<ref>; there is no cron).
-- Nothing stores a raw pitch. The tables hold the sufficient statistics the existing Lab queries need:
--   pitch_shape_bins_milb     the joint speed x ride x run x arm-angle distribution with swing / whiff / called-strike / contact counts (the sandbox's cohort)
--   pitch_shape_cells_milb    the 0.1-inch ride x run map with swings and whiffs per cell (the league map and "who throws it here")
--   pitch_shape_pitcher_milb  one row per level x season x pitcher x pitch type: average shape, spread, results, a 60-pitch sample, diagnostics
--   pitch_shape_milb_coverage per level x season x month x park: games, pitches and usable (tracked) pitches
--   pitch_shape_milb_runs     per level x season: source, fetch time, per-field null counts, rejects, duplicates, gaps and which sandbox axes the data supports
-- Pitchers keep their MLB player id across promotions. A pitcher seen at two levels has one row at each; the level-season rows are never merged.
--
-- Estimated size (from the 2026-08-01 sample day: 4,974 Triple-A and 1,470 Florida State League pitches; scale by ~140 game days):
--   bins   ~60k rows per level-season   cells ~100 rows of ~2k numbers each   pitcher ~6k rows   coverage ~600 rows   -> low tens of MB in total.
--
-- RLS: enabled with NO policies, exactly like the MLB shape tables. The site reads them server-side with the service role (src/lib/pitch-shape/data.ts), where the Pro rule
-- (four-seam and sweeper free, every other pitch type Pro) is applied before anything is returned, so no row can reach a browser that is not entitled to it. There is
-- no public SELECT policy because nothing here is read from the browser. No client can write.

create table if not exists pitch_shape_bins_milb (
  level            text         not null check (level in ('aaa', 'fsl')),
  span             text         not null,   -- the season, e.g. '2026'
  pitch_type       text         not null,
  p_throws         char(1)      not null,
  velo_bin         smallint     not null,   -- round(mph / 1)
  ivb_bin          smallint     not null,   -- round(inches / 2), ride (induced vertical break)
  hb_bin           smallint     not null,   -- round(inches / 2), run, arm-side positive
  slot_bin         smallint     not null,   -- floor(arm angle / 10) clipped 0..9; -1 = the pitch has no arm angle
  n_pitches        int          not null default 0,
  n_swings         int          not null default 0,
  n_whiffs         int          not null default 0,
  n_called_strikes int          not null default 0,
  n_csw            int          not null default 0,
  n_bbe            int          not null default 0,
  xwoba_con_sum    numeric      not null default 0,
  n_hard_hit       int          not null default 0,
  n_gb             int          not null default 0,
  updated_at       timestamptz  not null default now(),
  primary key (level, span, pitch_type, p_throws, velo_bin, ivb_bin, hb_bin, slot_bin)
);

create table if not exists pitch_shape_cells_milb (
  level       text         not null check (level in ('aaa', 'fsl')),
  span        text         not null,
  pitch_type  text         not null,
  p_throws    char(1)      not null,
  n_pitches   int          not null,
  n_swings    int          not null,
  n_whiffs    int          not null,
  cells       jsonb        not null,        -- [hb10, ivb10, pitches, swings, whiffs, ...] exactly as pitch_shape_cells
  updated_at  timestamptz  not null default now(),
  primary key (level, span, pitch_type, p_throws)
);

create table if not exists pitch_shape_pitcher_milb (
  level          text         not null check (level in ('aaa', 'fsl')),
  season         smallint     not null,
  pitcher_id     int          not null,
  pitch_type     text         not null,
  pitcher_name   text         not null,
  team_abbr      text,
  p_throws       char(1)      not null,
  n_pitches      int          not null,
  velo           numeric      not null,
  ivb            numeric      not null,
  hb             numeric      not null,
  slot           numeric      not null,
  sd_hb          numeric      not null,
  sd_ivb         numeric      not null,
  n_swings       int          not null default 0,
  n_whiffs       int          not null default 0,
  n_taken        int          not null default 0,
  n_gift         int          not null default 0,
  n_miss         int          not null default 0,
  n_loc          int          not null default 0,
  n_zone         int          not null default 0,
  n_heart        int          not null default 0,
  n_ooz          int          not null default 0,
  n_chase        int          not null default 0,
  n_bbe          int          not null default 0,
  xwoba_con_sum  numeric      not null default 0,
  n_bbe_w        int          not null default 0,
  woba_con_sum   numeric      not null default 0,
  points         jsonb        not null default '[]'::jsonb,
  counts         jsonb,
  batter_sides   jsonb,
  updated_at     timestamptz  not null default now(),
  primary key (level, season, pitcher_id, pitch_type)
);
create index if not exists idx_pitch_shape_pitcher_milb_pitcher on pitch_shape_pitcher_milb (pitcher_id, season);
create index if not exists idx_pitch_shape_pitcher_milb_type on pitch_shape_pitcher_milb (level, season, pitch_type, p_throws);

create table if not exists pitch_shape_milb_coverage (
  level      text         not null check (level in ('aaa', 'fsl')),
  season     smallint     not null,
  month      smallint     not null,
  park       text         not null,         -- the home club's abbreviation
  games      int          not null,
  pitches    int          not null,         -- rows after removing exact duplicates
  tracked    int          not null,         -- pitches with a standard type, speed and movement
  updated_at timestamptz  not null default now(),
  primary key (level, season, month, park)
);

create table if not exists pitch_shape_milb_runs (
  level       text         not null check (level in ('aaa', 'fsl')),
  season      smallint     not null,
  source      text         not null,        -- the Savant endpoint family and the Stats API used to verify leagues
  fetched_at  timestamptz  not null,
  complete    boolean      not null,        -- false when a chunk could not be fetched in full: the Lab then labels the level's coverage as partial
  first_date  date,
  last_date   date,
  summary     jsonb        not null,        -- rows, duplicates, usable, nulls per field, rejects by league, quarantined games, gaps, capabilities
  updated_at  timestamptz  not null default now(),
  primary key (level, season)
);

alter table pitch_shape_bins_milb enable row level security;
alter table pitch_shape_cells_milb enable row level security;
alter table pitch_shape_pitcher_milb enable row level security;
alter table pitch_shape_milb_coverage enable row level security;
alter table pitch_shape_milb_runs enable row level security;
