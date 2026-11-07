import { describe, expect, it } from 'vitest'
import { findPitchers, type FinderRow } from './finder'

const row = (o: Partial<FinderRow>): FinderRow => ({ pitcherId: 1, name: 'A', teamAbbr: 'X', pitches: 500, score: 50, gap: 0, verdict: 'level', overall: { pitches: 2000, runsPct: 50 }, ...o })

describe('find me a pitcher', () => {
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
})
