-- nfl_game_postgame — one jsonb payload per FINAL NFL game (play-by-play half of the postgame page).
-- Sole writer: scripts/nfl/compute_nfl_postgame.py. Read by /nfl/[slug]/postgame.
-- Run once in the Supabase SQL editor.

create table if not exists public.nfl_game_postgame (
  game_id     text primary key,
  season      int  not null,
  week        int  not null,
  payload     jsonb not null,
  computed_at timestamptz not null default now()
);

create index if not exists nfl_game_postgame_season_week_idx on public.nfl_game_postgame (season, week);

alter table public.nfl_game_postgame enable row level security;
-- Server reads/writes use the service-role key (bypasses RLS); no public policy on purpose.
