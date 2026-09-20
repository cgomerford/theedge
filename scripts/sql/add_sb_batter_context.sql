-- Scout §5 — who was at the plate when a club stole, and how many chances they had.
-- Run once in the Supabase SQL editor, then re-run the backfill so old rows get the batter:
--   python3 scripts/fetch_game_situations.py --start-date 2026-03-25 --end-date <yesterday>
-- (safe to re-run: sb_attempt_log upserts on attempt_id, sb_opportunity_log on game_pk+batter_id).

-- 1) the batter at the plate for each steal attempt
alter table sb_attempt_log
  add column if not exists batter_id   integer,
  add column if not exists batter_name text;

create index if not exists idx_sb_attempt_batter on sb_attempt_log (batter_id);

-- 2) steal-of-second CHANCES: plate appearances that began with a runner on first and
--    second base open, one row per game per batter. Written only by fetch_game_situations.py.
create table if not exists sb_opportunity_log (
  game_pk         integer  not null,
  game_date       date     not null,
  batting_team_id integer  not null,
  batter_id       integer  not null,
  batter_name     text,
  opps            smallint not null,
  primary key (game_pk, batter_id)
);

create index if not exists idx_sb_opp_team on sb_opportunity_log (batting_team_id);
create index if not exists idx_sb_opp_date on sb_opportunity_log (game_date);
