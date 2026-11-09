-- Referral tracking on subscribers. Run ONCE in the Supabase SQL editor BEFORE deploying the referral code.
--
-- WRITER: only src/app/api/stripe/webhook/route.ts writes these two columns (single-writer rule),
-- and only while referral_code is still empty, so the first code a person arrived with is the one kept.
-- Safe to run twice (if not exists). Touches no existing row's data.
--
-- If this has not been run, the webhook still grants Pro and logs a loud error saying the referral was not recorded.

alter table subscribers add column if not exists referral_code text;
alter table subscribers add column if not exists referral_recorded_at timestamptz;
create index if not exists subscribers_referral_code_idx on subscribers (referral_code);
