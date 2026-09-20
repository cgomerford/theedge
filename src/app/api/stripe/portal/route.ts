// POST /api/stripe/portal → { url } — Stripe's hosted billing portal (update card, switch plan, cancel).
// Signed-in Pro members only; needs subscribers.stripe_customer_id (set by the webhook).

import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentSubscriber } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const subscriber = await getCurrentSubscriber()
  if (!subscriber) return NextResponse.json({ error: 'sign_in_required' }, { status: 401 })

  const { data, error } = await createAdminClient().from('subscribers').select('stripe_customer_id').eq('id', subscriber.id).maybeSingle()
  if (error) console.error('[stripe/portal] Supabase error:', error.message)
  const customer = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id
  if (!customer) return NextResponse.json({ error: 'no_billing_account' }, { status: 404 })

  try {
    const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${req.nextUrl.origin}/pricing` })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[stripe/portal]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 })
  }
}
