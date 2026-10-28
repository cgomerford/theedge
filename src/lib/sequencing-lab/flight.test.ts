import { describe, it, expect } from 'vitest'
import { buildFlight } from './flight'

const base = { plateX: 0.1, plateZ: 2.6, relX: -1.8, relZ: 5.9, ext: 6.5, speed: 96, spin: 2400, hb: 8, ivb: 16, hand: 'R' as const }

describe('buildFlight', () => {
  it('starts at the release point and ends at the measured plate crossing', () => {
    const p = buildFlight('FF', 'Four-seam', base, 100)!
    expect(p.pts[0].x).toBeCloseTo(-1.8); expect(p.pts[0].z).toBeCloseTo(5.9); expect(p.pts[0].y).toBeCloseTo(54)
    expect(p.pts[60].x).toBeCloseTo(0.1); expect(p.pts[60].z).toBeCloseTo(2.6); expect(p.pts[60].y).toBeCloseTo(17 / 12)
  })
  it('a faster pitch takes less time than a slower one', () => {
    expect(buildFlight('FF', 'a', { ...base, speed: 100 }, 1)!.T).toBeLessThan(buildFlight('CU', 'b', { ...base, speed: 78 }, 1)!.T)
  })
  it('returns null when a number is missing', () => {
    expect(buildFlight('FF', 'a', { ...base, ext: NaN }, 1)).toBeNull()
  })
})
