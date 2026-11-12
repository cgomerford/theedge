// src/lib/article-chart.ts
//
// The article chart block: its stored shape, the parser for the [CHART: ...] marker an author can paste or leave in a draft, the validation the insert dialog shows, and the finder the "Convert all chart markers"
// action uses. Pure functions with no React or Tiptap import, so the writer, the public renderer and the tests all share them.
//
// Marker format:  [CHART: <type> | <title> | labels: a, b, c | <series> = v1, v2, v3; <series2> = v1, v2, v3 | series: name1, name2]
//   optional segments: unit: mph | caption: text | alt: text
//   a single unnamed entry ("values = 1, 2, 3") takes its name from the series: segment.

export type ChartType = 'bar' | 'line'

export interface ChartSeries { name: string; values: number[] }

export interface ChartBlock {
  type: ChartType
  title: string
  labels: string[]
  series: ChartSeries[]
  /** shown on axes and value labels where it reads as a unit: %, mph, runs */
  yUnit?: string
  /** kept for internal records and never drawn on the chart */
  source?: string
  /** shown under the chart */
  caption?: string
  /** required: what the chart shows, for readers who cannot see it */
  alt: string
}

export const EMPTY_CHART: ChartBlock = { type: 'bar', title: '', labels: [], series: [{ name: '', values: [] }], yUnit: '', source: '', caption: '', alt: '' }

const num = (s: string): number => Number(s.trim().replace(/%$/, '').replace(/^\+/, '').replace(/−/g, '-'))
const split = (s: string) => s.split(',').map(x => x.trim()).filter(x => x !== '')

export type MarkerResult = { ok: true; block: ChartBlock } | { ok: false; error: string }

/** Parses one [CHART: ...] marker. Never throws: an unreadable marker returns an error and the text is left alone by the caller. */
export function parseChartMarker(raw: string): MarkerResult {
  const text = raw.trim()
  const m = /^\[\s*CHART\s*:\s*([\s\S]*)\]$/i.exec(text)
  if (!m) return { ok: false, error: 'Not a [CHART: ...] marker.' }
  const parts = m[1].split('|').map(p => p.trim())
  if (parts.length < 4) return { ok: false, error: 'Expected: type | title | labels: ... | series data.' }
  const type: ChartType = /line/i.test(parts[0]) ? 'line' : /bar|column/i.test(parts[0]) ? 'bar' : (null as unknown as ChartType)
  if (!type) return { ok: false, error: `Unknown chart type "${parts[0]}": use bar or line.` }
  const title = parts[1]
  let labels: string[] = [], seriesNames: string[] = [], unit = '', caption = '', alt = ''
  const dataParts: string[] = []
  for (const p of parts.slice(2)) {
    let k: RegExpExecArray | null
    if ((k = /^labels\s*:\s*([\s\S]*)$/i.exec(p))) labels = split(k[1])
    else if ((k = /^series\s*:\s*([\s\S]*)$/i.exec(p))) seriesNames = split(k[1])
    else if ((k = /^(?:unit|yunit)\s*:\s*([\s\S]*)$/i.exec(p))) unit = k[1].trim()
    else if ((k = /^caption\s*:\s*([\s\S]*)$/i.exec(p))) caption = k[1].trim()
    else if ((k = /^alt\s*:\s*([\s\S]*)$/i.exec(p))) alt = k[1].trim()
    else if (p.includes('=')) dataParts.push(p)
  }
  if (!labels.length) return { ok: false, error: 'Missing labels: a, b, c.' }
  const entries = dataParts.join(';').split(';').map(e => e.trim()).filter(Boolean)
  if (!entries.length) return { ok: false, error: 'Missing series data (name = 1, 2, 3).' }
  const series: ChartSeries[] = []
  for (let i = 0; i < entries.length; i++) {
    const eq = entries[i].indexOf('=')
    if (eq < 0) return { ok: false, error: `Series entry "${entries[i]}" needs name = values.` }
    const rawName = entries[i].slice(0, eq).trim()
    const values = split(entries[i].slice(eq + 1)).map(num)
    // a lone unnamed entry (values = ...) takes the name given after series:
    const unnamed = /^(values?|data)$/i.test(rawName) || rawName === ''
    const name = unnamed ? (seriesNames[i] ?? seriesNames[0] ?? 'Series') : rawName
    series.push({ name, values })
  }
  const block: ChartBlock = { type, title, labels, series, yUnit: unit, source: '', caption, alt }
  return { ok: true, block }
}

