import { describe, expect, it } from 'vitest'
import { cellOf, gridOf, inZone, isBarrel, leagueGrid, profileOf, shareGrid, total, type Ball } from './math'

const b = (ev: number, la: number, result = 0, xw = -1): Ball => [Math.round(ev * 10), la, 1, result, xw]

describe('cellOf', () => {
  it('bins by 4 mph from 40 and 5 degrees from -60, clamping the edges', () => {
    expect(cellOf(40, -60)).toEqual({ e: 0, a: 0 })
    expect(cellOf(99.9, 12)).toEqual({ e: 14, a: 14 })
    expect(cellOf(130, 90)).toEqual({ e: 18, a: 25 })
    expect(cellOf(10, -90)).toEqual({ e: 0, a: 0 })
  })
})

describe('gridOf, shareGrid, leagueGrid', () => {
  it('counts balls, hits and xwOBA per cell and the shares add to 1', () => {
    const balls = [b(100, 20, 1, 600), b(101, 21, 0, 200), b(60, -10, 0)]
    const g = gridOf(balls)
    expect(total(g)).toBe(3)
    const { e, a } = cellOf(100, 20)
    expect(g[e][a]).toEqual({ n: 2, hits: 1, xSum: 0.8, xN: 2 })
    expect(shareGrid(g).flat().reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9)
  })
  it('an empty hitter gives a zero grid, not NaN', () => { expect(shareGrid(gridOf([])).flat().every(x => x === 0)).toBe(true) })
  it('reads stored league rows', () => { expect(leagueGrid([[2, 3, 50, 20, 15, 48]])[2][3]).toEqual({ n: 50, hits: 20, xSum: 15, xN: 48 }) })
})

describe('isBarrel', () => {
  it('follows the published edges: 98 mph needs 26 to 30 degrees, wider as speed rises, 116+ is 8 to 50', () => {
    expect(isBarrel(98, 28)).toBe(true); expect(isBarrel(98, 25)).toBe(false); expect(isBarrel(98, 31)).toBe(false)
    expect(isBarrel(100, 24)).toBe(true); expect(isBarrel(100, 23.5)).toBe(false); expect(isBarrel(100, 32)).toBe(true); expect(isBarrel(100, 33)).toBe(false)
    expect(isBarrel(116, 8)).toBe(true); expect(isBarrel(120, 50)).toBe(true); expect(isBarrel(120, 7)).toBe(false)
    expect(isBarrel(97.9, 28)).toBe(false)
  })
})

describe('profileOf', () => {
  it('computes the rates and averages', () => {
    const p = profileOf([b(100, 28, 4, 1500), b(90, 5, 1, 400), b(96, 15, 2, 800), b(70, 60, 0, 50)])
    expect(p.n).toBe(4)
    expect(p.avgEv).toBeCloseTo(89, 6); expect(p.maxEv).toBe(100)
    expect(p.hardHit).toBe(0.5); expect(p.barrel).toBe(0.25); expect(p.sweetSpot).toBe(0.5)
    expect(p.hitRate).toBe(0.75); expect(p.xwoba).toBeCloseTo(0.6875, 6)
    expect([p.gb, p.ld, p.fb, p.pu]).toEqual([0.25, 0.25, 0.25, 0.25])
  })
  it('no balls: every figure is null and nothing is invented', () => {
    const p = profileOf([])
    expect(p.n).toBe(0); expect(p.avgEv).toBeNull(); expect(p.xwoba).toBeNull(); expect(p.hardHit).toBeNull()
  })
  it('balls without an xwOBA do not pull the average down', () => {
    const p = profileOf([b(90, 10, 0, 400), b(90, 10, 0, -1)])
    expect(p.xwoba).toBeCloseTo(0.4, 9); expect(p.xwobaN).toBe(1)
  })
})

describe('inZone', () => {
  it('is inclusive on both edges', () => {
    const z = { evMin: 95, evMax: 105, laMin: 10, laMax: 30 }
    expect(inZone(b(95, 10), z)).toBe(true); expect(inZone(b(105, 30), z)).toBe(true); expect(inZone(b(94.9, 20), z)).toBe(false); expect(inZone(b(100, 31), z)).toBe(false)
  })
})
