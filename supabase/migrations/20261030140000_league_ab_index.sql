-- League at-bat index: every at-bat of a season squeezed into one compressed file, stored as text parts, so the Sequencing Lab can find the real at-bats that
-- match a stack of pitches. Creates one table (written only by scripts/build_league_ab_index.py). Nothing in pitch_events is touched.
-- The server reads the parts once, keeps them in memory and matches there; the database never scans pitch_events for this.

create table if not exists public.league_ab_index (
  season int not null,
  part int not null,
  parts int not null,
  data text not null,
  built_at timestamptz not null default now(),
  primary key (season, part)
);
alter table public.league_ab_index enable row level security;
