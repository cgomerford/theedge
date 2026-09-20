-- Stripe billing columns on subscribers. Run ONCE in the Supabase SQL editor
-- BEFORE turning on live checkout.
--
-- WRITER: only src/app/api/stripe/webhook/route.ts writes these columns and
-- subscribers.is_pro on a Stripe event (single-writer rule). A manual/admin
-- grant of is_pro still works — the webhook only flips is_pro for subscribers
-- that Stripe knows about.
--
-- The webhook degrades safely if this has not been run: it still sets is_pro
-- (so a paying customer is never locked out) and logs a loud error telling you
-- to run this file. The Founding-100 counter needs pro_plan, so without it
-- checkout offers standard pricing only.

alter table subscribers
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists pro_plan               text,          -- 'founding' | 'standard'
  add column if not exists pro_status             text,          -- Stripe subscription status: active, trialing, past_due, canceled, ...
  add column if not exists pro_updated_at         timestamptz;

create index if not exists idx_subscribers_stripe_customer on subscribers (stripe_customer_id);
create index if not exists idx_subscribers_pro_plan on subscribers (pro_plan) where pro_plan is not null;
