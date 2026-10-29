-- Pitcher strikeout structure by time through: for each pitcher, how many plate appearances and strikeouts he had the FIRST time he faced a hitter in a game, the SECOND time,
-- and the THIRD time or later, and how the strikeouts were built (the pitch that ended them, the pitch they opened with, swinging or looking, how many pitches).
-- pitcher_id 0 is the whole league, for comparison. Written only by scripts/build_pitcher_k_structure.py, from the at-bat index (league_ab_index). About 2,500 rows.
-- Creates one empty table; nothing else is touched.
create table if not exists public.pitcher_k_structure (
  season integer not null,
  pitcher_id integer not null,
  look smallint not null check (look in (1, 2, 3)),
  pas integer not null,
  ks integer not null,
  swinging_ks integer not null,
  looking_ks integer not null,
  k_pitches integer not null,
  finishers jsonb not null,
  openers jsonb not null,
  built_at timestamptz not null default now(),
  primary key (season, pitcher_id, look)
);
alter table public.pitcher_k_structure enable row level security;
