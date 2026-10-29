-- graphics_library: saved graphics from /admin/graphics (the full GraphicSpec, so a card can be reopened and edited), with the post caption and a
-- reminder time. Nothing posts automatically: post_at is only a reminder shown in the studio.
-- Single writer: src/app/api/admin/graphics-library/route.ts (admin only).

create table if not exists public.graphics_library (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  template    text not null,
  spec        jsonb not null,
  caption     text not null default '',
  post_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists graphics_library_updated_idx on public.graphics_library (updated_at desc);
alter table public.graphics_library enable row level security;
