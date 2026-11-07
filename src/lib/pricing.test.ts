import { describe, it, expect } from 'vitest'
import * as pricing from './pricing'
import { FOUNDING, STANDARD, FOUNDING_LIMIT, formatPrice, formatPriceLong } from './pricing'

describe('annual pricing', () => {
  it('founding is US$45 a year for the first 100, standard is US$60 a year', () => {
    expect(FOUNDING).toMatchObject({ price: 45, currency: 'USD', interval: 'year' })
    expect(STANDARD).toMatchObject({ price: 60, currency: 'USD', interval: 'year' })
    expect(FOUNDING_LIMIT).toBe(100)
  })
  it('prints the currency with every amount', () => {
    expect(formatPrice(FOUNDING)).toBe('US$45/yr')
    expect(formatPrice(STANDARD)).toBe('US$60/yr')
    expect(formatPriceLong(FOUNDING)).toBe('US$45 a year')
  })
  it('has no monthly plan and no non-dollar currency', () => {
    const src = Object.keys(pricing)
    expect(src).not.toContain('MONTHLY')
    expect(formatPrice(FOUNDING) + formatPrice(STANDARD)).not.toMatch(/[£€]/)
  })
})
