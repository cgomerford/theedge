// The ONE place prices live in code. Stripe holds the real prices (the price ids come from the STRIPE_PRICE_* env vars read
// in src/lib/stripe.ts and used by /api/stripe/checkout); these numbers are only what we print. Keep them in step with Stripe.
//
// Visibility rules (see ProGate and /pricing):
//   signed out        -> no price and no plan name anywhere (pages, meta tags, structured data)
//   signed in, no Pro -> the price shows on /pricing and inside the one ProGate on a page
//   Pro               -> no prices and no upgrade prompts

export const FOUNDING = { label: 'Founding', price: 40, currency: 'GBP', interval: 'year' } as const
export const MONTHLY = { price: 4, currency: 'GBP', interval: 'month' } as const

type Money = { price: number; currency: string; interval: 'year' | 'month' }

const SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' }
const SHORT: Record<Money['interval'], string> = { year: 'yr', month: 'mo' }

/** formatPrice(FOUNDING) -> "£40/yr"; formatPrice(MONTHLY) -> "£4/mo" */
export function formatPrice(p: Money): string {
  return `${SYMBOL[p.currency] ?? ''}${p.price}/${SHORT[p.interval]}`
}

/** "£40/yr Founding, then £4/mo" (shown only to signed-in people without Pro) */
export function foundingThenMonthly(): string {
  return `${formatPrice(FOUNDING)} ${FOUNDING.label}, then ${formatPrice(MONTHLY)}`
}

/** What a free account can follow. The one place the limits live. */
export const FREE_FOLLOW_LIMITS = { players: 10, teams: 3 } as const

/** When true, signed-out visitors see the prices on /pricing (and only there). When false they see "Create account to see Pro pricing". */
export const SHOW_PRICE_SIGNED_OUT_ON_PRICING = true
