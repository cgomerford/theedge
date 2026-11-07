// POST /api/stripe/checkout  { expect?: 'founding' | 'standard' }  →  { url }
//
// Starts a Stripe Checkout subscription for annual Pro, in US dollars (US$45 Founding, US$60 Standard). Works signed-in or signed-out:
//   • signed in  → the session is pre-filled with their email and tagged with their
//                  subscriber id, so the webhook upgrades exactly that account.
//   • signed out → Stripe collects the email; the webhook creates (or finds) the
//                  subscriber by that email. They then sign in with a login link.
// Pro itself is granted ONLY by the webhook after Stripe confirms payment — never here.
//
// The price is the *_USD Stripe price, checked against Stripe (active, USD, yearly, exact amount) before a session is made; if it is
// missing or wrong the answer is 503, never a different amount. There is no monthly plan: a request for one is refused (400).
// `expect` is the plan the page showed; if the offer has moved on (founding just filled) the answer is 409 and nothing is charged.
// Existing subscriptions are untouched: nothing here reads, changes or reprices a subscription that already exists.

import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getStripe, priceFor } from '@/lib/stripe'
import { getOffer } from '@/lib/pro-offer-server'
import { log } from '@/lib/log'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  let expect: string | null = null
  try {
    const body = await req.json()
    if (body?.interval === 'month') return NextResponse.json({ error: 'monthly_not_available' }, { status: 400 })
    if (body?.expect === 'founding' || body?.expect === 'standard') expect = body.expect
  } catch { /* no body: annual */ }

  const subscriber = await getCurrentSubscriber()
  if (subscriber?.is_pro) return NextResponse.json({ error: 'already_pro' }, { status: 409 })

  const { annual } = await getOffer()
  if (annual.plan === null) {
    log.error('stripe/checkout', 'annual checkout unavailable:', annual.reason)
    return NextResponse.json({ error: 'not_configured', reason: annual.reason }, { status: 503 })
  }
  const plan = annual.plan
  const price = priceFor(plan === 'founding') as string   // getOffer only returns a plan whose price is set and verified
  if (expect && expect !== plan) return NextResponse.json({ error: 'price_changed', plan }, { status: 409 })

  try {
    const origin = req.nextUrl.origin
    const meta: Record<string, string> = { plan, interval: 'year', currency: 'usd', ...(subscriber ? { subscriber_id: subscriber.id } : {}) }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      ...(subscriber ? { customer_email: subscriber.email, client_reference_id: subscriber.id } : {}),
      metadata: meta,
      subscription_data: { metadata: meta },
    })
    if (!session.url) return NextResponse.json({ error: 'no_url' }, { status: 502 })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    log.error('stripe/checkout', 'failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 })
  }
}
