import { describe, it, expect } from 'vitest'
import { buildDist, changeBetween, goodness, verdictWord } from './sandbox-math'
import { indexBins, lookup, type ShapeBin } from './model'

const bin = (velo: number, ivb: number, hb: number, o: Partial<ShapeBin> = {}): ShapeBin => ({ veloBin: velo, ivbBin: ivb, hbBin: hb, slotBin: 4, pitches: 600, swings: 300, whiffs: 60, calledStrikes: 80, csw: 140, bbe: 150, xwobaConSum: 52, hardHit: 50, gb: 45, ...o })

describe('goodness and verdicts', () => {
  const bins = [bin(94, 8, 4, { whiffs: 30 }), bin(95, 8, 4, { whiffs: 60 }), bin(96, 8, 4, { whiffs: 120 })]
  const dist = buildDist(bins)
  it('ranks a whiff rate among the league shapes, weighted by pitches', () => {
    expect(goodness(dist, 'whiff', 0.05)).toBe(0)
    expect(goodness(dist, 'whiff', 0.9)).toBeCloseTo(1)
    expect(verdictWord(goodness(dist, 'whiff', 0.2))).toBe('about average')
  })
  it('flips damage on contact so lower is better', () => {
    const d = buildDist([bin(94, 8, 4, { xwobaConSum: 40 }), bin(95, 8, 4, { xwobaConSum: 60 })])
    expect(goodness(d, 'xw', 0.2)).toBeGreaterThan(goodness(d, 'xw', 0.5))
  })
  it('words the thirds', () => {
    expect([verdictWord(0.1), verdictWord(0.5), verdictWord(0.9)]).toEqual(['below average', 'about average', 'above average'])
  })
})

describe('changeBetween', () => {
  const bins = [bin(94, 8, 4, { whiffs: 45, swings: 300 }), bin(98, 8, 4, { whiffs: 120, swings: 300 })]   // 15% at 94 mph, 40% at 98 mph
  const idx = indexBins(bins)
  const at = (velo: number) => lookup(idx, { velo, ivb: 16, hb: 8, slot: 45 })
  it('gives each measure from shape A to shape B and the difference', () => {
    const c = changeBetween(at(94), at(98)).find(x => x.metric === 'whiff')!
    expect(c.from).toBeCloseTo(0.15, 2); expect(c.to).toBeCloseTo(0.4, 2); expect(c.delta).toBeCloseTo(0.25, 2)
  })
  it('has no difference when one of the shapes has too few pitches (never a guess)', () => {
    const c = changeBetween(at(94), at(110)).find(x => x.metric === 'whiff')!
    expect(c.to).toBeNull(); expect(c.delta).toBeNull()
  })
})
