import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const create = vi.fn(async () => ({ url: 'https://checkout.stripe.test/s_1' }))
const sessionArg = () => (create.mock.calls as unknown as unknown[][])[0][0] as { line_items: { price: string }[]; metadata: Record<string, string>; subscription_data: { metadata: Record<string, string> } }
const getOffer = vi.fn()
const getCurrentSubscriber = vi.fn()

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create } } }),
  priceFor: (interval: string, founding: boolean) => `price_${interval}_${founding ? 'founding' : 'standard'}`,
}))
vi.mock('@/lib/pro-offer-server', () => ({ getOffer: () => getOffer() }))
vi.mock('@/lib/auth', () => ({ getCurrentSubscriber: () => getCurrentSubscriber() }))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body, nextUrl: { origin: 'https://x9.test' } }) as unknown as NextRequest
const AMOUNT = { year: { founding: 45, standard: 60 }, month: { founding: 4.5, standard: 8 } }
const offer = (plan: 'founding' | 'standard') => ({
  founding: plan === 'founding' ? 'open' : 'closed',
  annual: { plan, amount: AMOUNT.year[plan], currency: 'USD', interval: 'year' },
  monthly: { plan, amount: AMOUNT.month[plan], currency: 'USD', interval: 'month' },
})
const unavailable = (reason: string) => ({ founding: 'open', annual: { plan: null, reason }, monthly: { plan: null, reason } })

beforeEach(() => { create.mockClear(); getOffer.mockReset(); getCurrentSubscriber.mockReset(); getCurrentSubscriber.mockResolvedValue(null) })

describe('POST /api/stripe/checkout, yearly', () => {
  it('founding open: charges the founding yearly USD price, tagged usd/year', async () => {
    getOffer.mockResolvedValue(offer('founding'))
    const res = await POST(req({ interval: 'year', expect: 'founding' }))
    expect(res.status).toBe(200)
    expect(sessionArg().line_items[0].price).toBe('price_year_founding')
    expect(sessionArg().metadata).toMatchObject({ plan: 'founding', interval: 'year', currency: 'usd' })
    expect(sessionArg().subscription_data.metadata.plan).toBe('founding')
  })
  it('defaults to yearly when no interval is sent', async () => {
    getOffer.mockResolvedValue(offer('standard'))
    await POST(req({}))
    expect(sessionArg().line_items[0].price).toBe('price_year_standard')
  })
})

describe('POST /api/stripe/checkout, monthly', () => {
  it('founding open: charges the founding monthly USD price, tagged usd/month', async () => {
    getOffer.mockResolvedValue(offer('founding'))
    const res = await POST(req({ interval: 'month', expect: 'founding' }))
    expect(res.status).toBe(200)
    expect(sessionArg().line_items[0].price).toBe('price_month_founding')
    expect(sessionArg().metadata).toMatchObject({ plan: 'founding', interval: 'month', currency: 'usd' })
  })
  it('founding closed: charges the standard monthly USD price', async () => {
    getOffer.mockResolvedValue(offer('standard'))
    await POST(req({ interval: 'month' }))
    expect(sessionArg().line_items[0].price).toBe('price_month_standard')
  })
})

describe('POST /api/stripe/checkout, refusals', () => {
  for (const interval of ['year', 'month'] as const) {
    it(`${interval}: 409 and no session when the page showed founding but founding has closed`, async () => {
      getOffer.mockResolvedValue(offer('standard'))
      const res = await POST(req({ interval, expect: 'founding' }))
      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ error: 'price_changed', plan: 'standard' })
      expect(create).not.toHaveBeenCalled()
    })
    it(`${interval}: 503 and no session when the USD price is not set up`, async () => {
      getOffer.mockResolvedValue(unavailable('usd_price_not_configured'))
      expect((await POST(req({ interval }))).status).toBe(503)
      expect(create).not.toHaveBeenCalled()
    })
    it(`${interval}: 503 when the founding count cannot be read`, async () => {
      getOffer.mockResolvedValue(unavailable('founding_count_unavailable'))
      expect((await POST(req({ interval }))).status).toBe(503)
      expect(create).not.toHaveBeenCalled()
    })
  }
  it('does not start a purchase for someone who already has Pro', async () => {
    getCurrentSubscriber.mockResolvedValue({ id: 'u1', email: 'a@b.c', is_pro: true })
    expect((await POST(req({}))).status).toBe(409)
    expect(create).not.toHaveBeenCalled()
  })
  it('one period being unavailable does not block the other', async () => {
    getOffer.mockResolvedValue({ ...offer('founding'), monthly: { plan: null, reason: 'usd_price_not_configured' } })
    expect((await POST(req({ interval: 'month' }))).status).toBe(503)
    expect((await POST(req({ interval: 'year' }))).status).toBe(200)
  })
})
