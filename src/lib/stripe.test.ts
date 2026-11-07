import { describe, it, expect, afterEach, vi } from 'vitest'
import { priceFor } from './stripe'

afterEach(() => { vi.unstubAllEnvs() })

describe('priceFor', () => {
  it('annual uses only the USD price ids', () => {
    vi.stubEnv('STRIPE_PRICE_YEARLY_USD', 'price_std_usd'); vi.stubEnv('STRIPE_PRICE_FOUNDING_YEARLY_USD', 'price_fnd_usd')
    expect(priceFor(false)).toBe('price_std_usd')
    expect(priceFor(true)).toBe('price_fnd_usd')
  })
  it('annual never falls back to the older pre-USD price ids', () => {
    vi.stubEnv('STRIPE_PRICE_YEARLY', 'price_old'); vi.stubEnv('STRIPE_PRICE_FOUNDING_YEARLY', 'price_old_fnd')
    vi.stubEnv('STRIPE_PRICE_YEARLY_USD', ''); vi.stubEnv('STRIPE_PRICE_FOUNDING_YEARLY_USD', '')
    expect(priceFor(false)).toBeNull()
    expect(priceFor(true)).toBeNull()
  })
})
