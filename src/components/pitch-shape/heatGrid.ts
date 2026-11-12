// src/components/pitch-shape/heatGrid.ts
//
// Shared maths for the 0.1-inch movement maps (MovementHeat on a pitcher's tab, PitchFinder on the lab page).
// League pitches arrive as flat cell arrays (five numbers per 0.1 in cell: hb10, ivb10, pitches, swings, whiffs).
// One cell holds about one pitch, so a box's rate is computed over a square window around it; a summed-area table
// makes any window four lookups. Nothing is estimated: a window with too few swings has no rate.
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'

/** inches either side of the league centre that the Pitch Shape Lab's league heat map shows (the server asks for this much, the map draws this much). Lives here, not in the 'use client' map, so server code can read it. */
export const HEAT_HALF = 12

/**
 * One fixed colour scale for every league heat map, so the same colour always means the same whiffs per swing, on any pitch type, level or view. A continuous blue-to-red gradient (a blend of the
 * ColorBrewer RdBu palette, safe for the common kinds of colour blindness): blue at HEAT_LO (5% of swings missed), a pale neutral in the middle (about 15%), dark red at HEAT_HI (26%). It turns red
 * early on purpose, and rates outside the range take the end colour. The nine colours are spaced evenly from HEAT_LO to HEAT_HI and blended in between, so the legend's CSS gradient over the same
 * colours is exactly the scale the maps use.
 */
export const HEAT_COLORS = ['#2166AC', '#4393C3', '#92C5DE', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#F4A582', '#D6604D', '#B2182B'] as const
export const HEAT_LO = 0.05
export const HEAT_HI = 0.26
/** the whole-percent marks the legend labels along the gradient */
export const HEAT_TICKS = [5, 10, 15, 20, 26] as const
export const HEAT_GRADIENT_CSS = `linear-gradient(to right, ${HEAT_COLORS.join(', ')})`

const HEAT_RGB: [number, number, number][] = HEAT_COLORS.map(h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] })
/** where a rate (0 to 1) sits along the gradient, 0 = bluest end, 1 = reddest end */
export const heatPos = (rate: number) => Math.max(0, Math.min(1, (rate - HEAT_LO) / (HEAT_HI - HEAT_LO)))
/** the colour at a position along the gradient (0 = bluest end, 1 = reddest end): the blend every measure's scale maps onto */
export function heatRgbAt(pos: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, pos)) * (HEAT_RGB.length - 1)
  const i = Math.min(HEAT_RGB.length - 2, Math.floor(x)), t = x - i
  const a = HEAT_RGB[i], b = HEAT_RGB[i + 1]
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]
}
/** the colour of a whiffs-per-swing rate (0 to 1): a smooth blend, not steps */
export function heatRgb(rate: number): [number, number, number] {
  const x = heatPos(rate) * (HEAT_RGB.length - 1)
  const i = Math.min(HEAT_RGB.length - 2, Math.floor(x)), t = x - i
  const a = HEAT_RGB[i], b = HEAT_RGB[i + 1]
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]
}
/** the sequential colours for the "where pitches live" view: a count, not a rate, so it deliberately does not use the blue-to-red scale */
export const DENSITY_COLORS = ['#F7F5F0', '#E3E1DA', '#C9C7BE', '#A9A79D', '#85837A', '#5F5D56', '#3A3935'] as const

/** which seasons to add up: the latest, all of them, or one season by year */
export type Span = 'latest' | 'all'
export type SeasonSpan = Span | number
export const seasonsIn = <T extends { season: number }>(seasons: T[], latest: number, which: SeasonSpan): T[] => (which === 'all' ? seasons : seasons.filter(s => s.season === (which === 'latest' ? latest : which)))
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

export function makeGrid(payload: MovementCellsPayload, which: SeasonSpan): Grid {
  const m10 = Math.round(payload.margin * 10), h10 = Math.round(payload.half * 10)
  const gx0 = Math.round(payload.hb0 * 10) - h10 - m10, gy0 = Math.round(payload.ivb0 * 10) - h10 - m10
  const size = 2 * (h10 + m10) + 1
  const P = new Int32Array(size * size), S = new Int32Array(size * size), W = new Int32Array(size * size)
  const use = seasonsIn(payload.seasons, payload.latest, which)
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
