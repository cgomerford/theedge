-- Article writer: new fields on `articles`, and a revision history.
-- Single writer: the admin article API (src/app/api/admin/articles/route.ts via src/lib/articles.ts).
--
--   dek              the line under the headline
--   section          one of the scout vocabulary headings (Matchup notes, What changed, ...)
--   layout           standard | feature | data | quick
--   seo_description  search and share description; falls back to excerpt when empty
--   published_at     already exists: a future time means "scheduled" (public queries only show rows with published_at <= now(), so no cron is needed)
--
-- article_revisions keeps the last saves of each article so a draft can be restored. A published article's live row is never changed by an
-- autosave; autosaves of a published article only write here.

alter table public.articles add column if not exists dek text;
alter table public.articles add column if not exists section text;
alter table public.articles add column if not exists layout text not null default 'standard';
alter table public.articles add column if not exists seo_description text;

create table if not exists public.article_revisions (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references public.articles(id) on delete cascade,
  title       text not null,
  body        jsonb not null,
  meta        jsonb not null default '{}'::jsonb,
  kind        text not null default 'autosave',   -- autosave | save | publish
  saved_at    timestamptz not null default now()
);
create index if not exists article_revisions_article_idx on public.article_revisions (article_id, saved_at desc);
alter table public.article_revisions enable row level security;
