'use client'

// src/components/stats/queryUi.tsx
//
// Shared building blocks for the two halves of /mlb/stats — "Ask the Stats"
// (StatsQueryLab) and the Player Explorer (StatsExplorer) — so both read as
// one product: same filter fields, chips, tables, CSV / PNG export and the
// Pro lock. Fonts and colours come from team/ui.tsx (Outfit is the only font).
//
// Pro rule (DESIGN_SYSTEM §5): `isPro` is a required prop on everything here
// that gates, never defaulted. Locked state shows a feature list and an
// upgrade link — no numbers, no blurred fake data.

import { useState } from 'react'
import Link from 'next/link'
import { toPng } from 'html-to-image'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, LabelList, Line, LineChart, Pie, PieChart,
  PolarAngleAxis, PolarGrid, Radar, RadarChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { C, SANS, MONO } from '@/components/team/ui'
import { ProBadge } from '@/components/profile/ProPanel'
import { CHART_TYPES, type ChartType } from '@/lib/stats-query-catalog'

// ── styles ──────────────────────────────────────────────────────────────

export const labelStyle: React.CSSProperties = {
  fontFamily: SANS, fontWeight: 700, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, marginBottom: 4,
}
export const selectStyle: React.CSSProperties = {
  fontFamily: SANS, fontSize: 14, padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 5,
  background: '#fff', color: C.ink, width: '100%',
}
export const th: React.CSSProperties = {
  textAlign: 'right', padding: '8px 10px', fontFamily: MONO, fontSize: 10, color: C.faint, fontWeight: 400,
  whiteSpace: 'nowrap', borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, background: '#fff',
}
export const td: React.CSSProperties = { textAlign: 'right', padding: '7px 10px', fontFamily: MONO, fontSize: 12, color: C.ink, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
export const tdName: React.CSSProperties = { textAlign: 'left', padding: '7px 10px', fontFamily: SANS, fontWeight: 600, fontSize: 13, color: C.ink, whiteSpace: 'nowrap' }
export const axisTick = { fontSize: 10, fontFamily: MONO, fill: C.faint }
export const tooltipStyle = { fontFamily: SANS, fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8 }

/** Responsive grids — plain CSS @media (Tailwind responsive classes are unreliable under Turbopack). */
export const QUERY_CSS = `
.ql-grid{display:grid;gap:14px;grid-template-columns:repeat(4,minmax(0,1fr))}
.ql-two{display:grid;gap:14px;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}
.ql-tiles{display:grid;gap:10px;grid-template-columns:repeat(4,minmax(0,1fr))}
.ql-scroll{overflow:auto;max-height:560px;border-radius:6px}
.ql-shell{display:grid;gap:20px;grid-template-columns:minmax(0,1fr) 300px;align-items:start}
.ql-panels{display:grid;gap:12px;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);margin-bottom:12px;align-items:start}
.ql-help-toggle{display:none}
@media (max-width:1100px){.ql-shell{grid-template-columns:minmax(0,1fr)}.ql-help-body{display:none}.ql-help-body.open{display:block}.ql-help-toggle{display:block}.ql-help-side{position:static !important;max-height:none !important}}
@media (max-width:760px){.ql-panels{grid-template-columns:minmax(0,1fr)}}
@media (max-width:900px){.ql-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ql-two{grid-template-columns:minmax(0,1fr)}.ql-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
`

// ── form bits ───────────────────────────────────────────────────────────

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'block', minWidth: 0 }}>
      <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>{label}{hint && <Hint text={hint} />}</div>
      {children}
    </div>
  )
}

