import { describe, it, expect } from 'vitest'
import type { ShapeBin } from './model'
import { binSummary, centreOf, filteredHeat, NO_FILTER, passes, rateAt, standing } from './filtered-heat'

const bin = (veloBin: number, ivbBin: number, hbBin: number, slotBin: number, pitches: number, swings: number, whiffs: number): ShapeBin => ({
  veloBin, ivbBin, hbBin, slotBin, pitches, swings, whiffs, calledStrikes: 0, csw: 0, bbe: 0, xwobaConSum: 0, hardHit: 0, gb: 0,
})

// a small league: fast pitches (95 mph) miss 30% of swings, slow ones (88 mph) miss 10%, all at the same shape (ride 16 in, run 8 in)
const bins = [bin(95, 8, 4, 5, 900, 500, 150), bin(88, 8, 4, 5, 900, 500, 50), bin(95, 8, 4, 2, 400, 200, 60)]

describe('filter', () => {
  it('keeps only the speeds and arm angles asked for', () => {
    expect(bins.filter(b => passes(b, { ...NO_FILTER, vMin: 94, vMax: 99 })).length).toBe(2)
    expect(bins.filter(b => passes(b, { ...NO_FILTER, aMin: 50, aMax: 60 })).length).toBe(2)   // slot band 5 = 50-60 degrees
    expect(bins.filter(b => passes(b, { ...NO_FILTER, aMin: 20, aMax: 30 })).length).toBe(1)
  })
})

describe('rate at a shape', () => {
  it('is the whiff rate of the groups around it, and changes with the speed filter', () => {
    const all = rateAt(bins, NO_FILTER, 1, 8, 16)
    const fast = rateAt(bins, { ...NO_FILTER, vMin: 94, vMax: 99 }, 1, 8, 16)
    const slow = rateAt(bins, { ...NO_FILTER, vMin: 80, vMax: 90 }, 1, 8, 16)
    expect(all.rate).toBeCloseTo((150 + 50 + 60) / 1200, 5)
    expect(fast.rate).toBeCloseTo((150 + 60) / 700, 5)
    expect(slow.rate).toBeCloseTo(0.1, 5)
  })
  it('is blank, never estimated, under 40 swings', () => {
    expect(rateAt([bin(90, 8, 4, 5, 50, 30, 10)], NO_FILTER, 1, 8, 16).rate).toBeNull()
    expect(rateAt(bins, NO_FILTER, 1, 40, 40).rate).toBeNull()
  })
})

describe('filteredHeat', () => {
  it('is centred on the shape it is given and counts what passes the filter', () => {
    const h = filteredHeat(bins, { ...NO_FILTER, vMin: 94, vMax: 99 }, 1, centreOf(bins))
    expect(h.n).toBe(97)
    expect(h.total).toEqual({ pitches: 1300, swings: 700, whiffs: 210 })
    expect(h.rates.filter(r => r != null).length).toBeGreaterThan(0)
    expect(h.rates.length).toBe(97 * 97)
  })
})

describe('other measures from the same bins', () => {
  // the 95 mph pitches: 400 balls in play, 200 hard hit, 80 ground balls, 190 called strikes + whiffs; the 88 mph ones: 240 balls in play, 48 hard hit, 120 ground balls
  const rich: ShapeBin[] = [
    { ...bin(95, 8, 4, 5, 900, 500, 150), bbe: 400, hardHit: 200, gb: 80, csw: 190, xwobaConSum: 160 },
    { ...bin(88, 8, 4, 5, 900, 500, 50), bbe: 240, hardHit: 48, gb: 120, csw: 90, xwobaConSum: 60 },
  ]
  it('reads hard-hit, ground-ball, called strikes plus whiffs and xwOBA on contact, per their own denominators', () => {
    expect(rateAt(rich, NO_FILTER, 1, 8, 16, 'hardhit').rate).toBeCloseTo(248 / 640, 5)
    expect(rateAt(rich, NO_FILTER, 1, 8, 16, 'gb').rate).toBeCloseTo(200 / 640, 5)
    expect(rateAt(rich, NO_FILTER, 1, 8, 16, 'csw').rate).toBeCloseTo(280 / 1800, 5)
    expect(rateAt(rich, NO_FILTER, 1, 8, 16, 'xwobacon').rate).toBeCloseTo(220 / 640, 5)
  })
  it('honours the speed filter for each of them', () => {
    expect(rateAt(rich, { ...NO_FILTER, vMin: 94, vMax: 99 }, 1, 8, 16, 'hardhit').rate).toBeCloseTo(0.5, 5)
    expect(rateAt(rich, { ...NO_FILTER, vMax: 90 }, 1, 8, 16, 'hardhit').rate).toBeCloseTo(0.2, 5)
  })
  it('is blank when a measure has too few of its own count (balls in play) even if there are plenty of swings', () => {
    const few: ShapeBin[] = [{ ...bin(95, 8, 4, 5, 900, 500, 150), bbe: 10, hardHit: 5 }]
    expect(rateAt(few, NO_FILTER, 1, 8, 16, 'whiff').rate).not.toBeNull()
    expect(rateAt(few, NO_FILTER, 1, 8, 16, 'hardhit').rate).toBeNull()
  })
  it('gives the lattice and the league value for the chosen measure', () => {
    const h = filteredHeat(rich, NO_FILTER, 1, centreOf(rich), 'hardhit')
    expect(h.metric).toBe('hardhit'); expect(h.counts.length).toBe(97 * 97)
    expect(h.leagueValue).toBeCloseTo(248 / 640, 5)
  })
})

describe('summary', () => {
  it('finds the speed range, the histogram and whether arm angle is present', () => {
    const s = binSummary(bins)
    expect(s.vLo).toBe(88); expect(s.vHi).toBe(95); expect(s.veloHist.length).toBe(8)
    expect(s.hasArm).toBe(true)
    expect(binSummary(bins.map(b => ({ ...b, slotBin: 0 }))).hasArm).toBe(false)
  })
})

describe('standing against the league rate', () => {
  it('is below, at or above by how far his own sample is from the league rate', () => {
    expect(standing({ whiffs: 100, swings: 500 }, 0.30).standing).toBe('below')   // 20% against 30%
    expect(standing({ whiffs: 150, swings: 500 }, 0.30).standing).toBe('at')
    expect(standing({ whiffs: 200, swings: 500 }, 0.30).standing).toBe('above')   // 40% against 30%
  })
  it('judges a small sample by its own wider margin: a 5-point gap is "at" over 40 swings but "below" over 600', () => {
    expect(standing({ whiffs: 8, swings: 40 }, 0.25).standing).toBe('at')       // 20% against 25%, one standard error is about 6.8 points
    expect(standing({ whiffs: 120, swings: 600 }, 0.25).standing).toBe('below')  // the same 20%, one standard error is about 1.8 points
  })
})
