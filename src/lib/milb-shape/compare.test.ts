import { describe, it, expect } from 'vitest'
import { meanDelta, movers, shapeDelta, summarise, type PRow } from './compare'

const p = (id: number, n: number, velo: number, ivb: number, hb: number, slot: number, name = `P${id}`, sw = 100, wh = 20): PRow =>
  ({ pitcher_id: id, pitcher_name: name, team_abbr: 'XXX', n_pitches: n, velo, ivb, hb, slot, n_swings: sw, n_whiffs: wh })

describe('summarise: a level\'s average shape for a pitch', () => {
  it('weights by pitches and reports the spread between pitchers', () => {
    const s = summarise('aaa', 2026, [p(1, 300, 94, 16, 8, 40), p(2, 100, 90, 12, 12, 30)])!
    expect(s.pitches).toBe(400); expect(s.pitchers).toBe(2)
    expect(s.mean.velo).toBeCloseTo((94 * 300 + 90 * 100) / 400, 10)
    expect(s.mean.ivb).toBeCloseTo(15, 10)
    // a population standard deviation weighted by pitches
    const m = s.mean.velo
    expect(s.spread.velo).toBeCloseTo(Math.sqrt(((94 - m) ** 2 * 300 + (90 - m) ** 2 * 100) / 400), 10)
    expect(s.swings).toBe(200); expect(s.whiffs).toBe(40)
  })
  it('numeric strings from the database are read as numbers', () => {
    const s = summarise('mlb', 2026, [{ ...p(1, 300, 94, 16, 8, 40), velo: '94.5' as unknown as number }])!
    expect(s.mean.velo).toBe(94.5)
  })
  it('null with nothing to average', () => { expect(summarise('fsl', 2026, [])).toBeNull() })
})

describe('movers: the same pitcher at two levels', () => {
  const aaa = { level: 'aaa' as const, rows: [p(1, 400, 94, 15, 8, 40, 'Ann'), p(2, 500, 92, 14, 9, 35, 'Bo'), p(3, 200, 93, 14, 9, 35, 'Cy'), p(4, 900, 95, 16, 7, 38, 'Di')] }
  const mlb = { level: 'mlb' as const, rows: [p(1, 350, 95, 16, 8, 41, 'Ann'), p(2, 320, 91, 14, 10, 35, 'Bo'), p(3, 800, 94, 15, 9, 36, 'Cy'), p(9, 900, 96, 17, 6, 39, 'Zed')] }
  it('needs the minimum at both levels, and ignores pitchers at only one', () => {
    const m = movers(aaa, mlb, 300)
    expect(m.map(x => x.pitcherId)).toEqual([1, 2])   // largest smaller-sample first (Ann 350, Bo 320); Cy has 200 at Triple-A; Di and Zed are at one level only
  })
  it('reports high minus low, with both samples', () => {
    const bo = movers(aaa, mlb, 300).find(x => x.pitcherId === 2)!
    expect(bo.delta.velo).toBe(-1)
    expect(bo.low).toMatchObject({ level: 'aaa', pitches: 500 }); expect(bo.high).toMatchObject({ level: 'mlb', pitches: 320 })
    expect(shapeDelta({ velo: 3, ivb: 2, hb: 1, slot: 0 }, { velo: 1, ivb: 1, hb: 1, slot: 5 })).toEqual({ velo: 2, ivb: 1, hb: 0, slot: -5 })
  })
  it('the average change is weighted by the smaller sample, and null for none', () => {
    const d = meanDelta(movers(aaa, mlb, 300))!
    // Bo: -1 over min(500,320)=320; Ann: +1 over min(400,350)=350
    expect(d.velo).toBeCloseTo((-1 * 320 + 1 * 350) / 670, 10); expect(d.n).toBe(2)
    expect(meanDelta([])).toBeNull()
  })
})
