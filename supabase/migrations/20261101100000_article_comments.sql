-- Reader comments on articles.
-- Single writer: src/lib/comments.ts (public POST /api/comments, admin PATCH /api/admin/comments).
--
--   status   visible | hidden. A comment is visible as soon as it is posted; an admin can hide it, and three different readers reporting it hides it automatically.
--   author_name is the name the reader typed (never their email).
-- Only signed-in readers can post (subscriber_id), which is the main spam brake. Reads and writes go through the service-role client, so RLS is on with no policies.

create table if not exists public.article_comments (
  id            uuid primary key default gen_random_uuid(),
  article_id    uuid not null references public.articles(id) on delete cascade,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  author_name   text not null,
  body          text not null,
  status        text not null default 'visible',
  created_at    timestamptz not null default now()
);
create index if not exists article_comments_article_idx on public.article_comments (article_id, created_at);
create index if not exists article_comments_subscriber_idx on public.article_comments (subscriber_id, created_at desc);
alter table public.article_comments enable row level security;

create table if not exists public.article_comment_reports (
  comment_id    uuid not null references public.article_comments(id) on delete cascade,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (comment_id, subscriber_id)
);
alter table public.article_comment_reports enable row level security;
