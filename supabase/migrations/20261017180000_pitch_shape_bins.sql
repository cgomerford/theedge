-- pitch_shape_bins: pre-aggregated Statcast pitch counts per shape bin (the Pitch Shape Lab's
-- cached table — pages read these rows, nothing is computed in a render path).
--
-- Single writer: .github/workflows/shape-bins.yml
--
-- Source: Baseball Savant pitch feed (pybaseball.statcast). Every column below is built only
-- from fields confirmed present on 2026-09-15 and 2025-09-15 (docs/fields/savant_*.json):
--   pitch_type, p_throws, release_speed, pfx_x, pfx_z, arm_angle, description, type,
--   launch_speed, estimated_woba_using_speedangle, bb_type.
-- Definitions (exact `description` strings come from docs/fields):
--   n_pitches       every pitch row in the bin
--   n_swings        swinging_strike, swinging_strike_blocked, foul, foul_tip, hit_into_play,
--                   foul_bunt, missed_bunt
--   n_whiffs        swinging_strike, swinging_strike_blocked (+ missed_bunt)
--   n_called_strikes called_strike
--   n_csw           called_strike + whiffs
--   n_bbe           batted-ball events: balls in play (description = hit_into_play) that have an
--                   estimated_woba_using_speedangle. (First draft said "rows with a launch_speed";
--                   live data showed that includes foul balls: 1,465 vs 764 balls in play on
--                   2026-09-15. See scripts/build_pitch_shape_bins.py.)
--   xwoba_con_sum   SUM(estimated_woba_using_speedangle) over those BBE; divide by n_bbe for xwOBAcon
--   n_hard_hit      BBE with launch_speed >= 95
--   n_gb            BBE with bb_type = 'ground_ball'
-- Bin columns (velo/ivb/hb/slot) are integer bin indices from release_speed, pfx_z, pfx_x and
-- arm_angle; the bin widths are owned by the writer, not by this table.
-- NOT a Savant field: `coord_era` is a label the writer derives for the pitch-coordinate era a
-- row belongs to, so rows from different tracking calibrations are never pooled in one bin.

create table if not exists pitch_shape_bins (
  span             text         not null,   -- window the bin covers, e.g. '2026' or 'last30'
  pitch_type       text         not null,
  p_throws         char(1)      not null,   -- 'L' | 'R'
  velo_bin         smallint     not null,
  ivb_bin          smallint     not null,
  hb_bin           smallint     not null,
  slot_bin         smallint     not null,
  n_pitches        int          not null default 0,
  n_swings         int          not null default 0,
  n_whiffs         int          not null default 0,
  n_called_strikes int          not null default 0,
  n_csw            int          not null default 0,
  n_bbe            int          not null default 0,
  xwoba_con_sum    numeric      not null default 0,  -- numeric comes back as a string: Number() it
  n_hard_hit       int          not null default 0,
  n_gb             int          not null default 0,
  coord_era        text         not null,
  updated_at       timestamptz  not null default now(),
  primary key (span, pitch_type, p_throws, velo_bin, ivb_bin, hb_bin, slot_bin, coord_era)
);

create index if not exists idx_pitch_shape_bins_lookup
  on pitch_shape_bins (pitch_type, p_throws, velo_bin);

-- Run log shared by cron writers (created only if no earlier migration/script made it).
create table if not exists cron_run_log (
  job          text         not null,
  started_at   timestamptz  not null default now(),
  finished_at  timestamptz,
  rows_written int,
  status       text,
  note         text
);
