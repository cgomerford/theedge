// POST /api/stripe/webhook — the ONLY place Pro is granted or revoked from a payment.
//
// TABLE OWNERSHIP (single-writer rule): on a Stripe event this route is the sole writer of
//   subscribers.is_pro, stripe_customer_id, stripe_subscription_id, pro_plan, pro_status, pro_updated_at.
//
// Point a Stripe webhook endpoint at https://<your-domain>/api/stripe/webhook and subscribe it to:
//   checkout.session.completed · customer.subscription.updated · customer.subscription.deleted
// and put its signing secret in STRIPE_WEBHOOK_SECRET.
//
// Behaviour:
//   • signature verified on the RAW body (a forged request is rejected 400);
//   • checkout.session.completed → find the subscriber (metadata id → customer id → email), or
//     create a verified one from the payment email, then is_pro = true;
//   • subscription updated/deleted → is_pro follows the Stripe status (active/trialing/past_due = on);
//   • idempotent: replays set the same values;
//   • if the billing columns don't exist yet (scripts/sql/add_stripe_columns.sql not run) it STILL flips
//     is_pro — a paying customer is never locked out — and logs a loud error;
//   • a real failure returns 500 so Stripe retries.

import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'crypto'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase'
import { getStripe, PRO_STATUSES } from '@/lib/stripe'

export const runtime = 'nodejs'

type Patch = { is_pro: boolean; stripe_customer_id?: string; stripe_subscription_id?: string; pro_plan?: string; pro_status?: string; pro_updated_at?: string }

const idOf = (v: string | { id: string } | null | undefined): string | undefined => (typeof v === 'string' ? v : v?.id)

async function applyPatch(subscriberId: string, patch: Patch): Promise<void> {
  const supa = createAdminClient()
  const { error } = await supa.from('subscribers').update(patch).eq('id', subscriberId)
  if (!error) return
  // Undefined column / stale schema cache → migration not run. Grant/revoke Pro anyway.
  if (error.code === '42703' || error.code === 'PGRST204') {
    console.error('[stripe/webhook] billing columns missing — run scripts/sql/add_stripe_columns.sql. Applying is_pro only.')
    const { error: e2 } = await supa.from('subscribers').update({ is_pro: patch.is_pro }).eq('id', subscriberId)
    if (e2) throw new Error(e2.message)
    return
  }
  throw new Error(error.message)
}

async function findSubscriberId(opts: { subscriberId?: string; customerId?: string; email?: string | null }): Promise<string | null> {
  const supa = createAdminClient()
  if (opts.subscriberId) {
    const { data } = await supa.from('subscribers').select('id').eq('id', opts.subscriberId).maybeSingle()
    if (data) return (data as { id: string }).id
  }
  if (opts.customerId) {
    const { data, error } = await supa.from('subscribers').select('id').eq('stripe_customer_id', opts.customerId).maybeSingle()
    if (error && error.code !== '42703') console.error('[stripe/webhook] customer lookup:', error.message)
    if (data) return (data as { id: string }).id
  }
  if (opts.email) {
    const { data } = await supa.from('subscribers').select('id').eq('email', opts.email.toLowerCase().trim()).maybeSingle()
    if (data) return (data as { id: string }).id
  }
  return null
}

async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription') return
  const email = (session.customer_details?.email ?? session.customer_email)?.toLowerCase().trim() ?? null
  let id = await findSubscriberId({ subscriberId: session.metadata?.subscriber_id ?? session.client_reference_id ?? undefined, email })
  if (!id) {
    if (!email) throw new Error('checkout completed with no email and no matching subscriber')
    // First contact IS the purchase: Stripe collected and charged this email, so it is verified for login links.
    const { data, error } = await createAdminClient().from('subscribers').upsert({
      email, source: 'stripe_checkout', fan_type: 'casual', email_verified: true,
      preferences_token: crypto.randomUUID().replace(/-/g, ''),
    }, { onConflict: 'email' }).select('id').maybeSingle()
    if (error || !data) throw new Error(`could not create subscriber: ${error?.message ?? 'no row'}`)
    id = (data as { id: string }).id
  }
  await applyPatch(id, {
    is_pro: true, pro_status: 'active', pro_plan: session.metadata?.plan === 'founding' ? 'founding' : 'standard',
    stripe_customer_id: idOf(session.customer), stripe_subscription_id: idOf(session.subscription), pro_updated_at: new Date().toISOString(),
  })
}

async function onSubscriptionChanged(sub: Stripe.Subscription) {
  const id = await findSubscriberId({ subscriberId: sub.metadata?.subscriber_id, customerId: idOf(sub.customer) })
  if (!id) { console.error('[stripe/webhook] subscription event for an unknown customer', idOf(sub.customer)); return }
  await applyPatch(id, { is_pro: PRO_STATUSES.has(sub.status), pro_status: sub.status, stripe_subscription_id: sub.id, pro_updated_at: new Date().toISOString() })
}

export async function POST(req: NextRequest) {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, secret)
  } catch (err) {
    console.error('[stripe/webhook] bad signature:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
    else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') await onSubscriptionChanged(event.data.object as Stripe.Subscription)
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error(`[stripe/webhook] ${event.type} failed:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 })
  }
}
