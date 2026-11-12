import { describe, it, expect } from 'vitest'
import { METRICS, METRIC_ORDER, BIN_METRICS, CELL_METRICS, metricPos, metricRgb, scaledDef } from './metrics'
import { heatRgb, HEAT_LO, HEAT_HI } from './heatGrid'

describe('metrics share one colour rule: red is better for the pitcher', () => {
  it('puts the best end of every scale at red and the worst at blue', () => {
    for (const k of METRIC_ORDER) {
      const m = METRICS[k]
      const best = m.betterHigh ? m.hi : m.lo, worst = m.betterHigh ? m.lo : m.hi
      expect(metricPos(m, best)).toBe(1)
      expect(metricPos(m, worst)).toBe(0)
    }
  })
  it('makes a lower wOBA redder and a higher whiff rate redder', () => {
    const redder = (a: number[], b: number[]) => a[0] - a[2] > b[0] - b[2]
    expect(redder(metricRgb(METRICS.woba, 0.26), metricRgb(METRICS.woba, 0.40))).toBe(true)
    expect(redder(metricRgb(METRICS.whiff, 0.25), metricRgb(METRICS.whiff, 0.06))).toBe(true)
  })
  it('keeps whiffs on exactly the scale the maps always used', () => {
    for (const r of [0.05, 0.1, 0.155, 0.2, 0.26]) expect(metricRgb(METRICS.whiff, r)).toEqual(heatRgb(r))
    expect(METRICS.whiff.lo).toBe(HEAT_LO); expect(METRICS.whiff.hi).toBe(HEAT_HI)
  })
  it('covers every measure from exactly one source and has ticks inside its scale', () => {
    for (const k of METRIC_ORDER) { const m = METRICS[k]; expect(m.ticks[0]).toBeGreaterThanOrEqual(m.lo); expect(m.ticks[m.ticks.length - 1]).toBeLessThanOrEqual(m.hi) }
    expect([...BIN_METRICS, ...CELL_METRICS].sort()).toEqual([...METRIC_ORDER].sort())
  })
})

describe('scaledDef', () => {
  it('stretches the scale over the range a pitch actually covers', () => {
    // a sweeper-like map: every box is between 28% and 46% whiffs, far above the fixed 5%-26% scale
    const pairs: [number, number][] = Array.from({ length: 200 }, (_, i) => [0.28 + (i / 199) * 0.18, 100])
    const d = scaledDef(METRICS.whiff, pairs)
    expect(d.lo).toBeGreaterThan(0.25)
    expect(d.hi).toBeLessThanOrEqual(0.5)
    expect(d.ticks).toHaveLength(5)
    // under the fixed scale nearly everything is the reddest end; under the stretched one the values spread out
    const spreadFixed = new Set(pairs.map(([v]) => Math.round(metricPos(METRICS.whiff, v) * 10))).size
    const spreadScaled = new Set(pairs.map(([v]) => Math.round(metricPos(d, v) * 10))).size
    expect(spreadScaled).toBeGreaterThan(spreadFixed)
  })
  it('leaves the fixed scale alone when there are too few values or they barely vary', () => {
    expect(scaledDef(METRICS.whiff, [[0.2, 100]])).toBe(METRICS.whiff)
    expect(scaledDef(METRICS.whiff, Array.from({ length: 100 }, () => [0.2, 50] as [number, number]))).toBe(METRICS.whiff)
  })
})
