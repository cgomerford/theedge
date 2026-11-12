// src/components/pitch-shape/metrics.ts
//
// The measures the Pitch Shape Lab can colour its map by and report for a spot, in one place so the map, the legend, the readout and the server agree. Client-safe, no data.
//   source 'bins'   comes from the 2-inch league bins (speed x shape x arm angle), so it works with the speed and arm-angle filters and is built on the server
//   source 'cells'  comes from the 0.1-inch league outcomes (pitch_shape_results), which are pooled over speed and arm angle, so it is not available with those filters
//   source 'both'   whiffs per swing: the full-detail map for no filter, the bins with a filter
// ONE colour rule for every measure: red is better for the pitcher and blue is worse. Whiffs: more misses is red. wOBA, average, slugging and hard contact: lower is red. So a map always reads the same way
// whatever it is coloured by, and the legend says what red and blue mean for the measure chosen. Each measure has a fixed scale (lo to hi) so a colour always means the same value.
import { HEAT_LO, HEAT_HI, heatRgbAt } from './heatGrid'

export type MetricKey = 'whiff' | 'csw' | 'woba' | 'xwoba' | 'runs' | 'avg' | 'slg' | 'hardhit' | 'gb' | 'xwobacon'
export type MetricDef = {
  key: MetricKey
  label: string
  short: string
  source: 'bins' | 'cells' | 'both'
  /** true when a higher number is better for the pitcher */
  betterHigh: boolean
  /** the value at the blue end and at the red end of the scale is derived from these two: lo is the smaller number, hi the larger */
  lo: number; hi: number
  /** marks labelled on the legend, in the measure's own numbers */
  ticks: number[]
  fmt: (v: number) => string
  /** what is counted behind the rate, for "n" labels */
  per: string
  /** minimum count behind a value before it is shown */
  min: number
  explain: string
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const w3 = (v: number) => v.toFixed(3).replace(/^0/, '').replace(/^-0/, '-')
const runs = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`

export const METRICS: Record<MetricKey, MetricDef> = {
  whiff:    { key: 'whiff', label: 'Swings and misses (whiffs per swing)', short: 'Whiffs per swing', source: 'both', betterHigh: true, lo: HEAT_LO, hi: HEAT_HI, ticks: [0.05, 0.10, 0.15, 0.20, 0.26], fmt: pct, per: 'swings', min: 40, explain: 'Share of swings that miss the ball.' },
  csw:      { key: 'csw', label: 'Called strikes plus whiffs (per pitch)', short: 'Called strikes + whiffs', source: 'bins', betterHigh: true, lo: 0.18, hi: 0.36, ticks: [0.18, 0.22, 0.27, 0.32, 0.36], fmt: pct, per: 'pitches', min: 150, explain: 'Share of all pitches that are called strikes or swings and misses.' },
  woba:     { key: 'woba', label: 'wOBA against', short: 'wOBA', source: 'cells', betterHigh: false, lo: 0.24, hi: 0.42, ticks: [0.24, 0.28, 0.32, 0.36, 0.42], fmt: w3, per: 'plate appearances', min: 100, explain: 'Weighted on-base average of the plate appearances these pitches ended. Lower is better for the pitcher.' },
  xwoba:    { key: 'xwoba', label: 'xwOBA against (expected)', short: 'xwOBA', source: 'cells', betterHigh: false, lo: 0.25, hi: 0.41, ticks: [0.25, 0.29, 0.33, 0.37, 0.41], fmt: w3, per: 'plate appearances', min: 100, explain: 'Expected wOBA from the quality of contact (and walks and strikeouts as they happened). Lower is better for the pitcher.' },
  runs:     { key: 'runs', label: 'Runs saved per 100 pitches', short: 'Runs saved per 100', source: 'cells', betterHigh: true, lo: -1.5, hi: 1.5, ticks: [-1.5, -0.75, 0, 0.75, 1.5], fmt: runs, per: 'pitches', min: 300, explain: 'How many fewer runs per 100 pitches than the league average for this pitch type. Higher is better for the pitcher.' },
  avg:      { key: 'avg', label: 'Batting average against', short: 'Average', source: 'cells', betterHigh: false, lo: 0.16, hi: 0.32, ticks: [0.16, 0.20, 0.24, 0.28, 0.32], fmt: w3, per: 'at-bats', min: 100, explain: 'Hits per at-bat these pitches ended. Lower is better for the pitcher.' },
  slg:      { key: 'slg', label: 'Slugging against', short: 'Slugging', source: 'cells', betterHigh: false, lo: 0.25, hi: 0.55, ticks: [0.25, 0.33, 0.40, 0.47, 0.55], fmt: w3, per: 'at-bats', min: 100, explain: 'Total bases per at-bat these pitches ended. Lower is better for the pitcher.' },
  hardhit:  { key: 'hardhit', label: 'Hard-hit rate (95+ mph, per ball in play)', short: 'Hard-hit rate', source: 'bins', betterHigh: false, lo: 0.28, hi: 0.52, ticks: [0.28, 0.34, 0.40, 0.46, 0.52], fmt: pct, per: 'balls in play', min: 40, explain: 'Share of balls in play hit 95 mph or harder. Lower is better for the pitcher.' },
  gb:       { key: 'gb', label: 'Ground-ball rate (per ball in play)', short: 'Ground-ball rate', source: 'bins', betterHigh: true, lo: 0.20, hi: 0.55, ticks: [0.20, 0.29, 0.38, 0.46, 0.55], fmt: pct, per: 'balls in play', min: 40, explain: 'Share of balls in play that are ground balls. Higher is better for the pitcher.' },
  xwobacon: { key: 'xwobacon', label: 'xwOBA on contact', short: 'xwOBA on contact', source: 'bins', betterHigh: false, lo: 0.30, hi: 0.44, ticks: [0.30, 0.34, 0.37, 0.40, 0.44], fmt: w3, per: 'balls in play', min: 40, explain: 'Expected wOBA of the balls in play only. Lower is better for the pitcher.' },
}
export const METRIC_ORDER: MetricKey[] = ['whiff', 'csw', 'woba', 'xwoba', 'runs', 'avg', 'slg', 'hardhit', 'gb', 'xwobacon']
/** measures built from the 2-inch bins, so they work with a speed or arm-angle filter */
export const BIN_METRICS: MetricKey[] = ['whiff', 'csw', 'hardhit', 'gb', 'xwobacon']
/** measures that exist only as 0.1-inch outcomes pooled over speed and arm angle */
export const CELL_METRICS: MetricKey[] = ['woba', 'xwoba', 'runs', 'avg', 'slg']

/** the same measure coloured by its number instead of by who it favours: the higher number is red and the lower number blue, whatever the measure (so for wOBA, average and slugging, red is where hitters did more damage) */
export const numberDef = (m: MetricDef): MetricDef => (m.betterHigh ? m : { ...m, betterHigh: true })

/** position along the blue-to-red gradient (0 = blue, 1 = red) for a value: red is always better for the pitcher */
export function metricPos(m: MetricDef, v: number): number {
  const t0 = (v - m.lo) / (m.hi - m.lo)
  if (!Number.isFinite(t0)) return 0.5   // a missing or non-numeric value takes the pale middle rather than breaking the map
  const t = Math.max(0, Math.min(1, t0))
  return m.betterHigh ? t : 1 - t
}
export const metricRgb = (m: MetricDef, v: number) => heatRgbAt(metricPos(m, v))

/**
 * A copy of a measure's scale stretched over what THIS pitch actually does, so the colours spread from blue to red instead of the whole map landing in one end (a sweeper misses far more bats than the
 * fastball the fixed scale was set on). The ends are the 5th and 95th percentile of the values on the map, weighted by the swings (or pitches) behind each, rounded to a tidy step; the marks are five
 * evenly spaced values between them. Returns the fixed scale unchanged when there are too few values or they barely vary, so a thin map is never stretched into noise.
 */
export function scaledDef(def: MetricDef, pairs: [number, number][]): MetricDef {
  const pts = pairs.filter(([v, w]) => Number.isFinite(v) && w > 0).sort((a, b) => a[0] - b[0])
  if (pts.length < 40) return def
  const tot = pts.reduce((a, p) => a + p[1], 0)
  const q = (p: number) => { let c = 0; for (const [v, w] of pts) { c += w; if (c >= p * tot) return v } return pts[pts.length - 1][0] }
  const lo0 = q(0.05), hi0 = q(0.95)
  if (!(hi0 - lo0 > (def.hi - def.lo) * 0.2)) return def
  const raw = (hi0 - lo0) / 16, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag
  const step = mag * (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10)
  const lo = Math.floor(lo0 / step) * step, hi = Math.ceil(hi0 / step) * step
  const ticks = [0, 1, 2, 3, 4].map(i => lo + ((hi - lo) * i) / 4)
  return { ...def, lo, hi, ticks }
}
