-- One-time schema for the per-pitch ABS challenge log.
-- Run this in the Supabase SQL editor, then let me know — I'll kick off
-- the backfill script once it exists.

create table if not exists abs_challenge_log (
  play_id text primary key,               -- MLB's own per-pitch UUID; natural upsert key
  game_pk integer not null,
  game_date date not null,
  inning integer not null,
  half_inning text not null,               -- 'top' | 'bottom'
  batting_team_id integer not null,
  fielding_team_id integer not null,
  challenging_team_id integer not null,
  challenge_side text not null,            -- 'batting' | 'fielding' (fielding = pitcher/catcher-initiated)
  challenger_player_id integer,
  challenger_player_name text,
  is_overturned boolean not null,
  pitch_type text,
  batter_id integer,
  pitcher_id integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_abs_challenge_log_date on abs_challenge_log (game_date);
create index if not exists idx_abs_challenge_log_challenging_team on abs_challenge_log (challenging_team_id);
create index if not exists idx_abs_challenge_log_challenger_player on abs_challenge_log (challenger_player_id);
create index if not exists idx_abs_challenge_log_inning on abs_challenge_log (inning);
