import { describe, expect, it } from 'vitest'
import { normalise, processFindings, rankArsenal, situationLeaks, summarise, type Line } from './diagnose'

const L = (o: Partial<Line>): Line => normalise({ pitch_type: 'FF', p_throws: 'R', stand: 'R', count_state: 'even', tto: 1, pitches: 500, swings: 200, whiffs: 50, rv_n: 500, rv: 0, pa: 100, wd: 100, w: 30, x: 30, zone_n: 250, ooz_n: 200, chase_n: 60, first_n: 100, first_strike: 60, prev_n: 400, repeat_n: 150, ...o })

describe('diagnose: where is it leaking', () => {
  it('ranks pitches by what the gap costs across the whole arsenal', () => {
    const r = rankArsenal([
      { pitchType: 'FF', name: 'Four-seam', pitches: 600, share: 0.6, shapeSaved: 1, ownSaved: 0.9, small: false },
      { pitchType: 'SL', name: 'Slider', pitches: 400, share: 0.4, shapeSaved: 1, ownSaved: -1, small: false },
    ])
    expect(r[0].pitchType).toBe('SL')
    expect(r[0].cost).toBeCloseTo(0.8)
    expect(r[1].cost).toBeCloseTo(0.06)
  })
  it('finds the situation where he does worse than league pitchers with his mix', () => {
    // he is fine against righties and bad against lefties; the league allows 0 runs per 100 everywhere
    const mine = [L({ stand: 'R', rv: 0 }), L({ stand: 'L', rv: 10 })]   // +2.0 runs per 100 against lefties
    const league = [L({ stand: 'R', pitches: 5000, rv_n: 5000, rv: 0 }), L({ stand: 'L', pitches: 5000, rv_n: 5000, rv: 0 })]
    const leaks = situationLeaks(mine, league)
    // slices overlap (the lefties are also part of 'even counts' and 'first time through'), so the batter-side slice is the one to check
    const lefties = leaks.find(l => l.dim === 'stand')!
    expect(lefties.label).toMatch(/left-handed/)
    expect(lefties.cost).toBeCloseTo(1.0)   // 2.0 per 100 on half his pitches
    expect(leaks.find(l => /right-handed/.test(l.label))).toBeUndefined()
  })
  it('skips thin slices', () => {
    expect(situationLeaks([L({ stand: 'L', pitches: 100, rv_n: 100, rv: 5 })], [L({ pitches: 5000, rv_n: 5000, rv: 0 })])).toEqual([])
  })
  it('flags first-pitch strikes and repeats against the league for his mix', () => {
    const mine = [L({ first_n: 200, first_strike: 90, repeat_n: 250 })]            // 45% first-pitch strikes, repeats 62.5%
    const league = [L({ pitches: 9000, first_n: 2000, first_strike: 1300, prev_n: 7000, repeat_n: 2100 })]   // 65% and 30%
    const p = processFindings(mine, league)
    expect(p.map(x => x.id)).toEqual(expect.arrayContaining(['first', 'repeat']))
    expect(p.find(x => x.id === 'first')?.hurts).toBe(true)
    expect(p.find(x => x.id === 'repeat')?.hurts).toBe(true)
  })
  it('says it plainly, and says so when no pitch explains it', () => {
    const arsenal = rankArsenal([{ pitchType: 'SL', name: 'Slider', pitches: 400, share: 0.4, shapeSaved: 1, ownSaved: -1, small: false }])
    expect(summarise(arsenal, [], [], null, () => 'Slider')[0].text).toMatch(/Most of the shortfall is on his slider/)
    const flat = rankArsenal([{ pitchType: 'FF', name: 'Four-seam', pitches: 600, share: 1, shapeSaved: 1, ownSaved: 1, small: false }])
    expect(summarise(flat, [], [], null)[0].tone).toBe('ok')
    expect(summarise(flat, [], [], 0.05).some(s => /defense or luck/.test(s.text))).toBe(true)
  })
})
