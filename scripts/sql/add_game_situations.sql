-- Scout §4 / §5 — game-situation columns for ABS challenges and a per-attempt
-- stolen-base log. Run once in the Supabase SQL editor, then backfill with
--   python3 scripts/fetch_game_situations.py --start-date 2026-03-25 --end-date <yesterday>
-- (safe to re-run: every write is an upsert on a natural key).

-- 1) ABS challenges: the situation the challenged pitch was thrown in.
alter table abs_challenge_log
  add column if not exists balls      smallint,   -- count BEFORE the challenged pitch
  add column if not exists strikes    smallint,
  add column if not exists outs       smallint,
  add column if not exists base_state text,       -- runners on at the start of the PA, e.g. '100' = runner on 1st ('000' empty)
  add column if not exists bat_diff   smallint;   -- batting team's score minus fielding team's, before the play

-- 2) Stolen-base attempts (one row per runner per attempt; pickoffs are excluded).
create table if not exists sb_attempt_log (
  attempt_id       text primary key,              -- '<game_pk>:<at_bat_index>:<play_index>:<runner_id>'
  game_pk          integer not null,
  game_date        date    not null,
  inning           smallint not null,
  half_inning      text    not null,              -- 'top' | 'bottom'
  running_team_id  integer not null,
  fielding_team_id integer not null,
  runner_id        integer,
  runner_name      text,
  pitcher_id       integer,
  steal_of         text    not null,              -- '2B' | '3B' | 'HOME'
  success          boolean not null,
  balls            smallint,                      -- count when the runner went
  strikes          smallint,
  outs             smallint,
  run_diff         smallint,                      -- running team's score minus fielding team's, at that moment
  created_at       timestamptz not null default now()
);

create index if not exists idx_sb_attempt_running on sb_attempt_log (running_team_id);
create index if not exists idx_sb_attempt_fielding on sb_attempt_log (fielding_team_id);
create index if not exists idx_sb_attempt_date on sb_attempt_log (game_date);
