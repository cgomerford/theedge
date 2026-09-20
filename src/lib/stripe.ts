// src/lib/stripe.ts
//
// Server-only Stripe wiring for Pro membership.
//
// ENV (set in Vercel → Project → Environment Variables; never commit values):
//   STRIPE_SECRET_KEY                 sk_live_… / sk_test_…
//   STRIPE_WEBHOOK_SECRET             whsec_…  (from the webhook endpoint you create for /api/stripe/webhook)
//   STRIPE_PRICE_MONTHLY              price_…  £6 / month   (standard)
//   STRIPE_PRICE_YEARLY               price_…  £60 / year   (standard)
//   STRIPE_PRICE_FOUNDING_MONTHLY     price_…  £4 / month   (Founding 100 — optional)
//   STRIPE_PRICE_FOUNDING_YEARLY      price_…  £40 / year   (Founding 100 — optional)
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

export const FOUNDING_LIMIT = 100
export type Interval = 'month' | 'year'

let client: Stripe | null = null
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return (client ??= new Stripe(key))
}

export function priceFor(interval: Interval, founding: boolean): string | null {
  const env = process.env
  const std = interval === 'month' ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_YEARLY
  const fnd = interval === 'month' ? env.STRIPE_PRICE_FOUNDING_MONTHLY : env.STRIPE_PRICE_FOUNDING_YEARLY
  return (founding ? fnd || std : std) || null
}

/** Statuses that keep Pro on. past_due stays on while Stripe retries the card; unpaid/canceled/incomplete_expired turn it off. */
export const PRO_STATUSES = new Set(['active', 'trialing', 'past_due'])
