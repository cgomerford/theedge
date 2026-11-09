import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// A tiny fake of the Supabase builder: records every update and answers selects from `row`.
type Update = { table: string; patch: Record<string, unknown>; filters: [string, unknown][] }
const updates: Update[] = []
let row: Record<string, unknown> | null = null
function builder(table: string) {
  const filters: [string, unknown][] = []
  let patch: Record<string, unknown> | null = null
  const b: Record<string, unknown> = {
    select: () => b,
    update: (p: Record<string, unknown>) => { patch = p; return b },
    upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'new1' }, error: null }) }) }),
    eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
    is: (k: string, v: unknown) => { filters.push([`is:${k}`, v]); return b },
    maybeSingle: async () => ({ data: row, error: null }),
    then: (res: (v: { error: null }) => unknown) => { if (patch) updates.push({ table, patch, filters }); return Promise.resolve({ error: null }).then(res) },
  }
  return b
}
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))
let event: unknown
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ webhooks: { constructEvent: () => event } }), PRO_STATUSES: new Set(['active', 'trialing', 'past_due']) }))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from './route'
const req = { headers: new Headers({ 'stripe-signature': 'sig' }), text: async () => '{}' } as unknown as NextRequest

beforeEach(() => { updates.length = 0; row = null; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test' })

describe('Stripe webhook', () => {
  it('a canceled subscription never switches Pro off for a subscriber with no stripe_customer_id', async () => {
    row = { id: 's1', stripe_customer_id: null }
    event = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled', customer: 'cus_1', metadata: { subscriber_id: 's1' } } } }
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(updates.some(u => u.patch.is_pro === false)).toBe(false)
  })
  it('a canceled subscription does switch Pro off for a billed subscriber', async () => {
    row = { id: 's2', stripe_customer_id: 'cus_2' }
    event = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_2', status: 'canceled', customer: 'cus_2', metadata: { subscriber_id: 's2' } } } }
    await POST(req)
    expect(updates.some(u => u.patch.is_pro === false)).toBe(true)
  })
  it('checkout.session.completed grants Pro and records the referral once (uppercased, only while empty)', async () => {
    row = { id: 's3' }
    event = { type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer_email: 'a@b.co', customer: 'cus_3', subscription: 'sub_3', client_reference_id: 's3', metadata: { plan: 'standard', ref: 'friend' } } } }
    await POST(req)
    expect(updates.some(u => u.patch.is_pro === true)).toBe(true)
    const r = updates.find(u => 'referral_code' in u.patch)
    expect(r?.patch.referral_code).toBe('FRIEND')
    expect(r?.filters).toContainEqual(['is:referral_code', null])
  })
  it('no ref in metadata: no referral write', async () => {
    row = { id: 's4' }
    event = { type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer_email: 'a@b.co', customer: 'cus_4', subscription: 'sub_4', client_reference_id: 's4', metadata: { plan: 'standard' } } } }
    await POST(req)
    expect(updates.some(u => 'referral_code' in u.patch)).toBe(false)
  })
})
