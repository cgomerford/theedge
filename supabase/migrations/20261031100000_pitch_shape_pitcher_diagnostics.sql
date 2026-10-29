-- pitch_shape_pitcher: the counts behind "ahead of / behind the shape" (is it location, or contact results?). The redesigned Pitch Shape Lab shows them next to
-- each pitcher's whiff gap. Same single writer as the table (scripts/build_pitch_shape_pitcher.py via shape-pitcher.yml).
--
-- Location (Savant `zone`: 1-9 inside the rulebook zone, 5 = the middle cell, 11-14 outside):
--   n_loc      pitches with a zone value
--   n_zone     pitches in zone 1-9                        zone%  = n_zone / n_loc
--   n_heart    pitches in zone 5 (down the middle)        heart% = n_heart / n_loc
--   n_ooz      pitches in zone 11-14 (outside the zone)
--   n_chase    swings at those outside pitches            chase% = n_chase / n_ooz
-- Contact results (balls in play that have estimated_woba_using_speedangle; the same definition as n_bbe elsewhere):
--   n_bbe        balls in play with an xwOBA value
--   xwoba_con_sum  sum of xwOBA on those balls in play   xwOBAcon = xwoba_con_sum / n_bbe   (contact QUALITY allowed)
--   n_bbe_w      of those, balls in play that also carry the actual wOBA value
--   woba_con_sum   sum of the actual wOBA value          wOBAcon  = woba_con_sum / n_bbe_w   (what actually happened)
--   wOBAcon minus xwOBAcon is the part defense and luck account for.
-- Nullable: rows written before this stay NULL until the next shape-pitcher run, and the page shows "—" for them (never a guess).
alter table pitch_shape_pitcher
  add column if not exists n_loc         int,
  add column if not exists n_zone        int,
  add column if not exists n_heart       int,
  add column if not exists n_ooz         int,
  add column if not exists n_chase       int,
  add column if not exists n_bbe         int,
  add column if not exists xwoba_con_sum numeric,
  add column if not exists n_bbe_w       int,
  add column if not exists woba_con_sum  numeric;
