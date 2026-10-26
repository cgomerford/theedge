-- Park hit summary for the game page: hits by type and by direction at each ballpark, plus games played there.
-- Replaces the per-hit points used by the (removed) heatmap; the points column is now written empty.
alter table public.park_hit_map
  add column if not exists n_games   integer,
  add column if not exists n_single  integer,
  add column if not exists n_double  integer,
  add column if not exists n_triple  integer,
  add column if not exists n_hr      integer,
  add column if not exists n_left    integer,   -- hits to the left third of the field (spray angle left of -15 degrees)
  add column if not exists n_center  integer,   -- middle third (-15 to +15)
  add column if not exists n_right   integer;   -- right third (right of +15)
