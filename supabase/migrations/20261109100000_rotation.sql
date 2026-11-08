-- Rotation Lab: every pitcher's appearances (workload and fastball signals) and a current snapshot (name, hand, club, injured list).
--
-- rotation_apps: one row per pitcher per game. Pitches, batters faced, outs, strikeouts, walks, CSW%, and for each fastball type
--   (four-seam FF, sinker SI) the outing's pitch count, average velocity, velocity in his first 25 and last 25 pitches, release height and arm angle.
--   Single writer: scripts/build_rotation_board.py (rotation-board.yml). Rest days, rolling averages and every fatigue flag are worked out when the page reads
--   (src/lib/rotation/flags.ts), so a rule can change without re-running the job.
-- rotation_pitchers: one row per pitcher per season: name, throwing hand, current club, and injured-list status from the MLB roster feed.
--   Single writer: the same script.
--
-- Private to the service role (the site reads server-side); no public policies.

create table if not exists rotation_apps (
  player_id  integer  not null,
  game_pk    integer  not null,
  season     smallint not null,
  game_date  date     not null,
  team       text     not null,
  opp        text,
  is_start   boolean  not null,
  pitches    integer  not null,
  bf         integer  not null,
  outs       integer  not null,
  k          integer  not null,
  bb         integer  not null,
  csw        numeric,
  fb         jsonb    not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (player_id, game_pk)
);
create index if not exists rotation_apps_team_idx on rotation_apps (season, team, game_date);
create index if not exists rotation_apps_player_idx on rotation_apps (player_id, game_date);

create table if not exists rotation_pitchers (
  season    smallint not null,
  player_id integer  not null,
  name      text     not null,
  throws    text,
  team      text,
  il_code   text,
  il_desc   text,
  updated_at timestamptz not null default now(),
  primary key (season, player_id)
);

alter table rotation_apps enable row level security;
alter table rotation_pitchers enable row level security;