/** ⓘ helper: a small button that explains a control in plain language (hover, focus or tap). */
export function Hint({ text, align = 'left' }: { text: React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="What is this?" aria-expanded={open} onClick={() => setOpen(o => !o)} onBlur={() => setOpen(false)}
        style={{ width: 15, height: 15, borderRadius: 8, border: `1px solid ${C.faint}`, background: '#fff', color: C.mute, fontFamily: SANS, fontSize: 10, fontWeight: 800, lineHeight: '12px', padding: 0, cursor: 'help' }}>i</button>
      {open && (
        <span role="tooltip" style={{
          position: 'absolute', zIndex: 40, top: 'calc(100% + 6px)', [align]: -6, width: 250, maxWidth: '72vw', background: C.ink, color: '#fff',
          padding: '8px 10px', borderRadius: 6, fontFamily: SANS, fontSize: 12, lineHeight: 1.45, boxShadow: '0 6px 18px rgba(0,0,0,.2)', textAlign: 'left',
        }}>{text}</span>
      )}
    </span>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: 5, overflow: 'hidden', background: '#fff' }}>
      {options.map(o => (
        <button
          key={o.key} type="button" onClick={() => onChange(o.key)}
          style={{
            flex: 1, padding: '8px 10px', fontFamily: SANS, fontWeight: 700, fontSize: 13, cursor: 'pointer', border: 'none',
            background: value === o.key ? C.ink : 'transparent', color: value === o.key ? '#fff' : C.mute,
          }}
        >{o.label}</button>
      ))}
    </div>
  )
}

export function Chip({ on, onClick, children, title, solid = false }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string; solid?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{
        fontFamily: SANS, fontSize: 12.5, fontWeight: on ? 800 : 600, padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
        border: `1px solid ${on ? (solid ? C.ink : C.orange) : C.line}`, background: on ? (solid ? C.ink : C.orange) : '#fff', color: on ? '#fff' : C.ink,
      }}>{children}</button>
  )
}

// ── Pro lock + exports ──────────────────────────────────────────────────

