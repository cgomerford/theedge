// src/lib/graphics/chart-model.ts
//
// Pure logic for the admin chart builder's non-scatter charts: bars (players or groups), histograms, season lines, donuts and tables.
// Nothing here fetches or draws; src/lib/graphics/scatter.ts has names, ticks, formatting and the scatter helpers.

import { nameKey, type ScatterDataset, type ScatterRow } from './scatter'

export type ChartType = 'scatter' | 'bubble' | 'bar' | 'column' | 'histogram' | 'box' | 'line' | 'donut' | 'table' | 'compare' | 'radar'
export const CHART_TYPES: { id: ChartType; label: string; blurb: string }[] = [
  { id: 'scatter', label: 'Scatter', blurb: 'Every player on two stats' },
  { id: 'bubble', label: 'Bubble', blurb: 'Scatter with dot size from a third stat' },
  { id: 'bar', label: 'Bar (sideways)', blurb: 'Leaders on one stat, or groups such as teams' },
  { id: 'column', label: 'Column', blurb: 'The same, standing up' },
  { id: 'histogram', label: 'Histogram', blurb: 'How one stat is distributed across the league' },
  { id: 'box', label: 'Box plot by group', blurb: 'How one stat is distributed within each team, league or position' },
  { id: 'line', label: 'Line over seasons', blurb: 'Follow players on one stat, year by year' },
  { id: 'donut', label: 'Donut', blurb: 'Share of a total by team, league or position' },
  { id: 'table', label: 'Table', blurb: 'Leaders with several stats side by side' },
  { id: 'compare', label: 'Compare players', blurb: 'Chosen players side by side across many stats' },
  { id: 'radar', label: 'Radar', blurb: 'Chosen players as shapes across 3 to 10 stats' },
]

export type Agg = 'sum' | 'mean' | 'median' | 'max' | 'min' | 'count'
export const AGGS: { id: Agg; label: string }[] = [{ id: 'sum', label: 'Total' }, { id: 'mean', label: 'Average' }, { id: 'median', label: 'Median' }, { id: 'max', label: 'Highest' }, { id: 'min', label: 'Lowest' }, { id: 'count', label: 'Number of players' }]

/** Brand orange first, then colours that stay apart on the cream paper. */
export const PALETTE = ['#FF5722', '#1A1A1A', '#1D9E75', '#3B82C4', '#E8B400', '#8A5FBF', '#D4533B', '#5B5347', '#17A2B8', '#C2185B', '#7CB342', '#8A8275']

