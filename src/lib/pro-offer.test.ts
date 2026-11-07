import { describe, it, expect } from 'vitest'
import { decideAnnualOffer, isExpectedAnnualPrice, planFor, type PriceFacts } from './pro-offer'

const ok: PriceFacts = { configured: true, verified: 'ok' }
const none: PriceFacts = { configured: false, verified: null }
const both = { founding: ok, standard: ok }
const usdYear = (cents: number, over: Partial<Parameters<typeof isExpectedAnnualPrice>[1]> = {}) => ({ active: true, currency: 'usd', unit_amount: cents, recurring: { interval: 'year', interval_count: 1 }, ...over })

describe('decideAnnualOffer', () => {
  it('offers Founding at US$45 while spots are open', () => {
    expect(decideAnnualOffer('open', both)).toEqual({ plan: 'founding', amount: 45, currency: 'USD', interval: 'year' })
  })
  it('offers Standard at US$60 once founding has closed', () => {
    expect(decideAnnualOffer('closed', both)).toEqual({ plan: 'standard', amount: 60, currency: 'USD', interval: 'year' })
  })
  it('withholds annual checkout when the founding count cannot be read, rather than guessing a price', () => {
    expect(decideAnnualOffer('unknown', both)).toEqual({ plan: null, reason: 'founding_count_unavailable' })
  })
  it('never falls back to the standard price when the founding USD price is missing', () => {
    expect(decideAnnualOffer('open', { founding: none, standard: ok })).toEqual({ plan: null, reason: 'usd_price_not_configured' })
  })
  it('reports a missing standard USD price once founding is closed', () => {
    expect(decideAnnualOffer('closed', { founding: ok, standard: none })).toEqual({ plan: null, reason: 'usd_price_not_configured' })
  })
  it('refuses a price Stripe says is wrong, and one it could not check', () => {
    expect(decideAnnualOffer('open', { founding: { configured: true, verified: 'mismatch' }, standard: ok }).reason).toBe('usd_price_mismatch')
    expect(decideAnnualOffer('open', { founding: { configured: true, verified: 'unreachable' }, standard: ok }).reason).toBe('stripe_unavailable')
  })
  it('maps founding state to a plan', () => {
    expect([planFor('open'), planFor('closed'), planFor('unknown')]).toEqual(['founding', 'standard', null])
  })
})

describe('isExpectedAnnualPrice', () => {
  it('accepts exactly US$45 and US$60 a year', () => {
    expect(isExpectedAnnualPrice('founding', usdYear(4500))).toBe(true)
    expect(isExpectedAnnualPrice('standard', usdYear(6000))).toBe(true)
  })
  it('rejects the wrong amount, a non-USD currency, a monthly interval, an inactive price and a swapped plan', () => {
    expect(isExpectedAnnualPrice('founding', usdYear(4000))).toBe(false)               // the earlier amount
    expect(isExpectedAnnualPrice('founding', usdYear(4500, { currency: 'eur' }))).toBe(false)
    expect(isExpectedAnnualPrice('standard', usdYear(6000, { recurring: { interval: 'month', interval_count: 1 } }))).toBe(false)
    expect(isExpectedAnnualPrice('standard', usdYear(6000, { active: false }))).toBe(false)
    expect(isExpectedAnnualPrice('standard', usdYear(4500))).toBe(false)
    expect(isExpectedAnnualPrice('founding', usdYear(4500, { recurring: null }))).toBe(false)
  })
})
