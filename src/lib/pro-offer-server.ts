import 'server-only'
// src/lib/pro-offer-server.ts
//
// Reads the real state behind the offer: how many founding spots are taken (subscribers.pro_plan = 'founding', is_pro = true) and what
// Stripe says about the configured USD annual prices. Used by /pricing, GET /api/stripe/offer and POST /api/stripe/checkout.
//
// KNOWN LIMIT: the founding cap is checked when a checkout session is CREATED, not reserved. Two people who start checkout when 99 spots
// are taken can both finish and the 100 can be exceeded by a few. A cancelled founder frees a spot. Making it exact needs a reservation
// or a Stripe-side limit; this file does not claim to enforce one.

import { createAdminClient } from '@/lib/supabase'
import { FOUNDING_LIMIT, getStripe, priceFor } from '@/lib/stripe'
import { decideAnnualOffer, isExpectedAnnualPrice, type AnnualOffer, type FoundingState, type Plan, type PriceFacts } from '@/lib/pro-offer'
import { log } from '@/lib/log'

export async function getFoundingState(): Promise<FoundingState> {
  const { count, error } = await createAdminClient().from('subscribers').select('id', { count: 'exact', head: true }).eq('pro_plan', 'founding').eq('is_pro', true)
  if (error) {
    // Column missing (migration not run) or the query failed: say "unknown" so the annual price is withheld rather than guessed.
    log.error('getFoundingState', 'founding count failed', error.message)
    return 'unknown'
  }
  return (count ?? 0) < FOUNDING_LIMIT ? 'open' : 'closed'
}

type Described = { active: boolean; currency: string; unit_amount: number | null; recurring: { interval: string; interval_count: number } | null }
const described = new Map<string, { at: number; value: Described | null }>()

/** One Stripe price, cached ten minutes. null when Stripe could not be asked. */
export async function describePrice(id: string): Promise<Described | null> {
  const hit = described.get(id)
  if (hit && Date.now() - hit.at < 600_000) return hit.value
  const stripe = getStripe()
  if (!stripe) return null
  try {
    const p = await stripe.prices.retrieve(id)
    const value: Described = { active: p.active, currency: p.currency, unit_amount: p.unit_amount, recurring: p.recurring ? { interval: p.recurring.interval, interval_count: p.recurring.interval_count } : null }
    described.set(id, { at: Date.now(), value })
    return value
  } catch (e) {
    log.error('describePrice', 'Stripe price lookup failed', e instanceof Error ? e.message : e)
    return null
  }
}

async function factsFor(plan: Plan): Promise<PriceFacts> {
  const id = priceFor(plan === 'founding')
  if (!id) return { configured: false, verified: null }
  const d = await describePrice(id)
  if (!d) return { configured: true, verified: 'unreachable' }
  return { configured: true, verified: isExpectedAnnualPrice(plan, d) ? 'ok' : 'mismatch' }
}

export type OfferView = { founding: FoundingState; annual: AnnualOffer }

export async function getOffer(): Promise<OfferView> {
  const founding = await getFoundingState()
  const [fFacts, sFacts] = await Promise.all([factsFor('founding'), factsFor('standard')])
  return { founding, annual: decideAnnualOffer(founding, { founding: fFacts, standard: sFacts }) }
}
