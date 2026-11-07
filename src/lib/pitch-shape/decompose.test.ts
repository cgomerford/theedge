import { describe, expect, it } from 'vitest'
import { biggestZoneShift, decompose, verdictOf, type WindowLine } from './decompose'

const W = (o: Partial<WindowLine>): WindowLine => ({ stand: 'R', count_state: 'even', zone: 5, pitches: 1000, swings: 400, whiffs: 80, rv_n: 1000, rv: 0, pa: 200, wd: 200, w: 60, x: 60, velo_n: 1000, velo_sum: 94000, ext_n: 1000, ext_sum: 6300, ...o })

describe('decompose: why are the results not there', () => {
  // league: righties cost 0 runs per 100, lefties cost +2; he throws it mostly to lefties
  const league = [W({ stand: 'R', pitches: 5000, rv_n: 5000, rv: 0 }), W({ stand: 'L', pitches: 5000, rv_n: 5000, rv: 100 })]   // L: +2.0 per 100
  it('prices his platoon mix against the league window', () => {
    const his = [W({ stand: 'R', pitches: 200, rv_n: 200, rv: 0 }), W({ stand: 'L', pitches: 800, rv_n: 800, rv: 16 })]       // 80% lefties
    const why = decompose(his, league)!
    const platoon = why.factors.find(f => f.id === 'platoon')!
    // league overall = +1.0; his mix priced = 0.2*0 + 0.8*2.0 = 1.6; effect = +0.6
    expect(platoon.effect).toBeCloseTo(0.6)
    expect(verdictOf(platoon.effect)).toBe('explains')
  })
  it('prices location: more pitches down the middle where the league did worse', () => {
    const lg = [W({ zone: 5, pitches: 2000, rv_n: 2000, rv: 80 }), W({ zone: 3, pitches: 8000, rv_n: 8000, rv: -80 })]         // heart +4.0, upper right -1.0 per 100
    const his = [W({ zone: 5, pitches: 500, rv_n: 500, rv: 10 }), W({ zone: 3, pitches: 500, rv_n: 500, rv: 0 })]               // 50% heart
    const loc = decompose(his, lg)!.factors.find(f => f.id === 'location')!
    // league overall = 0 ; his mix = 0.5*4 + 0.5*-1 = +1.5
    expect(loc.effect).toBeCloseTo(1.5)
    expect(biggestZoneShift(loc)?.key).toBe('5')
  })
  it('a thin league slice is priced at the league average, so it neither helps nor hurts', () => {
    const lg = [W({ zone: 5, pitches: 5000, rv_n: 5000, rv: 0 }), W({ zone: 1, pitches: 20, rv_n: 20, rv: 30 })]
    const his = [W({ zone: 1, pitches: 1000, rv_n: 1000, rv: 0 })]
    expect(decompose(his, lg)!.factors.find(f => f.id === 'location')!.effect).toBeCloseTo(0, 1)
  })
  it('reports the gap, speed and extension differences', () => {
    const his = [W({ rv_n: 1000, rv: 30, velo_sum: 92000, ext_sum: 6000 })]
    const why = decompose(his, [W({ rv_n: 1000, rv: 0 })])!
    expect(why.gap).toBeCloseTo(3.0)
    expect(why.velocity.diff).toBeCloseTo(-2.0)
    expect(why.extension.diff).toBeCloseTo(-0.3)
  })
  it('returns null with nothing to compare', () => {
    expect(decompose([], [W({})])).toBeNull()
  })
})
