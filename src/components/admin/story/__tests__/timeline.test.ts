import { describe, expect, it } from 'vitest'
import { buildStory } from '../buildStory'
import { buildTimeline, holdKey, isStatic, PUSH_S, rebaseT, segmentAt } from '../timeline'
import { emptyGame, extras, fullGame, fullScout } from './fixtures'

const SLATE = '2026-10-07'

describe('timeline', () => {
  const { segments } = buildStory(fullGame(), extras, SLATE, { scout: fullScout() })
  const tl = buildTimeline(segments)

  it('total is the sum of the slide durations, contiguous', () => {
    tl.entries.forEach((e, i) => { if (i > 0) expect(e.start).toBeCloseTo(tl.entries[i - 1].end, 9) })
    expect(tl.total).toBeCloseTo(segments.reduce((s, x) => s + x.duration, 0), 9)
  })
  it('the default selection stays under a minute; an empty game is just hook + close', () => {
    expect(tl.total).toBeLessThanOrEqual(59.5)
    expect(buildTimeline(buildStory(emptyGame(), extras, SLATE).segments).entries.map(e => e.id)).toEqual(['hook', 'close'])
  })
  it('rebaseT keeps the playhead on the same slide when slides change', () => {
    const a = buildTimeline([{ id: 'hook', duration: 3, buildFrac: 0.4 }, { id: 'sp', duration: 5, buildFrac: 0.4 }, { id: 'streaks', duration: 3, buildFrac: 0.4 }, { id: 'close', duration: 3, buildFrac: 0.4 }])
    const b = buildTimeline([{ id: 'hook', duration: 3, buildFrac: 0.4 }, { id: 'abs', duration: 5.5, buildFrac: 0.4 }, { id: 'sp', duration: 5, buildFrac: 0.4 }, { id: 'streaks', duration: 3, buildFrac: 0.4 }, { id: 'close', duration: 3, buildFrac: 0.4 }])
    const t = 3 + 2.2                                        // 2.2s into 'sp'
    const moved = rebaseT(a, b, t)
    expect(segmentAt(b, moved).entry.id).toBe('sp')
    expect(segmentAt(b, moved).localT).toBeCloseTo(2.2, 6)
    // slide removed → next present slide (by the old order)
    const c = buildTimeline([{ id: 'hook', duration: 3, buildFrac: 0.4 }, { id: 'streaks', duration: 3, buildFrac: 0.4 }, { id: 'close', duration: 3, buildFrac: 0.4 }])
    expect(segmentAt(c, rebaseT(a, c, t)).entry.id).toBe('streaks')
  })
  it('is not static during builds or push windows, and is static during holds', () => {
    for (const e of tl.entries) {
      expect(isStatic(tl, e.start + 0.01)).toBe(false)
      expect(isStatic(tl, e.start + PUSH_S / 2)).toBe(false)
      expect(isStatic(tl, (e.start + e.buildEnd) / 2 + 0.05)).toBe(false)
      expect(isStatic(tl, e.buildEnd + 0.01)).toBe(true)
      expect(isStatic(tl, e.end - 0.01)).toBe(true)
    }
  })
  it('segmentAt reports pushes only at the head of non-first segments', () => {
    expect(segmentAt(tl, 0.05).pushing).toBeNull()
    const second = tl.entries[1]
    expect(segmentAt(tl, second.start + 0.1).pushing?.from.id).toBe('hook')
    expect(segmentAt(tl, second.start + PUSH_S + 0.01).pushing).toBeNull()
  })
  it('holdKey groups frames of one hold and is null while moving', () => {
    const e = tl.entries[2]
    expect(holdKey(tl, e.buildEnd + 0.1)).toBe(holdKey(tl, e.end - 0.1))
    expect(holdKey(tl, e.start + 0.1)).toBeNull()
  })
})
