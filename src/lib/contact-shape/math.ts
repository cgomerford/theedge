// src/lib/contact-shape/math.ts
//
// Pure maths for Contact Shape: batted balls laid out by exit velocity (EV) and launch angle (LA). No fetching and no React, so every figure on the page is testable.
// A batted ball is stored as a tuple (see fixtures/hitters.json meta.fields): [EV x10, LA, side (0 L / 1 R), result (0 out, 1 1B, 2 2B, 3 3B, 4 HR), xwOBA x1000 or -1].

export type Ball = [ev10: number, la: number, side: number, result: number, xw: number]

export const GRID = { evStart: 40, evStep: 4, evBins: 19, laStart: -60, laStep: 5, laBins: 26 } as const
export const evOf = (b: Ball) => b[0] / 10
export const isHit = (b: Ball) => b[3] > 0

export const cellOf = (ev: number, la: number) => ({
  e: Math.max(0, Math.min(GRID.evBins - 1, Math.floor((ev - GRID.evStart) / GRID.evStep))),
  a: Math.max(0, Math.min(GRID.laBins - 1, Math.floor((la - GRID.laStart) / GRID.laStep))),
})

export type Cell = { n: number; hits: number; xSum: number; xN: number }
export type Grid = Cell[][]   // [evBin][laBin]
export const emptyGrid = (): Grid => Array.from({ length: GRID.evBins }, () => Array.from({ length: GRID.laBins }, () => ({ n: 0, hits: 0, xSum: 0, xN: 0 })))

export function gridOf(balls: Ball[]): Grid {
  const g = emptyGrid()
  for (const b of balls) {
    const { e, a } = cellOf(evOf(b), b[1]), c = g[e][a]
    c.n++; if (isHit(b)) c.hits++
    if (b[4] >= 0) { c.xSum += b[4] / 1000; c.xN++ }
  }
  return g
}

/** League cells as stored: [ev bin, la bin, balls, hits, sum xwOBA, balls with xwOBA]. */
export function leagueGrid(rows: number[][]): Grid {
  const g = emptyGrid()
  for (const [e, a, n, hits, xs, xn] of rows) g[e][a] = { n, hits, xSum: xs, xN: xn }
  return g
}

export const total = (g: Grid) => g.reduce((s, r) => s + r.reduce((t, c) => t + c.n, 0), 0)

/** Share of a hitter's own batted balls that landed in each cell (0..1). */
export function shareGrid(g: Grid): number[][] {
  const t = total(g) || 1
  return g.map(r => r.map(c => c.n / t))
}

export type Zone = { evMin: number; evMax: number; laMin: number; laMax: number }
export const inZone = (b: Ball, z: Zone) => evOf(b) >= z.evMin && evOf(b) <= z.evMax && b[1] >= z.laMin && b[1] <= z.laMax

/** Statcast's barrel: 98+ mph, with an angle band that starts at 26 to 30 degrees at 98 mph and widens evenly (1 degree down and about 1.1 up per mph) to 8 to 50 degrees at 116 mph. An approximation of the published rule, so it can differ slightly from Savant’s barrel count. */
export function isBarrel(ev: number, la: number): boolean {
  if (ev < 98) return false
  const over = Math.min(ev, 116) - 98
  return la >= 26 - over && la <= 30 + (20 / 18) * over
}

export type Profile = {
  n: number; avgEv: number | null; maxEv: number | null; avgLa: number | null
  hardHit: number | null; sweetSpot: number | null; barrel: number | null
  xwoba: number | null; xwobaN: number; hitRate: number | null
  gb: number | null; ld: number | null; fb: number | null; pu: number | null
}

const share = (k: number, n: number) => (n > 0 ? k / n : null)
export function profileOf(balls: Ball[]): Profile {
  const n = balls.length
  if (n === 0) return { n: 0, avgEv: null, maxEv: null, avgLa: null, hardHit: null, sweetSpot: null, barrel: null, xwoba: null, xwobaN: 0, hitRate: null, gb: null, ld: null, fb: null, pu: null }
  let ev = 0, la = 0, mx = 0, hard = 0, sweet = 0, bar = 0, xs = 0, xn = 0, hits = 0, gb = 0, ld = 0, fb = 0, pu = 0
  for (const b of balls) {
    const v = evOf(b), a = b[1]
    ev += v; la += a; if (v > mx) mx = v
    if (v >= 95) hard++
    if (a >= 8 && a <= 32) sweet++
    if (isBarrel(v, a)) bar++
    if (b[4] >= 0) { xs += b[4] / 1000; xn++ }
    if (isHit(b)) hits++
    if (a < 10) gb++; else if (a < 25) ld++; else if (a <= 50) fb++; else pu++
  }
  return { n, avgEv: ev / n, maxEv: mx, avgLa: la / n, hardHit: share(hard, n), sweetSpot: share(sweet, n), barrel: share(bar, n), xwoba: xn > 0 ? xs / xn : null, xwobaN: xn, hitRate: share(hits, n), gb: share(gb, n), ld: share(ld, n), fb: share(fb, n), pu: share(pu, n) }
}

export const cellX = (c: Cell) => (c.xN > 0 ? c.xSum / c.xN : null)
export const cellHit = (c: Cell) => (c.n > 0 ? c.hits / c.n : null)

/** Cells under this many balls are shown blank for quality measures: a rate from two or three balls is not a read. */
export const MIN_CELL = 3

export const evLabel = (e: number) => `${GRID.evStart + e * GRID.evStep}–${GRID.evStart + (e + 1) * GRID.evStep} mph`
export const laLabel = (a: number) => `${GRID.laStart + a * GRID.laStep} to ${GRID.laStart + (a + 1) * GRID.laStep}°`

/** Balls in each launch-angle band as named on the page. */
export const BANDS = [
  { id: 'gb', label: 'Ground balls', range: 'under 10°' }, { id: 'ld', label: 'Line drives', range: '10° to 25°' },
  { id: 'fb', label: 'Fly balls', range: '25° to 50°' }, { id: 'pu', label: 'Pop-ups', range: 'over 50°' },
] as const
