import { describe, it, expect } from 'vitest'
import { HEAT_COLORS, HEAT_GRADIENT_CSS, HEAT_HI, HEAT_LO, HEAT_TICKS, heatPos, heatRgb } from './heatGrid'

const hex = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }

describe('heat colour scale (a continuous gradient)', () => {
  it('is the first colour at the low end and the last at the high end, and holds those colours beyond', () => {
    expect(heatRgb(HEAT_LO)).toEqual(hex(HEAT_COLORS[0]))
    expect(heatRgb(HEAT_HI)).toEqual(hex(HEAT_COLORS[HEAT_COLORS.length - 1]))
    expect(heatRgb(0)).toEqual(hex(HEAT_COLORS[0]))
    expect(heatRgb(0.9)).toEqual(hex(HEAT_COLORS[HEAT_COLORS.length - 1]))
  })
  it('is the pale neutral in the middle, about 15% of swings missed', () => {
    expect(heatRgb((HEAT_LO + HEAT_HI) / 2)).toEqual(hex('#F7F7F7'))
  })
  it('moves smoothly from blue to red: each rate gets a colour between its neighbours, never a jump', () => {
    let prev = heatRgb(HEAT_LO)
    for (let r = HEAT_LO + 0.001; r <= HEAT_HI; r += 0.001) {
      const c = heatRgb(r)
      expect(Math.max(Math.abs(c[0] - prev[0]), Math.abs(c[1] - prev[1]), Math.abs(c[2] - prev[2]))).toBeLessThan(15)
      prev = c
    }
  })
  it('gets redder and less blue as the rate rises', () => {
    const lo = heatRgb(0.07), mid = heatRgb(0.15), hi = heatRgb(0.24)
    expect(lo[2]).toBeGreaterThan(lo[0])       // blue end: more blue than red
    expect(hi[0]).toBeGreaterThan(hi[2])       // red end: more red than blue
    expect(mid[0]).toBeGreaterThan(200); expect(mid[2]).toBeGreaterThan(200)   // pale in the middle
  })
  it('turns red early: already warm at 20%, per the brief', () => {
    const c = heatRgb(0.20)
    expect(c[0]).toBeGreaterThan(c[2])
  })
  it('puts the legend marks on the gradient the map uses', () => {
    expect(HEAT_TICKS[0] / 100).toBe(HEAT_LO)
    expect(HEAT_TICKS[HEAT_TICKS.length - 1] / 100).toBe(HEAT_HI)
    expect(heatPos(HEAT_LO)).toBe(0); expect(heatPos(HEAT_HI)).toBe(1)
    expect(HEAT_GRADIENT_CSS).toContain(HEAT_COLORS[0]); expect(HEAT_GRADIENT_CSS).toContain(HEAT_COLORS[8])
  })
})
