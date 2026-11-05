-- Content calendar: long briefs/scripts, private images, and uploads from the content assistants (MLB Analysis, X, YouTube).
-- Additive only: nothing is dropped or rewritten, and the existing rows keep working (they get the defaults below).
--
--   brief         the full brief or script for the item (an article outline, a video script, a post thread). Plain text, shown pre-wrapped.
--   source        who put the item there: george | mlb_analysis | x | youtube. An assistant can only change items with its own source.
--   external_key  the assistant's own id for the item, so uploading the same one again updates it instead of making a duplicate.
--   assets        the item's images: [{ "path": "<item id>/<uuid>.png", "label": "...", "role": "thumbnail" | "graphic" | "other" }].
--
-- The `content-assets` bucket is PRIVATE. Images are never public: the server reads them and hands the admin a signed link that expires after an hour.
-- Single writer: src/lib/content-plan.ts (via the admin and the token-protected ingest routes).

alter table public.content_plan add column if not exists brief        text  not null default '';
alter table public.content_plan add column if not exists source       text  not null default 'george';
alter table public.content_plan add column if not exists external_key text;
alter table public.content_plan add column if not exists assets       jsonb not null default '[]'::jsonb;

create unique index if not exists content_plan_source_key_idx on public.content_plan (source, external_key) where external_key is not null;

insert into storage.buckets (id, name, public) values ('content-assets', 'content-assets', false) on conflict (id) do nothing;
