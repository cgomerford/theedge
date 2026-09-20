-- Scout §11 — who pitches from the 7th inning on, and what each bullpen has done against
-- a given opponent. One row per game per pitcher who faced a batter in the 7th or later.
-- Run once in the Supabase SQL editor, then backfill:
--   python3 scripts/fetch_game_situations.py --start-date 2026-03-25 --end-date <yesterday>
-- Written only by scripts/fetch_game_situations.py (upsert on game_pk + pitcher_id, so re-runs are safe).

create table if not exists late_inning_log (
  game_pk          integer  not null,
  pitcher_id       integer  not null,
  game_date        date     not null,
  pitcher_name     text,
  pitching_team_id integer  not null,
  batting_team_id  integer  not null,
  entry_inning     smallint not null,   -- first inning >= 7 in which he faced a batter
  entry_margin     smallint,            -- his team's lead (+) or deficit (-) when he first faced a batter in the 7th+
  inn7             smallint not null default 0,   -- 1 if he faced a batter in that inning
  inn8             smallint not null default 0,
  inn9             smallint not null default 0,
  inn10p           smallint not null default 0,   -- extra innings
  bf               smallint not null default 0,   -- batters faced from the 7th on
  outs             smallint not null default 0,
  hits             smallint not null default 0,
  bb               smallint not null default 0,   -- walks + hit batters
  k                smallint not null default 0,
  hr               smallint not null default 0,
  runs             smallint not null default 0,   -- runs scored while he was on the mound (includes inherited runners)
  primary key (game_pk, pitcher_id)
);

create index if not exists idx_late_pitching_team on late_inning_log (pitching_team_id);
create index if not exists idx_late_batting_team on late_inning_log (batting_team_id);
create index if not exists idx_late_date on late_inning_log (game_date);
