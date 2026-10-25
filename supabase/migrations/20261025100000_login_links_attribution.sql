-- login_links_attribution: where a sign-in came from, stored on the magic link itself (no cookies).
-- The /signup page carries ?source= and utm_* as hidden form fields into /api/auth/login, which writes them here.
-- return_to is the same-site path the person was on, so the callback can send them back after the link is used.
--
-- Single writer: createLoginLink() in src/lib/auth.ts (via /api/auth/login). Nothing else writes these columns.

alter table login_links
  add column if not exists source       text,
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term     text,
  add column if not exists utm_content  text,
  add column if not exists return_to    text;
