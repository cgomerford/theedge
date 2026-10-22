-- pitch_shape_pitcher: adds the counts behind the sinker-comparison section ("How does this compare vs other ...").
-- Same single writer as the table (scripts/build_pitch_shape_pitcher.py via shape-pitcher.yml).
--
--   n_taken   pitches the batter took and the umpire ruled on: called strikes + balls (blocked balls included;
--             automatic balls, hit-by-pitch and pitchouts excluded)
--   n_gift    called strikes on pitches OUTSIDE the rulebook zone (Savant zone 11-14): calls that went his way
--   n_miss    balls on pitches INSIDE the rulebook zone (Savant zone 1-9): calls that went against him
--   setup     what came before it in the plate appearance, one entry per previous pitch type ("FIRST" = first
--             pitch of the at-bat, "OTH" = a type we do not track):
--             [{"prev": "SL", "n": 120, "swings": 70, "whiffs": 30, "called": 20, "dv": 8.4}, ...]
--             dv = mean of (previous pitch speed - this pitch speed), mph; null for "FIRST"
-- Nullable / defaulted: rows written before this stay NULL until the next shape-pitcher run, and the page shows
-- an empty state for them (never a guess).
alter table pitch_shape_pitcher
  add column if not exists n_taken int,
  add column if not exists n_gift  int,
  add column if not exists n_miss  int,
  add column if not exists setup   jsonb;
