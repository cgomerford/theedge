import { describe, it, expect } from 'vitest'
import { handsOf, handWord, mergeCells, mergeResults, mergeThrowers } from './bothHands'
import type { MovementCellsPayload, Thrower } from '@/lib/pitch-shape/data'

const payload = (cells: number[], league: { pitches: number; swings: number; whiffs: number }, hb0 = 7): MovementCellsPayload => ({
  seasons: [{ season: 2026, cells, league }], latest: 2026, hb0, ivb0: 15, half: 12, margin: 2.5, pct: { latest: { hb: 40, ivb: 50 }, all: { hb: 40, ivb: 50 } },
})

describe('both hands', () => {
  it('names and lists the hands', () => {
    expect(handsOf('B')).toEqual(['R', 'L']); expect(handsOf('L')).toEqual(['L'])
    expect(handWord('B')).toBe('left- and right-handed')
  })
  it('sums the movement cells of the two hands, cell by cell, and the league totals', () => {
    const r = payload([70, 150, 10, 5, 1, 71, 150, 4, 2, 1], { pitches: 14, swings: 7, whiffs: 2 })
    const l = payload([70, 150, 6, 3, 2, 80, 160, 2, 1, 0], { pitches: 8, swings: 4, whiffs: 2 }, 8)
    const m = mergeCells(r, l)
    expect(m.hb0).toBe(7)   // drawn around the right-handed centre
    expect(m.seasons[0].league).toEqual({ pitches: 22, swings: 11, whiffs: 4 })
    expect(m.seasons[0].cells).toEqual([70, 150, 16, 8, 3, 71, 150, 4, 2, 1, 80, 160, 2, 1, 0])
  })
  it('sums results cells (14 numbers each) and keeps coordinates', () => {
    const cell = (hb: number, n: number) => [hb, 150, n, n, 0, n, 100 * n, 0, 0, 0, 0, 0, 0, 0]
    const a = { seasons: [{ season: 2026, cells: cell(70, 2) }], latest: 2026, hb0: 7, ivb0: 15, half: 12, margin: 2.5 }
    const b = { seasons: [{ season: 2026, cells: cell(70, 3) }], latest: 2026, hb0: 8, ivb0: 15, half: 12, margin: 2.5 }
    const m = mergeResults(a, b)
    expect(m.seasons[0].cells.slice(0, 3)).toEqual([70, 150, 5])
    expect(m.seasons[0].cells).toHaveLength(14)
  })
  it('merges throwers by how many of their pitches land in the window', () => {
    const t = (id: number, inSpot: number) => ({ pitcherId: id, inSpot, nPitches: 100 } as unknown as Thrower)
    expect(mergeThrowers([t(1, 5), t(2, 9)], [t(3, 7)]).map(x => x.pitcherId)).toEqual([2, 3, 1])
  })
})