/** Inline errors for the dialog: every series needs one number per label, and the chart needs a title, labels and alt text. */
export function validateChart(b: ChartBlock): string[] {
  const errs: string[] = []
  if (!b.title.trim()) errs.push('Give the chart a title.')
  if (b.labels.length === 0) errs.push('Include at least one label.')
  if (b.series.length === 0) errs.push('Include at least one series.')
  b.series.forEach((s, i) => {
    const n = s.name.trim() || `Series ${i + 1}`
    if (!s.name.trim()) errs.push(`${n}: give the series a name.`)
    if (s.values.length !== b.labels.length) errs.push(`${n}: ${s.values.length} values but ${b.labels.length} labels. They must match.`)
    if (s.values.some(v => !Number.isFinite(v))) errs.push(`${n}: every figure must be a number (negatives and decimals are fine).`)
  })
  if (!b.alt.trim()) errs.push('Include alt text describing the chart.')
  if (/—/.test([b.title, b.caption ?? '', b.alt, ...b.labels, ...b.series.map(s => s.name)].join(' '))) errs.push('Avoid em dashes in chart text.')
  return errs
}

/** A plain-language default for alt text when a marker carries none: the chart type, its title, and every series with its values. */
export function autoAlt(b: ChartBlock): string {
  const kind = b.type === 'line' ? 'Line chart' : b.series.length > 1 ? 'Grouped bar chart' : 'Bar chart'
  const data = b.series.map(s => `${s.name}: ${b.labels.map((l, i) => `${l} ${s.values[i] ?? ''}`).join(', ')}`).join('. ')
  return `${kind}: ${b.title}. ${data}.`
}

/** The most decimal places any value in the chart needs, up to two: so 44.6 and 16 print as 44.6 and 16.0 together, and ERA 5.1 prints as 5.10 beside 4.92. */
export function decimalsFor(values: number[]): number {
  let d = 0
  for (const v of values) { if (!Number.isFinite(v)) continue; const r = Math.round(v * 100) / 100; for (let k = 0; k <= 2; k++) { if (Math.abs(r * 10 ** k - Math.round(r * 10 ** k)) < 1e-9) { d = Math.max(d, k); break } } }
  return d
}

/** A tidy value axis: a round step (1, 2, 2.5, 5 times a power of ten), the range widened to whole steps with room above for the value labels, zero kept in view, and the tick values. */
export function niceAxis(values: number[], opts: { zeroFloor?: boolean } = {}): { min: number; max: number; ticks: number[] } {
  const vs = values.filter(Number.isFinite)
  const lo = Math.min(0, ...vs)
  let hi = Math.max(0, ...vs)
  if (hi === lo) hi = lo + 1
  const pad = (hi - lo) * 0.14
  const top = hi > 0 ? hi + pad : hi, bottom = lo < 0 ? lo - pad : lo
  const raw = (top - bottom) / 5
  const mag = 10 ** Math.floor(Math.log10(raw))
  // the smallest round step (1, 2, 2.5, 5 or 10 times a power of ten) that covers the range in five steps or fewer
  const step = [1, 2, 2.5, 5, 10, 20, 25, 50].map(m => m * mag).find(st => Math.ceil((top - bottom) / st) <= 5) ?? mag * 10
  const min = opts.zeroFloor && lo >= 0 ? 0 : Math.floor(bottom / step) * step
  const max = Math.ceil(top / step) * step
  const ticks: number[] = []
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6)
  return { min, max, ticks }
}

/** "2.64" or "-11": the text of a value with its unit where the unit reads as a suffix (percent) or is shown on the axis (mph, runs). `decimals` fixes the places so a column of values lines up. */
export function formatValue(v: number, unit?: string, sign = false, decimals?: number): string {
  const t = decimals != null ? v.toFixed(decimals) : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
  const s = sign && v > 0 ? `+${t}` : t.replace('-', '−')
  return unit === '%' ? `${s}%` : s
}

export interface MarkerHit { index: number; text: string; result: MarkerResult }
interface DocNodeLike { type: string; content?: DocNodeLike[]; text?: string }

/** Every top-level paragraph that is exactly one [CHART: ...] marker, with its position in the body and what it parses to. */
export function findChartMarkers(doc: { content?: unknown[] }): MarkerHit[] {
  const out: MarkerHit[] = []
  ;(doc.content ?? []).forEach((n, index) => {
    const node = n as DocNodeLike
    if (node.type !== 'paragraph') return
    const text = (node.content ?? []).map(c => c.text ?? '').join('').trim()
    if (/^\[\s*CHART\s*:/i.test(text)) out.push({ index, text, result: parseChartMarker(text) })
  })
  return out
}

/** The text of a chart block for the word count and the checks: title, labels and series names (the caption and alt text are read from the node's attributes like every other block's). */
export function chartText(a: Record<string, unknown>): string {
  const labels = Array.isArray(a.labels) ? (a.labels as string[]).join(' ') : ''
  const series = Array.isArray(a.series) ? (a.series as { name?: string }[]).map(s => s.name ?? '').join(' ') : ''
  return [a.title, labels, series].filter(x => typeof x === 'string' && x).join('\n')
}
