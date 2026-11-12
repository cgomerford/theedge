// src/lib/pitch-shape/filtered-heat.ts
//
// The league shape map restricted to a speed range and an arm-angle range, plus the maths for "who is above or below the league rate at this shape". Pure functions on the league bins
// (pitch_shape_bins: speed 1 mph x ride 2 in x run 2 in x arm angle 10 degrees, with swings and whiffs). The full 0.1-inch map cannot be filtered by speed or arm angle (it is pooled over both),
// so a filtered map is built from the 2-inch groups instead: each group is spread evenly over its own 2-inch square and blurred with a Gaussian, and each point on a quarter-inch lattice reads the blurred result, so the picture is smooth (no square edges) but coarser than the full map.
// Nothing is estimated: a point with under 40 swings in reach is blank. Run is arm-side positive (left-handers flipped), as everywhere in the lab.
import { BIN_WIDTH, type ShapeBin } from '@/lib/pitch-shape/model'
import { METRICS, type MetricKey } from '@/components/pitch-shape/metrics'

export type BinFilter = {
  /** speed range in mph, both ends included */
  vMin: number; vMax: number
  /** arm angle range in degrees: groups from aMin up to (not including) aMax, in steps of 10 */
  aMin: number; aMax: number
}
export const NO_FILTER: BinFilter = { vMin: 0, vMax: 200, aMin: 0, aMax: 100 }
export const MIN_SWINGS_IN_REACH = 40
/** the measures the 2-inch bins can build: each is a count over a count */
export type BinMetric = 'whiff' | 'csw' | 'hardhit' | 'gb' | 'xwobacon'
export const LATTICE_STEP = 0.25  // inches between points on the filtered map
export const LATTICE_HALF = 12    // inches either side of the centre

export const passes = (b: ShapeBin, f: BinFilter) => b.veloBin >= f.vMin && b.veloBin <= f.vMax && b.slotBin * BIN_WIDTH.slot >= f.aMin && b.slotBin * BIN_WIDTH.slot < f.aMax

/** spread of the blur, in inches, for a window choice of +-r: groups are 2 in wide, so it is wider than the full map's window */
export const sigmaFor = (radius: number) => 0.8 + 0.3 * radius   // 0.95, 1.1 and 1.4 in: measured against the full-detail map over every box with 150+ swings, 1.1 in is 1.8 points off on average (1.5 in was 2.2)

// the normal curve's cumulative share, by the Abramowitz and Stegun polynomial for erf (error under 1.5e-7)
const erf = (x: number) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y }
const Phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2))

export type FilteredHeat = {
  n: number
  /** whiffs per swing at each lattice point (row 0 = lowest ride), null where under the swing minimum */
  rates: (number | null)[]
  /** the (blurred) count behind each point: swings for whiffs, pitches for called strikes + whiffs, balls in play for the contact measures */
  counts: number[]
  metric: BinMetric
  hb0: number; ivb0: number; half: number
  /** every pitch, swing and whiff that passes the filter */
  total: { pitches: number; swings: number; whiffs: number }
  /** the measure over every pitch that passes the filter: what a spot is set against */
  leagueValue: number | null
}

/** the pitch-weighted mean shape of the bins (run, ride), to the nearest half inch: the centre every map of a type is drawn around so it does not jump when a filter moves */
export function centreOf(bins: ShapeBin[]): { hb: number; ivb: number } {
  let n = 0, h = 0, v = 0
  for (const b of bins) { n += b.pitches; h += b.pitches * b.hbBin * BIN_WIDTH.hb; v += b.pitches * b.ivbBin * BIN_WIDTH.ivb }
  return n > 0 ? { hb: Math.round((h / n) * 2) / 2, ivb: Math.round((v / n) * 2) / 2 } : { hb: 0, ivb: 0 }
}

