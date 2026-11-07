// src/lib/pro-offer.ts
//
// What a NEW subscriber is offered, decided in one place so the pricing page, the unlock buttons and checkout can never disagree:
//   founding spots open    -> Founding Pro (US$45/yr or US$4.50/mo), only if that USD price is configured and verified in Stripe
//   founding closed        -> Standard Pro (US$60/yr or US$8/mo), only if that USD price is configured and verified
//   founding count unknown -> no checkout (we cannot tell which price is right, so we do not guess)
// A missing or wrong price means "unavailable", never a different amount. Pure functions, no server imports: unit-tested.

import { FOUNDING, STANDARD, FOUNDING_MONTHLY, STANDARD_MONTHLY } from '@/lib/pricing'

export type Plan = 'founding' | 'standard'
export type Interval = 'year' | 'month'
export type FoundingState = 'open' | 'closed' | 'unknown'
export type UnavailableReason = 'founding_count_unavailable' | 'usd_price_not_configured' | 'usd_price_mismatch' | 'stripe_unavailable'

export type Offer =
  | { plan: Plan; amount: number; currency: 'USD'; interval: Interval; reason?: undefined }
  | { plan: null; reason: UnavailableReason }

/** Which plan the founding state calls for, before checking that its Stripe price is usable. */
export function planFor(state: FoundingState): Plan | null {
  return state === 'open' ? 'founding' : state === 'closed' ? 'standard' : null
}

/** The amount in dollars each plan must be priced at in Stripe, per billing period. */
export const PRICE_USD: Record<Interval, Record<Plan, number>> = {
  year: { founding: FOUNDING.price, standard: STANDARD.price },
  month: { founding: FOUNDING_MONTHLY.price, standard: STANDARD_MONTHLY.price },
}

export type PriceFacts = { configured: boolean; verified: 'ok' | 'mismatch' | 'unreachable' | null }

/**
 * @param interval which billing period is being decided
 * @param state    the founding count result
 * @param price    facts about each plan's USD price for that period: whether its env var is set, and what Stripe said about it
 *                 (ok = active, USD, right period, right amount; mismatch = wrong currency/amount/period or inactive; unreachable = could not ask)
 */
export function decideOffer(interval: Interval, state: FoundingState, price: Record<Plan, PriceFacts>): Offer {
  const plan = planFor(state)
  if (!plan) return { plan: null, reason: 'founding_count_unavailable' }
  const f = price[plan]
  if (!f.configured) return { plan: null, reason: 'usd_price_not_configured' }
  if (f.verified === 'mismatch') return { plan: null, reason: 'usd_price_mismatch' }
  if (f.verified !== 'ok') return { plan: null, reason: 'stripe_unavailable' }
  return { plan, amount: PRICE_USD[interval][plan], currency: 'USD', interval }
}

type StripePriceFacts = { active: boolean; currency: string; unit_amount: number | null; recurring: { interval: string; interval_count: number } | null }

/** True when a Stripe price object is exactly the USD price a plan is meant to be for that billing period (to the cent). */
export function isExpectedPrice(interval: Interval, plan: Plan, p: StripePriceFacts): boolean {
  return p.active && p.currency.toLowerCase() === 'usd' && p.unit_amount === Math.round(PRICE_USD[interval][plan] * 100) && p.recurring?.interval === interval && p.recurring.interval_count === 1
}
