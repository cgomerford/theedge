import { describe, it, expect } from 'vitest'
import { mlbHistoryOf, mlbResultsOf, NO_REFINE, passes, statusChips, tradedWithin, type PitcherStatus } from './status-math'

const s = (o: Partial<PitcherStatus> = {}): PitcherStatus => ({ id: 1, age: 24, debut: null, draftYear: 2022, orgId: 144, teamId: 234, trades: [], optioned: false, mlbPitches: {}, mlbRuns100: null, mlbRvPitches: 0, ...o })
const AS_OF = '2026-09-27'

describe('reaching MLB', () => {
  it('never: no debut and no MLB pitches', () => expect(mlbHistoryOf(s(), 2026)).toBe('never'))
  it('before: debuted earlier, nothing this season', () => {
    expect(mlbHistoryOf(s({ debut: '2024-05-11' }), 2026)).toBe('before')
    expect(mlbHistoryOf(s({ debut: '2024-05-11', mlbPitches: { 2025: 300 } }), 2026)).toBe('before')
  })
  it('this season, and sent down when he was also optioned', () => {
    expect(mlbHistoryOf(s({ debut: '2025-08-30', mlbPitches: { 2026: 909 } }), 2026)).toBe('this-season')
    expect(mlbHistoryOf(s({ debut: '2025-08-30', mlbPitches: { 2026: 909 }, optioned: true }), 2026)).toBe('sent-down')
  })
})

describe('how he did in MLB', () => {
  const st = (runs: number, n: number) => s({ mlbPitches: { 2026: n }, mlbRuns100: runs, mlbRvPitches: n })
  it('struggled: 0.3+ more runs per 100 than the MLB average, with enough pitches', () => expect(mlbResultsOf(st(1.1, 400), 2026, 0.5)).toBe('struggled'))
  it('pitched well: 0.3+ fewer', () => expect(mlbResultsOf(st(0.1, 400), 2026, 0.5)).toBe('good'))
  it('thin under 150 MLB pitches, never judged', () => expect(mlbResultsOf(st(3, 100), 2026, 0.5)).toBe('thin'))
  it('near the average is neither', () => expect(mlbResultsOf(st(0.6, 400), 2026, 0.5)).toBeNull())
  it('null with no MLB pitches this season', () => expect(mlbResultsOf(s(), 2026, 0.5)).toBeNull())
})

describe('trades', () => {
  it('within 365 days of the date asked', () => {
    expect(tradedWithin(s({ trades: ['2026-07-20'] }), AS_OF, 365)).toBe(true)
    expect(tradedWithin(s({ trades: ['2025-02-01'] }), AS_OF, 365)).toBe(false)
  })
})

describe('passes', () => {
  const st = { ...s({ debut: '2025-08-30', mlbPitches: { 2026: 400 }, mlbRuns100: 1.2, mlbRvPitches: 400, optioned: true, trades: ['2026-07-20'], age: 26, orgId: 133 }) }
  it('no choice means everyone, including a pitcher whose status is unknown', () => expect(passes(undefined, NO_REFINE, 2026, 0.5, AS_OF)).toBe(true))
  it('a status choice is never passed by an unknown status', () => expect(passes(undefined, { ...NO_REFINE, mlb: 'never' }, 2026, 0.5, AS_OF)).toBe(false))
  it('combines every choice with AND', () => {
    const r = { ...NO_REFINE, mlb: 'sent-down' as const, results: 'struggled' as const, moves: 'traded-season' as const, ageMin: 24, ageMax: 28, org: 133 }
    expect(passes(st, r, 2026, 0.5, AS_OF)).toBe(true)
    expect(passes(st, { ...r, org: 144 }, 2026, 0.5, AS_OF)).toBe(false)
    expect(passes(st, { ...r, ageMax: 25 }, 2026, 0.5, AS_OF)).toBe(false)
    expect(passes({ ...st, trades: [] }, r, 2026, 0.5, AS_OF)).toBe(false)
  })
  it('not traded excludes anyone traded in the last 12 months', () => {
    expect(passes(st, { ...NO_REFINE, moves: 'not-traded' }, 2026, 0.5, AS_OF)).toBe(false)
    expect(passes({ ...st, trades: [] }, { ...NO_REFINE, moves: 'not-traded' }, 2026, 0.5, AS_OF)).toBe(true)
  })
  it('an unknown age fails an age limit rather than slipping through', () => expect(passes({ ...st, age: null }, { ...NO_REFINE, ageMin: 20 }, 2026, 0.5, AS_OF)).toBe(false))
})

describe('chips', () => {
  it('say what he has done, with the sample', () => {
    const c = statusChips(s({ debut: '2025-08-30', mlbPitches: { 2026: 909 }, mlbRuns100: 1.2, mlbRvPitches: 909, optioned: true, trades: ['2026-07-20'] }), 2026, 0.5, AS_OF)
    expect(c).toEqual(['Age 24', 'MLB 2026: 909 pitches, +0.70 runs per 100 vs MLB average, since sent down', 'Traded Jul 2026'])
    expect(statusChips(s(), 2026, 0.5, AS_OF)).toEqual(['Age 24', 'Has not pitched in MLB'])
    expect(statusChips(undefined, 2026, 0.5, AS_OF)).toEqual([])
    expect(statusChips(s({ mlbPitches: { 2026: 60 } }), 2026, 0.5, AS_OF)[1]).toMatch(/too few pitches to judge/)
  })
})