type Cell = { s: number; w: number; p: number; c: number; b: number; x: number; h: number; g: number }
/** numerator and denominator of a measure from one group: whiffs per swing, called strikes + whiffs per pitch, hard hits / ground balls / expected wOBA per ball in play */
const numDen = (c: Cell, m: BinMetric): [number, number] => m === 'whiff' ? [c.w, c.s] : m === 'csw' ? [c.c, c.p] : m === 'hardhit' ? [c.h, c.b] : m === 'gb' ? [c.g, c.b] : [c.x, c.b]
const minDen = (m: BinMetric) => METRICS[m].min
/** 2-inch groups after the filter, keyed by their grid position */
function gridOf(bins: ShapeBin[], f: BinFilter) {
  const g = new Map<number, Cell>()
  const total = { pitches: 0, swings: 0, whiffs: 0 }
  for (const b of bins) {
    if (!passes(b, f)) continue
    const k = b.hbBin * 1000 + b.ivbBin
    const c = g.get(k) ?? { s: 0, w: 0, p: 0, c: 0, b: 0, x: 0, h: 0, g: 0 }
    c.s += b.swings; c.w += b.whiffs; c.p += b.pitches; c.c += b.csw; c.b += b.bbe; c.x += b.xwobaConSum; c.h += b.hardHit; c.g += b.gb
    g.set(k, c)
    total.pitches += b.pitches; total.swings += b.swings; total.whiffs += b.whiffs
  }
  return { g, total }
}

/**
 * the measure (whiffs per swing unless another is asked for) at one point, and the (blurred) count behind it (swings, pitches or balls in play). Each 2-inch group is treated as an even spread over its own square and blurred with a Gaussian of spread `sigma`, so a point
 * reads a share of every group around it by how much of that group's square the blur covers. rate is null under the swing minimum.
 */
function at(g: Map<number, Cell>, hb: number, ivb: number, sigma: number, metric: BinMetric = 'whiff'): { rate: number | null; swings: number } {
  const reach = 3 * sigma + 1
  let S = 0, W = 0
  for (let ix = Math.ceil((hb - reach) / BIN_WIDTH.hb); ix <= Math.floor((hb + reach) / BIN_WIDTH.hb); ix++) {
    const wx = Phi((ix * BIN_WIDTH.hb + BIN_WIDTH.hb / 2 - hb) / sigma) - Phi((ix * BIN_WIDTH.hb - BIN_WIDTH.hb / 2 - hb) / sigma)
    if (wx <= 1e-6) continue
    for (let iy = Math.ceil((ivb - reach) / BIN_WIDTH.ivb); iy <= Math.floor((ivb + reach) / BIN_WIDTH.ivb); iy++) {
      const c = g.get(ix * 1000 + iy)
      if (!c) continue
      const w = wx * (Phi((iy * BIN_WIDTH.ivb + BIN_WIDTH.ivb / 2 - ivb) / sigma) - Phi((iy * BIN_WIDTH.ivb - BIN_WIDTH.ivb / 2 - ivb) / sigma))
      const [nu, de] = numDen(c, metric)
      S += w * de; W += w * nu
    }
  }
  return { rate: S >= minDen(metric) && S > 0 ? W / S : null, swings: S }
}

/** the filtered league rate at one spot: the benchmark a pitcher at that shape is held against */
export function rateAt(bins: ShapeBin[], f: BinFilter, radius: number, hb: number, ivb: number, metric: BinMetric = 'whiff') {
  return at(gridOf(bins, f).g, hb, ivb, sigmaFor(radius), metric)
}

export function filteredHeat(bins: ShapeBin[], f: BinFilter, radius: number, centre: { hb: number; ivb: number }, metric: BinMetric = 'whiff'): FilteredHeat {
  const { g, total } = gridOf(bins, f)
  const sigma = sigmaFor(radius)
  const n = Math.round((2 * LATTICE_HALF) / LATTICE_STEP) + 1
  const rates: (number | null)[] = [], counts: number[] = []
  for (let yy = 0; yy < n; yy++) {
    for (let xx = 0; xx < n; xx++) {
      const r = at(g, centre.hb - LATTICE_HALF + xx * LATTICE_STEP, centre.ivb - LATTICE_HALF + yy * LATTICE_STEP, sigma, metric)
      rates.push(r.rate == null ? null : Math.round(r.rate * 10000) / 10000)
      counts.push(Math.round(r.swings))
    }
  }
  let nu = 0, de = 0
  for (const c of g.values()) { const [a, b] = numDen(c, metric); nu += a; de += b }
  return { n, rates, counts, metric, hb0: centre.hb, ivb0: centre.ivb, half: LATTICE_HALF, total, leagueValue: de >= minDen(metric) ? nu / de : null }
}

