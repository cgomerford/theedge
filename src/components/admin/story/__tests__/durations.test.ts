import { describe, expect, it } from 'vitest'
import { buildFracFor, durationFor } from '../durations'
import { buildStory } from '../buildStory'
import { penGridFixture } from './fixtures'
import { extras, fullGame } from './fixtures'
import { total } from '../split'

describe('durations', () => {
  it('clamps to lo/hi', () => {
    expect(durationFor('sp', 0)).toBe(3.5 > 4.0 ? 4 : 4.0)         // base 4.0, minRows 5 → stays 4.0
    expect(durationFor('sp', 40)).toBe(5)
    expect(durationFor('late', 0)).toBe(3.5)
    expect(durationFor('close', 0)).toBe(3)
  })
  it('adds 0.35s per row beyond minRows', () => {
    expect(durationFor('sp', 5)).toBe(4)
    expect(durationFor('sp', 6)).toBe(4.35)
    expect(durationFor('sp', 7)).toBe(4.7)
    expect(durationFor('abs', 8)).toBe(6.2)
  })
  it('buildFrac is 0.4, part-hook 0.5, and part-hook is fixed 1.5s', () => {
    expect(buildFracFor('sp')).toBe(0.4)
    expect(buildFracFor('part-hook')).toBe(0.5)
    expect(durationFor('part-hook', 99)).toBe(1.5)
  })
  it('hook gets +0.5 when the scout note wraps to 3 lines', () => {
    expect(durationFor('hook', 0, 0.5)).toBe(3)
    expect(durationFor('hook', 0)).toBe(2.5)
  })
  it('Quick preset totals ≤ 30s on a full-data game', () => {
    const { segments } = buildStory(fullGame(), extras, '2026-10-07', { on: ['hook', 'sp', 'bullpen-avail', 'streaks', 'close'], bullpenGrid: penGridFixture() })
    expect(segments.map(s => s.id)).toEqual(['hook', 'sp', 'bullpen-avail', 'streaks', 'close'])
    expect(total(segments)).toBeLessThanOrEqual(30)
    for (const s of segments) expect(s.buildFrac).toBe(0.4)
  })
})
