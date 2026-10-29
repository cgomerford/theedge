-- Player Savant percentile ranks for the My x9Lab dashboard (player cards). One row per player and kind (batter or pitcher) per season; ranks is a JSON object of
-- metric key -> percentile 0-100 (already direction-corrected by Savant: higher is better for every metric), null where Savant has no rank.
-- Written only by scripts/fetch_player_percentiles.py, run as a step of the existing nightly workflow (nightly-statcast-events.yml). About 2,300 rows a season.
-- Creates one empty table; nothing else is touched.
create table if not exists public.player_percentiles (
  season integer not null,
  player_id integer not null,
  kind text not null check (kind in ('batter', 'pitcher')),
  ranks jsonb not null,
  built_at timestamptz not null default now(),
  primary key (season, player_id, kind)
);
alter table public.player_percentiles enable row level security;
