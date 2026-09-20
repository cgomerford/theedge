-- One-time schema for a cache-aside table for expensive Savant Statcast
-- CSV pulls (per-batter pitch logs, situational zones, team pitch logs).
-- Run this in the Supabase SQL editor, then let me know.
--
-- Why: these fetches return 2-2.5MB+ raw CSVs, which is over Next's
-- fetch Data Cache 2MB-per-item ceiling — `next: { revalidate }` on
-- them is silently a no-op, so every single call re-downloads live
-- from Savant with zero caching between repeat hits on the same
-- player. This table caches the much-smaller PARSED/aggregated result
-- instead (the thing Next's own cache can't hold), keyed by a string
-- describing the exact query (function + player/team + season).

create table if not exists savant_fetch_cache (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_savant_fetch_cache_fetched_at on savant_fetch_cache (fetched_at);
