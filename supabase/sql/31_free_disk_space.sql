-- Free disk space, step 1 of a few. NOT run yet: George runs this himself in the Supabase SQL Editor.
-- savant_fetch_cache holds downloaded Savant files for 6 hours (src/lib/savant-cache.ts). It was 134 MB for 25 rows. Emptying it loses nothing permanent:
-- the next view of a page that needs a file downloads it again and stores it. The only cost is a slower first view.
truncate table public.savant_fetch_cache;

-- Later steps (not in this file yet, each waits for the sizes and your yes):
--   drop league_pitch_bins (64 MB) once the pitch finder reads the in-memory at-bat index instead
--   drop unused pitch_events indexes (211 MB of indexes today)
--   NFL tables (nfl_player_stats_weekly 86 MB, nfl_pfr_advstats 20 MB, others) if NFL is out
--   key_players_snapshot (43 MB for 6 rows) and edge_predictions (26 MB for 1 live row)
