import { describe, expect, it } from 'vitest'
import { STRIDE, makeResultsGrid, measuresOf, percentile, resultsVsShape, runsSaved, windowSums, windowSumsRect, zeroSums } from './results-math'

// one cell: hb10, ivb10, pitches, swings, whiffs, rv_n, rv*1000, pa, ab, hits, tb, wd, w*1000, x*1000
const cell = (hb: number, iv: number, o: Partial<Record<string, number>> = {}) => {
  const d = { pitches: 400, swings: 200, whiffs: 50, rvN: 400, rv: 4000, pa: 120, ab: 110, hits: 30, tb: 50, wd: 120, w: 36000, x: 38000, ...o }
  return [hb, iv, d.pitches, d.swings, d.whiffs, d.rvN, d.rv, d.pa, d.ab, d.hits, d.tb, d.wd, d.w, d.x]
}
const payload = (cells: number[]) => ({ seasons: [{ season: 2026, cells }], latest: 2026, hb0: 0, ivb0: 0, half: 2, margin: 1 })

describe('results grid', () => {
  it('sums a window and unscales run value, wOBA and xwOBA', () => {
    const g = makeResultsGrid(payload([...cell(0, 0), ...cell(30, 30)]), 'latest')
    expect(cell(0, 0).length).toBe(STRIDE)
    const s = windowSums(g, 0, 0, 5)
    expect(s.pitches).toBe(400)
    expect(s.rv).toBeCloseTo(4)
    expect(s.w).toBeCloseTo(36)
  })
  it('sizes a box by its own width and height', () => {
    const g = makeResultsGrid(payload([...cell(0, 0), ...cell(20, 0)]), 'latest')
    expect(windowSumsRect(g, 0, 0, 5, 5).pitches).toBe(400)
    expect(windowSumsRect(g, 0, 0, 25, 5).pitches).toBe(800)
    expect(windowSumsRect(g, 0, 0, 25, 5)).toEqual(windowSumsRect(g, 0, 0, 25, 5))
  })
  it('turns sums into measures and gates thin windows', () => {
    const g = makeResultsGrid(payload(cell(0, 0)), 'latest')
    const m = measuresOf(windowSums(g, 0, 0, 5))
    expect(m.runs100).toBeCloseTo(1)
    expect(m.avg).toBeCloseTo(30 / 110)
    expect(m.slg).toBeCloseTo(50 / 110)
    expect(m.woba).toBeCloseTo(0.3)
    expect(m.whiff).toBeCloseTo(0.25)
    const thin = measuresOf({ ...zeroSums(), rvN: 50, rv: 10, ab: 20, hits: 5, tb: 8, wd: 30, w: 9, x: 9, swings: 10, whiffs: 3 })
    expect([thin.runs100, thin.avg, thin.woba, thin.whiff]).toEqual([null, null, null, null])
  })
})

describe('shape score helpers', () => {
  it('runs saved is league minus window, null when either is gated', () => {
    const a = measuresOf({ ...zeroSums(), rvN: 1000, rv: 5 }), b = measuresOf({ ...zeroSums(), rvN: 1000, rv: -10 })
    expect(runsSaved(b, a)).toBeCloseTo(1.5)
    expect(runsSaved(measuresOf(zeroSums()), a)).toBeNull()
  })
  it('percentile is the share at or below, kept between 1 and 99', () => {
    const v = [1, 2, 3, 4]
    expect(percentile(v, 2)).toBe(50)
    expect(percentile(v, 99)).toBe(99)
    expect(percentile(v, -5)).toBe(1)
  })
  it('compares his own results with his shape', () => {
    expect(resultsVsShape(-0.2, 1.1)).toEqual({ gap: -1.3, verdict: 'behind' })
    expect(resultsVsShape(1.2, 1.1)?.verdict).toBe('level')
    expect(resultsVsShape(null, 1)).toBeNull()
  })
})
