-- NHL core tables: teams, players, games, play-by-play, shifts, strength timeline,
-- per-game player/goalie/team-state rollups, officials, scratches, the free-page
-- deployment strip + availability desk, and the ingest validation report.
--
-- Sole writers: scripts/nhl/sync_teams_rosters.py (nhl_teams, nhl_players,
-- nhl_roster_snapshots), scripts/nhl/sync_schedule.py (nhl_games), scripts/nhl/
-- ingest_game.py (nhl_pbp_events, nhl_shifts, nhl_strength_timeline,
-- nhl_player_game, nhl_goalie_game, nhl_team_game_state, nhl_game_officials,
-- nhl_game_scratches, nhl_ingest_validation), scripts/nhl/rollups.py
-- (nhl_deployment_strip, nhl_availability_desk).
--
-- NO column here may hold a URL, logo, headshot or odds value -- every writer
-- selects named fields only, never a raw jsonb blob of the API payload.
--
-- Run once in the Supabase SQL editor (house convention -- see scripts/sql/*.sql
-- for NFL; this project has no supabase/migrations CLI setup).

create table if not exists public.nhl_teams (
  team_id      int primary key,
  abbrev       text not null unique,
  place_name   text,
  common_name  text,
  full_name    text,
  color_hex    text,
  text_on_hex  text,
  updated_at   timestamptz not null default now()
);
alter table public.nhl_teams enable row level security;

create table if not exists public.nhl_players (
  player_id       int primary key,
  first_name      text,
  last_name       text,
  full_name       text,
  position_code   text,
  shoots_catches  text,
  sweater_number  int,
  team_id         int references public.nhl_teams(team_id),
  birth_date      date,
  height_in       int,
  weight_lb       int,
  updated_at      timestamptz not null default now()
);
alter table public.nhl_players enable row level security;

create table if not exists public.nhl_roster_snapshots (
  snapshot_date  date not null,
  team_id        int not null,
  player_id      int not null,
  position_code  text,
  primary key (snapshot_date, team_id, player_id)
);
alter table public.nhl_roster_snapshots enable row level security;

create table if not exists public.nhl_games (
  game_id          bigint primary key,
  season           int not null,
  game_type        smallint not null,
  game_date        date not null,
  start_time_utc   timestamptz,
  venue            text,
  venue_tz         text,
  home_team_id     int,
  away_team_id     int,
  home_score       int,
  away_score       int,
  game_state       text,
  last_period_type text,
  home_coach       text,
  away_coach       text,
  ingest_status    text not null default 'pending'
    check (ingest_status in ('pending','ingested','failed','skipped')),
  ingest_error     text,
  ingested_at      timestamptz,
  ref_recheck_until date
);
create index if not exists nhl_games_season_date_idx on public.nhl_games (season, game_date);
create index if not exists nhl_games_home_season_idx on public.nhl_games (home_team_id, season);
create index if not exists nhl_games_away_season_idx on public.nhl_games (away_team_id, season);
create index if not exists nhl_games_ingest_status_idx on public.nhl_games (ingest_status);
alter table public.nhl_games enable row level security;

-- The explicit subset actually used downstream -- no clip/URL fields, no raw jsonb.
create table if not exists public.nhl_pbp_events (
  game_id                 bigint not null,
  event_id                int not null,
  sort_order              int,
  period                  smallint,
  period_type             text,
  game_sec                int,
  situation_code          text,
  type_code               int,
  type_desc_key           text,
  event_owner_team_id     int,
  x_coord                 int,
  y_coord                 int,
  zone_code               text,
  shot_type               text,
  shooting_player_id      int,
  scoring_player_id       int,
  assist1_player_id       int,
  assist2_player_id       int,
  goalie_in_net_id        int,
  winning_player_id       int,
  losing_player_id        int,
  hitting_player_id       int,
  hittee_player_id        int,
  blocking_player_id      int,
  committed_by_player_id  int,
  drawn_by_player_id      int,
  penalty_type_code       text,
  penalty_desc_key        text,
  penalty_minutes         int,
  reason                  text,
  secondary_reason        text,
  home_score              int,
  away_score              int,
  home_defending_side     text,
  primary key (game_id, event_id)
);
create index if not exists nhl_pbp_events_sort_idx on public.nhl_pbp_events (game_id, sort_order);
create index if not exists nhl_pbp_events_type_idx on public.nhl_pbp_events (type_desc_key);
alter table public.nhl_pbp_events enable row level security;

-- Already de-duplicated/unioned (see strength.py) -- one row per player per
-- shift after merging overlaps. Never re-derive totals by summing these rows'
-- raw duration; use nhl_player_game.toi_s etc. instead.
create table if not exists public.nhl_shifts (
  game_id     bigint not null,
  player_id   int not null,
  team_id     int,
  period      smallint,
  start_sec   int not null,
  end_sec     int not null,
  primary key (game_id, player_id, start_sec)
);
alter table public.nhl_shifts enable row level security;

create table if not exists public.nhl_strength_timeline (
  game_id         bigint not null,
  start_sec       int not null,
  end_sec         int not null,
  home_skaters    smallint,
  away_skaters    smallint,
  home_goalie_in  boolean,
  away_goalie_in  boolean,
  source          text check (source in ('sim','anchor')),
  primary key (game_id, start_sec)
);
alter table public.nhl_strength_timeline enable row level security;

create table if not exists public.nhl_player_game (
  game_id             bigint not null,
  player_id           int not null,
  team_id             int,
  position            text,
  sweater_number      int,
  goals               int,
  assists             int,
  points              int,
  sog                 int,
  hits                int,
  blocked             int,
  pim                 int,
  ppg                 int,
  faceoff_pct         numeric,
  giveaways           int,
  takeaways           int,
  plus_minus          int,
  box_toi_s           int,
  box_shifts          int,
  toi_s               int,
  toi_ev_s            int,
  toi_5v5_s           int,
  toi_pp_s            int,
  toi_sh_s            int,
  toi_en_for_s        int,
  toi_en_against_s    int,
  shifts              int,
  avg_shift_s         numeric,
  ref_ev_s            int,
  ref_pp_s            int,
  ref_sh_s            int,
  toi_check           text check (toi_check in ('pass','fail')),
  strength_check      text check (strength_check in ('pass','fail','unchecked')),
  max_toi_err_s       int,
  max_strength_err_s  int,
  computed_at         timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index if not exists nhl_player_game_player_idx on public.nhl_player_game (player_id);
create index if not exists nhl_player_game_team_idx on public.nhl_player_game (team_id, game_id);
alter table public.nhl_player_game enable row level security;

create table if not exists public.nhl_goalie_game (
  game_id        bigint not null,
  player_id      int not null,
  team_id        int,
  starter        boolean,
  decision       text,
  toi_s          int,
  shots_against  int,
  saves          int,
  goals_against  int,
  ev_sa          int,
  ev_saves       int,
  pp_sa          int,
  pp_saves       int,
  sh_sa          int,
  sh_saves       int,
  primary key (game_id, player_id)
);
alter table public.nhl_goalie_game enable row level security;

create table if not exists public.nhl_team_game_state (
  game_id            bigint not null,
  team_id            int not null,
  toi_ev_s           int,
  toi_5v5_s          int,
  toi_pp_s           int,
  toi_sh_s           int,
  toi_en_for_s       int,
  toi_en_against_s   int,
  pp_opps            int,
  pp_goals           int,
  sh_goals_against   int,
  primary key (game_id, team_id)
);
alter table public.nhl_team_game_state enable row level security;

create table if not exists public.nhl_game_officials (
  game_id         bigint not null,
  role            text check (role in ('referee','linesman')),
  name            text not null,
  sweater_number  int,
  primary key (game_id, role, name)
);
alter table public.nhl_game_officials enable row level security;

create table if not exists public.nhl_game_scratches (
  game_id    bigint not null,
  team_id    int not null,
  player_id  int not null,
  primary key (game_id, team_id, player_id)
);
alter table public.nhl_game_scratches enable row level security;

-- value = share of team state seconds (0-1) for the toi_* metrics; per-game mean
-- for shifts / avg shift. raw = seconds (toi_*) or count (shifts) or seconds
-- (avg_shift). Sole writer: scripts/nhl/rollups.py.
create table if not exists public.nhl_deployment_strip (
  season        int not null,
  team_id       int not null,
  player_id     int not null,
  metric        text not null check (metric in ('nhl_toi_5v5','nhl_toi_ev','nhl_toi_pp','nhl_toi_sh','nhl_shifts','nhl_avg_shift')),
  through_date  date,
  last_game_id  bigint,
  last_value    numeric,
  last_raw      numeric,
  l5_games      int,
  l5_value      numeric,
  l5_raw        numeric,
  season_games  int,
  season_value  numeric,
  season_raw    numeric,
  excluded_games int,
  computed_at   timestamptz not null default now(),
  primary key (season, team_id, player_id, metric)
);
create index if not exists nhl_deployment_strip_team_metric_idx on public.nhl_deployment_strip (team_id, metric);
alter table public.nhl_deployment_strip enable row level security;

create table if not exists public.nhl_availability_desk (
  season             int not null,
  team_id            int not null,
  player_id          int not null,
  status             text check (status in ('dressed','scratched','not_listed')),
  last_game_id       bigint,
  dressed_last10     int,
  team_games_last10  int,
  consecutive_missed int,
  on_current_roster  boolean,
  roster_change      text check (roster_change in ('added','removed') or roster_change is null),
  roster_change_date date,
  computed_at        timestamptz not null default now(),
  primary key (season, team_id, player_id)
);
alter table public.nhl_availability_desk enable row level security;

create table if not exists public.nhl_ingest_validation (
  game_id              bigint primary key,
  players              int,
  skaters               int,
  toi_fail              int,
  strength_fail         int,
  strength_unchecked    int,
  max_toi_err_s         int,
  max_strength_err_s    int,
  ref_available         boolean,
  computed_at           timestamptz not null default now()
);
alter table public.nhl_ingest_validation enable row level security;

-- Server reads/writes use the service-role key (bypasses RLS); no public policy
-- on purpose, matching the existing nfl_* tables -- these pages read server-side.
