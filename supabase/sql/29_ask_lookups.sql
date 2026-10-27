-- 29_ask_lookups.sql  (George runs this himself in the Supabase SQL editor)
-- Daily lookup allowance for the ask lab. Counted per Europe/London day.
-- One row per (viewer, day, question). charges counts how many times that question was charged today
-- (asked again after the refine window = a new charge). Today's use = sum(charges).
create table if not exists public.ask_lookups (
  id            bigint generated always as identity primary key,
  viewer_kind   text        not null check (viewer_kind in ('subscriber','anon')),
  subscriber_id uuid        null,
  anon_id       text        null,
  ip_hash       text        null,
  london_day    date        not null,
  question_key  text        not null,
  charges       int         not null default 1,
  charged_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  viewer_key    text generated always as (coalesce(subscriber_id::text, 'anon:' || anon_id)) stored,
  check ((viewer_kind = 'subscriber' and subscriber_id is not null and anon_id is null)
      or (viewer_kind = 'anon' and anon_id is not null and subscriber_id is null))
);
create unique index if not exists ask_lookups_viewer_day_q_uq
  on public.ask_lookups (viewer_key, london_day, question_key);
create index if not exists ask_lookups_ip_day_idx
  on public.ask_lookups (ip_hash, london_day) where ip_hash is not null;
create index if not exists ask_lookups_day_idx
  on public.ask_lookups (london_day);

-- Deny-all: RLS on, no policies. Only the service-role server calls the functions below.
alter table public.ask_lookups enable row level security;
revoke all on public.ask_lookups from public, anon, authenticated;

-- Shared: lookups left today for a viewer (min of the viewer cap and, for anon with an ip_hash, the IP backstop).
create or replace function public.ask_lookups_left(
  p_kind text, p_subscriber uuid, p_anon text, p_ip_hash text, p_cap int, p_ip_cap int)
returns int
language sql stable security definer set search_path = public
as $$
  select greatest(0, least(
    p_cap - coalesce((select sum(charges)::int from ask_lookups
              where viewer_key = coalesce(p_subscriber::text, 'anon:' || p_anon)
                and london_day = (now() at time zone 'Europe/London')::date), 0),
    case when p_kind = 'anon' and p_ip_hash is not null
      then p_ip_cap - coalesce((select sum(charges)::int from ask_lookups
                        where ip_hash = p_ip_hash
                          and london_day = (now() at time zone 'Europe/London')::date), 0)
      else p_cap end));
$$;

-- Step 1, before the query runs. Read-only. refine = same question asked within the window (free).
create or replace function public.ask_lookup_check(
  p_kind text, p_subscriber uuid, p_anon text, p_ip_hash text,
  p_question text, p_cap int, p_ip_cap int, p_refine_minutes int)
returns table (allowed boolean, refine boolean, lookups_left int)
language plpgsql stable
security definer
set search_path = public
as $$
declare
  is_refine boolean;
  lft int := public.ask_lookups_left(p_kind, p_subscriber, p_anon, p_ip_hash, p_cap, p_ip_cap);
begin
  select exists (select 1 from ask_lookups
                  where viewer_key = coalesce(p_subscriber::text, 'anon:' || p_anon)
                    and london_day = (now() at time zone 'Europe/London')::date
                    and question_key = p_question
                    and last_used_at >= now() - make_interval(mins => p_refine_minutes))
    into is_refine;
  return query select (is_refine or lft > 0), is_refine, lft;
end $$;

-- Step 2, only after the result has at least one row. This step decides: it takes the advisory lock(s),
-- re-checks, and either refreshes a refine (no charge), charges once, or refuses (charged = false).
create or replace function public.ask_lookup_charge(
  p_kind text, p_subscriber uuid, p_anon text, p_ip_hash text,
  p_question text, p_cap int, p_ip_cap int, p_refine_minutes int)
returns table (charged boolean, refine boolean, lookups_left int)
language plpgsql
security definer
set search_path = public
as $$
declare
  d     date := (now() at time zone 'Europe/London')::date;
  vkey  text := coalesce(p_subscriber::text, 'anon:' || p_anon);
  ipcap boolean := (p_kind = 'anon' and p_ip_hash is not null);
begin
  perform pg_advisory_xact_lock(hashtext('ask_lookup:' || vkey));
  if ipcap then
    perform pg_advisory_xact_lock(hashtext('ask_lookup_ip:' || p_ip_hash));
  end if;

  -- Retention: keep 30 days (no cron).
  delete from ask_lookups where london_day < d - 30;

  -- Refine: same question inside the window. Refresh the timestamp, no charge.
  update ask_lookups set last_used_at = now()
   where viewer_key = vkey and london_day = d and question_key = p_question
     and last_used_at >= now() - make_interval(mins => p_refine_minutes);
  if found then
    return query select false, true,
      public.ask_lookups_left(p_kind, p_subscriber, p_anon, p_ip_hash, p_cap, p_ip_cap);
    return;
  end if;

  if public.ask_lookups_left(p_kind, p_subscriber, p_anon, p_ip_hash, p_cap, p_ip_cap) <= 0 then
    return query select false, false, 0;
    return;
  end if;

  insert into ask_lookups (viewer_kind, subscriber_id, anon_id, ip_hash, london_day, question_key)
  values (p_kind, p_subscriber, p_anon, p_ip_hash, d, p_question)
  on conflict (viewer_key, london_day, question_key)
  do update set charges = ask_lookups.charges + 1, charged_at = now(), last_used_at = now(),
                ip_hash = coalesce(excluded.ip_hash, ask_lookups.ip_hash);

  return query select true, false,
    public.ask_lookups_left(p_kind, p_subscriber, p_anon, p_ip_hash, p_cap, p_ip_cap);
end $$;

revoke all on function public.ask_lookup_check(text, uuid, text, text, text, int, int, int),
                       public.ask_lookup_charge(text, uuid, text, text, text, int, int, int),
                       public.ask_lookups_left(text, uuid, text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.ask_lookup_check(text, uuid, text, text, text, int, int, int),
                          public.ask_lookup_charge(text, uuid, text, text, text, int, int, int),
                          public.ask_lookups_left(text, uuid, text, text, int, int)
  to service_role;
grant select, insert, update, delete on public.ask_lookups to service_role;
-- end of 29_ask_lookups.sql
