// src/lib/pitch-shape/results-grid.ts
//
// League outcomes (wOBA, xwOBA, run value, average, slugging, whiffs) on the movement map, read on the server so the browser never receives the large 0.1-inch results table. The table (pitch_shape_results)
// is pooled over speed and arm angle, so these measures cannot be filtered by either. A grid per pitch type, hand and level is built once and kept for an hour; a spot or a lattice of spots is read from it.
// "Both" hands add cell by cell, exactly as for the whiff cells (bothHands.ts). MLB uses every season added up (the same sample as the Shape Score board); a minor-league level is its own season.
import { getResultsPayload } from '@/lib/pitch-shape/results'
import { makeResultsGrid, measuresOf, runsSaved, windowSums, type Measures, type RGrid, type Sums } from '@/lib/pitch-shape/results-math'
import { handsOf, mergeResults, type ViewHand } from '@/components/pitch-shape/bothHands'
import { HEAT_HALF } from '@/components/pitch-shape/heatGrid'
import { isMilb, type Level } from '@/lib/milb-shape/levels'
import { resolveSeason } from '@/lib/milb-shape/server'
import { limitsFor } from '@/lib/milb-shape/limits'
import { METRICS, type MetricKey } from '@/components/pitch-shape/metrics'

type Built = { at: number; grid: RGrid; league: Measures }
const cache = new Map<string, Built>()
export type CellMetric = 'woba' | 'xwoba' | 'runs' | 'avg' | 'slg'

export async function getResultsGrid(type: string, hand: ViewHand, level: Level, year?: number): Promise<Built | null> {
  const key = `${level}|${type}|${hand}|${isMilb(level) ? '' : year ?? 'all'}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit
  const season = isMilb(level) ? await resolveSeason(level, null) : undefined
  const payloads = await Promise.all(handsOf(hand).map(h => (isMilb(level) ? getResultsPayload(type, h, HEAT_HALF, 2.5, level, season) : getResultsPayload(type, h, HEAT_HALF))))
  const a = payloads[0], b = payloads[1]
  const payload = b && a ? mergeResults(a, b) : a ?? b ?? null
  if (!payload) return null
  const grid = makeResultsGrid(payload, !isMilb(level) && year ? year : 'all')
  const built = { at: Date.now(), grid, league: measuresOf(grid.total, limitsFor(level).gated) }
  cache.set(key, built)
  return built
}

/** every measure at one spot, over the pitches within +-radius inches, each null under its own sample gate */
export function measuresAt(b: Built, hb: number, ivb: number, radius: number, gated = true): Measures & { saved: number | null; sums: Sums } {
  const sums = windowSums(b.grid, Math.round(hb * 10), Math.round(ivb * 10), Math.round(radius * 10))
  const m = measuresOf(sums, gated)
  return { ...m, saved: runsSaved(m, b.league), sums }
}

/** the value of one outcome measure from a Measures, and the count behind it */
export function pick(m: Measures & { saved: number | null }, k: CellMetric): { value: number | null; n: number } {
  switch (k) {
    case 'woba': return { value: m.woba, n: m.n.pa }
    case 'xwoba': return { value: m.xwoba, n: m.n.pa }
    case 'avg': return { value: m.avg, n: m.n.ab }
    case 'slg': return { value: m.slg, n: m.n.ab }
    case 'runs': return { value: m.saved, n: m.n.rv }
  }
}
export const leagueOf = (b: Built, k: CellMetric) => pick({ ...b.league, saved: 0 }, k).value

export type MetricLattice = { n: number; values: (number | null)[]; counts: number[]; metric: CellMetric; hb0: number; ivb0: number; half: number; leagueValue: number | null }
export function metricLattice(b: Built, k: CellMetric, radius: number, centre: { hb: number; ivb: number }, step = 0.25, half = HEAT_HALF): MetricLattice {
  const n = Math.round((2 * half) / step) + 1
  const values: (number | null)[] = [], counts: number[] = []
  for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) {
    const r = pick(measuresAt(b, centre.hb - half + xx * step, centre.ivb - half + yy * step, radius), k)
    values.push(r.value == null ? null : Math.round(r.value * 10000) / 10000); counts.push(Math.round(r.n))
  }
  return { n, values, counts, metric: k, hb0: centre.hb, ivb0: centre.ivb, half, leagueValue: k === 'runs' ? 0 : leagueOf(b, k) }
}
export const cellMetricKeys = (m: MetricKey): m is CellMetric => METRICS[m].source === 'cells'
