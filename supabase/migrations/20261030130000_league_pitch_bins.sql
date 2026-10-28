-- League pitch bins: a small summary of every pitch of a season, so the Sequencing Lab's League pitch finder answers instantly.
-- Creates one table (written only by scripts/build_league_pitch_bins.py) and REPLACES the function league_pitch_finder from 20261030120000 so it reads this table
-- instead of scanning pitch_events (which timed out). Nothing in pitch_events is touched. Same function name, inputs and outputs, so the page needs no change.
-- A cell = season, pitch type, hand, batter side, zone (0 = not recorded), speed (whole mph), arm-side break and induced rise (2-inch cells), result.

create table if not exists public.league_pitch_bins (
  season int not null,
  pitch_type text not null,
  hand text not null,
  stand text not null,
  zone int not null,
  speed_bin int not null,
  hb_bin int not null,
  ivb_bin int not null,
  result text not null,
  n int not null,
  sum_plate_x numeric not null, sum_plate_z numeric not null,
  sum_rel_x numeric not null, sum_rel_z numeric not null, sum_ext numeric not null,
  sum_speed numeric not null, sum_spin numeric not null, sum_hb numeric not null, sum_ivb numeric not null,
  primary key (season, pitch_type, hand, stand, zone, speed_bin, hb_bin, ivb_bin, result)
);
alter table public.league_pitch_bins enable row level security;

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
  select b.result, sum(b.n)::bigint,
    sum(b.sum_plate_x) / sum(b.n), sum(b.sum_plate_z) / sum(b.n),
    sum(b.sum_rel_x) / sum(b.n), sum(b.sum_rel_z) / sum(b.n), sum(b.sum_ext) / sum(b.n),
    sum(b.sum_speed) / sum(b.n), sum(b.sum_spin) / sum(b.n), sum(b.sum_hb) / sum(b.n), sum(b.sum_ivb) / sum(b.n)
  from public.league_pitch_bins b
  where b.season = p_season and b.pitch_type = p_type and b.hand = p_hand
    and (p_zone is null or b.zone = p_zone)
    and (p_stand is null or b.stand = p_stand)
    and (p_speed_lo is null or b.speed_bin + 0.5 >= p_speed_lo) and (p_speed_hi is null or b.speed_bin + 0.5 <= p_speed_hi)
    and (p_hb_lo is null or b.hb_bin + 1 >= p_hb_lo) and (p_hb_hi is null or b.hb_bin + 1 <= p_hb_hi)
    and (p_ivb_lo is null or b.ivb_bin + 1 >= p_ivb_lo) and (p_ivb_hi is null or b.ivb_bin + 1 <= p_ivb_hi)
  group by b.result
$$;

revoke all on function public.league_pitch_finder(text, text, integer, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.league_pitch_finder(text, text, integer, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, integer, integer) to service_role;
