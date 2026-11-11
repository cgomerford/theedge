import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const create = vi.fn(async () => ({ url: 'https://checkout.stripe.test/s_1' }))
const sessionArg = () => (create.mock.calls as unknown as unknown[][])[0][0] as { line_items: { price: string }[]; metadata: Record<string, string>; subscription_data: { metadata: Record<string, string> } }
const list = vi.fn()
const getOffer = vi.fn()
const getCurrentSubscriber = vi.fn()

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create } }, promotionCodes: { list } }),
  priceFor: (interval: string, founding: boolean) => `price_${interval}_${founding ? 'founding' : 'standard'}`,
}))
vi.mock('@/lib/pro-offer-server', () => ({ getOffer: () => getOffer() }))
vi.mock('@/lib/auth', () => ({ getCurrentSubscriber: () => getCurrentSubscriber() }))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from './route'

const req = (body: unknown, cookie?: string) => ({ json: async () => body, nextUrl: { origin: 'https://x9.test' }, headers: new Headers(cookie ? { cookie } : {}) }) as unknown as NextRequest
const AMOUNT = { year: { founding: 45, standard: 60 }, month: { founding: 4.5, standard: 8 } }
const offer = (plan: 'founding' | 'standard') => ({
  founding: plan === 'founding' ? 'open' : 'closed',
  annual: { plan, amount: AMOUNT.year[plan], currency: 'USD', interval: 'year' },
  monthly: { plan, amount: AMOUNT.month[plan], currency: 'USD', interval: 'month' },
})
const unavailable = (reason: string) => ({ founding: 'open', annual: { plan: null, reason }, monthly: { plan: null, reason } })

beforeEach(() => { list.mockReset(); list.mockResolvedValue({ data: [] }); create.mockClear(); getOffer.mockReset(); getCurrentSubscriber.mockReset(); getCurrentSubscriber.mockResolvedValue(null) })

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

describe('POST /api/stripe/checkout, referral codes', () => {
  const arg = () => sessionArg() as unknown as Record<string, unknown>
  it('a valid code (body) is applied as a discount, never together with allow_promotion_codes, and tagged in metadata', async () => {
    getOffer.mockResolvedValue(offer('standard')); list.mockResolvedValue({ data: [{ id: 'promo_1' }] })
    await POST(req({ interval: 'year', ref: 'FRIEND' }))
    expect(list).toHaveBeenCalledWith({ code: 'FRIEND', active: true, limit: 1 })
    expect(arg().discounts).toEqual([{ promotion_code: 'promo_1' }])
    expect(arg()).not.toHaveProperty('allow_promotion_codes')
    expect(sessionArg().metadata.ref).toBe('FRIEND')
    expect(sessionArg().subscription_data.metadata.ref).toBe('FRIEND')
  })
  it('falls back to the edge_ref cookie when the body has no code', async () => {
    getOffer.mockResolvedValue(offer('standard')); list.mockResolvedValue({ data: [{ id: 'promo_2' }] })
    await POST(req({}, 'a=1; edge_ref=COOKIECODE'))
    expect(list).toHaveBeenCalledWith({ code: 'COOKIECODE', active: true, limit: 1 })
    expect(sessionArg().metadata.ref).toBe('COOKIECODE')
  })
  it('a code from the emailed link beats a stale cookie from an earlier visit', async () => {
    getOffer.mockResolvedValue(offer('standard')); list.mockResolvedValue({ data: [{ id: 'promo_link' }] })
    await POST(req({ interval: 'month', ref: 'LINKCODE' }, 'edge_ref=STALECOOKIE'))
    expect(list).toHaveBeenCalledWith({ code: 'LINKCODE', active: true, limit: 1 })
    expect(arg().discounts).toEqual([{ promotion_code: 'promo_link' }])
    expect(sessionArg().metadata.ref).toBe('LINKCODE')
  })
  it('an invalid code in the body is dropped, and the cookie is used instead', async () => {
    getOffer.mockResolvedValue(offer('standard')); list.mockResolvedValue({ data: [{ id: 'promo_c' }] })
    await POST(req({ ref: '!!!' }, 'edge_ref=COOKIECODE'))
    expect(list).toHaveBeenCalledWith({ code: 'COOKIECODE', active: true, limit: 1 })
    expect(sessionArg().metadata.ref).toBe('COOKIECODE')
  })
  it('an invalid code and no cookie: no lookup, no ref anywhere, normal promotion box', async () => {
    getOffer.mockResolvedValue(offer('standard'))
    await POST(req({ ref: '<>' }))
    expect(list).not.toHaveBeenCalled()
    expect(arg()).toHaveProperty('allow_promotion_codes', true)
    expect(sessionArg().metadata).not.toHaveProperty('ref')
    expect(sessionArg().subscription_data.metadata).not.toHaveProperty('ref')
  })
  it('a code with no matching Stripe promotion code still lands in the session and the subscription metadata (the webhook records it)', async () => {
    getOffer.mockResolvedValue(offer('standard'))
    await POST(req({ interval: 'month', ref: 'FRIEND10' }))
    expect(sessionArg().metadata).toMatchObject({ ref: 'FRIEND10', interval: 'month', plan: 'standard', currency: 'usd' })
    expect(sessionArg().subscription_data.metadata).toMatchObject({ ref: 'FRIEND10', interval: 'month' })
  })
  it('an unknown code gives the normal promotion-code box and no discount', async () => {
    getOffer.mockResolvedValue(offer('standard'))
    await POST(req({ ref: 'NOPE' }))
    expect(arg().allow_promotion_codes).toBe(true)
    expect(arg()).not.toHaveProperty('discounts')
  })
  it('no code at all: no Stripe lookup, normal box, no ref in metadata, cancel returns to /pricing?checkout=cancelled', async () => {
    getOffer.mockResolvedValue(offer('standard'))
    await POST(req({}))
    expect(list).not.toHaveBeenCalled()
    expect(arg().allow_promotion_codes).toBe(true)
    expect(sessionArg().metadata).not.toHaveProperty('ref')
    expect(arg().cancel_url).toBe('https://x9.test/pricing?checkout=cancelled')
    expect(arg().success_url).toContain('https://x9.test/pricing/success')
  })
  it('a failed Stripe lookup still lets checkout go ahead', async () => {
    getOffer.mockResolvedValue(offer('standard')); list.mockRejectedValue(new Error('down'))
    const res = await POST(req({ ref: 'FRIEND' }))
    expect(res.status).toBe(200)
    expect(arg().allow_promotion_codes).toBe(true)
  })
})
