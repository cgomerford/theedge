import { describe, it, expect } from 'vitest'
import { FOUNDING, STANDARD, FOUNDING_MONTHLY, STANDARD_MONTHLY, FOUNDING_LIMIT, formatPrice, formatPriceLong } from './pricing'

describe('pricing', () => {
  it('founding is US$45 a year or US$4.50 a month for the first 100; standard is US$60 a year or US$8 a month', () => {
    expect(FOUNDING).toMatchObject({ price: 45, currency: 'USD', interval: 'year' })
    expect(STANDARD).toMatchObject({ price: 60, currency: 'USD', interval: 'year' })
    expect(FOUNDING_MONTHLY).toMatchObject({ price: 4.5, currency: 'USD', interval: 'month' })
    expect(STANDARD_MONTHLY).toMatchObject({ price: 8, currency: 'USD', interval: 'month' })
    expect(FOUNDING_LIMIT).toBe(100)
  })
  it('prints the currency and the cents where there are some', () => {
    expect(formatPrice(FOUNDING)).toBe('US$45/yr')
    expect(formatPrice(STANDARD)).toBe('US$60/yr')
    expect(formatPrice(FOUNDING_MONTHLY)).toBe('US$4.50/mo')
    expect(formatPrice(STANDARD_MONTHLY)).toBe('US$8/mo')
    expect(formatPriceLong(FOUNDING_MONTHLY)).toBe('US$4.50 a month')
    expect(formatPriceLong(STANDARD)).toBe('US$60 a year')
  })
})