export function aggregate(vals: number[], agg: Agg): number {
  const v = vals.filter(Number.isFinite)
  if (agg === 'count') return v.length
  if (!v.length) return NaN
  if (agg === 'sum') return v.reduce((a, b) => a + b, 0)
  if (agg === 'mean') return v.reduce((a, b) => a + b, 0) / v.length
  if (agg === 'max') return Math.max(...v)
  if (agg === 'min') return Math.min(...v)
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export type Group = { label: string; value: number; n: number }
/** One bar per category value (team, league, position...). With no stat the bar is the head count. Empty categories are left out. */
export function groupRows(rows: ScatterRow[], catKey: string, valueKey: string | null, agg: Agg): Group[] {
  const by = new Map<string, number[]>()
  for (const r of rows) {
    const g = r.c[catKey]; if (!g) continue
    const arr = by.get(g) ?? []
    if (valueKey == null) arr.push(1)
    else { const x = r.v[valueKey]; if (x != null) arr.push(x) }
    by.set(g, arr)
  }
  return [...by.entries()].map(([label, vals]) => ({ label, value: valueKey == null ? vals.length : aggregate(vals, agg), n: vals.length })).filter(g => Number.isFinite(g.value))
}

export type Ranked = { name: string; value: number; row: ScatterRow; rank: number }
/** The n highest (or lowest) players on one stat, plus any named players who fall outside the cut, each keeping their true rank. */
export function topRows(rows: ScatterRow[], key: string, n: number, dir: 'desc' | 'asc', include: string[]): Ranked[] {
  const all = rows.flatMap(r => { const v = r.v[key]; return v != null ? [{ name: r.name, value: v, row: r }] : [] })
  all.sort((a, b) => (dir === 'desc' ? b.value - a.value : a.value - b.value) || a.name.localeCompare(b.name))
  const ranked = all.map((x, i) => ({ ...x, rank: i + 1 }))
  const keep = new Set(include.map(nameKey))
  const head = ranked.slice(0, Math.max(0, n))
  const extra = ranked.slice(Math.max(0, n)).filter(x => keep.has(nameKey(x.name)))
  return [...head, ...extra]
}

export type Bin = { lo: number; hi: number; count: number }
export function histogram(values: number[], bins: number): { bins: Bin[]; mean: number; median: number; n: number } {
  const v = values.filter(Number.isFinite)
  if (!v.length) return { bins: [], mean: NaN, median: NaN, n: 0 }
  const lo = Math.min(...v), hi = Math.max(...v)
  const k = Math.max(2, Math.min(60, Math.round(bins)))
  const w = (hi - lo || 1) / k
  const out: Bin[] = Array.from({ length: k }, (_, i) => ({ lo: lo + i * w, hi: lo + (i + 1) * w, count: 0 }))
  for (const x of v) out[Math.min(k - 1, Math.floor((x - lo) / w))].count++
  return { bins: out, mean: aggregate(v, 'mean'), median: aggregate(v, 'median'), n: v.length }
}
/** Index of the bin a value falls in (the last bin includes the maximum). */
export function binIndex(bins: Bin[], x: number): number {
  if (!bins.length) return -1
  for (let i = 0; i < bins.length; i++) if (x < bins[i].hi) return i
  return bins.length - 1
}

export type Series = { name: string; points: { season: number; v: number | null }[] }
/** One line per named player: that player's number on the stat in each loaded season (null where he has none). */
export function seasonSeries(names: string[], history: Map<number, ScatterDataset>, key: string): Series[] {
  const seasons = [...history.keys()].sort((a, b) => a - b)
  return names.map(n => {
    const k = nameKey(n)
    return { name: n, points: seasons.map(season => ({ season, v: history.get(season)?.rows.find(r => nameKey(r.name) === k)?.v[key] ?? null })) }
  })
}
/** The league line: one number per season across every row that has the stat. */
export function leagueSeries(history: Map<number, ScatterDataset>, key: string, agg: Agg): { season: number; v: number | null }[] {
  return [...history.keys()].sort((a, b) => a - b).map(season => {
    const vals = (history.get(season)?.rows ?? []).flatMap(r => (r.v[key] != null ? [r.v[key] as number] : []))
    return { season, v: vals.length ? aggregate(vals, agg) : null }
  })
}

export type Slice = { label: string; value: number; share: number }
/** Largest slices first; everything past `max` joins one "Other" slice. Negative totals cannot be a share, so they are dropped. */
export function donutSlices(groups: Group[], max: number): Slice[] {
  const g = groups.filter(x => x.value > 0).sort((a, b) => b.value - a.value)
  const total = g.reduce((a, b) => a + b.value, 0)
  if (!total) return []
  const head = g.slice(0, Math.max(1, max)), tail = g.slice(Math.max(1, max))
  const out = head.map(x => ({ label: x.label, value: x.value, share: x.value / total }))
  const rest = tail.reduce((a, b) => a + b.value, 0)
  if (rest > 0) out.push({ label: 'Other', value: rest, share: rest / total })
  return out
}

/** A stable colour for each category value, in the order they are first seen sorted. */
export function categoryColors(values: string[]): Map<string, string> {
  const u = [...new Set(values)].sort()
  // Brand orange is kept for the players the editor names, so group colours start after it.
  return new Map(u.map((v, i) => [v, PALETTE[(i + 1) % PALETTE.length]]))
}

/** Dot radius from a third stat: area grows with the value, between rMin and rMax. */
export function bubbleRadius(v: number, lo: number, hi: number, rMin = 4, rMax = 20): number {
  if (!(hi > lo)) return (rMin + rMax) / 2
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
  return Math.sqrt(rMin * rMin + t * (rMax * rMax - rMin * rMin))
}

/** Rows that pass a minimum on one stat and, if set, belong to one group value. */
export function filterRows(rows: ScatterRow[], f: { key: string; min: number | null; catKey: string; catValue: string }): ScatterRow[] {
  return rows.filter(r => (f.min == null || (r.v[f.key] ?? -Infinity) >= f.min) && (!f.catKey || !f.catValue || r.c[f.catKey] === f.catValue))
}

/** Where a value ranks among a group: the share (0 to 100) of the group below it, counting ties as half. null when the group is empty. */
export function percentileOf(values: number[], v: number): number | null {
  const g = values.filter(Number.isFinite)
  if (!g.length) return null
  const below = g.filter(x => x < v).length, same = g.filter(x => x === v).length
  return Math.round(((below + same / 2) / g.length) * 1000) / 10
}

export type CompareStat = { key: string; label: string; decimals: number; values: (number | null)[]; pct: (number | null)[] }
/** For each stat, each named player's number and his percentile among everyone in `pool`. Players are found by name in `source` (default: the pool); one not found gets nulls. */
export function compareStats(players: string[], pool: ScatterRow[], stats: { key: string; label: string; decimals: number }[], source: ScatterRow[] = pool): CompareStat[] {
  const rows = players.map(n => source.find(r => nameKey(r.name) === nameKey(n)))
  return stats.map(s => {
    const all = pool.flatMap(r => (r.v[s.key] != null ? [r.v[s.key] as number] : []))
    const values = rows.map(r => r?.v[s.key] ?? null)
    return { ...s, values, pct: values.map(v => (v == null ? null : percentileOf(all, v))) }
  })
}

/** The p-th quantile (0 to 1) of an already sorted list, by linear interpolation. */
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}
export type BoxStats = { n: number; q1: number; median: number; q3: number; lo: number; hi: number; outliers: number[] }
/** Quartiles with Tukey whiskers: the whiskers reach the furthest points within 1.5 box-lengths of the box; anything beyond is an outlier dot. */
export function boxStats(values: number[]): BoxStats | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const q1 = quantile(v, 0.25), median = quantile(v, 0.5), q3 = quantile(v, 0.75), iqr = q3 - q1
  const inside = v.filter(x => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr)
  return { n: v.length, q1, median, q3, lo: inside[0] ?? v[0], hi: inside[inside.length - 1] ?? v[v.length - 1], outliers: v.filter(x => x < q1 - 1.5 * iqr || x > q3 + 1.5 * iqr) }
}
export type BoxGroup = { label: string; stats: BoxStats }
/** One box per category value, highest median first. Groups with fewer than `minN` players are left out. */
export function groupBoxes(rows: ScatterRow[], catKey: string, valueKey: string, minN = 3): BoxGroup[] {
  const by = new Map<string, number[]>()
  for (const r of rows) { const g = r.c[catKey], x = r.v[valueKey]; if (g && x != null) (by.get(g) ?? by.set(g, []).get(g)!).push(x) }
  return [...by.entries()].flatMap(([label, v]) => { const st = v.length >= minN ? boxStats(v) : null; return st ? [{ label, stats: st }] : [] }).sort((a, b) => b.stats.median - a.stats.median)
}