export type BinSummary = {
  /** speed range worth offering (mph): the lowest and highest speeds that hold the middle 99.6% of pitches */
  vLo: number; vHi: number
  /** pitches at each mph from vLo to vHi */
  veloHist: number[]
  /** pitches in each 10-degree arm-angle band, 0-10 up to 90-100 */
  slotHist: number[]
  /** false when the cohort carries no arm angle (everything is in one band), so the arm-angle filter is not offered */
  hasArm: boolean
  /** speed below which 25% / 75% of the pitches fall */
  q25: number; q75: number
}

export function binSummary(bins: ShapeBin[]): BinSummary {
  const byV = new Map<number, number>(), slots = new Array(10).fill(0)
  let total = 0
  for (const b of bins) { byV.set(b.veloBin, (byV.get(b.veloBin) ?? 0) + b.pitches); slots[Math.max(0, Math.min(9, b.slotBin))] += b.pitches; total += b.pitches }
  const speeds = [...byV.keys()].sort((a, b) => a - b)
  if (!speeds.length || total <= 0) return { vLo: 0, vHi: 0, veloHist: [], slotHist: slots, hasArm: false, q25: 0, q75: 0 }
  const quantile = (q: number) => { let c = 0; for (const v of speeds) { c += byV.get(v)!; if (c >= q * total) return v } return speeds[speeds.length - 1] }
  const vLo = quantile(0.002), vHi = quantile(0.998)
  const veloHist = Array.from({ length: vHi - vLo + 1 }, (_, i) => byV.get(vLo + i) ?? 0)
  const bandsUsed = slots.filter(x => x > 0).length
  return { vLo, vHi, veloHist, slotHist: slots, hasArm: bandsUsed > 1, q25: quantile(0.25), q75: quantile(0.75) }
}

/** what the sliders are built from, plus the centre shape every map of the type is drawn around */
export type ShapeSummary = BinSummary & { centre: { hb: number; ivb: number } }
export const summaryOf = (bins: ShapeBin[]): ShapeSummary => ({ ...binSummary(bins), centre: centreOf(bins) })

// ---- pitchers against the league rate at a shape ----

export type PitcherRate = { whiffs: number; swings: number }
export type Standing = 'below' | 'at' | 'above'

/** where a pitcher's own whiffs per swing stands against the league rate at his shape, by how many standard errors of his own sample it is away: 1 or more below / above, else at */
export function standing(p: PitcherRate, leagueRate: number): { standing: Standing; diff: number; z: number } {
  const rate = p.swings > 0 ? p.whiffs / p.swings : 0
  const se = Math.sqrt(Math.max(leagueRate * (1 - leagueRate), 1e-9) / Math.max(p.swings, 1))
  const z = (rate - leagueRate) / se
  return { standing: z <= -1 ? 'below' : z >= 1 ? 'above' : 'at', diff: rate - leagueRate, z }
}

export type BinCounts = { pitches: number; swings: number; whiffs: number; csw: number; bbe: number; xwobaConSum: number; hardHit: number; gb: number }
const zeroCounts = (): BinCounts => ({ pitches: 0, swings: 0, whiffs: 0, csw: 0, bbe: 0, xwobaConSum: 0, hardHit: 0, gb: 0 })
const addCounts = (a: BinCounts, b: ShapeBin) => { a.pitches += b.pitches; a.swings += b.swings; a.whiffs += b.whiffs; a.csw += b.csw; a.bbe += b.bbe; a.xwobaConSum += b.xwobaConSum; a.hardHit += b.hardHit; a.gb += b.gb }

/** the raw counts of every pitch that passes the filter, in total and in the square window of half-width `windowIn` around a spot (a group is in when its centre is) */
export function countsAround(bins: ShapeBin[], f: BinFilter, hb: number, ivb: number, windowIn: number): { win: BinCounts; all: BinCounts } {
  const win = zeroCounts(), all = zeroCounts()
  for (const b of bins) {
    if (!passes(b, f)) continue
    addCounts(all, b)
    if (Math.abs(b.hbBin * BIN_WIDTH.hb - hb) <= windowIn && Math.abs(b.ivbBin * BIN_WIDTH.ivb - ivb) <= windowIn) addCounts(win, b)
  }
  return { win, all }
}
/** numerator and denominator of a bin measure from raw counts */
export const countsNumDen = (c: BinCounts, m: BinMetric): [number, number] => m === 'whiff' ? [c.whiffs, c.swings] : m === 'csw' ? [c.csw, c.pitches] : m === 'hardhit' ? [c.hardHit, c.bbe] : m === 'gb' ? [c.gb, c.bbe] : [c.xwobaConSum, c.bbe]
