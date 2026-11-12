-- Minor-league percentile pool: every player's season rates at one level, so a player page can rank him against everyone else at that level and season.
--
-- DRAFT FOR GEORGE TO REVIEW AND RUN. Additive only: one new table, nothing existing is touched.
--
-- level   'aaa' | 'aa' | 'higha' | 'a' | 'rk' (the MLB Stats API sportIds 11, 12, 13, 14, 16). A player is only ever ranked against his own level and season: a Double-A hitter is never
--         compared with Triple-A or MLB hitters, because the pitching, parks and strike zones differ.
-- n       plate appearances (batter) or batters faced (pitcher): the sample behind the rates, so a reader can apply a minimum.
-- metrics the rates as plain numbers (batter: avg obp slg ops iso k_pct bb_pct hr sb; pitcher: era whip k_pct bb_pct kbb_pct hr9 fip). k_pct, bb_pct and kbb_pct are percents (27.1 = 27.1%).
--
-- Single writer: scripts/compute_milb_stat_pool.py (workflow compute-milb-stat-pool.yml). Players who played for two clubs at one level are one row (the API combines them).
-- RLS on with no policies, like the other minor-league tables: the site reads it server-side with the service role (src/lib/milb-percentiles.ts); no client can read or write it.

create table if not exists milb_stat_pool (
  level       text         not null check (level in ('aaa', 'aa', 'higha', 'a', 'rk')),
  season      smallint     not null,
  subject     text         not null check (subject in ('batter', 'pitcher')),
  player_id   int          not null,
  n           int          not null,
  metrics     jsonb        not null,
  updated_at  timestamptz  not null default now(),
  primary key (level, season, subject, player_id)
);
create index if not exists idx_milb_stat_pool_pool on milb_stat_pool (level, season, subject, n);

alter table milb_stat_pool enable row level security;
