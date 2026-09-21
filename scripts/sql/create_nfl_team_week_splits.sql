-- nfl_team_week_splits — one row per (team, game) of play-by-play splits.
-- Sole writer: scripts/nfl/compute_team_week_splits.py. Read by the NFL Scout / Preview / Postgame pages.
-- Counts and sums (not rates) live in the jsonb columns so the app can roll up L3 / L5 / season exactly.
-- Run once in the Supabase SQL editor.

create table if not exists public.nfl_team_week_splits (
  team_id      text        not null,
  season       int         not null,
  week         int         not null,
  season_type  text,
  game_id      text        not null,
  opponent_id  text,
  is_home      boolean,
  off          jsonb,   -- this team's offense that game
  def          jsonb,   -- what this team's defense allowed that game
  ftn_off      jsonb,   -- FTN-charted offense tendencies (motion / play action / RPO / box faced)
  ftn_def      jsonb,   -- FTN-charted tendencies faced by the defense (blitz, motion faced)
  computed_at  timestamptz not null default now(),
  primary key (team_id, season, week)
);

create index if not exists nfl_team_week_splits_game_idx on public.nfl_team_week_splits (game_id);
create index if not exists nfl_team_week_splits_season_idx on public.nfl_team_week_splits (season, team_id);

alter table public.nfl_team_week_splits enable row level security;
-- Server reads/writes use the service-role key (bypasses RLS); no public policy on purpose.

-- nfl_team_form — the same sums pre-rolled into windows, one row per (team, season), regular season only.
-- Sole writer: scripts/nfl/compute_team_week_splits.py (it owns BOTH tables in this file).
-- season_sum / l3 / l5 each hold { games, off, def, ftn_off, ftn_def }.

create table if not exists public.nfl_team_form (
  team_id      text not null,
  season       int  not null,
  through_week int,
  games        int,
  season_sum   jsonb,
  l3           jsonb,
  l5           jsonb,
  computed_at  timestamptz not null default now(),
  primary key (team_id, season)
);

alter table public.nfl_team_form enable row level security;
