import { describe, expect, it } from 'vitest'
import { shapeTimeline } from './timeline'
import type { RawPitch } from '@/lib/pitcher-pitch-log'

const p = (date: string, type: string, pfx: [number, number] | null, velo: number | null = 95): RawPitch => ({ date, pitchType: type, pfx, velo } as unknown as RawPitch)
const many = (date: string, k: number, pfx: [number, number], velo = 95) => Array.from({ length: k }, () => p(date, 'FF', pfx, velo))

describe('shapeTimeline', () => {
  it('averages ride, run and speed per level and month, in date order', () => {
    const t = shapeTimeline([
      { level: 'mlb', throws: 'R', pitches: many('2026-06-10', 60, [-1, 1.5], 96) },
      { level: 'aaa', throws: 'R', pitches: [...many('2026-04-05', 60, [-0.9, 1.4], 94), ...many('2026-05-02', 20, [-1, 1.5])] },
    ], 'FF')
    expect(t.map(x => `${x.level}${x.month}`)).toEqual(['aaa2026-04', 'aaa2026-05', 'mlb2026-06'])
    expect(t[0]).toMatchObject({ n: 60, thin: false }); expect(t[0].ride).toBeCloseTo(16.8, 6); expect(t[0].run).toBeCloseTo(10.8, 6); expect(t[0].velo).toBeCloseTo(94, 6)
    expect(t[1].thin).toBe(true)
  })
  it('run is arm-side positive for a left-hander too', () => {
    const t = shapeTimeline([{ level: 'mlb', throws: 'L', pitches: many('2026-06-10', 20, [1, 1.2]) }], 'FF')
    expect(t[0].run).toBeCloseTo(12, 6)
  })
  it('leaves out months under 15 pitches, other pitch types and pitches without movement', () => {
    const t = shapeTimeline([{ level: 'mlb', throws: 'R', pitches: [...many('2026-06-10', 14, [-1, 1]), p('2026-07-01', 'SL', [-1, 0]), p('2026-07-02', 'FF', null)] }], 'FF')
    expect(t).toEqual([])
  })
  it('puts the lower level first inside a month', () => {
    const t = shapeTimeline([{ level: 'mlb', throws: 'R', pitches: many('2026-06-20', 20, [-1, 1]) }, { level: 'aaa', throws: 'R', pitches: many('2026-06-02', 20, [-1, 1]) }], 'FF')
    expect(t.map(x => x.level)).toEqual(['aaa', 'mlb'])
  })
})
