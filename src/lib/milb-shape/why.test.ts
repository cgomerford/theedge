import { describe, it, expect } from 'vitest'
import { buildMilbWhy } from './why'
import type { BoardRow } from '@/lib/pitch-shape/results'
import type { Diag } from '@/lib/pitch-shape/diagnostics'
import type { ShapeBin } from '@/lib/pitch-shape/model'

const m = (woba: number | null, xwoba: number | null, pa = 100) => ({ pitches: 400, runs100: 0, woba, xwoba, avg: null, slg: null, whiff: null, n: { rv: 400, ab: 90, pa, swings: 150 }, saved: null })
const sel = (o: Partial<BoardRow> = {}): BoardRow => ({
  pitcherId: 1, name: 'Test Arm', teamAbbr: 'DUR', pitches: 400, hb: 8, ivb: 16, sdHb: 2, sdIvb: 2, velo: 91, slot: 40,
  shape: m(0.3, 0.3), own: m(0.35, 0.3), shapeRaw: m(0.3, 0.3), ownRaw: m(0.35, 0.3), overall: null, profile: null, stats: null, owned: null, role: null, small: false, score: 60, gap: -1, verdict: 'behind', ...o,
})
// league bins for movement near (ivb 16, hb 8): hitters whiff more on faster ones
const bin = (velo: number, slot: number, pitches: number, swings: number, whiffs: number): ShapeBin => ({ veloBin: velo, ivbBin: 8, hbBin: 4, slotBin: slot, pitches, swings, whiffs, calledStrikes: 0, csw: 0, bbe: 200, xwobaConSum: 70, hardHit: 0, gb: 0 })
const bins = [bin(95, 4, 800, 400, 120), bin(94, 4, 800, 400, 120), bin(91, 4, 400, 200, 40), bin(92, 4, 400, 200, 44)]
const diag = (heart: number, chase: number): Diag => ({ zonePct: 0.5, heartPct: heart, chasePct: chase, xwobaCon: 0.33, wobaCon: 0.34, nBbe: 100, giftPct: null, missPct: null, sdHb: 2, sdIvb: 2, nLoc: 400, nOoz: 200 })

describe('buildMilbWhy', () => {
  it('names a slow pitch as part of the gap when pitches at his speed whiff less', () => {
    const w = buildMilbWhy(sel(), 'four-seam', 'Triple-A', bins, diag(0.08, 0.3), diag(0.08, 0.3), -1)
    const velo = w.rows.find(r => r.id === 'velo')!
    expect(velo.status).toBe('explains')
    expect(velo.text).toMatch(/slower than Triple-A four-seams/)
    expect(w.lead).toMatch(/allows 1\.00 more runs per 100/)
    expect(w.hurting.map(r => r.id)).toContain('velo')
  })
  it('lists platoon, extension and sequencing as not measured at the level, never a guess', () => {
    const w = buildMilbWhy(sel(), 'four-seam', 'Florida State League', bins, null, null, -1)
    for (const id of ['platoon', 'ext', 'sequencing']) { const r = w.rows.find(x => x.id === id)!; expect(r.status).toBe('unknown'); expect(r.number).toBe('—'); expect(r.text).toMatch(/Not measured at Florida State League/) }
  })
  it('location: more pitches down the middle than the level is part of the gap; fewer is helping', () => {
    expect(buildMilbWhy(sel(), 'four-seam', 'Triple-A', bins, diag(0.13, 0.3), diag(0.08, 0.3), -1).rows.find(r => r.id === 'location')!.status).toBe('explains')
    expect(buildMilbWhy(sel(), 'four-seam', 'Triple-A', bins, diag(0.04, 0.3), diag(0.08, 0.3), 0.5).rows.find(r => r.id === 'location')!.status).toBe('helps')
    expect(buildMilbWhy(sel(), 'four-seam', 'Triple-A', bins, null, null, -1).rows.find(r => r.id === 'location')!.status).toBe('unknown')
  })
  it('defense and luck compares wOBA with xwOBA and needs 20+ plate appearances', () => {
    expect(buildMilbWhy(sel({ ownRaw: m(0.4, 0.3) }), 'four-seam', 'Triple-A', bins, null, null, -1).rows.find(r => r.id === 'luck')!.status).toBe('explains')
    expect(buildMilbWhy(sel({ ownRaw: m(0.4, 0.3, 10) }), 'four-seam', 'Triple-A', bins, null, null, -1).rows.find(r => r.id === 'luck')!.status).toBe('unknown')
  })
  it('the lead follows the gap: ahead, in line, or behind with nothing measured to blame', () => {
    expect(buildMilbWhy(sel(), 'four-seam', 'Triple-A', undefined, null, null, 0.5).lead).toMatch(/allows 0\.50 fewer runs/)
    expect(buildMilbWhy(sel(), 'four-seam', 'Triple-A', undefined, null, null, 0.02).lead).toMatch(/in line/)
    expect(buildMilbWhy(sel({ velo: 94, ownRaw: m(0.3, 0.3) }), 'four-seam', 'Triple-A', bins, diag(0.08, 0.3), diag(0.08, 0.3), -1).lead).toMatch(/nothing measured here accounts for it/)
    expect(buildMilbWhy(sel(), 'four-seam', 'Triple-A', bins, null, null, null).lead).toBeNull()
  })
})
