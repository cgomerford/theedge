// src/components/pitch-shape/heatGrid.ts
//
// Shared maths for the 0.1-inch movement maps (MovementHeat on a pitcher's tab, PitchFinder on the lab page).
// League pitches arrive as flat cell arrays (five numbers per 0.1 in cell: hb10, ivb10, pitches, swings, whiffs).
// One cell holds about one pitch, so a box's rate is computed over a square window around it; a summed-area table
// makes any window four lookups. Nothing is estimated: a window with too few swings has no rate.
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'

export type Span = 'latest' | 'all'
export type Grid = { size: number; m10: number; h10: number; gx0: number; gy0: number; iP: Float64Array; iS: Float64Array; iW: Float64Array; swings: number; whiffs: number }

export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** summed-area table over a size x size grid (so any square window sum is four lookups) */
export function integral(a: Int32Array, size: number): Float64Array {
  const s = new Float64Array((size + 1) * (size + 1))
  for (let y = 0; y < size; y++) {
    let row = 0
    for (let x = 0; x < size; x++) {
      row += a[y * size + x]
      s[(y + 1) * (size + 1) + (x + 1)] = s[y * (size + 1) + (x + 1)] + row
    }
  }
  return s
}
const win = (s: Float64Array, size: number, x0: number, y0: number, x1: number, y1: number) =>
  s[(y1 + 1) * (size + 1) + (x1 + 1)] - s[y0 * (size + 1) + (x1 + 1)] - s[(y1 + 1) * (size + 1) + x0] + s[y0 * (size + 1) + x0]

export function makeGrid(payload: MovementCellsPayload, which: Span): Grid {
  const m10 = Math.round(payload.margin * 10), h10 = Math.round(payload.half * 10)
  const gx0 = Math.round(payload.hb0 * 10) - h10 - m10, gy0 = Math.round(payload.ivb0 * 10) - h10 - m10
  const size = 2 * (h10 + m10) + 1
  const P = new Int32Array(size * size), S = new Int32Array(size * size), W = new Int32Array(size * size)
  const use = which === 'latest' ? payload.seasons.filter(s => s.season === payload.latest) : payload.seasons
  let swings = 0, whiffs = 0
  for (const se of use) {
    swings += se.league.swings; whiffs += se.league.whiffs
    for (let k = 0; k < se.cells.length; k += 5) {
      const x = se.cells[k] - gx0, y = se.cells[k + 1] - gy0
      if (x < 0 || y < 0 || x >= size || y >= size) continue
      const i = y * size + x
      P[i] += se.cells[k + 2]; S[i] += se.cells[k + 3]; W[i] += se.cells[k + 4]
    }
  }
  return { size, m10, h10, gx0, gy0, iP: integral(P, size), iS: integral(S, size), iW: integral(W, size), swings, whiffs }
}

/** league pitches, swings and whiffs inside the square window of half-width r10 (tenths of an inch) around a point */
export function stats(g: Grid, hb10: number, ivb10: number, r10: number) {
  const x = hb10 - g.gx0, y = ivb10 - g.gy0
  const x0 = Math.max(0, x - r10), x1 = Math.min(g.size - 1, x + r10), y0 = Math.max(0, y - r10), y1 = Math.min(g.size - 1, y + r10)
  return { pitches: win(g.iP, g.size, x0, y0, x1, y1), swings: win(g.iS, g.size, x0, y0, x1, y1), whiffs: win(g.iW, g.size, x0, y0, x1, y1) }
}
