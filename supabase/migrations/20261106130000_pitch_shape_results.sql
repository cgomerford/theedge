-- pitch_shape_results: what pitches at each point of the movement map have PRODUCED, for the Pitch Shape Lab's results heat map and Shape Score.
-- Same grid as pitch_shape_cells (0.1 in cells, arm-side break x induced vertical break, pooled over velocity and arm angle), one row per
-- season x pitch type x hand, but carrying outcomes as well as whiffs. Nothing is computed from Savant in a render path.
--
-- Single writer: .github/workflows/shape-results.yml (scripts/build_pitch_shape_results.py). It also writes pitch_shape_results_pitcher.
--
--   cells  flat integer array, FOURTEEN numbers per occupied cell:
--            [hb10, ivb10, pitches, swings, whiffs, rv_n, rv, pa, ab, hits, tb, woba_den, woba_sum, xwoba_sum, hb10, ...]
--          hb10 / ivb10 = tenths of an inch, round-half-up, hb arm-side positive (left-handers flipped), as pitch_shape_cells
--          rv_n   = pitches with a run value;  rv = sum of Statcast delta_run_exp (runs for the BATTING side) x 1000, rounded
--          pa     = plate appearances that ended on the pitch (woba_denom > 0)
--          ab, hits, tb = official at-bats, hits and total bases among them (walks, hit by pitch and sacrifices are not at-bats)
--          woba_den, woba_sum = Statcast woba_denom and woba_value x 1000
--          xwoba_sum = x 1000 of estimated_woba_using_speedangle on balls in play, woba_value on every other plate appearance
create table if not exists pitch_shape_results (
  span        text         not null,
  coord_era   text         not null,
  pitch_type  text         not null,
  p_throws    char(1)      not null,
  n_pitches   int          not null,
  cells       jsonb        not null,
  updated_at  timestamptz  not null default now(),
  primary key (span, coord_era, pitch_type, p_throws)
);

-- One pitcher's own results on one pitch type for one season: the other half of "results against shape".
create table if not exists pitch_shape_results_pitcher (
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
  primary key (season, pitcher_id, pitch_type)
);
create index if not exists idx_pitch_shape_results_pitcher_type on pitch_shape_results_pitcher (season, pitch_type, p_throws);
