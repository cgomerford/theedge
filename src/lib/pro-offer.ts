// src/lib/pro-offer.ts
//
// What a NEW annual subscriber is offered, decided in one place so the pricing page, the unlock buttons and checkout can never disagree:
//   founding spots open   -> Founding Pro (US$45/yr), only if the USD founding price is configured and verified
//   founding closed       -> Standard Pro (US$60/yr), only if the USD standard price is configured and verified
//   founding count unknown-> no annual checkout (we cannot tell which price is right, so we do not guess)
// A missing or wrong price means "unavailable", never a different amount or currency. Pure functions, no server imports: unit-tested.

import { FOUNDING, STANDARD } from '@/lib/pricing'

export type Plan = 'founding' | 'standard'
export type FoundingState = 'open' | 'closed' | 'unknown'
export type UnavailableReason = 'founding_count_unavailable' | 'usd_price_not_configured' | 'usd_price_mismatch' | 'stripe_unavailable'

export type AnnualOffer =
  | { plan: Plan; amount: number; currency: 'USD'; interval: 'year'; reason?: undefined }
  | { plan: null; reason: UnavailableReason }

/** Which plan the founding state calls for, before checking that its Stripe price is usable. */
export function planFor(state: FoundingState): Plan | null {
  return state === 'open' ? 'founding' : state === 'closed' ? 'standard' : null
}

/** The amount in whole dollars each annual plan must be priced at in Stripe. */
export const ANNUAL_USD: Record<Plan, number> = { founding: FOUNDING.price, standard: STANDARD.price }

export type PriceFacts = { configured: boolean; verified: 'ok' | 'mismatch' | 'unreachable' | null }

/**
 * @param state    the founding count result
 * @param price    facts about the plan's USD price: whether its env var is set, and what Stripe said about it
 *                 (ok = active, USD, yearly, right amount; mismatch = wrong currency/amount/interval or inactive; unreachable = could not ask)
 */
export function decideAnnualOffer(state: FoundingState, price: Record<Plan, PriceFacts>): AnnualOffer {
  const plan = planFor(state)
  if (!plan) return { plan: null, reason: 'founding_count_unavailable' }
  const f = price[plan]
  if (!f.configured) return { plan: null, reason: 'usd_price_not_configured' }
  if (f.verified === 'mismatch') return { plan: null, reason: 'usd_price_mismatch' }
  if (f.verified !== 'ok') return { plan: null, reason: 'stripe_unavailable' }
  return { plan, amount: ANNUAL_USD[plan], currency: 'USD', interval: 'year' }
}

/** True when a Stripe price object is exactly the annual USD price a plan is meant to be. */
export function isExpectedAnnualPrice(plan: Plan, p: { active: boolean; currency: string; unit_amount: number | null; recurring: { interval: string; interval_count: number } | null }): boolean {
  return p.active && p.currency.toLowerCase() === 'usd' && p.unit_amount === ANNUAL_USD[plan] * 100 && p.recurring?.interval === 'year' && p.recurring.interval_count === 1
}
