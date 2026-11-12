// src/lib/pitch-shape/results-math.ts
//
// Maths for the Pitch Shape Lab's results heat map and Shape Score. Client-safe (no server imports). League pitches arrive as flat cell arrays,
// FOURTEEN numbers per 0.1 in cell (see supabase/migrations/20261106130000_pitch_shape_results.sql):
//   hb10, ivb10, pitches, swings, whiffs, rv_n, rv*1000, pa, ab, hits, tb, woba_den, woba_sum*1000, xwoba_sum*1000
// One cell holds about one pitch, so any rate is taken over a square window around a point; a summed-area table per field makes a window four lookups.
// A measure with too few in its window is null, never a guess.
//
// Run value is Statcast delta_run_exp: runs for the BATTING side, so LOWER is better for the pitcher. "Runs saved per 100 pitches" is the league's runs per
// 100 minus the window's, so HIGHER is better for the pitcher.
// Shape Score = where a shape's runs saved per 100 ranks among all the shapes pitchers throw (a 1 to 99 percentile). It describes what pitches shaped like his
// have produced; it is not a forecast of what his pitches will do.

export const STRIDE = 14
export const FIELDS = ['pitches', 'swings', 'whiffs', 'rvN', 'rv', 'pa', 'ab', 'hits', 'tb', 'wd', 'w', 'x'] as const
export type Field = (typeof FIELDS)[number]
export type Sums = Record<Field, number>
/** Fields stored times 1000 in the cell arrays. */
const SCALED: Field[] = ['rv', 'w', 'x']

/** What a window needs before a measure is shown. */
export const GATE = { rvPitches: 300, ab: 100, den: 100, swings: 40 } as const
/** A pitcher's own pitch needs this many pitches before its own run value is compared with its shape's. */
export const MIN_OWN_PITCHES = 300
/** Gap (runs per 100 pitches) inside which results and shape are "about level". */
export const LEVEL_RUNS = 0.4

export type ResultsPayload = {
  seasons: { season: number; cells: number[] }[]
  latest: number
  /** window centre (inches), half-width, extra margin so a window at the edge is exact */
  hb0: number; ivb0: number; half: number; margin: number
}
export type Span = 'latest' | 'all'
export type RGrid = { size: number; m10: number; h10: number; gx0: number; gy0: number; I: Record<Field, Float64Array>; total: Sums }

export const zeroSums = (): Sums => Object.fromEntries(FIELDS.map(f => [f, 0])) as Sums

