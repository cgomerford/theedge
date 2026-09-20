// POST /api/stripe/checkout  { interval: 'month' | 'year' }  →  { url }
//
// Starts a Stripe Checkout subscription. Works signed-in or signed-out:
//   • signed in  → the session is pre-filled with their email and tagged with their
//                  subscriber id, so the webhook upgrades exactly that account.
//   • signed out → Stripe collects the email; the webhook creates (or finds) the
//                  subscriber by that email. They then sign in with a login link.
// Pro itself is granted ONLY by the webhook after Stripe confirms payment — never here.

import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { FOUNDING_LIMIT, getStripe, priceFor, type Interval } from '@/lib/stripe'

export const runtime = 'nodejs'

async function foundingOpen(): Promise<boolean> {
  const { count, error } = await createAdminClient().from('subscribers').select('id', { count: 'exact', head: true }).eq('pro_plan', 'founding').eq('is_pro', true)
  if (error) {
    // Column missing (migration not run) or query failed: fail CLOSED to standard pricing, never to an accidental discount.
    console.error('[stripe/checkout] founding count failed:', error.message)
    return false
  }
  return (count ?? 0) < FOUNDING_LIMIT
}

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  let interval: Interval = 'month'
  try {
    const body = await req.json()
    if (body?.interval === 'year') interval = 'year'
  } catch { /* default to monthly */ }

  const subscriber = await getCurrentSubscriber()
  if (subscriber?.is_pro) return NextResponse.json({ error: 'already_pro' }, { status: 409 })

  // Founding price only if a founding Stripe price is configured AND spots remain; otherwise standard.
  const foundingEnv = interval === 'month' ? process.env.STRIPE_PRICE_FOUNDING_MONTHLY : process.env.STRIPE_PRICE_FOUNDING_YEARLY
  const useFounding = !!foundingEnv && (await foundingOpen())
  const price = useFounding ? (foundingEnv as string) : priceFor(interval, false)
  if (!price) {
    console.error('[stripe/checkout] no Stripe price configured for', interval)
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  const plan = useFounding ? 'founding' : 'standard'

  try {
    const origin = req.nextUrl.origin
    const meta: Record<string, string> = { plan, ...(subscriber ? { subscriber_id: subscriber.id } : {}) }
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
    console.error('[stripe/checkout]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 })
  }
}
