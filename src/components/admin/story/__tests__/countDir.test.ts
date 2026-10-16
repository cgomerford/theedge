import { describe, expect, it } from 'vitest'
import { countSpec, countValue, tween } from '../countDir'

describe('countDir', () => {
  it('count rises 0 → v', () => {
    expect(countValue('count', 12, 0)).toBe(0)
    expect(countValue('count', 12, 1)).toBeCloseTo(12, 6)
    expect(countValue('count', 12, 0.5)).toBeGreaterThan(0)
  })
  it('cooling falls from the peak to now', () => {
    const peak = 0.964, now = 0.745
    const a = countValue('cooling', now, 0.2, peak), b = countValue('cooling', now, 0.8, peak)
    expect(countValue('cooling', now, 0, peak)).toBeCloseTo(peak, 6)
    expect(a).toBeGreaterThan(b); expect(b).toBeGreaterThanOrEqual(now)
    expect(countValue('cooling', now, 1, peak)).toBeCloseTo(now, 6)
  })
  it('heating rises from the low to now', () => {
    const low = 0.458, now = 0.61
    expect(countValue('heating', now, 0, low)).toBeCloseTo(low, 6)
    expect(countValue('heating', now, 0.5, low)).toBeGreaterThan(low)
    expect(countValue('heating', now, 1, low)).toBeCloseTo(now, 6)
  })
  it('static never changes', () => {
    for (const p of [0, 0.3, 1]) expect(countValue('static', 1.97, p)).toBe(1.97)
    expect(countSpec('static').animate).toBe(false)
  })
  it('tween eases out', () => expect(tween(0, 100, 0.5)).toBeGreaterThan(50))
})
