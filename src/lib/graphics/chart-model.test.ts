import { describe, it, expect } from 'vitest'
import { boxStats, groupBoxes, quantile, compareStats, percentileOf, aggregate, binIndex, bubbleRadius, categoryColors, donutSlices, filterRows, groupRows, histogram, leagueSeries, seasonSeries, topRows } from './chart-model'
import type { ScatterDataset, ScatterRow } from './scatter'

const row = (name: string, v: Record<string, number | null>, c: Record<string, string> = {}): ScatterRow => ({ id: null, name, v, c })
const rows = [row('A', { hr: 40, pa: 600 }, { team: 'NYY', league: 'AL' }), row('B', { hr: 30, pa: 650 }, { team: 'NYY', league: 'AL' }), row('C', { hr: 10, pa: 500 }, { team: 'LAD', league: 'NL' }), row('D', { hr: null, pa: 100 }, { team: 'LAD', league: 'NL' })]

describe('aggregate and groups', () => {
  it('aggregates', () => {
    expect(aggregate([1, 2, 3, 10], 'sum')).toBe(16); expect(aggregate([1, 2, 3, 10], 'mean')).toBe(4); expect(aggregate([1, 2, 3, 10], 'median')).toBe(2.5)
    expect(aggregate([1, 2, 3], 'max')).toBe(3); expect(aggregate([1, 2, 3], 'min')).toBe(1); expect(aggregate([1, NaN, 3], 'count')).toBe(2); expect(aggregate([], 'mean')).toBeNaN()
  })
  it('groups by a category, skipping players with no number', () => {
    const g = groupRows(rows, 'team', 'hr', 'sum').sort((a, b) => b.value - a.value)
    expect(g).toEqual([{ label: 'NYY', value: 70, n: 2 }, { label: 'LAD', value: 10, n: 1 }])
    expect(groupRows(rows, 'league', null, 'count').find(x => x.label === 'NL')?.value).toBe(2)
  })
})

describe('top rows', () => {
  it('ranks, and keeps a named player outside the cut with his true rank', () => {
    const t = topRows(rows, 'hr', 1, 'desc', ['c'])
    expect(t.map(x => [x.name, x.rank])).toEqual([['A', 1], ['C', 3]])
    expect(topRows(rows, 'hr', 2, 'asc', []).map(x => x.name)).toEqual(['C', 'B'])
  })
})

describe('histogram', () => {
  it('bins every value once and finds the bin of a value', () => {
    const h = histogram([1, 2, 2, 3, 9, 10], 3)
    expect(h.bins.reduce((a, b) => a + b.count, 0)).toBe(6); expect(h.n).toBe(6); expect(h.median).toBe(2.5)
    expect(binIndex(h.bins, 10)).toBe(2); expect(binIndex(h.bins, 1)).toBe(0)
    expect(histogram([], 5).bins).toEqual([])
  })
})

describe('season lines', () => {
  const ds = (hr: Record<string, number | null>): ScatterDataset => ({ id: 'x', label: 'x', columns: [], cats: [], rows: Object.entries(hr).map(([n, v]) => row(n, { hr: v })) })
  const hist = new Map<number, ScatterDataset>([[2024, ds({ 'Bobby Witt Jr.': 32, B: 10 })], [2025, ds({ B: 20 })], [2026, ds({ 'Witt Jr., Bobby': 40, B: 30 })]])
  it('follows a player by name across seasons, with gaps', () => {
    const s = seasonSeries(['Bobby Witt'], hist, 'hr')[0]
    expect(s.points).toEqual([{ season: 2024, v: 32 }, { season: 2025, v: null }, { season: 2026, v: 40 }])
  })
  it('draws the league line', () => { expect(leagueSeries(hist, 'hr', 'mean').map(p => p.v)).toEqual([21, 20, 35]) })
})

describe('donut, colours, bubbles, filters', () => {
  it('keeps the biggest slices and pools the rest', () => {
    const s = donutSlices([{ label: 'a', value: 50, n: 1 }, { label: 'b', value: 30, n: 1 }, { label: 'c', value: 15, n: 1 }, { label: 'd', value: 5, n: 1 }, { label: 'neg', value: -3, n: 1 }], 2)
    expect(s.map(x => x.label)).toEqual(['a', 'b', 'Other']); expect(s.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 6); expect(s[2].value).toBe(20)
  })
  it('gives each category one colour', () => { const m = categoryColors(['NL', 'AL', 'NL']); expect(m.size).toBe(2); expect(m.get('AL')).not.toBe(m.get('NL')) })
  it('sizes bubbles by area between the limits', () => { expect(bubbleRadius(0, 0, 10)).toBe(4); expect(bubbleRadius(10, 0, 10)).toBeCloseTo(20, 6); expect(bubbleRadius(5, 5, 5)).toBe(12); expect(bubbleRadius(5, 0, 10)).toBeGreaterThan(4) })
  it('filters by minimum and group', () => {
    expect(filterRows(rows, { key: 'pa', min: 550, catKey: '', catValue: '' }).map(r => r.name)).toEqual(['A', 'B'])
    expect(filterRows(rows, { key: 'pa', min: null, catKey: 'league', catValue: 'NL' }).map(r => r.name)).toEqual(['C', 'D'])
  })
})

describe('player comparison', () => {
  it('ranks a value among a group, ties as half', () => {
    expect(percentileOf([1, 2, 3, 4], 4)).toBe(87.5); expect(percentileOf([1, 2, 3, 4], 1)).toBe(12.5); expect(percentileOf([2, 2, 2, 2], 2)).toBe(50); expect(percentileOf([], 1)).toBeNull()
  })
  it('gives each named player a number and a percentile per stat, and nulls for one who is not in the pool', () => {
    const pool = [row('A', { hr: 40 }), row('B', { hr: 30 }), row('C', { hr: 10 }), row('D', { hr: null })]
    const c = compareStats(['b', 'Nobody', 'A'], pool, [{ key: 'hr', label: 'HR', decimals: 0 }])[0]
    expect(c.values).toEqual([30, null, 40]); expect(c.pct[0]).toBeCloseTo(50, 5); expect(c.pct[1]).toBeNull(); expect(c.pct[2]).toBeCloseTo(83.3, 1)
  })
})

describe('box plots', () => {
  it('finds quartiles by interpolation', () => { expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3); expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75); expect(quantile([], 0.5)).toBeNaN() })
  it('puts far-out points beyond the whiskers', () => {
    const b = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100])!
    expect(b.median).toBe(5.5); expect(b.outliers).toEqual([100]); expect(b.hi).toBe(9); expect(b.lo).toBe(1); expect(boxStats([])).toBeNull()
  })
  it('makes one box per group, highest median first, skipping tiny groups', () => {
    const r = (n: string, g: string, x: number) => row(n, { x }, { team: g })
    const rows = [r('a', 'NYY', 1), r('b', 'NYY', 2), r('c', 'NYY', 3), r('d', 'LAD', 8), r('e', 'LAD', 9), r('f', 'LAD', 10), r('g', 'BOS', 5)]
    expect(groupBoxes(rows, 'team', 'x').map(g => g.label)).toEqual(['LAD', 'NYY'])
  })
})
