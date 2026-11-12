// src/lib/pitch-shape/coarse-heat.ts
//
// A small version of the league movement heat map, for the "all pitch shape maps" view where eight or nine maps share a screen. The full 0.1-inch cells are far too heavy to send nine times,
// so each map is sampled every 0.3 inch, each sample being the whiffs per swing of the league pitches within +-1 inch of it (the same window rule as the big map: under 40 swings is blank, never
// estimated). Pure maths on the cells payload the server already reads; nothing here fetches.
import type { MovementCellsPayload } from '@/lib/pitch-shape/data'
import { makeGrid, stats, type Span } from '@/components/pitch-shape/heatGrid'

export const COARSE_MIN_SWINGS = 40
const STEP10 = 3      // a sample every 0.3 in
const WINDOW10 = 10   // +-1.0 in

export type CoarseHeat = {
  /** samples per side */
  n: number
  /** whiffs per swing at each sample, row 0 = the lowest ride, or null where the window has too few swings */
  rates: (number | null)[]
  /** raw swings within reach of each sample, so a map can fade colour where few swings stand behind it */
  sampleSwings: number[]
  hb0: number; ivb0: number; half: number
  /** every league pitch of this type and hand in the span */
  pitches: number; swings: number; whiffs: number
  /** the pitch-weighted average shape (run, ride) of the pitches inside the window, in inches */
  meanHb: number; meanIvb: number
}

export function coarseHeat(payload: MovementCellsPayload, span: Span = 'latest'): CoarseHeat {
  const g = makeGrid(payload, span)
  const half10 = g.h10
  const n = Math.floor((2 * half10) / STEP10) + 1
  const rates: (number | null)[] = [], sampleSwings: number[] = []
  for (let yy = 0; yy < n; yy++) {
    for (let xx = 0; xx < n; xx++) {
      const s = stats(g, g.gx0 + g.m10 + xx * STEP10, g.gy0 + g.m10 + yy * STEP10, WINDOW10)
      rates.push(s.swings >= COARSE_MIN_SWINGS ? Math.round((s.whiffs / s.swings) * 1000) / 1000 : null)
      sampleSwings.push(s.swings)
    }
  }
  const use = span === 'latest' ? payload.seasons.filter(x => x.season === payload.latest) : payload.seasons
  let cnt = 0, sumHb = 0, sumIvb = 0
  for (const se of use) for (let k = 0; k < se.cells.length; k += 5) { const c = se.cells[k + 2]; cnt += c; sumHb += se.cells[k] * c; sumIvb += se.cells[k + 1] * c }
  return { n, rates, sampleSwings, hb0: payload.hb0, ivb0: payload.ivb0, half: payload.half, pitches: use.reduce((a, x) => a + x.league.pitches, 0), swings: g.swings, whiffs: g.whiffs, meanHb: cnt ? sumHb / cnt / 10 : payload.hb0, meanIvb: cnt ? sumIvb / cnt / 10 : payload.ivb0 }
}
