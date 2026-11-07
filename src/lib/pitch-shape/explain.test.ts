import { describe, expect, it } from 'vitest'
import { explainShape, reasons } from './explain'
import type { ShapeBin } from './model'

const bin = (velo: number, ivb: number, hb: number, slot: number, o: Partial<ShapeBin> = {}): ShapeBin => ({ veloBin: velo, ivbBin: ivb, hbBin: hb, slotBin: slot, pitches: 1000, swings: 500, whiffs: 100, calledStrikes: 0, csw: 0, bbe: 300, xwobaConSum: 100, hardHit: 0, gb: 0, ...o })

describe('explain a shape by speed and arm angle', () => {
  // movement bin (8, 4) at all speeds: fast pitches miss more than slow ones
  const bins = [bin(95, 8, 4, 4, { whiffs: 130 }), bin(94, 8, 4, 4, { whiffs: 120 }), bin(90, 8, 4, 4, { whiffs: 60 }), bin(89, 8, 4, 4, { whiffs: 60 }), bin(95, 30, 30, 4)]
  const shape = { velo: 90, ivb: 16, hb: 8, slot: 45 }
  it('finds the typical speed and what his speed band has produced', () => {
    const e = explainShape(bins, shape)!
    expect(e.typicalVelo).toBeCloseTo(92.0, 0)
    expect(e.veloDiff).toBeLessThan(-1.5)
    expect(e.atSpeed.whiff).toBeCloseTo(60 / 500 * 1, 1)   // 120 whiffs over 1000 swings at 89 to 91 mph
    expect(e.whiffEffect.speed!).toBeLessThan(-0.03)
  })
  it('says it in a sentence when the gap is real, and stays quiet otherwise', () => {
    const e = explainShape(bins, shape)!
    const r = reasons(e, shape, 'four-seam')
    expect(r.find(x => x.factor === 'speed')?.lean).toBe(-1)
    expect(r.find(x => x.factor === 'speed')?.text).toMatch(/below the 92\.0 typical/)
    const typical = { ...shape, velo: 92 }
    expect(reasons(explainShape(bins, typical)!, typical, 'four-seam').some(x => x.factor === 'speed')).toBe(false)
  })
  it('returns null when no league pitch moves like his', () => {
    expect(explainShape(bins, { velo: 90, ivb: 100, hb: 100, slot: 45 })).toBeNull()
  })
})
