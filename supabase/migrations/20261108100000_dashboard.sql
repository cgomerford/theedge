-- My x9Lab dashboard: two tables.
--
-- league_player_stats: one row per player per season per role (batter or pitcher) with every Savant leaderboard stat we chart, as JSON.
--   Single writer: scripts/build_league_player_stats.py (league-player-stats.yml). The dashboard's tiles, leaderboards, scatters and slicers read it,
--   so no page or API ever fetches Savant while rendering.
-- user_dashboards: the layout a signed-in person has built (widgets, sizes, slicers), one row per person.
--   Single writer: src/lib/dashboard/store.ts (via PUT /api/me/dashboard).
--
-- Both are private to the service role (the site reads and writes them server-side); no public policies.

create table if not exists league_player_stats (
  season     integer     not null,
  player_id  integer     not null,
  role       text        not null check (role in ('batter', 'pitcher')),
  name       text        not null,
  team_abbr  text,
  position   text,
  stats      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (season, role, player_id)
);

create index if not exists league_player_stats_season_role_idx on league_player_stats (season, role);

create table if not exists user_dashboards (
  subscriber_id uuid        primary key references subscribers(id) on delete cascade,
  layout        jsonb       not null,
  updated_at    timestamptz not null default now()
);

alter table league_player_stats enable row level security;
alter table user_dashboards enable row level security;
