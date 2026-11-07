-- Two read-only functions for the Pitch Shape Lab's diagnosis (run this whole file once in the Supabase SQL editor): shape_situation_lines and shape_window_lines.
--
-- shape_situation_lines: how pitchers (or the whole league) have done by pitch type, batter side, count and time through the order, plus the process measures that tell a pitcher
-- with a good shape and bad results WHERE it is leaking: first-pitch strikes, zone, chase, and how often he repeats the pitch he just threw. Read by the Pitch Shape Lab's
-- diagnosis (src/lib/pitch-shape/diagnose.ts) through /api/mlb/pitch-shape/diagnosis. Reads pitch_events only; writes nothing. Run once in the Supabase SQL editor.
--
--   p_season  calendar year
--   p_pitcher one pitcher's lines, or null for the whole league (pitcher_id comes back null then)
--
--   count_state: 'first' = 0-0, 'ahead' = more strikes than balls, 'even' = equal (not 0-0), 'behind' = more balls than strikes. tto = times through the order, capped at 3.
--   swings = swinging strike, blocked swinging strike, foul, foul tip, in play, foul bunt, missed bunt.  whiffs = swinging strike, blocked, missed bunt.
--   zone_n = Statcast zone 1 to 9; ooz_n = zone 11 to 14; chase_n = swings at pitches outside the zone.
--   first_n / first_strike = 0-0 pitches and those that were a strike (called, swinging, foul, in play).
--   prev_n / repeat_n = pitches with an earlier pitch in the same plate appearance, and those of the same pitch type as it.
--   pa / wd / w / x = plate appearances that ended on the pitch (woba_denom > 0), woba_denom, woba_value, and estimated woba on balls in play (woba_value otherwise).
--   rv_n / rv = pitches with a run value, and the sum of delta_run_exp (runs for the BATTING side, so lower is better for the pitcher).
create or replace function public.shape_situation_lines(p_season int, p_pitcher bigint default null)
returns table (
  pitcher_id bigint, pitch_type text, p_throws text, stand text, count_state text, tto int,
  pitches bigint, swings bigint, whiffs bigint, rv_n bigint, rv double precision,
  pa bigint, wd double precision, w double precision, x double precision,
  zone_n bigint, ooz_n bigint, chase_n bigint, first_n bigint, first_strike bigint, prev_n bigint, repeat_n bigint
)
language sql stable security definer set search_path = public
as $$
  with seq as (
    select e.*,
      lag(e.pitch_type) over (partition by e.game_pk, e.at_bat_number order by e.pitch_number) as prev_type
    from public.pitch_events e
    where e.game_date >= make_date(p_season, 1, 1) and e.game_date < make_date(p_season + 1, 1, 1)
      and (p_pitcher is null or e.pitcher_id = p_pitcher)
  )
  select
    (case when p_pitcher is null then null else s.pitcher_id end)::bigint,
    s.pitch_type::text, s.p_throws::text, s.stand::text,
    (case when s.balls = 0 and s.strikes = 0 then 'first' when s.strikes > s.balls then 'ahead' when s.strikes = s.balls then 'even' else 'behind' end)::text,
    least(coalesce(s.times_through_order, 1), 3)::int,
    count(*)::bigint,
    sum(case when s.description in ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','missed_bunt') or s.description like 'hit_into_play%' then 1 else 0 end)::bigint,
    sum(case when s.description in ('swinging_strike','swinging_strike_blocked','missed_bunt') then 1 else 0 end)::bigint,
    sum(case when s.delta_run_exp is not null then 1 else 0 end)::bigint,
    coalesce(sum(s.delta_run_exp), 0)::double precision,
    sum(case when s.woba_denom > 0 then 1 else 0 end)::bigint,
    coalesce(sum(case when s.woba_denom > 0 then s.woba_denom else 0 end), 0)::double precision,
    coalesce(sum(case when s.woba_denom > 0 then s.woba_value else 0 end), 0)::double precision,
    coalesce(sum(case when s.woba_denom > 0 then coalesce(s.estimated_woba, s.woba_value) else 0 end), 0)::double precision,
    sum(case when s.zone between 1 and 9 then 1 else 0 end)::bigint,
    sum(case when s.zone between 11 and 14 then 1 else 0 end)::bigint,
    sum(case when s.zone between 11 and 14 and (s.description in ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','missed_bunt') or s.description like 'hit_into_play%') then 1 else 0 end)::bigint,
    sum(case when s.balls = 0 and s.strikes = 0 then 1 else 0 end)::bigint,
    sum(case when s.balls = 0 and s.strikes = 0 and (s.description in ('called_strike','swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','missed_bunt') or s.description like 'hit_into_play%') then 1 else 0 end)::bigint,
    sum(case when s.prev_type is not null then 1 else 0 end)::bigint,
    sum(case when s.prev_type is not null and s.prev_type = s.pitch_type then 1 else 0 end)::bigint
  from seq s
  where s.pitch_type is not null
  group by 2, 3, 4, 5, 6, case when p_pitcher is null then null else s.pitcher_id end
$$;

revoke all on function public.shape_situation_lines(int, bigint) from public, anon, authenticated;
grant execute on function public.shape_situation_lines(int, bigint) to service_role;

-- shape_window_lines: for ONE pitch type, how pitches shaped like a given movement (or one pitcher's own pitches of that type) have done by batter side, count and where they crossed the plate,
-- plus their average speed and extension. The Pitch Shape Lab sets a pitcher's mix of batter sides, counts and locations against the league's for the same shape to say how much of the
-- gap between his results and his shape each one explains (src/lib/pitch-shape/decompose.ts, /api/mlb/pitch-shape/why). Reads pitch_events only; writes nothing.
--
--   p_hb / p_ivb / p_half_hb / p_half_ivb  the movement box in inches (hb arm-side positive, left-handers flipped: -pfx_x * 12 for right-handers, pfx_x * 12 for left-handers; ivb = pfx_z * 12).
--                                          Null = every pitch of the type and hand. Ignored when p_pitcher is given.
--   p_pitcher                              one pitcher's own pitches of the type (no movement box), or null for the league window.
--   zone                                   the Statcast zone, 1 to 9 inside (3 x 3, catcher's view) and 11 to 14 outside.
--   The measures are those of shape_situation_lines (swings, whiffs, run value, plate appearances, wOBA, xwOBA), with velo_* and ext_* the count and sum of release speed and extension.
create or replace function public.shape_window_lines(
  p_season int, p_type text, p_hand text,
  p_hb numeric default null, p_ivb numeric default null, p_half_hb numeric default null, p_half_ivb numeric default null,
  p_pitcher bigint default null
)
returns table (
  stand text, count_state text, zone int,
  pitches bigint, swings bigint, whiffs bigint, rv_n bigint, rv double precision,
  pa bigint, wd double precision, w double precision, x double precision,
  velo_n bigint, velo_sum double precision, ext_n bigint, ext_sum double precision
)
language sql stable security definer set search_path = public
as $$
  with p as (
    select e.stand, e.balls, e.strikes, e.zone, e.description, e.delta_run_exp, e.woba_denom, e.woba_value, e.estimated_woba, e.release_speed, e.release_extension,
      (case when p_hand = 'R' then -1 else 1 end) * e.pfx_x * 12 as hb, e.pfx_z * 12 as ivb
    from public.pitch_events e
    where e.pitch_type = p_type and e.p_throws = p_hand
      and e.game_date >= make_date(p_season, 1, 1) and e.game_date < make_date(p_season + 1, 1, 1)
      and e.pfx_x is not null and e.pfx_z is not null and e.zone is not null
      and (p_pitcher is null or e.pitcher_id = p_pitcher)
  )
  select
    p.stand::text,
    (case when p.balls = 0 and p.strikes = 0 then 'first' when p.strikes > p.balls then 'ahead' when p.strikes = p.balls then 'even' else 'behind' end)::text,
    p.zone::int,
    count(*)::bigint,
    sum(case when p.description in ('swinging_strike','swinging_strike_blocked','foul','foul_tip','foul_bunt','missed_bunt') or p.description like 'hit_into_play%' then 1 else 0 end)::bigint,
    sum(case when p.description in ('swinging_strike','swinging_strike_blocked','missed_bunt') then 1 else 0 end)::bigint,
    sum(case when p.delta_run_exp is not null then 1 else 0 end)::bigint,
    coalesce(sum(p.delta_run_exp), 0)::double precision,
    sum(case when p.woba_denom > 0 then 1 else 0 end)::bigint,
    coalesce(sum(case when p.woba_denom > 0 then p.woba_denom else 0 end), 0)::double precision,
    coalesce(sum(case when p.woba_denom > 0 then p.woba_value else 0 end), 0)::double precision,
    coalesce(sum(case when p.woba_denom > 0 then coalesce(p.estimated_woba, p.woba_value) else 0 end), 0)::double precision,
    sum(case when p.release_speed is not null then 1 else 0 end)::bigint,
    coalesce(sum(p.release_speed), 0)::double precision,
    sum(case when p.release_extension is not null then 1 else 0 end)::bigint,
    coalesce(sum(p.release_extension), 0)::double precision
  from p
  where p_pitcher is not null
     or ((p_hb is null or abs(p.hb - p_hb) <= p_half_hb) and (p_ivb is null or abs(p.ivb - p_ivb) <= p_half_ivb))
  group by 1, 2, 3
$$;

revoke all on function public.shape_window_lines(int, text, text, numeric, numeric, numeric, numeric, bigint) from public, anon, authenticated;
grant execute on function public.shape_window_lines(int, text, text, numeric, numeric, numeric, numeric, bigint) to service_role;
