import { describe, it, expect } from 'vitest'
import { combineSplits, type Split } from './workload'

const line = (ip: string, bf: number, k: number, er: number, team?: string): Split => ({ ...(team ? { team: { id: 1, name: team } } : {}), stat: { inningsPitched: ip, battersFaced: bf, strikeOuts: k, earnedRuns: er } })

describe('combineSplits', () => {
  it('uses the combined line for a traded pitcher instead of adding every line (the 143-inning bug)', () => {
    const w = combineSplits([line('71.2', 305, 55, 30), line('11.2', 50, 9, 6, 'SEA'), line('60.0', 255, 46, 24, 'TB')])
    expect(w!.ip).toBeCloseTo(71.667, 2); expect(w!.bf).toBe(305); expect(w!.era).toBeCloseTo(3.77, 2)
  })
  it('adds the club lines when there is no combined line', () => {
    const w = combineSplits([line('10.0', 40, 8, 4, 'SEA'), line('20.0', 80, 17, 8, 'TB')])
    expect(w!.ip).toBeCloseTo(30, 5); expect(w!.k).toBe(25)
  })
  it('returns null with nothing to use', () => {
    expect(combineSplits([])).toBeNull()
    expect(combineSplits([line('0.0', 0, 0, 0)])).toBeNull()
  })
})
