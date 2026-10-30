// src/lib/pitch-shape/sandbox-math.ts
//
// The shared maths behind "dial in a shape" (the sandbox and the pitcher tab): where a value sits among the league's shapes for a pitch type (weighted by pitches),
// the verdict words, the shaded part of each slider, and the change between two shapes. Pure functions over the same bins and lookup as model.ts, so every number
// matches the classic sandbox. Descriptions of what league pitches with a shape have produced; never a forecast for a person.

import { lookup, typicalShape, type BinIndex, type Shape, type ShapeBin, type ShapeLookup } from './model'

export type Metric = 'whiff' | 'csw' | 'gb' | 'xw'
export type Dist = { d: Record<Metric, [number, number][]>; tot: Record<Metric, number> }

/** Each bin's rate for each metric (bins with at least 20 swings / pitches / balls in play), sorted, with the pitch total as the weight. */
export function buildDist(bins: ShapeBin[]): Dist {
  const d: Record<Metric, [number, number][]> = { whiff: [], csw: [], gb: [], xw: [] }
  for (const b of bins) {
    if (b.swings >= 20) d.whiff.push([b.whiffs / b.swings, b.pitches])
    if (b.pitches >= 20) d.csw.push([b.csw / b.pitches, b.pitches])
    if (b.bbe >= 20) { d.gb.push([b.gb / b.bbe, b.pitches]); d.xw.push([b.xwobaConSum / b.bbe, b.pitches]) }
  }
  const tot = { whiff: 0, csw: 0, gb: 0, xw: 0 }
  for (const k of Object.keys(d) as Metric[]) { d[k].sort((a, b) => a[0] - b[0]); tot[k] = d[k].reduce((s, x) => s + x[1], 0) }
  return { d, tot }
}

/** 0 = worst for the pitcher .. 1 = best. Damage on contact is lower-is-better, so it flips. */
export function goodness(dist: Dist, k: Metric, v: number): number {
  let a = 0
  for (const [x, w] of dist.d[k]) { if (x < v) a += w; else break }
  const p = a / (dist.tot[k] || 1)
  return k === 'xw' ? 1 - p : p
}
export const verdictWord = (g: number) => (g < 1 / 3 ? 'below average' : g < 2 / 3 ? 'about average' : 'above average')

export function leagueAverages(bins: ShapeBin[]) {
  let sw = 0, wh = 0, p = 0, cs = 0, bb = 0, gb = 0, xw = 0
  for (const b of bins) { sw += b.swings; wh += b.whiffs; p += b.pitches; cs += b.csw; bb += b.bbe; gb += b.gb; xw += b.xwobaConSum }
  return { whiff: sw ? wh / sw : null, csw: p ? cs / p : null, gb: bb ? gb / bb : null, xw: bb ? xw / bb : null }
}

export const SLIDER_STEP: Record<keyof Shape, number> = { velo: 0.5, ivb: 1, hb: 1, slot: 5 }
export function sliderRange(k: keyof Shape, c: Shape): [number, number] {
  return k === 'velo' ? [c.velo - 8, c.velo + 8] : k === 'slot' ? [10, 90] : [c[k] - 18, c[k] + 18]
}

/** The part of one slider where the bins have enough swings, given the other three settings: [low, high], or null when nowhere on it does. */
export function band(index: BinIndex, base: Shape, k: keyof Shape, center: Shape): [number, number] | null {
  const [lo, hi] = sliderRange(k, center)
  let mn: number | null = null, mx: number | null = null
  for (let v = lo; v <= hi + 1e-9; v += SLIDER_STEP[k]) if (lookup(index, { ...base, [k]: v }).whiff.value != null) { if (mn == null) mn = v; mx = v }
  return mn == null || mx == null ? null : [mn, mx]
}

export type Change = { metric: Metric; label: string; from: number | null; to: number | null; delta: number | null }
/** What league pitches shaped like B have produced against pitches shaped like A, per measure. delta is in the measure's own units (a share, or xwOBA). */
export function changeBetween(a: ShapeLookup, b: ShapeLookup): Change[] {
  const row = (metric: Metric, label: string, x: number | null, y: number | null): Change => ({ metric, label, from: x, to: y, delta: x == null || y == null ? null : y - x })
  return [row('whiff', 'Whiffs per swing', a.whiff.value, b.whiff.value), row('csw', 'Called + swinging strikes', a.csw.value, b.csw.value), row('gb', 'Ground balls', a.gb.value, b.gb.value), row('xw', 'Damage on contact (xwOBAcon)', a.xwobaCon.value, b.xwobaCon.value)]
}

export { typicalShape }
