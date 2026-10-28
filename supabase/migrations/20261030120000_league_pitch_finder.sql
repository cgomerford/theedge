-- League pitch finder (Sequencing Lab, League view).
-- Reads pitch_events only; creates one read-only function and one index. Nothing is changed or deleted.
-- Given a pitch type, the throwing hand and optional windows for speed, arm-side break, induced rise, zone, batter side and count,
-- it returns one row per result (B ball, C called strike, W swinging strike, F foul, XH in play a hit, XO in play an out) with the
-- number of pitches and their average plate crossing, release point, extension, speed, spin and break.
-- Arm-side break is positive toward the pitcher's arm side (a right-hander's is the negative of Statcast's pfx_x), the same way the Pitching Lab shows it.
-- Called only from the server with the service key; not exposed to the browser.

create index if not exists idx_pitch_events_type_throws on public.pitch_events (pitch_type, p_throws, game_date);

create or replace function public.league_pitch_finder(
  p_type text,
  p_hand text,
  p_season integer default 2026,
  p_speed_lo numeric default null, p_speed_hi numeric default null,
  p_hb_lo numeric default null, p_hb_hi numeric default null,
  p_ivb_lo numeric default null, p_ivb_hi numeric default null,
  p_zone integer default null,
  p_stand text default null,
  p_balls integer default null,
  p_strikes integer default null
)
returns table (
  result text, n bigint,
  avg_plate_x numeric, avg_plate_z numeric,
  avg_rel_x numeric, avg_rel_z numeric, avg_ext numeric,
  avg_speed numeric, avg_spin numeric, avg_hb numeric, avg_ivb numeric
)
language sql stable security definer set search_path = public as $$
  with p as (
    select
      case
        when description in ('ball','blocked_ball','pitchout','automatic_ball','intent_ball','hit_by_pitch') then 'B'
        when description in ('called_strike','automatic_strike') then 'C'
        when description in ('swinging_strike','swinging_strike_blocked','foul_tip','missed_bunt') then 'W'
        when description in ('foul','foul_bunt','bunt_foul_tip') then 'F'
        when description like 'hit_into_play%' and events in ('single','double','triple','home_run') then 'XH'
        when description like 'hit_into_play%' then 'XO'
      end as result,
      plate_x, plate_z, release_pos_x, release_pos_z, release_extension, release_speed, release_spin_rate,
      (case when p_hand = 'R' then -1 else 1 end) * pfx_x * 12 as hb,
      pfx_z * 12 as ivb
    from public.pitch_events
    where pitch_type = p_type and p_throws = p_hand
      and game_date >= make_date(p_season, 1, 1) and game_date < make_date(p_season + 1, 1, 1)
      and plate_x is not null and pfx_x is not null and release_speed is not null
      and (p_zone is null or zone = p_zone)
      and (p_stand is null or stand = p_stand)
      and (p_balls is null or balls = p_balls)
      and (p_strikes is null or strikes = p_strikes)
  )
  select result, count(*)::bigint,
    avg(plate_x), avg(plate_z), avg(release_pos_x), avg(release_pos_z), avg(release_extension),
    avg(release_speed), avg(release_spin_rate), avg(hb), avg(ivb)
  from p
  where result is not null
    and (p_speed_lo is null or release_speed >= p_speed_lo) and (p_speed_hi is null or release_speed <= p_speed_hi)
    and (p_hb_lo is null or hb >= p_hb_lo) and (p_hb_hi is null or hb <= p_hb_hi)
    and (p_ivb_lo is null or ivb >= p_ivb_lo) and (p_ivb_hi is null or ivb <= p_ivb_hi)
  group by result
$$;

revoke all on function public.league_pitch_finder(text, text, integer, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.league_pitch_finder(text, text, integer, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, integer, integer) to service_role;
