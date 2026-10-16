import { describe, expect, it } from 'vitest'
import { MAX_PART_S, splitStory, total } from '../split'
import type { Segment, SegmentId } from '../types'

const seg = (id: SegmentId, duration: number): Segment => ({ id, duration, buildFrac: 0.4 })
const long = (): Segment[] => [
  seg('hook', 3), seg('sp', 5), seg('sp-arsenal', 6), seg('sp-tto', 4.5), seg('bullpen-avail', 6.5), seg('run-game', 7), seg('abs', 7),
  seg('club-status', 4.5), seg('defense-away', 4), seg('defense-home', 4), seg('streaks', 4), seg('form', 4.5), seg('lineup-away', 4), seg('lineup-home', 4), seg('close', 3.5),
]

describe('splitStory', () => {
  it('splits a >59.5s story into two parts that each fit', () => {
    const src = long()
    expect(total(src)).toBeGreaterThan(MAX_PART_S)
    const parts = splitStory(src)!
    expect(parts).not.toBeNull()
    expect(total(parts[0])).toBeLessThanOrEqual(MAX_PART_S)
    expect(total(parts[1])).toBeLessThanOrEqual(MAX_PART_S)
  })
  it('hook first in part 1; part-hook first and close last in part 2; no close in part 1', () => {
    const [a, b] = splitStory(long())!
    expect(a[0].id).toBe('hook')
    expect(a.map(s => s.id)).not.toContain('close')
    expect(b[0].id).toBe('part-hook'); expect(b[0].duration).toBe(1.5)
    expect(b.at(-1)!.id).toBe('close')
  })
  it('splits only at segment boundaries and keeps the order', () => {
    const src = long()
    const [a, b] = splitStory(src)!
    const rejoined = [...a, ...b.filter(s => s.id !== 'part-hook')].map(s => s.id)
    expect(rejoined).toEqual(src.map(s => s.id))
  })
  it('prefers the balanced split', () => {
    const [a, b] = splitStory(long())!
    const bal = Math.abs(total(a) - total(b))
    expect(bal).toBeLessThan(10)
  })
  it('returns null when no valid split exists', () => {
    const huge = [seg('hook', 3), seg('abs', 58), seg('run-game', 58), seg('close', 3)]
    expect(splitStory(huge)).toBeNull()
  })
  it('returns null without a hook or close', () => {
    expect(splitStory([seg('sp', 5)])).toBeNull()
  })
})
