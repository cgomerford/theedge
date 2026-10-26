-- Free deep look: one (feature, entity) per subscriber per Europe/London day.
-- NOTE: if you ran an earlier draft of this migration (a deep_looks table keyed on user_id + day), run
--   drop table if exists public.deep_looks;
-- first, because "create table if not exists" below would leave the old shape in place.
create table if not exists public.deep_looks (
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  london_day    date not null,
  feature       text not null check (feature in ('batting_lab','pitching_lab','pitch_shape','player_trends','game_zones','scout_report')),
  entity_id     text not null,
  created_at    timestamptz not null default now(),
  primary key (subscriber_id, london_day, feature, entity_id)
);
create index if not exists deep_looks_sub_day_idx on public.deep_looks (subscriber_id, london_day);
create index if not exists deep_looks_day_idx on public.deep_looks (london_day);
alter table public.deep_looks enable row level security;
-- The site uses its own session cookie and the service-role client (no Supabase Auth user, auth.uid() is null),
-- so there are deliberately NO policies: anon and authenticated can read and write nothing. The server reads by the session's subscriber id.
revoke all on public.deep_looks from anon, authenticated;

create or replace function public.claim_deep_look(p_subscriber uuid, p_feature text, p_entity text, p_limit int)
returns text language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Europe/London')::date;
  used int;
begin
  perform pg_advisory_xact_lock(hashtext(p_subscriber::text || ':' || d::text));
  -- Retention: keep 30 days. Clears this subscriber's old rows on each claim (no cron).
  delete from deep_looks where subscriber_id = p_subscriber and london_day < d - 30;
  if exists (select 1 from deep_looks where subscriber_id = p_subscriber and london_day = d and feature = p_feature and entity_id = p_entity) then
    return 'existing';
  end if;
  select count(*) into used from deep_looks where subscriber_id = p_subscriber and london_day = d;
  if used >= p_limit then
    return 'limit';
  end if;
  insert into deep_looks (subscriber_id, london_day, feature, entity_id) values (p_subscriber, d, p_feature, p_entity)
  on conflict do nothing;
  return 'claimed';
end $$;

create or replace function public.has_deep_look(p_subscriber uuid, p_feature text, p_entity text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from deep_looks where subscriber_id = p_subscriber
    and london_day = (now() at time zone 'Europe/London')::date and feature = p_feature and entity_id = p_entity);
$$;

create or replace function public.deep_looks_used_today(p_subscriber uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from deep_looks where subscriber_id = p_subscriber
    and london_day = (now() at time zone 'Europe/London')::date;
$$;

revoke all on function public.claim_deep_look(uuid,text,text,int), public.has_deep_look(uuid,text,text), public.deep_looks_used_today(uuid) from public, anon, authenticated;
grant execute on function public.claim_deep_look(uuid,text,text,int), public.has_deep_look(uuid,text,text), public.deep_looks_used_today(uuid) to service_role;

-- Optional manual clean-up for accounts that never claim again (run by hand when wanted; no cron):
-- delete from public.deep_looks where london_day < (now() at time zone 'Europe/London')::date - 30;
