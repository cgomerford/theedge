import { describe, it, expect } from 'vitest'
import { add, countsOf, lineOf, zero } from './team-batting'

describe('team batting lines', () => {
  const game = (o: Record<string, number>) => ({ plateAppearances: 40, atBats: 35, hits: 10, doubles: 2, triples: 0, homeRuns: 1, baseOnBalls: 4, hitByPitch: 1, sacFlies: 0, strikeOuts: 8, runs: 5, rbi: 5, stolenBases: 1, totalBases: 15, ...o })
  it('sums games before taking rates', () => {
    const c = add(countsOf(game({}), true), countsOf(game({ hits: 4, totalBases: 6, runs: 1 })))
    const l = lineOf(c)!
    expect(l.g).toBe(2); expect(l.w).toBe(1); expect(l.r).toBe(6)
    expect(l.avg).toBeCloseTo(14 / 70, 5)
    expect(l.slg).toBeCloseTo(21 / 70, 5)
    expect(l.obp).toBeCloseTo((14 + 8 + 2) / (70 + 8 + 2), 5)
    expect(l.ops).toBeCloseTo(l.obp! + l.slg!, 5)
    expect(l.kPct).toBeCloseTo(16 / 80, 5)
  })
  it('has no line without plate appearances', () => { expect(lineOf(zero())).toBeNull() })
})
