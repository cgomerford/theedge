-- Drops four pitch_events indexes that Supabase's own counters show are (almost) never used. NOT run yet: George runs this himself in the Supabase SQL Editor.
-- Scans since the counters began: idx_pitch_events_events 0, idx_pitch_events_release_speed 1, idx_pitch_events_batter 2, idx_pitch_events_type_throws 7.
-- Saves about 57 MB of disk and a little memory, and makes every write to pitch_events cheaper. No data is touched; an index can be recreated at any time.
-- Kept on purpose: pitch_events_batter_date_idx (covers the same lookups as idx_pitch_events_batter), idx_pitch_events_pitcher and idx_pitch_events_pitcher_ab (the Pitching Lab
-- and Stuff Lab read by pitcher), idx_pitch_events_game_date, the primary key and the game / at-bat / pitch unique key (the nightly upsert and every loader use them).
drop index if exists public.idx_pitch_events_events;
drop index if exists public.idx_pitch_events_release_speed;
drop index if exists public.idx_pitch_events_batter;
drop index if exists public.idx_pitch_events_type_throws;
