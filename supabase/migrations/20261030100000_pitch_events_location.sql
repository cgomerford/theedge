-- pitch_events: add where each pitch crossed the plate, how it moved, how fast it was, who was batting and what the batted ball did.
-- Powers the Sequencing Lab's "play the at-bat" and matchup replay (what has happened against pitches like this).
--
-- Single writer: scripts/fetch_statcast_events.py (unchanged ownership). Every column is nullable: rows loaded before this
-- migration keep NULLs until the 2026 reload below fills them, and the pages show an empty state for a NULL, never a guess.
--
-- Units are Statcast's own:
--   plate_x / plate_z   feet where the pitch crossed the front of the plate (plate_x is from the CATCHER's view; + is toward first base)
--   sz_top / sz_bot     the batter's strike zone top and bottom, feet
--   pfx_x / pfx_z       movement in FEET as Statcast reports it (multiply by 12 for inches); pfx_x is from the catcher's view
--   release_speed       mph (already stored); effective_speed mph; release_spin_rate rpm; release_extension feet
--   release_pos_x / _z  feet
--   launch_speed (mph) / launch_angle (degrees)  recorded on balls in play and on many fouls
--   stand / p_throws    'L' | 'R' | 'S'(batter switch never appears here: Statcast gives the side he batted from)
--   balls / strikes     the count BEFORE the pitch (Statcast's own columns; replaces rebuilding it from the calls)
--   bb_type             ground_ball | line_drive | fly_ball | popup, on balls in play
--   estimated_woba / woba_value / woba_denom   expected and actual wOBA value of the pitch's result (NULL on pitches that did not end the at-bat)

alter table public.pitch_events
  add column if not exists plate_x numeric(6,3),
  add column if not exists plate_z numeric(6,3),
  add column if not exists sz_top numeric(5,3),
  add column if not exists sz_bot numeric(5,3),
  add column if not exists pfx_x numeric(6,3),
  add column if not exists pfx_z numeric(6,3),
  add column if not exists effective_speed numeric(5,1),
  add column if not exists release_spin_rate integer,
  add column if not exists release_extension numeric(4,2),
  add column if not exists release_pos_x numeric(5,2),
  add column if not exists release_pos_z numeric(5,2),
  add column if not exists launch_speed numeric(5,1),
  add column if not exists launch_angle numeric(5,1),
  add column if not exists bb_type text,
  add column if not exists stand char(1),
  add column if not exists p_throws char(1),
  add column if not exists balls smallint,
  add column if not exists strikes smallint,
  add column if not exists outs_when_up smallint,
  add column if not exists inning smallint,
  add column if not exists estimated_woba numeric(5,3),
  add column if not exists woba_value numeric(5,3),
  add column if not exists woba_denom smallint;

-- The matchup replay reads one hitter's pitches faced and the lab reads one pitcher's pitches in at-bat order.
create index if not exists idx_pitch_events_batter on public.pitch_events (batter_id, game_date);
create index if not exists idx_pitch_events_pitcher_ab on public.pitch_events (pitcher_id, game_pk, at_bat_number, pitch_number);
