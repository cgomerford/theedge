-- Postgame "Hitters: hot, cooling, or turning a corner?" — each hitter's last-15-games baseline, aggregated IN the database so the
-- page pulls ~1 row per hitter instead of thousands of pitch rows.
-- Reads pitch_events + batted_ball_events (written only by scripts/fetch_statcast_events.py; this function is read-only).
-- Run once in the Supabase SQL editor. Safe to re-run (create or replace).
--
-- "Last 15 games" = the hitter's 15 most recent games BEFORE p_game_pk (up to and including p_date, excluding that game),
-- where a game counts if he saw at least one pitch. Definitions match src/lib/postgame/hittercheck.ts:
--   swing  = swinging_strike, swinging_strike_blocked, foul_tip, foul, hit_into_play, foul_bunt, missed_bunt
--   whiff  = swinging_strike, swinging_strike_blocked, foul_tip, missed_bunt
--   chase  = swing at a pitch outside the zone (Statcast zone 11-14) / pitches outside the zone
--   hard   = launch_speed >= 95
--   xwoba_con / woba_con = average xwOBA / actual wOBA value over balls in play that have an xwOBA (sac bunts have none)
-- NOTE: numeric results may come back from PostgREST as STRINGS — coerce with Number() when reading.

create or replace function batter_form_l15(p_ids integer[], p_game_pk integer, p_date date)
returns table (
  batter_id        integer,
  games            integer,   -- games of history found (max 15)
  bip              integer,   -- balls in play in those games
  avg_ev           numeric,
  hard_hit         numeric,   -- 0..1
  xwoba_con        numeric,
  woba_con         numeric,
  swings           integer,
  whiffs           integer,
  outside          integer,   -- pitches seen outside the zone
  chases           integer,   -- swings at them
  season_xwoba_con numeric,   -- same calendar year, before this game
  per_game         jsonb      -- oldest -> newest: [{pk, n, xw}] for the trend line
)
language sql stable
as $$
  with g as (
    select x.batter_id, x.game_pk, x.game_date,
           row_number() over (partition by x.batter_id order by x.game_date desc, x.game_pk desc) as rn
    from (
      select distinct pe.batter_id, pe.game_pk, pe.game_date
      from pitch_events pe
      where pe.batter_id = any(p_ids) and pe.game_date <= p_date and pe.game_pk <> p_game_pk
    ) x
  ),
  l15 as (select * from g where rn <= 15),
  pit as (
    select l.batter_id,
      (count(*) filter (where p.description in ('swinging_strike','swinging_strike_blocked','foul_tip','foul','hit_into_play','foul_bunt','missed_bunt')))::int as swings,
      (count(*) filter (where p.description in ('swinging_strike','swinging_strike_blocked','foul_tip','missed_bunt')))::int as whiffs,
      (count(*) filter (where p.zone >= 11))::int as outside,
      (count(*) filter (where p.zone >= 11 and p.description in ('swinging_strike','swinging_strike_blocked','foul_tip','foul','hit_into_play','foul_bunt','missed_bunt')))::int as chases
    from l15 l
    join pitch_events p on p.batter_id = l.batter_id and p.game_pk = l.game_pk
    group by l.batter_id
  ),
  bb as (
    select l.batter_id,
      count(*)::int as bip,
      avg(b.launch_speed) as avg_ev,
      avg((b.launch_speed >= 95)::int) as hard_hit,
      avg(b.estimated_woba) as xwoba_con,
      avg(case when b.estimated_woba is not null then b.woba_value end) as woba_con
    from l15 l
    join batted_ball_events b on b.batter_id = l.batter_id and b.game_pk = l.game_pk
    group by l.batter_id
  ),
  per as (
    select l.batter_id,
      jsonb_agg(jsonb_build_object('pk', l.game_pk, 'n', coalesce(pg.n, 0), 'xw', pg.xw) order by l.rn desc) as per_game
    from l15 l
    left join (
      select b.batter_id, b.game_pk, count(*) as n, avg(b.estimated_woba) as xw
      from batted_ball_events b
      where b.batter_id = any(p_ids)
      group by b.batter_id, b.game_pk
    ) pg on pg.batter_id = l.batter_id and pg.game_pk = l.game_pk
    group by l.batter_id
  ),
  season as (
    select b.batter_id, avg(b.estimated_woba) as xw
    from batted_ball_events b
    where b.batter_id = any(p_ids)
      and b.game_date <= p_date and b.game_pk <> p_game_pk
      and b.game_date >= date_trunc('year', p_date)::date
    group by b.batter_id
  )
  select ids.id,
    coalesce((select count(*) from l15 where l15.batter_id = ids.id), 0)::int,
    coalesce(bb.bip, 0), bb.avg_ev, bb.hard_hit, bb.xwoba_con, bb.woba_con,
    coalesce(pit.swings, 0), coalesce(pit.whiffs, 0), coalesce(pit.outside, 0), coalesce(pit.chases, 0),
    season.xw,
    coalesce(per.per_game, '[]'::jsonb)
  from unnest(p_ids) as ids(id)
  left join bb on bb.batter_id = ids.id
  left join pit on pit.batter_id = ids.id
  left join per on per.batter_id = ids.id
  left join season on season.batter_id = ids.id;
$$;
