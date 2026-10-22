-- pitch_shape_monthly outcomes: adds the counts behind "which month went best / worst" on the Shape tab.
-- Same single writer as the table (scripts/build_pitch_shape_monthly.py via shape-monthly.yml).
-- Definitions match build_pitch_shape_bins.py so a month's rate lines up with the league neighborhoods:
--   n_swings       swinging_strike, swinging_strike_blocked, foul, foul_tip, hit_into_play, foul_bunt, missed_bunt
--   n_whiffs       swinging_strike, swinging_strike_blocked, missed_bunt
--   n_csw          called_strike + whiffs
--   n_bbe          balls in play that have estimated_woba_using_speedangle
--   xwoba_con_sum  SUM(estimated_woba_using_speedangle) over those balls in play (divide by n_bbe in the app)
-- Nullable: rows written before this migration stay NULL until the next shape-monthly run, and the page
-- shows an empty state for them (never a guess). numeric comes back as a string: Number() it.
alter table pitch_shape_monthly
  add column if not exists n_swings      int,
  add column if not exists n_whiffs      int,
  add column if not exists n_csw         int,
  add column if not exists n_bbe         int,
  add column if not exists xwoba_con_sum numeric;
