-- x9Lab park index: runs per game at a ballpark (home games) against the same
-- teams' runs per game away from it (road games), over the last 3 seasons.
-- 100 = neutral. Written only by scripts/compute-park-index.ts (single writer).
create table if not exists public.park_index (
  venue_id    integer primary key,
  team_id     integer not null,
  seasons     text    not null,            -- e.g. '2024-2026'
  home_rpg    numeric not null,            -- runs per game (both teams) in home games
  road_rpg    numeric not null,            -- runs per game (both teams) in road games
  index       integer not null,            -- round(100 * home_rpg / road_rpg)
  home_games  integer not null,
  road_games  integer not null,
  updated_at  timestamptz not null default now()
);

alter table public.park_index enable row level security;
-- No policies: read and written with the service role only.
