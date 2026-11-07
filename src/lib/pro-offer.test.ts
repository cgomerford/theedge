import { describe, it, expect } from 'vitest'
import { decideOffer, isExpectedPrice, planFor, PRICE_USD, type PriceFacts } from './pro-offer'

const ok: PriceFacts = { configured: true, verified: 'ok' }
const none: PriceFacts = { configured: false, verified: null }
const both = { founding: ok, standard: ok }
const usd = (cents: number, interval: 'year' | 'month', over: Partial<Parameters<typeof isExpectedPrice>[2]> = {}) => ({ active: true, currency: 'usd', unit_amount: cents, recurring: { interval, interval_count: 1 }, ...over })

describe('the four prices', () => {
  it('are US$45/yr, US$60/yr, US$4.50/mo and US$8/mo', () => {
    expect(PRICE_USD).toEqual({ year: { founding: 45, standard: 60 }, month: { founding: 4.5, standard: 8 } })
  })
})

describe('decideOffer', () => {
  it('offers Founding while spots are open: US$45 a year, US$4.50 a month', () => {
    expect(decideOffer('year', 'open', both)).toEqual({ plan: 'founding', amount: 45, currency: 'USD', interval: 'year' })
    expect(decideOffer('month', 'open', both)).toEqual({ plan: 'founding', amount: 4.5, currency: 'USD', interval: 'month' })
  })
  it('offers Standard once founding has closed: US$60 a year, US$8 a month', () => {
    expect(decideOffer('year', 'closed', both)).toEqual({ plan: 'standard', amount: 60, currency: 'USD', interval: 'year' })
    expect(decideOffer('month', 'closed', both)).toEqual({ plan: 'standard', amount: 8, currency: 'USD', interval: 'month' })
  })
  it('withholds checkout when the founding count cannot be read, rather than guessing a price', () => {
    expect(decideOffer('year', 'unknown', both)).toEqual({ plan: null, reason: 'founding_count_unavailable' })
    expect(decideOffer('month', 'unknown', both)).toEqual({ plan: null, reason: 'founding_count_unavailable' })
  })
  it('never falls back to the standard price when the founding USD price is missing', () => {
    expect(decideOffer('year', 'open', { founding: none, standard: ok })).toEqual({ plan: null, reason: 'usd_price_not_configured' })
    expect(decideOffer('month', 'open', { founding: none, standard: ok })).toEqual({ plan: null, reason: 'usd_price_not_configured' })
  })
  it('reports a missing standard USD price once founding is closed', () => {
    expect(decideOffer('month', 'closed', { founding: ok, standard: none })).toEqual({ plan: null, reason: 'usd_price_not_configured' })
  })
  it('refuses a price Stripe says is wrong, and one it could not check', () => {
    expect(decideOffer('year', 'open', { founding: { configured: true, verified: 'mismatch' }, standard: ok }).reason).toBe('usd_price_mismatch')
    expect(decideOffer('month', 'open', { founding: { configured: true, verified: 'unreachable' }, standard: ok }).reason).toBe('stripe_unavailable')
  })
  it('maps founding state to a plan', () => {
    expect([planFor('open'), planFor('closed'), planFor('unknown')]).toEqual(['founding', 'standard', null])
  })
})

describe('isExpectedPrice', () => {
  it('accepts exactly the four prices, to the cent', () => {
    expect(isExpectedPrice('year', 'founding', usd(4500, 'year'))).toBe(true)
    expect(isExpectedPrice('year', 'standard', usd(6000, 'year'))).toBe(true)
    expect(isExpectedPrice('month', 'founding', usd(450, 'month'))).toBe(true)
    expect(isExpectedPrice('month', 'standard', usd(800, 'month'))).toBe(true)
  })
  it('rejects a wrong amount, a non-USD currency, the wrong period, an inactive price and a swapped plan', () => {
    expect(isExpectedPrice('year', 'founding', usd(4000, 'year'))).toBe(false)
    expect(isExpectedPrice('month', 'founding', usd(400, 'month'))).toBe(false)             // US$4, not US$4.50
    expect(isExpectedPrice('month', 'founding', usd(450, 'month', { currency: 'eur' }))).toBe(false)
    expect(isExpectedPrice('year', 'standard', usd(6000, 'month'))).toBe(false)              // monthly price in the yearly slot
    expect(isExpectedPrice('month', 'standard', usd(800, 'year'))).toBe(false)
    expect(isExpectedPrice('year', 'standard', usd(6000, 'year', { active: false }))).toBe(false)
    expect(isExpectedPrice('month', 'standard', usd(450, 'month'))).toBe(false)
    expect(isExpectedPrice('year', 'founding', usd(4500, 'year', { recurring: null }))).toBe(false)
  })
})
