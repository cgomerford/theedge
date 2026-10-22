-- Swing Lab league page (/mlb/swing-decisions): headline numbers stored on each batter row so the leaderboard reads
-- light rows instead of every batter's packed cells. Same single writer as the table itself
-- (scripts/build_swing_decisions.py); computed from the same pass and the same league baseline, per window.
--
--   name, team   the batter's name (MLB Stats API, one bulk lookup) and his latest batting team (Savant home/away
--                team + inning_topbot) as of the last game day read
--   n_grid       decision pitches that landed in one of the three count groups and a baselined cell
--   selection    share of the "swing-losing" pitches he took (league swing worse than league take in that cell); n_junk of them
--   aggression   share of the "hittable" pitches he swung at; n_hit of them
--   decision_runs_per100   sum over his cells of (his swings - n x league swing rate) x (league swing rv - league take rv) x 100,
--                          divided by n_grid. His own contact results are not in it.
alter table batter_swing_decisions
  add column if not exists name                  text,
  add column if not exists team                  text,
  add column if not exists n_grid                int,
  add column if not exists n_junk                int,
  add column if not exists n_hit                 int,
  add column if not exists selection             numeric,
  add column if not exists aggression            numeric,
  add column if not exists decision_runs_per100  numeric;

create index if not exists batter_swing_decisions_window on batter_swing_decisions (season, win, coord_era);
