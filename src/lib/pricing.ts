import { FREE_LIMITS } from '@/lib/follows/config'
// The ONE place prices live in code. Stripe holds the real prices (the price ids come from the STRIPE_PRICE_* env vars read
// in src/lib/stripe.ts and used by /api/stripe/checkout); these numbers are only what we print. Keep them in step with Stripe.
//
// Visibility rules (see ProGate and /pricing):
//   signed out        -> no price and no plan name anywhere (pages, meta tags, structured data)
//   signed in, no Pro -> the price shows on /pricing and inside the one ProGate on a page
//   Pro               -> no prices and no upgrade prompts

/** The first this-many subscribers get the Founding price and keep it while they stay continuously subscribed. */
export const FOUNDING_LIMIT = 100

// Pro is sold annually, in US dollars. Founding is the first FOUNDING_LIMIT subscribers; Standard applies once founding closes.
// There is no monthly plan: a monthly USD price has not been decided, so none is offered or shown.
export const FOUNDING = { label: 'Founding', price: 45, currency: 'USD', interval: 'year' } as const
export const STANDARD = { label: 'Standard', price: 60, currency: 'USD', interval: 'year' } as const

type Money = { price: number; currency: 'USD'; interval: 'year' }

/** formatPrice(FOUNDING) -> "US$45/yr" */
export function formatPrice(p: Money): string {
  return `US$${p.price}/yr`
}

/** formatPriceLong(FOUNDING) -> "US$45 a year" */
export function formatPriceLong(p: Money): string {
  return `US$${p.price} a year`
}

/** What a free account can follow. The one place the limits live. */
export const FREE_FOLLOW_LIMITS = { players: FREE_LIMITS.player, teams: FREE_LIMITS.team } as const

/** When true, signed-out visitors see the prices on /pricing (and only there). When false they see "Create account to see Pro pricing". */
export const SHOW_PRICE_SIGNED_OUT_ON_PRICING = true
