import { describe, it, expect } from 'vitest'
import { pitchChanges, usageChanges, separations, type MonthRow } from './changes'

const row = (pitchType: string, month: number, n: number, o: Partial<MonthRow> = {}): MonthRow => ({ pitchType, month, n, speed: 94, spin: 2300, ivb: 16, hb: -8, relX: -2, relZ: 5.8, ext: 6.4, ...o })

describe('pitchChanges', () => {
  it('flags the axes that moved by more than their threshold, between the first and the latest full month', () => {
    const [c] = pitchChanges([row('FF', 4, 300), row('FF', 6, 280, { speed: 92.6, spin: 2150 }), row('FF', 8, 290, { speed: 92.5, spin: 2140, ivb: 14.8 })])
    expect(c.first.month).toBe(4)
    expect(c.last.month).toBe(8)
    expect(c.delta.velo).toBeCloseTo(-1.5)
    expect(c.delta.spin).toBeCloseTo(-160)
    expect(c.flagged).toEqual(['velo', 'spin', 'ivb'])
    expect(c.delta.relZ).toBeCloseTo(0)
  })
  it('ignores months under the sample gate, so a thin month is not a reading', () => {
    expect(pitchChanges([row('CH', 4, 60), row('CH', 5, 12, { speed: 80 }), row('CH', 6, 49, { speed: 70 })])).toEqual([])   // only April is a full month
  })
  it('needs two months between the readings', () => {
    expect(pitchChanges([row('FF', 4, 200), row('FF', 5, 200, { speed: 90 })])).toEqual([])
  })
  it('compares the size of run and release side, so a left-hander and a right-hander read the same way', () => {
    const [c] = pitchChanges([row('SL', 4, 100, { hb: 3, relX: 2 }), row('SL', 7, 100, { hb: 5, relX: 2.4 })])
    expect(c.delta.hb).toBeCloseTo(2)
    expect(c.delta.relX).toBeCloseTo(0.4)
    const [l] = pitchChanges([row('SL', 4, 100, { hb: -3, relX: -2 }), row('SL', 7, 100, { hb: -5, relX: -2.4 })])
    expect(l.delta.hb).toBeCloseTo(2)
  })
  it('ranks the biggest move first, as a multiple of its threshold', () => {
    const out = pitchChanges([row('FF', 4, 200), row('FF', 7, 200, { speed: 95.1 }), row('CH', 4, 200), row('CH', 7, 200, { speed: 90, ivb: 11 })])
    expect(out.map(c => c.pitchType)).toEqual(['CH', 'FF'])
    expect(out[0].score).toBeGreaterThan(out[1].score)
  })
  it('leaves a missing figure out of the change instead of guessing it', () => {
    const [c] = pitchChanges([row('ST', 4, 100, { spin: null }), row('ST', 7, 100, { spin: 2500 })])
    expect(c.delta.spin).toBeNull()
    expect(c.flagged).not.toContain('spin')
  })
})

describe('usageChanges', () => {
  const early = (t: string, n: number) => [row(t, 4, n), row(t, 5, n)]
  it('finds a pitch he added: nothing early, a real share now', () => {
    const rows = [...early('FF', 250), ...early('SL', 120), row('FF', 6, 220), row('SL', 6, 120), row('CH', 6, 30), row('FF', 8, 200), row('SL', 8, 110), row('CH', 8, 90), row('FF', 9, 200), row('SL', 9, 100), row('CH', 9, 100)]
    const u = usageChanges(rows)
    expect(u).toHaveLength(1)
    expect(u[0]).toMatchObject({ pitchType: 'CH', kind: 'added', month: 6 })
    expect(u[0].early).toBe(0)
    expect(u[0].late).toBeCloseTo(190 / 800)
  })
  it('finds a pitch he dropped: a real share early, gone now', () => {
    const rows = [...early('FF', 200), ...early('CU', 100), row('FF', 6, 220), row('CU', 6, 5), row('FF', 8, 240), row('FF', 9, 240)]
    expect(usageChanges(rows)).toMatchObject([{ pitchType: 'CU', kind: 'dropped', month: 5 }])
  })
  it('says nothing when the mix is steady', () => {
    expect(usageChanges([...early('FF', 200), ...early('SL', 100), row('FF', 7, 200), row('SL', 7, 100), row('FF', 8, 200), row('SL', 8, 100)])).toEqual([])
  })
  it('needs three months with at least 100 pitches', () => {
    expect(usageChanges([...early('FF', 200), ...early('CH', 0)])).toEqual([])
  })
})

describe('separations', () => {
  it('measures the gap between the fastball and each other pitch, and how it changed', () => {
    const s = separations([
      row('FF', 4, 300, { ivb: 16, hb: -8, speed: 95 }), row('CH', 4, 100, { ivb: 8, hb: -15, speed: 86 }),
      row('FF', 8, 300, { ivb: 16, hb: -8, speed: 95 }), row('CH', 8, 100, { ivb: 11, hb: -11, speed: 88 }),
    ])
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ fastball: 'FF', pitchType: 'CH' })
    expect(s[0].first.gap).toBeCloseTo(Math.hypot(8, 7))
    expect(s[0].last.gap).toBeCloseTo(Math.hypot(5, 3))
    expect(s[0].change).toBeLessThan(-3)   // it stopped moving away from the fastball
    expect(s[0].veloFirst).toBeCloseTo(9)
    expect(s[0].veloLast).toBeCloseTo(7)
  })
  it('uses the sinker when he has no four-seam', () => {
    const s = separations([row('SI', 4, 300), row('SL', 4, 100, { ivb: 2, hb: -2 }), row('SI', 7, 300), row('SL', 7, 100, { ivb: 3, hb: -2 })])
    expect(s[0].fastball).toBe('SI')
  })
  it('needs both pitches in two full months, two months apart', () => {
    expect(separations([row('FF', 4, 300), row('CH', 4, 100), row('FF', 5, 300), row('CH', 5, 100, { ivb: 5 })])).toEqual([])
    expect(separations([row('CH', 4, 100), row('CH', 8, 100)])).toEqual([])
  })
})
