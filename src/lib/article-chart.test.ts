import { describe, it, expect } from 'vitest'
import { parseChartMarker, validateChart, findChartMarkers, autoAlt, formatValue, niceAxis, decimalsFor } from './article-chart'
import { ROGERS_CHARTS, fillFromFixtures } from './article-chart-fixtures'

const M1 = '[CHART: bar | Trevor Rogers: ERA vs xERA by season | labels: 2021, 2024, 2025, 2026 | ERA = 2.64, 4.92, 1.81, 4.03; xERA = 3.35, 5.10, 3.41, 3.60 | series: ERA, xERA]'
const M2 = "[CHART: line | Rogers' four-seam to changeup speed gap (mph) | labels: 2021, 2024, 2025, 2026 | values = 9.7, 6.4, 6.8, 6.8 | series: Speed gap]"
const M3 = "[CHART: bar | Rogers' changeup run value by season (runs) | labels: 2021, 2024, 2025, 2026 | values = 6, -4, 7, -11 | series: Changeup run value]"
const M4 = "[CHART: bar | Rogers' 2026 pitch mix: through July vs Aug-Sep (%) | labels: Four-seam, Changeup, Sweeper, Sinker, Cutter | Through July = 44.6, 22.8, 12.8, 10.1, 9.8; Aug-Sep = 51.5, 16.0, 16.8, 10.0, 5.6 | series: Through July, Aug-Sep]"

describe('parseChartMarker', () => {
  it('parses a grouped bar marker with two named series', () => {
    const r = parseChartMarker(M1)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.block.type).toBe('bar')
      expect(r.block.title).toBe('Trevor Rogers: ERA vs xERA by season')
      expect(r.block.labels).toEqual(['2021', '2024', '2025', '2026'])
      expect(r.block.series).toEqual([{ name: 'ERA', values: [2.64, 4.92, 1.81, 4.03] }, { name: 'xERA', values: [3.35, 5.1, 3.41, 3.6] }])
    }
  })
  it('takes the name of a lone unnamed entry from the series segment', () => {
    const r = parseChartMarker(M2)
    expect(r.ok && r.block.type).toBe('line')
    expect(r.ok && r.block.series).toEqual([{ name: 'Speed gap', values: [9.7, 6.4, 6.8, 6.8] }])
  })
  it('accepts negative numbers', () => {
    const r = parseChartMarker(M3)
    expect(r.ok && r.block.series[0].values).toEqual([6, -4, 7, -11])
  })
  it('splits series on semicolons and keeps text segments that contain colons', () => {
    const r = parseChartMarker(M4)
    expect(r.ok && r.block.series.map(s => s.name)).toEqual(['Through July', 'Aug-Sep'])
    expect(r.ok && r.block.labels).toHaveLength(5)
  })
  it('reads optional unit, caption and alt segments', () => {
    const r = parseChartMarker('[CHART: line | T | labels: a, b | values = 1, 2 | series: S | unit: mph | caption: C | alt: A]')
    expect(r.ok && [r.block.yUnit, r.block.caption, r.block.alt]).toEqual(['mph', 'C', 'A'])
  })
  it('returns an error and never throws on an unreadable marker', () => {
    expect(parseChartMarker('[CHART: pie | T | labels: a | v = 1]').ok).toBe(false)
    expect(parseChartMarker('[CHART: bar | T]').ok).toBe(false)
    expect(parseChartMarker('just text').ok).toBe(false)
  })
})

describe('validateChart', () => {
  it('passes the four Rogers charts', () => { for (const c of ROGERS_CHARTS) expect(validateChart(c)).toEqual([]) })
  it('flags a series whose length differs from the labels, non-numbers, missing alt and em dashes', () => {
    const e = validateChart({ type: 'bar', title: 'T', labels: ['a', 'b'], series: [{ name: 'S', values: [1] }, { name: 'U', values: [1, NaN] }], alt: '' })
    expect(e.join(' ')).toMatch(/1 values but 2 labels/)
    expect(e.join(' ')).toMatch(/must be a number/)
    expect(e.join(' ')).toMatch(/alt text/)
    expect(validateChart({ type: 'bar', title: 'A — B', labels: ['a'], series: [{ name: 'S', values: [1] }], alt: 'x' }).join(' ')).toMatch(/em dash/)
  })
})

describe('findChartMarkers and the Rogers fixtures', () => {
  const doc = { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] }, { type: 'paragraph', content: [{ type: 'text', text: M1 }] }, { type: 'paragraph', content: [{ type: 'text', text: '[CHART: broken' }] }] }
  it('finds markers by position and keeps an unreadable one as an error', () => {
    const hits = findChartMarkers(doc)
    expect(hits.map(h => h.index)).toEqual([1, 2])
    expect(hits[0].result.ok).toBe(true)
    expect(hits[1].result.ok).toBe(false)
  })
  it('fills the unit, caption and alt for a marker whose title matches a Rogers chart, and keeps the values', () => {
    for (const [i, m] of [M1, M2, M3, M4].entries()) {
      const r = parseChartMarker(m)
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      const b = fillFromFixtures(r.block)
      expect(b.series).toEqual(ROGERS_CHARTS[i].series)
      expect(b.labels).toEqual(ROGERS_CHARTS[i].labels)
      expect(b.alt).toBe(ROGERS_CHARTS[i].alt)
      expect(b.caption).toBe(ROGERS_CHARTS[i].caption)
      expect(b.yUnit).toBe(ROGERS_CHARTS[i].yUnit)
      expect(validateChart(b)).toEqual([])
    }
  })
  it('writes a default alt text and formats values', () => {
    expect(autoAlt(ROGERS_CHARTS[2])).toMatch(/Bar chart: Rogers' changeup run value/)
    expect(formatValue(-11, 'runs', true)).toBe('−11')
    expect(formatValue(6, 'runs', true)).toBe('+6')
    expect(formatValue(44.6, '%')).toBe('44.6%')
  })
})

describe('axis and decimals', () => {
  it('gives round ticks that cover the data with room above, and keeps zero in view', () => {
    const a = niceAxis([2.64, 4.92, 1.81, 4.03, 3.35, 5.1, 3.41, 3.6], { zeroFloor: true })
    expect(a.min).toBe(0)
    expect(a.max).toBeGreaterThan(5.1)
    expect(a.ticks.every(t => Math.abs(t * 100 - Math.round(t * 100)) < 1e-6)).toBe(true)
    const n = niceAxis([6, -4, 7, -11])
    expect(n.min).toBeLessThanOrEqual(-11)
    expect(n.max).toBeGreaterThanOrEqual(7)
    expect(n.ticks).toContain(0)
  })
  it('prints one column of values with the same number of decimals', () => {
    expect(decimalsFor([44.6, 22.8, 16.0, 10.0])).toBe(1)
    expect(decimalsFor([2.64, 5.1])).toBe(2)
    expect(decimalsFor([6, -4])).toBe(0)
    expect(formatValue(16, '%', false, 1)).toBe('16.0%')
  })
})