export function ProLockBar({ features }: { features: string[] }) {
  return (
    <div data-noexport="1" style={{ border: '1.5px dashed #d8d2c4', borderRadius: 8, padding: '12px 16px', background: 'rgba(255,255,255,.55)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <ProBadge />
      <span style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347', flex: 1, minWidth: 220 }}>{features.join(' · ')}</span>
      <Link href="/pricing" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', background: C.ink, color: C.cream, padding: '8px 12px', borderRadius: 8, textDecoration: 'none' }}>
        Unlock with Pro →
      </Link>
    </div>
  )
}

const smallBtn: React.CSSProperties = {
  fontFamily: SANS, fontWeight: 700, fontSize: 12, padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.line}`, background: '#fff', color: C.mute, cursor: 'pointer',
}

export function CsvButton({ isPro, filename, headers, rows }: { isPro: boolean; filename: string; headers: string[]; rows: (string | number)[][] }) {
  if (!isPro) {
    return <Link data-noexport="1" href="/pricing" style={{ ...smallBtn, textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}>Download CSV <ProBadge /></Link>
  }
  const download = () => {
    const esc = (c: string | number) => { const t = String(c); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }
  return <button data-noexport="1" type="button" onClick={download} style={smallBtn}>Download CSV</button>
}

/** Renders `node` to a PNG (2x) and downloads it. Elements marked data-noexport are left out. */
export async function exportPng(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    backgroundColor: C.cream,
    cacheBust: true,
    filter: n => !(n instanceof HTMLElement && n.dataset.noexport === '1'),
  })
  const a = document.createElement('a')
  a.href = dataUrl; a.download = filename; a.click()
}

export function PngButton({ isPro, target, filename }: { isPro: boolean; target: React.RefObject<HTMLElement | null>; filename: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  if (!isPro) {
    return <Link data-noexport="1" href="/pricing" style={{ ...smallBtn, textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}>Export PNG <ProBadge /></Link>
  }
  return (
    <button data-noexport="1" type="button" disabled={busy} style={{ ...smallBtn, background: C.ink, color: '#fff', border: `1px solid ${C.ink}` }}
      onClick={async () => {
        if (!target.current) return
        setBusy(true); setErr(false)
        try { await exportPng(target.current, filename) } catch (e) { console.error('[PngButton] export failed:', e); setErr(true) } finally { setBusy(false) }
      }}>
      {busy ? 'Rendering…' : err ? 'Export failed — retry' : 'Export PNG'}
    </button>
  )
}

// ── chart type switcher (Pro) ───────────────────────────────────────────

export function ChartTypePicker({ value, onChange }: { value: ChartType; onChange: (t: ChartType) => void }) {
  return (
    <div data-noexport="1" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ ...labelStyle, marginBottom: 0 }}>Chart</span>
      {CHART_TYPES.map(t => <Chip key={t.key} on={value === t.key} solid onClick={() => onChange(t.key)}>{t.label}</Chip>)}
    </div>
  )
}

// ── ChartPanel: one data shape, any chart type ──────────────────────────

export type ChartSeries = { key: string; name: string; color: string; dashed?: boolean; logo?: string }

/** Readable text colour (white or near-black) for a label drawn on `hex`. */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#1A1A1A' : '#fff'
}
export type ChartRow = { name: string; full?: string; [k: string]: string | number | null | undefined }
export type ScatterPoint = { name: string; x: number; y: number }

const PIE_COLORS = [C.orange, '#1D9E75', '#4C7EF3', '#FDE047', '#8a8275', C.bad, '#5FBF9B', '#9ADBC0', '#c9c2b0', '#d98a6b', '#7aa2f7', '#e0b84a', '#a89e8c', '#3a352c']

export function ChartPanel({
  type, data, series, fmt, refValue, refLabel, scatter, xLabel, yLabel, pointColor, height = 320, stacked = false, labels = true, totalKey = 'total',
}: {
  type: ChartType
  data: ChartRow[]
  series: ChartSeries[]
  fmt: (n: number) => string
  refValue?: number | null
  refLabel?: string
  scatter?: ScatterPoint[]
  xLabel?: string
  yLabel?: string
  /** colour override per row for single-series bar/pie (e.g. highlight the base year) */
  pointColor?: (row: ChartRow, i: number) => string | undefined
  height?: number
  /** stack the series (e.g. clubs summing to the league number); each row should carry a `total` for the end-of-bar label */
  stacked?: boolean
  /** data labels on bars / points (auto-hidden when there are too many to read) */
  labels?: boolean
  totalKey?: string
}) {
  if (type === 'table') {
    return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, padding: '6px 0' }}>Chart hidden — table view selected.</div>
  }
  const first = series[0]
  const fmtN = (v: unknown) => fmt(Number(v))
  const common = { data, margin: { top: 22, right: 16, left: 0, bottom: 4 } }
  const showLabels = labels && data.length <= 24
  const lbl = { fontFamily: SANS, fontSize: 10, fill: C.ink }
  const isStack = stacked && series.length > 1 && (type === 'bar' || type === 'hbar' || type === 'area')
  const horizontal = type === 'hbar'
  // Stacked-by-club legend: colour swatch + mini logo + abbreviation.
  const stackLegend = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center', fontFamily: SANS, fontSize: 11, color: C.ink, paddingTop: 6 }}>
      {series.map(sr => (
        <span key={sr.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: sr.color, display: 'inline-block' }} />
          {sr.logo && /* eslint-disable-next-line @next/next/no-img-element -- data URI logo */ <img src={sr.logo} alt="" width={14} height={14} />}
          {sr.name}
        </span>
      ))}
    </div>
  )
  const totalOf = (i: number) => Number((data[i] as Record<string, unknown> | undefined)?.[totalKey])
  // Segment content inside a stacked bar: the club's mini logo (when there is room) and its value.
  // Recharts hands label renderers loosely-typed props (numbers arrive as number | string), hence `any`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segLabelFor = (sr: ChartSeries) => (p: any) => {
    const x = Number(p.x ?? 0), y = Number(p.y ?? 0), width = Number(p.width ?? 0), height = Number(p.height ?? 0)
    const v = Number(p.value)
    if (!Number.isFinite(v) || v === 0) return null
    const ink = inkOn(sr.color)
    const roomForValue = horizontal ? width > 30 && height > 11 : height > 13 && width > 26
    const logoRoom = !!sr.logo && (horizontal ? width > 58 && height > 16 : height > 34 && width > 20)
    if (!roomForValue && !logoRoom) return null
    const cx = x + width / 2, cy = y + height / 2
    const L = 14
    return (
      <g>
        {logoRoom && (horizontal
          ? <image href={sr.logo} x={x + 5} y={cy - L / 2} width={L} height={L} />
          : <image href={sr.logo} x={cx - L / 2} y={y + 4} width={L} height={L} />)}
        {roomForValue && (
          <text x={horizontal && logoRoom ? x + 5 + L + 4 + (width - 5 - L - 4) / 2 - 5 : cx} y={logoRoom && !horizontal ? y + 4 + L + 11 : cy + 3} textAnchor="middle"
            style={{ fontFamily: SANS, fontSize: 9, fill: ink, fontWeight: 700 }}>{fmt(v)}</text>
        )}
      </g>
    )
  }
  // the whole-bar total, drawn past the end of the top-most segment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalLabel = (p: any) => {
    const x = Number(p.x ?? 0), y = Number(p.y ?? 0), width = Number(p.width ?? 0), height = Number(p.height ?? 0)
    const t = totalOf(Number(p.index ?? 0))
    if (!Number.isFinite(t)) return null
    return horizontal
      ? <text x={x + width + 5} y={y + height / 2 + 3} style={{ ...lbl, fontWeight: 800 }}>{fmt(t)}</text>
      : <text x={x + width / 2} y={y - 5} textAnchor="middle" style={{ ...lbl, fontWeight: 800 }}>{fmt(t)}</text>
  }

  let body: React.ReactElement
  if (type === 'scatter') {
    const pts = scatter ?? []
    if (pts.length < 2) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>Not enough points for a scatter plot.</div>
    body = (
      <ScatterChart margin={{ top: 10, right: 24, left: 4, bottom: 18 }}>
        <CartesianGrid stroke="#f1eee6" />
        <XAxis type="number" dataKey="x" name={xLabel} tick={axisTick} domain={['auto', 'auto']} label={{ value: xLabel, position: 'insideBottom', offset: -8, style: axisTick }} />
        <YAxis type="number" dataKey="y" name={yLabel} tick={axisTick} domain={['auto', 'auto']} width={52} label={{ value: yLabel, angle: -90, position: 'insideLeft', style: axisTick }} />
        <ZAxis range={[60, 60]} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} formatter={(v: unknown) => Number(v).toFixed(3)} labelFormatter={() => ''} />
        <Scatter data={pts} fill={C.orange}>
          {pts.length <= 40 && <LabelList dataKey="name" position="top" style={{ fontFamily: MONO, fontSize: 9, fill: C.mute }} />}
        </Scatter>
      </ScatterChart>
    )
  } else if (type === 'pie') {
    const slices = data.map(r => ({ name: r.full ?? r.name, v: Number(r[first.key]) })).filter(s => Number.isFinite(s.v) && s.v > 0).slice(0, 14)
    if (!slices.length) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>A donut needs positive values.</div>
    body = (
      <PieChart>
        <Pie data={slices} dataKey="v" nameKey="name" innerRadius="48%" outerRadius="82%" paddingAngle={1} stroke="#fff"
          label={showLabels ? ((e: { value?: unknown }) => fmt(Number(e.value))) : false}>
          {slices.map((_, i) => <Cell key={i} fill={pointColor?.(data[i], i) ?? PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [fmtN(v), String(n)]} />
        <Legend wrapperStyle={{ fontFamily: SANS, fontSize: 11 }} />
      </PieChart>
    )
  } else if (type === 'radar') {
    const pts = data.filter(r => r[first.key] != null).slice(0, 14)
    if (pts.length < 3) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>A radar needs at least 3 points.</div>
    body = (
      <RadarChart data={pts} outerRadius="75%">
        <PolarGrid stroke={C.line} />
        <PolarAngleAxis dataKey="name" tick={axisTick} />
        {series.map(s => <Radar key={s.key} name={s.name} dataKey={s.key} stroke={s.color} fill={s.color} fillOpacity={0.22} />)}
        <Tooltip contentStyle={tooltipStyle} formatter={fmtN} />
        {series.length > 1 && (isStack ? <Legend content={stackLegend} /> : <Legend wrapperStyle={{ fontFamily: SANS, fontSize: 12 }} />)}
      </RadarChart>
    )
  } else if (type === 'line' || type === 'area') {
    const Chart = type === 'line' ? LineChart : AreaChart
    body = (
      <Chart {...common}>
        <CartesianGrid vertical={false} stroke="#f1eee6" />
        <XAxis dataKey="name" tick={axisTick} interval={data.length > 16 ? 'preserveStartEnd' : 0} angle={data.length > 10 ? -30 : 0} textAnchor={data.length > 10 ? 'end' : 'middle'} height={data.length > 10 ? 56 : 30} />
        <YAxis tick={axisTick} tickFormatter={fmtN} width={52} domain={isStack ? [0, 'auto'] : ['auto', 'auto']} />
        {refValue != null && <ReferenceLine y={refValue} stroke={C.ink} strokeDasharray="4 3" label={refLabel ? { value: refLabel, style: axisTick, position: 'insideTopRight' } : undefined} />}
        <Tooltip contentStyle={tooltipStyle} formatter={fmtN} />
        {series.length > 1 && (isStack ? <Legend content={stackLegend} /> : <Legend wrapperStyle={{ fontFamily: SANS, fontSize: 12 }} />)}
        {series.map(s => type === 'line'
          ? <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={s.dashed ? 1.5 : 2.5} strokeDasharray={s.dashed ? '4 3' : undefined} dot={s.dashed ? false : { r: 3 }} connectNulls>
              {showLabels && !s.dashed && series.length <= 3 && <LabelList dataKey={s.key} position="top" formatter={fmtN} style={{ ...lbl, fill: s.color, fontWeight: 700 }} />}
            </Line>
          : <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={s.dashed ? 0.05 : isStack ? 0.7 : 0.22} strokeDasharray={s.dashed ? '4 3' : undefined} stackId={isStack ? 'a' : undefined} connectNulls>
              {showLabels && !isStack && !s.dashed && series.length <= 3 && <LabelList dataKey={s.key} position="top" formatter={fmtN} style={lbl} />}
            </Area>)}
      </Chart>
    )
  } else if (type === 'hbar') {
    body = (
      <BarChart {...common} layout="vertical" margin={{ top: 4, right: showLabels ? 56 : 28, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="#f1eee6" />
        <XAxis type="number" tick={axisTick} tickFormatter={fmtN} domain={isStack ? [0, 'auto'] : ['auto', 'auto']} />
        <YAxis type="category" dataKey="name" tick={{ ...axisTick, fontFamily: SANS, fill: C.ink }} width={118} interval={0} />
        {refValue != null && <ReferenceLine x={refValue} stroke={C.ink} strokeDasharray="4 3" />}
        <Tooltip contentStyle={tooltipStyle} formatter={fmtN} />
        {series.length > 1 && (isStack ? <Legend content={stackLegend} /> : <Legend wrapperStyle={{ fontFamily: SANS, fontSize: 12 }} />)}
        {series.map((s, si) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={isStack ? 0 : [0, 3, 3, 0]} stackId={isStack ? 'a' : undefined} stroke={isStack ? '#fff' : undefined} strokeWidth={isStack ? 1 : 0}>
            {series.length === 1 && data.map((r, i) => <Cell key={i} fill={pointColor?.(r, i) ?? s.color} />)}
            {showLabels && !isStack && series.length <= 2 && <LabelList dataKey={s.key} position="right" formatter={fmtN} style={lbl} />}
            {showLabels && isStack && <LabelList dataKey={s.key} content={segLabelFor(s)} />}
            {showLabels && isStack && si === series.length - 1 && <LabelList dataKey={s.key} content={totalLabel} />}
          </Bar>
        ))}
      </BarChart>
    )
  } else {
    body = (
      <BarChart {...common}>
        <CartesianGrid vertical={false} stroke="#f1eee6" />
        <XAxis dataKey="name" tick={axisTick} interval={0} angle={data.length > 8 ? -30 : 0} textAnchor={data.length > 8 ? 'end' : 'middle'} height={data.length > 8 ? 60 : 30} />
        <YAxis tick={axisTick} tickFormatter={fmtN} width={52} domain={isStack ? [0, 'auto'] : ['auto', 'auto']} />
        {refValue != null && <ReferenceLine y={refValue} stroke={C.ink} strokeDasharray="4 3" label={refLabel ? { value: refLabel, style: axisTick, position: 'insideTopRight' } : undefined} />}
        <Tooltip contentStyle={tooltipStyle} formatter={fmtN} />
        {series.length > 1 && (isStack ? <Legend content={stackLegend} /> : <Legend wrapperStyle={{ fontFamily: SANS, fontSize: 12 }} />)}
        {series.map((s, si) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={isStack ? 0 : [3, 3, 0, 0]} stackId={isStack ? 'a' : undefined} stroke={isStack ? '#fff' : undefined} strokeWidth={isStack ? 1 : 0}>
            {series.length === 1 && data.map((r, i) => <Cell key={i} fill={pointColor?.(r, i) ?? s.color} />)}
            {showLabels && !isStack && series.length <= 2 && <LabelList dataKey={s.key} position="top" formatter={fmtN} style={lbl} />}
            {showLabels && isStack && <LabelList dataKey={s.key} content={segLabelFor(s)} />}
            {showLabels && isStack && si === series.length - 1 && <LabelList dataKey={s.key} content={totalLabel} />}
          </Bar>
        ))}
      </BarChart>
    )
  }

  const h = type === 'hbar' ? Math.max(height, data.length * 24 + 40) : height
  return <div style={{ height: h }}><ResponsiveContainer width="100%" height="100%">{body}</ResponsiveContainer></div>
}

// ── grouping: labelled panels + connected segmented bar ─────────────────

/** A labelled control group: header strip with a title (and optional right-hand actions), body below. */
export function Panel({ title, step, hint, right, children, style }: { title: string; step?: string; hint?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', minWidth: 0, ...style }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 12px', background: C.soft, borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink }}>
          {step && <span style={{ color: C.orange, marginRight: 6 }}>{step}</span>}{title}
          {hint && <span style={{ marginLeft: 8 }}><Hint text={hint} /></span>}
        </span>
        {right && <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>{right}</span>}
      </header>
      <div style={{ padding: 12 }}>{children}</div>
    </section>
  )
}

/** Options as one connected bar of equal cells (hairline dividers) instead of loose floating buttons. */
export function SegBar<T extends string>({ value, options, onChange, dense = false }: {
  value: T
  options: { key: T; label: string; title?: string; mark?: boolean }[]
  onChange: (v: T) => void
  dense?: boolean
}) {
  return (
    <div role="group" style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: C.line, border: `1px solid ${C.line}`, borderRadius: 5, overflow: 'hidden' }}>
      {options.map(o => {
        const on = o.key === value
        return (
          <button key={o.key} type="button" title={o.title} onClick={() => onChange(o.key)}
            style={{
              flex: '1 0 auto', fontFamily: SANS, fontWeight: on ? 800 : 600, fontSize: dense ? 12 : 12.5, padding: dense ? '6px 10px' : '8px 12px', cursor: 'pointer', border: 'none',
              background: on ? C.ink : '#fff', color: on ? '#fff' : C.mute, whiteSpace: 'nowrap',
            }}>{o.label}{o.mark ? ' •' : ''}</button>
        )
      })}
    </div>
  )
}

/**
 * A collapsible panel. Closed, it still tells you what is chosen (`summary`), so a lot of controls can sit on
 * the page without all of them being on screen at once.
 */
export function Disclosure({ title, step, summary, hint, defaultOpen = false, right, children, style }: {
  title: string; step?: string; summary?: React.ReactNode; hint?: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode
  children: React.ReactNode; style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, minWidth: 0, ...style }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', background: open ? C.soft : '#fff', borderRadius: open ? '8px 8px 0 0' : 8, borderBottom: open ? `1px solid ${C.line}` : 'none' }}>
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
          style={{ all: 'unset', cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', minWidth: 0 }}>
          <span aria-hidden style={{ color: C.orange, fontSize: 11, width: 10 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink, whiteSpace: 'nowrap' }}>
            {step && <span style={{ color: C.orange, marginRight: 6 }}>{step}</span>}{title}
          </span>
          {!open && summary && <span style={{ fontFamily: SANS, fontSize: 12.5, color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{summary}</span>}
        </button>
        {hint && <Hint text={hint} align="right" />}
        {right}
      </header>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </section>
  )
}
