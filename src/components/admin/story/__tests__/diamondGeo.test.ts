import { describe, expect, it } from 'vitest'
import { dist, FIRST, HOME, MOUND, SECOND, SPOTS, THIRD, toPx, VIEW } from '../diamondGeo'

describe('diamondGeo', () => {
  it('toPx scales both axes identically (no stretch)', () => {
    for (const box of [400, 950]) {
      const a = toPx({ x: 250, y: 500 }, box), b = toPx({ x: 500, y: 1000 }, box)
      expect(b.x / a.x).toBeCloseTo(b.y / a.y, 9)
      expect(toPx({ x: VIEW, y: VIEW }, box)).toEqual({ x: box, y: box })
    }
  })
  it('infield sides are equal (±0.5) = 300 units = 90 ft', () => {
    const sides = [dist(HOME, FIRST), dist(FIRST, SECOND), dist(SECOND, THIRD), dist(THIRD, HOME)]
    for (const s of sides) expect(Math.abs(s - 300)).toBeLessThanOrEqual(0.5)
  })
  it('90° at home plate', () => {
    const v1 = { x: FIRST.x - HOME.x, y: FIRST.y - HOME.y }, v2 = { x: THIRD.x - HOME.x, y: THIRD.y - HOME.y }
    expect(v1.x * v2.x + v1.y * v2.y).toBeCloseTo(0, 6)
  })
  it('every fielder spot is inside the view', () => {
    for (const p of Object.values(SPOTS)) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(VIEW); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(VIEW) }
    expect(Object.keys(SPOTS).sort()).toEqual(['1B', '2B', '3B', 'C', 'CF', 'LF', 'RF', 'SS'])
  })
  it('mound centre is on the home→2B line, 60.5 ft from home', () => {
    const dx = SECOND.x - HOME.x, dy = SECOND.y - HOME.y
    const cross = (MOUND.x - HOME.x) * dy - (MOUND.y - HOME.y) * dx
    expect(Math.abs(cross)).toBeLessThan(1e-6)
    expect(dist(HOME, MOUND)).toBeCloseTo(60.5 * (300 / 90), 0)
    expect(MOUND.r).toBe(30)
  })
})
