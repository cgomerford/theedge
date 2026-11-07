import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const create = vi.fn(async () => ({ url: 'https://checkout.stripe.test/s_1' }))
const sessionArg = () => (create.mock.calls as unknown as unknown[][])[0][0]
const getOffer = vi.fn()
const getCurrentSubscriber = vi.fn()

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create } } }),
  priceFor: (founding: boolean) => (founding ? 'price_usd_founding' : 'price_usd_standard'),
}))
vi.mock('@/lib/pro-offer-server', () => ({ getOffer: () => getOffer() }))
vi.mock('@/lib/auth', () => ({ getCurrentSubscriber: () => getCurrentSubscriber() }))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body, nextUrl: { origin: 'https://x9.test' } }) as unknown as NextRequest
const annual = (plan: 'founding' | 'standard') => ({ founding: plan === 'founding' ? 'open' : 'closed', annual: { plan, amount: plan === 'founding' ? 45 : 60, currency: 'USD', interval: 'year' }, })

beforeEach(() => { create.mockClear(); getOffer.mockReset(); getCurrentSubscriber.mockReset(); getCurrentSubscriber.mockResolvedValue(null) })

describe('POST /api/stripe/checkout', () => {
  it('founding open: charges the USD founding price, tagged usd/year', async () => {
    getOffer.mockResolvedValue(annual('founding'))
    const res = await POST(req({ expect: 'founding' }))
    expect(res.status).toBe(200)
    const arg = sessionArg() as { line_items: { price: string }[]; metadata: Record<string, string>; subscription_data: { metadata: Record<string, string> } }
    expect(arg.line_items[0].price).toBe('price_usd_founding')
    expect(arg.metadata).toMatchObject({ plan: 'founding', interval: 'year', currency: 'usd' })
    expect(arg.subscription_data.metadata.plan).toBe('founding')
  })
  it('founding closed: charges the USD standard price', async () => {
    getOffer.mockResolvedValue(annual('standard'))
    await POST(req({}))
    expect((sessionArg() as { line_items: { price: string }[] }).line_items[0].price).toBe('price_usd_standard')
  })
  it('refuses with 409 and creates no session when the page showed founding but founding has closed', async () => {
    getOffer.mockResolvedValue(annual('standard'))
    const res = await POST(req({ expect: 'founding' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'price_changed', plan: 'standard' })
    expect(create).not.toHaveBeenCalled()
  })
  it('refuses with 503 and creates no session when the USD price is not set up', async () => {
    getOffer.mockResolvedValue({ founding: 'open', annual: { plan: null, reason: 'usd_price_not_configured' }, })
    const res = await POST(req({}))
    expect(res.status).toBe(503)
    expect(create).not.toHaveBeenCalled()
  })
  it('refuses with 503 when the founding count cannot be read', async () => {
    getOffer.mockResolvedValue({ founding: 'unknown', annual: { plan: null, reason: 'founding_count_unavailable' }, })
    expect((await POST(req({}))).status).toBe(503)
    expect(create).not.toHaveBeenCalled()
  })
  it('does not start a purchase for someone who already has Pro', async () => {
    getCurrentSubscriber.mockResolvedValue({ id: 'u1', email: 'a@b.c', is_pro: true })
    expect((await POST(req({}))).status).toBe(409)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('POST /api/stripe/checkout, monthly', () => {
  it('is not offered: refused with 400 and no session', async () => {
    const res = await POST(req({ interval: 'month' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'monthly_not_available' })
    expect(create).not.toHaveBeenCalled()
    expect(getOffer).not.toHaveBeenCalled()
  })
})
