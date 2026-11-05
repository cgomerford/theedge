-- Content calendar for the admin (/admin/calendar): what is planned to go out each day (articles, X posts, graphics, videos, emails), and the weekly targets
-- the roadmap report measures against. Real published articles are read from `articles` and shown on their day automatically; a plan row can link to one.
-- Single writer: src/app/api/admin/content-plan/route.ts (admin only, via src/lib/content-plan.ts). Nothing here publishes or sends anything.

create table if not exists public.content_plan (
  id          uuid primary key default gen_random_uuid(),
  plan_date   date not null,
  kind        text not null default 'article',    -- article | x_post | graphic | video | email | other
  title       text not null,
  notes       text not null default '',
  status      text not null default 'planned',    -- planned | drafted | scheduled | published | skipped
  article_id  uuid references public.articles(id) on delete set null,
  url         text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists content_plan_date_idx on public.content_plan (plan_date);
alter table public.content_plan enable row level security;

-- Small key/value settings (the weekly targets live under the key 'targets').
create table if not exists public.content_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.content_settings enable row level security;
