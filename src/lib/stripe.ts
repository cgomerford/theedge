// src/lib/stripe.ts
//
// Server-only Stripe wiring for Pro membership.
//
// ENV (set in Vercel → Project → Environment Variables; never commit values):
//   STRIPE_SECRET_KEY                    sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET                whsec_…  (from the webhook endpoint you create for /api/stripe/webhook)
//   STRIPE_PRICE_YEARLY_USD              price_…  US$60 / year  (Standard Pro)
//   STRIPE_PRICE_FOUNDING_YEARLY_USD     price_…  US$45 / year  (Founding Pro, first 100 subscribers)
//
// Older STRIPE_PRICE_* variables (the pre-USD prices) are no longer read by checkout and are never a fallback. Leave those prices
// active in Stripe: people already subscribed on them keep renewing on them, and the webhook keeps their access in step.
//
// Prices live in Stripe, not in code, so changing a price never needs a deploy.
// Founding pricing is offered automatically while fewer than FOUNDING_LIMIT
// members hold a founding plan (subscribers.pro_plan, see
// scripts/sql/add_stripe_columns.sql); after that everyone gets standard.
//
// getStripe() returns null when STRIPE_SECRET_KEY is missing — routes turn that
// into a clean 503 "not configured" instead of crashing, so the site is safe to
// deploy before Stripe is switched on.

import Stripe from 'stripe'

export { FOUNDING_LIMIT } from '@/lib/pricing'

let client: Stripe | null = null
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return (client ??= new Stripe(key))
}

/**
 * The Stripe price id for a NEW annual subscription (USD only). A missing USD price means "no checkout", never another price.
 */
export function priceFor(founding: boolean): string | null {
  const env = process.env
  return (founding ? env.STRIPE_PRICE_FOUNDING_YEARLY_USD : env.STRIPE_PRICE_YEARLY_USD) || null
}

/** Statuses that keep Pro on. past_due stays on while Stripe retries the card; unpaid/canceled/incomplete_expired turn it off. */
export const PRO_STATUSES = new Set(['active', 'trialing', 'past_due'])
