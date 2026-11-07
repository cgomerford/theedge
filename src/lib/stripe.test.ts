import { describe, it, expect, afterEach, vi } from 'vitest'
import { priceFor } from './stripe'

afterEach(() => { vi.unstubAllEnvs() })

describe('priceFor', () => {
  it('uses only the USD price ids, one per plan and billing period', () => {
    vi.stubEnv('STRIPE_PRICE_FOUNDING_YEARLY_USD', 'p_fy'); vi.stubEnv('STRIPE_PRICE_YEARLY_USD', 'p_sy')
    vi.stubEnv('STRIPE_PRICE_FOUNDING_MONTHLY_USD', 'p_fm'); vi.stubEnv('STRIPE_PRICE_MONTHLY_USD', 'p_sm')
    expect(priceFor('year', true)).toBe('p_fy')
    expect(priceFor('year', false)).toBe('p_sy')
    expect(priceFor('month', true)).toBe('p_fm')
    expect(priceFor('month', false)).toBe('p_sm')
  })
  it('never falls back to the older pre-USD price ids', () => {
    for (const k of ['STRIPE_PRICE_YEARLY', 'STRIPE_PRICE_FOUNDING_YEARLY', 'STRIPE_PRICE_MONTHLY', 'STRIPE_PRICE_FOUNDING_MONTHLY']) vi.stubEnv(k, 'price_old')
    for (const k of ['STRIPE_PRICE_FOUNDING_YEARLY_USD', 'STRIPE_PRICE_YEARLY_USD', 'STRIPE_PRICE_FOUNDING_MONTHLY_USD', 'STRIPE_PRICE_MONTHLY_USD']) vi.stubEnv(k, '')
    expect(priceFor('year', true)).toBeNull(); expect(priceFor('year', false)).toBeNull()
    expect(priceFor('month', true)).toBeNull(); expect(priceFor('month', false)).toBeNull()
  })
})
