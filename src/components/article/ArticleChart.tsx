'use client'

// src/components/article/ArticleChart.tsx
//
// The data chart block of an article, drawn the same way in the public article, the admin preview and the Insert chart dialog. Recharts, x9Lab house style: paper #FAF8F3, ink #1A1A1A, orange #FF5722, a second series in
// ink at 60%, never red and green. One font (Red Hat Display, as everywhere on the site; numbers use tabular figures). Value labels on every bar and point, a zero line when anything is negative, a small x9Lab wordmark at the
// bottom right, and no data-source name on the chart (the source field is kept in the stored block only). A single-series bar chart with negatives colours bars orange above zero and ink below.
// Accessible: the plot is hidden from screen readers, the figure carries the alt text, and a visually hidden table lists every value. Shape ratio is 16:9, and 4:5 on phones.

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { decimalsFor, formatValue, niceAxis, type ChartBlock } from '@/lib/article-chart'

const PAPER = '#FAF8F3', INK = '#1A1A1A', ORANGE = '#FF5722', INK60 = 'rgba(26, 26, 26, 0.6)', GRID = '#e7e2d8', MUTE = '#5b5347'
const SANS = 'var(--font-redhat), system-ui, sans-serif'
const seriesColour = (i: number) => (i === 0 ? ORANGE : INK60)

const hidden: React.CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }

export default function ArticleChart({ chart }: { chart: ChartBlock }) {
  const { type, title, labels, series, yUnit, caption, alt } = chart
  const unit = (yUnit ?? '').trim()
  const rows = labels.map((label, i) => ({ label, ...Object.fromEntries(series.map((s, j) => [`s${j}`, s.values[i]])) })) as Record<string, string | number>[]
  const all = series.flatMap(s => s.values).filter(Number.isFinite)
  const hasNeg = all.some(v => v < 0), allNonNeg = all.every(v => v >= 0)
  const single = series.length === 1
  const signed = single && hasNeg   // a single series that crosses zero shows + and − on its labels
  const axis = niceAxis(all, { zeroFloor: type === 'line' || allNonNeg })
  const dec = decimalsFor(all)
  const tick = { fontFamily: SANS, fontSize: 12.5, fontWeight: 700, fill: INK, fontVariantNumeric: 'tabular-nums' } as const
  const axisTick = { ...tick, fill: MUTE, fontWeight: 600 }

  // a value label above a positive bar or point and below a negative one
  const label = (colourOf: (i: number) => string) => function ValueLabel(p: { x?: number; y?: number; width?: number; height?: number; value?: number; index?: number }) {
    const { x = 0, y = 0, width = 0, height = 0, value, index = 0 } = p
    if (value == null || !Number.isFinite(value)) return null
    const top = Math.min(y, y + height), bottom = Math.max(y, y + height)
    const isLine = type === 'line'
    const cy = isLine ? y : value >= 0 ? top - 7 : bottom + 15
    const cx = isLine ? x : x + width / 2
    return <text x={cx} y={isLine ? y - 12 : cy} textAnchor="middle" style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, fill: colourOf(index), fontVariantNumeric: 'tabular-nums' }}>{formatValue(value, unit, signed, dec)}</text>
  }

  return (
    <figure className="x9-chart" aria-label={alt} style={{ margin: '1.8em 0', background: PAPER, border: `1px solid ${GRID}`, borderRadius: 6, padding: '18px 20px 12px', fontFamily: SANS, color: INK }}>
      <style>{'.x9c-plot{aspect-ratio:16/9;width:100%}@media(max-width:600px){.x9c-plot{aspect-ratio:4/5}}'}</style>
      <div style={{ fontSize: 'clamp(17px, 2.2vw, 21px)', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{title}</div>
      {unit && unit !== '%' && <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTE, marginTop: 2 }}>Values in {unit}</div>}
      {series.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', margin: '10px 0 0', fontSize: 13, fontWeight: 700 }}>
          {series.map((s, i) => <span key={s.name + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i aria-hidden style={{ width: 12, height: 12, borderRadius: 2, background: seriesColour(i), display: 'inline-block' }} />{s.name}</span>)}
        </div>
      )}
      <div className="x9c-plot" aria-hidden="true" style={{ marginTop: 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === 'line' ? (
            <LineChart data={rows} margin={{ top: 26, right: 22, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={{ stroke: INK }} tickLine={false} padding={{ left: 30, right: 30 }} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={[axis.min, axis.max]} ticks={axis.ticks} width={46} tickFormatter={(v: number) => formatValue(v, unit)} />
              {hasNeg && <ReferenceLine y={0} stroke={INK} strokeWidth={1.5} />}
              {series.map((s, j) => (
                <Line key={s.name + j} type="linear" dataKey={`s${j}`} stroke={seriesColour(j)} strokeWidth={3} dot={{ r: 5, fill: seriesColour(j), stroke: PAPER, strokeWidth: 2 }} activeDot={false} isAnimationActive={false}>
                  <LabelList dataKey={`s${j}`} content={label(() => (j === 0 ? INK : MUTE)) as never} />
                </Line>
              ))}
            </LineChart>
          ) : (
            <BarChart data={rows} margin={{ top: 26, right: 12, bottom: 4, left: 0 }} barGap={4} barCategoryGap="22%">
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} domain={[axis.min, axis.max]} ticks={axis.ticks} width={46} tickFormatter={(v: number) => formatValue(v, unit)} />
              <ReferenceLine y={0} stroke={INK} strokeWidth={hasNeg ? 2 : 1.25} />
              {series.map((s, j) => (
                <Bar key={s.name + j} dataKey={`s${j}`} fill={seriesColour(j)} isAnimationActive={false} radius={[2, 2, 2, 2]}>
                  {single && hasNeg && s.values.map((v, i) => <Cell key={i} fill={v < 0 ? INK : ORANGE} />)}
                  <LabelList dataKey={`s${j}`} content={label(() => INK) as never} />
                </Bar>
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
        {caption ? <figcaption style={{ fontSize: 13.5, lineHeight: 1.45, color: MUTE, margin: 0 }}>{caption}</figcaption> : <span />}
        <span aria-hidden style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em', color: INK, whiteSpace: 'nowrap' }}>x9<span style={{ color: ORANGE }}>Lab</span></span>
      </div>
      <table style={hidden}>
        <caption>{title}</caption>
        <thead><tr><th>Label</th>{series.map((s, i) => <th key={i}>{s.name}{unit ? ` (${unit})` : ''}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={i}><th>{l}</th>{series.map((s, j) => <td key={j}>{s.values[i]}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  )
}
