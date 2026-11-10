// POST /api/stripe/checkout  { interval?: 'year' | 'month', expect?: 'founding' | 'standard', ref?: string }  →  { url }
//
// Starts a Stripe Checkout subscription for Pro, in US dollars: yearly (default) or monthly. Founding while spots remain
// (US$45/yr, US$4.50/mo), Standard after (US$60/yr, US$8/mo). Works signed-in or signed-out:
//   • signed in  → the session is pre-filled with their email and tagged with their
//                  subscriber id, so the webhook upgrades exactly that account.
//   • signed out → Stripe collects the email; the webhook creates (or finds) the
//                  subscriber by that email. They then sign in with a login link.
// Pro itself is granted ONLY by the webhook after Stripe confirms payment — never here.
//
// The price is the *_USD Stripe price, checked against Stripe (active, USD, right period, exact amount) before a session is made; if it is
// missing or wrong the answer is 503, never a different amount.
// `expect` is the plan the page showed; if the offer has moved on (founding just filled) the answer is 409 and nothing is charged.
// Referral: `ref` (body first, then the edge_ref cookie) is checked against Stripe's active promotion codes. A real code is applied as a
// discount; otherwise the checkout page shows the normal "add promotion code" box. The two are never sent together (Stripe rejects it).
// The code is also stored in the session and subscription metadata; the webhook records it on the subscriber.
// Existing subscriptions are untouched: nothing here reads, changes or reprices a subscription that already exists.

import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { getStripe, priceFor, type Interval } from '@/lib/stripe'
import { getOffer } from '@/lib/pro-offer-server'
import { log } from '@/lib/log'
import { cleanRef, refFromCookieHeader } from '@/lib/referral'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  let interval: Interval = 'year'
  let expect: string | null = null
  let bodyRef: string | null = null
  try {
    const body = await req.json()
    if (body?.interval === 'month') interval = 'month'
    if (body?.expect === 'founding' || body?.expect === 'standard') expect = body.expect
    bodyRef = cleanRef(body?.ref)
  } catch { /* no body: yearly */ }

  const subscriber = await getCurrentSubscriber()
  if (subscriber?.is_pro) return NextResponse.json({ error: 'already_pro' }, { status: 409 })

  const offers = await getOffer()
  const offer = interval === 'year' ? offers.annual : offers.monthly
  if (offer.plan === null) {
    log.error('stripe/checkout', `${interval}ly checkout unavailable:`, offer.reason)
    return NextResponse.json({ error: 'not_configured', reason: offer.reason }, { status: 503 })
  }
  const plan = offer.plan
  const price = priceFor(interval, plan === 'founding') as string   // getOffer only returns a plan whose price is set and verified
  if (expect && expect !== plan) return NextResponse.json({ error: 'price_changed', plan }, { status: 409 })

  try {
    const origin = req.nextUrl.origin
    const ref = bodyRef ?? refFromCookieHeader(req.headers?.get?.('cookie'))
    // A promotion code that Stripe does not know (or that is switched off) is simply ignored: no discount, normal checkout.
    let promotionCodeId: string | null = null
    if (ref) {
      try {
        const found = await stripe.promotionCodes.list({ code: ref, active: true, limit: 1 })
        promotionCodeId = found.data[0]?.id ?? null
      } catch (err) {
        log.error('stripe/checkout', 'promotion code lookup failed', err instanceof Error ? err.message : err)
      }
    }
    const meta: Record<string, string> = { plan, interval, currency: 'usd', ...(ref ? { ref } : {}), ...(subscriber ? { subscriber_id: subscriber.id } : {}) }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      ...(promotionCodeId ? { discounts: [{ promotion_code: promotionCodeId }] } : { allow_promotion_codes: true }),
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