function integralF(a: Float64Array, size: number): Float64Array {
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

export function makeResultsGrid(p: ResultsPayload, which: Span | number): RGrid {
  const m10 = Math.round(p.margin * 10), h10 = Math.round(p.half * 10)
  const gx0 = Math.round(p.hb0 * 10) - h10 - m10, gy0 = Math.round(p.ivb0 * 10) - h10 - m10
  const size = 2 * (h10 + m10) + 1
  const A = Object.fromEntries(FIELDS.map(f => [f, new Float64Array(size * size)])) as Record<Field, Float64Array>
  const total = zeroSums()
  const use = which === 'all' ? p.seasons : p.seasons.filter(s => s.season === (which === 'latest' ? p.latest : which))
  for (const se of use) {
    for (let k = 0; k < se.cells.length; k += STRIDE) {
      const x = se.cells[k] - gx0, y = se.cells[k + 1] - gy0
      if (x < 0 || y < 0 || x >= size || y >= size) continue
      FIELDS.forEach((f, j) => { const v = se.cells[k + 2 + j] / (SCALED.includes(f) ? 1000 : 1); A[f][y * size + x] += v })
    }
  }
  for (const f of FIELDS) { for (let i = 0; i < A[f].length; i++) total[f] += A[f][i] }
  const I = Object.fromEntries(FIELDS.map(f => [f, integralF(A[f], size)])) as Record<Field, Float64Array>
  return { size, m10, h10, gx0, gy0, I, total }
}

/** League sums inside the square window of half-width r10 (tenths of an inch) around a point given in tenths of an inch. */
export function windowSums(g: RGrid, hb10: number, ivb10: number, r10: number): Sums {
  return windowSumsRect(g, hb10, ivb10, r10, r10)
}

/** The same with a box: half-width rx10 across (arm-side break) and ry10 up (ride), tenths of an inch. Used to size the shape window by a pitcher's own spread. */
export function windowSumsRect(g: RGrid, hb10: number, ivb10: number, rx10: number, ry10: number): Sums {
  const x = hb10 - g.gx0, y = ivb10 - g.gy0
  const x0 = Math.max(0, x - rx10), x1 = Math.min(g.size - 1, x + rx10), y0 = Math.max(0, y - ry10), y1 = Math.min(g.size - 1, y + ry10)
  const out = zeroSums()
  if (x1 < x0 || y1 < y0) return out
  for (const f of FIELDS) out[f] = win(g.I[f], g.size, x0, y0, x1, y1)
  return out
}

export type Measures = {
  pitches: number
  /** runs allowed per 100 pitches (batting side's run value): lower is better for the pitcher */
  runs100: number | null
  woba: number | null; xwoba: number | null; avg: number | null; slg: number | null; whiff: number | null
  /** sample behind each, for display */
  n: { rv: number; ab: number; pa: number; swings: number }
}

/** Every measure from a set of sums, each one null under its own sample gate. Sums are in real units (not x1000). */
export function measuresOf(s: Sums, gated = true): Measures {
  // gated = false shows the number from whatever sample there is (null only when there is nothing at all); the caller then labels it thin
  const g = gated ? GATE : { rvPitches: 1, ab: 1, den: 1, swings: 1 }
  return {
    pitches: s.pitches,
    runs100: s.rvN >= g.rvPitches ? (s.rv / s.rvN) * 100 : null,
    woba: s.wd >= g.den ? s.w / s.wd : null,
    xwoba: s.wd >= g.den ? s.x / s.wd : null,
    avg: s.ab >= g.ab ? s.hits / s.ab : null,
    slg: s.ab >= g.ab ? s.tb / s.ab : null,
    whiff: s.swings >= g.swings ? s.whiffs / s.swings : null,
    n: { rv: s.rvN, ab: s.ab, pa: s.pa, swings: s.swings },
  }
}

/** Runs saved per 100 pitches against the league's average for the pitch type: positive is better for the pitcher. null when either side is under its gate. */
export const runsSaved = (m: Measures, league: Measures): number | null => (m.runs100 == null || league.runs100 == null ? null : league.runs100 - m.runs100)

/** Share (1 to 99) of the sorted values that are at or below v. */
export function percentile(sorted: number[], v: number): number {
  if (!sorted.length) return 50
  let lo = 0, hi = sorted.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid }
  return Math.max(1, Math.min(99, Math.round((lo / sorted.length) * 100)))
}

export type Verdict = 'behind' | 'level' | 'ahead'
/** His own runs saved against his shape's: ahead means his results are better than the shape has produced. null when either is missing. */
export function resultsVsShape(ownSaved: number | null, shapeSaved: number | null): { gap: number; verdict: Verdict } | null {
  if (ownSaved == null || shapeSaved == null) return null
  const gap = Math.round((ownSaved - shapeSaved) * 100) / 100
  return { gap, verdict: gap > LEVEL_RUNS ? 'ahead' : gap < -LEVEL_RUNS ? 'behind' : 'level' }
}

/** A pitcher's own row (real units) as sums, so the same measuresOf applies. */
export function pitcherSums(r: { n_pitches: number; n_swings: number; n_whiffs: number; rv_n: number; rv: number; pa: number; ab: number; hits: number; tb: number; woba_den: number; woba_sum: number; xwoba_sum: number }): Sums {
  return { pitches: r.n_pitches, swings: r.n_swings, whiffs: r.n_whiffs, rvN: r.rv_n, rv: r.rv, pa: r.pa, ab: r.ab, hits: r.hits, tb: r.tb, wd: r.woba_den, w: r.woba_sum, x: r.xwoba_sum }
}
