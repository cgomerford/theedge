import { describe, expect, it } from 'vitest'
import { ESTABLISHED_PITCHES, findPitchers, isEstablished, passesNumbers, shuffled, type FinderRow } from './finder'

const row = (o: Partial<FinderRow>): FinderRow => ({ pitcherId: 1, name: 'A', teamAbbr: 'X', pitches: 500, score: 50, gap: 0, verdict: 'level', overall: { pitches: 2000, runsPct: 50 }, ...o })

describe('find me a pitcher', () => {
  it('counts a small sample for less when ordering', () => {
    const r = [row({ pitcherId: 1, score: 90, verdict: 'behind', gap: -4, ownRaw: { n: { rv: 110 } } }), row({ pitcherId: 2, score: 90, verdict: 'behind', gap: -2.5, ownRaw: { n: { rv: 900 } } })]
    expect(findPitchers(r, 'hidden').map(x => x.pitcherId)).toEqual([2, 1])
  })
  it('hidden: strong shape and behind, most behind first', () => {
    const r = [row({ pitcherId: 1, score: 90, gap: -0.6, verdict: 'behind' }), row({ pitcherId: 2, score: 80, gap: -2, verdict: 'behind' }), row({ pitcherId: 3, score: 60, gap: -3, verdict: 'behind' }), row({ pitcherId: 4, score: 95, gap: 1, verdict: 'ahead' })]
    expect(findPitchers(r, 'hidden').map(x => x.pitcherId)).toEqual([2, 1])
  })
  it('quiet: strong shape with a small role or a middling line, not already ahead', () => {
    const r = [row({ pitcherId: 1, score: 90, overall: { pitches: 700, runsPct: 90 } }), row({ pitcherId: 2, score: 85, overall: { pitches: 3000, runsPct: 40 } }), row({ pitcherId: 3, score: 99, overall: { pitches: 3000, runsPct: 95 } }), row({ pitcherId: 4, score: 99, verdict: 'ahead', overall: { pitches: 500, runsPct: 20 } })]
    expect(findPitchers(r, 'quiet').map(x => x.pitcherId)).toEqual([1, 2])
  })
  it('unexplained: weak shape, ahead, good overall line, biggest gap first', () => {
    const r = [row({ pitcherId: 1, score: 10, verdict: 'ahead', gap: 1, overall: { pitches: 2000, runsPct: 80 } }), row({ pitcherId: 2, score: 20, verdict: 'ahead', gap: 3, overall: { pitches: 2000, runsPct: 70 } }), row({ pitcherId: 3, score: 20, verdict: 'ahead', gap: 5, overall: { pitches: 2000, runsPct: 30 } })]
    expect(findPitchers(r, 'unexplained').map(x => x.pitcherId)).toEqual([2, 1])
  })
  it('skips pitchers with no Shape Score and honours the limit', () => {
    const r = Array.from({ length: 10 }, (_, i) => row({ pitcherId: i, score: 90, verdict: 'behind', gap: -i }))
    expect(findPitchers([...r, row({ pitcherId: 99, score: null, verdict: 'behind', gap: -9 })], 'hidden', 4)).toHaveLength(4)
  })
  it('hides household names by default: All-Stars, major winners and full-time veterans', () => {
    const base = { score: 90, verdict: 'behind' as const, gap: -1 }
    const r = [
      row({ ...base, pitcherId: 1, profile: { allStars: 2, major: false, debutYear: 2015 } }),
      row({ ...base, pitcherId: 2, profile: { allStars: 0, major: true, debutYear: 2018 } }),
      row({ ...base, pitcherId: 3, overall: { pitches: 2000, runsPct: 50, careerPitches: ESTABLISHED_PITCHES } }),
      row({ ...base, pitcherId: 4, profile: { allStars: 0, major: false, debutYear: 2024 }, overall: { pitches: 900, runsPct: 50, careerPitches: 1500 } }),
    ]
    expect(findPitchers(r, 'hidden').map(x => x.pitcherId)).toEqual([4])
    expect(findPitchers(r, 'hidden', { includeKnown: true })).toHaveLength(4)
    expect(isEstablished(row({ profile: null, overall: { pitches: 1, runsPct: null, careerPitches: 100 } }))).toBe(false)
  })
  it('keeps small samples unless asked not to', () => {
    const r = [row({ pitcherId: 1, score: 90, verdict: 'behind', gap: -3, small: true }), row({ pitcherId: 2, score: 90, verdict: 'behind', gap: -1 })]
    expect(findPitchers(r, 'hidden').map(x => x.pitcherId)).toEqual([1, 2])
    expect(findPitchers(r, 'hidden', { includeSmall: false }).map(x => x.pitcherId)).toEqual([2])
  })
  it('filters on ERA, xERA, the gap between them and Shape Score', () => {
    const r = [
      row({ pitcherId: 1, score: 92, stats: { era: 6.4, xera: 3.1, fip: 4, ip: 50 } }),
      row({ pitcherId: 2, score: 92, stats: { era: 6.4, xera: 4.8, fip: 4, ip: 50 } }),
      row({ pitcherId: 3, score: 60, stats: { era: 6.4, xera: 3.1, fip: 4, ip: 50 } }),
      row({ pitcherId: 4, score: 95, stats: null }),
    ]
    expect(findPitchers(r, 'any', { minEra: 6, maxXera: 3.5, minScore: 90 }).map(x => x.pitcherId)).toEqual([1])
    expect(findPitchers(r, 'any', { minEraGap: 3 }).map(x => x.pitcherId)).toEqual([3, 1].sort((a, b) => (r.find(x => x.pitcherId === b)!.score ?? 0) - (r.find(x => x.pitcherId === a)!.score ?? 0)))
    expect(passesNumbers(r[3], { minEra: 1 })).toBe(false)   // no season line: out whenever an ERA filter is on
    expect(findPitchers(r, 'any', { minScore: 90 }).map(x => x.pitcherId)).toEqual([4, 1, 2])
  })
  it('shuffles repeatably for one seed and differently for another', () => {
    const xs = Array.from({ length: 20 }, (_, i) => i)
    expect(shuffled(xs, 7)).toEqual(shuffled(xs, 7))
    expect(shuffled(xs, 7)).not.toEqual(shuffled(xs, 8))
    expect([...shuffled(xs, 7)].sort((a, b) => a - b)).toEqual(xs)
    const rows = Array.from({ length: 12 }, (_, i) => row({ pitcherId: i, score: 80 }))
    expect(findPitchers(rows, 'any', { seed: 3, limit: 4 })).toHaveLength(4)
  })
})
