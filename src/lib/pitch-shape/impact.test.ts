import { describe, it, expect } from 'vitest'
import { LARGE_EFFECT, translateChange } from './impact'

describe('translateChange', () => {
  // Casey Legumina's four-seam, +2 in of ride: +2.5 points of whiffs per swing, -.021 of xwOBAcon, 270 swings, 86 balls in play, 71.7 IP, 305 BF
  const base = { whiffDelta: 0.025, xwobaDelta: -0.021, swings: 270, bbe: 86, ip: 71.667, bf: 305 }
  it('reproduces the worked example in docs/pitch-change-impact.md', () => {
    const r = translateChange(base)
    expect(r.extraWhiffs).toBeCloseTo(6.75, 2)
    expect(r.extraK).toBeCloseTo(3.58, 1)
    expect(r.fipDelta).toBeCloseTo(-0.0999, 2)
    expect(r.contactPerNine).toBeCloseTo(-0.18, 2)
    expect(r.totalPerNine).toBeCloseTo(-0.28, 2)
    expect(r.kPctPts).toBeCloseTo(1.17, 1)
    expect(Math.abs(r.totalPerNine!)).toBeLessThan(LARGE_EFFECT)
  })
  it('leaves out a part whose sample is too small instead of guessing', () => {
    const r = translateChange({ ...base, swings: 60 })
    expect(r.extraK).toBeNull(); expect(r.fipDelta).toBeNull(); expect(r.contactPerNine).not.toBeNull()
    expect(r.totalPerNine).toBeCloseTo(-0.18, 2)
    expect(r.thin.join(' ')).toMatch(/swings/)
    const r2 = translateChange({ ...base, bbe: 10 })
    expect(r2.contactPerNine).toBeNull(); expect(r2.fipDelta).not.toBeNull()
  })
  it('converts nothing to per-nine figures without his innings', () => {
    const r = translateChange({ ...base, ip: null, bf: null })
    expect(r.extraK).not.toBeNull(); expect(r.fipDelta).toBeNull(); expect(r.totalPerNine).toBeNull(); expect(r.kPctPts).toBeNull()
  })
  it('a worse shape shows a positive number (more runs)', () => {
    const r = translateChange({ ...base, whiffDelta: -0.03, xwobaDelta: 0.02 })
    expect(r.totalPerNine!).toBeGreaterThan(0)
  })
  it('returns nulls when the league has no comparison', () => {
    const r = translateChange({ ...base, whiffDelta: null, xwobaDelta: null })
    expect(r.totalPerNine).toBeNull()
  })
})
