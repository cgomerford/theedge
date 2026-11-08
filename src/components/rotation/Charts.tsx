'use client'

// The Rotation Lab's four charts for one pitcher: fastball speed by outing (with the first-25 and last-25 pitch speeds), pitch count coloured by rest,
// release height and arm angle. The last three starts are shaded because they are what the flags compare with everything earlier.

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, SANS } from '@/components/team/ui'
import { wmean, type StartPoint } from '@/lib/rotation/flags'

const GREY = '#8a8275'
const SHADE = '#FF572214'
const md = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

type Row = StartPoint & { i: number; label: string }
const rows = (s: StartPoint[]): Row[] => s.map((p, i) => ({ ...p, i, label: md(p.date) }))

/** Average of the earlier starts (everything but the last three), weighted by fastballs thrown. */
function baseline(s: StartPoint[], pick: (p: StartPoint) => number | null): number | null {
  return wmean(s.slice(0, -3), pick, p => p.n).mean
}

function Frame({ title, note, children, h = 220 }: { title: string; note: string; children: React.ReactNode; h?: number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange }}>{title}</div>
      <div style={{ fontFamily: SANS, fontSize: 12, color: GREY, margin: '3px 0 8px', lineHeight: 1.4 }}>{note}</div>
      <div style={{ width: '100%', height: h }}>{children}</div>
    </div>
  )
}

const axis = { fontSize: 11, fill: GREY, fontFamily: SANS }
const xAxis = (data: Row[]) => (
  <XAxis dataKey="i" type="number" domain={[0, Math.max(0, data.length - 1)]} ticks={data.length > 1 ? data.filter((_, k) => k % Math.ceil(data.length / 6) === 0 || k === data.length - 1).map(r => r.i) : [0]}
    tickFormatter={(i: number) => data[i]?.label ?? ''} tick={axis} allowDecimals={false} />
)

export function VeloChart({ series, fb }: { series: StartPoint[]; fb: 'FF' | 'SI' | null }) {
  const data = rows(series)
  const base = baseline(series, p => p.v)
  const vals = data.flatMap(r => [r.v, r.e, r.l]).filter((x): x is number => x != null)
  if (vals.length < 3) return <Frame title="Fastball speed" note="No fastball speeds to chart."><div /></Frame>
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5)
  const from = Math.max(0, data.length - 3)
  return (
    <Frame title={`${fb === 'SI' ? 'Sinker' : 'Four-seam'} speed by outing`} note="Orange is the outing average. Light line: his first 25 pitches. Dark line: his last 25. The shaded band is his last three starts.">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="#ece8de" vertical={false} />
          {xAxis(data)}
          <YAxis domain={[lo, hi]} tick={axis} width={44} tickFormatter={(v: number) => v.toFixed(0)} />
          <ReferenceArea x1={from} x2={Math.max(0, data.length - 1)} fill={SHADE} />
          {base != null && <ReferenceLine y={base} stroke={GREY} strokeDasharray="4 3" label={{ value: `earlier ${base.toFixed(1)}`, position: 'insideBottomLeft', fontSize: 10, fill: GREY }} />}
          <Tooltip formatter={(v, name) => [`${Number(v).toFixed(1)} mph`, String(name)]} labelFormatter={i => data[Number(i)] ? `${data[Number(i)].label} vs ${data[Number(i)].opp ?? ''}` : ''} contentStyle={{ fontFamily: SANS, fontSize: 12, borderRadius: 8 }} />
          <Line type="monotone" dataKey="e" name="First 25 pitches" stroke="#c9c2b2" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="l" name="Last 25 pitches" stroke="#1A1A1A" strokeWidth={1.5} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="v" name="Outing average" stroke={C.orange} strokeWidth={2.5} dot={{ r: 2.5, fill: C.orange }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  )
}

const restColour = (r: number | null) => (r == null ? '#c9c2b2' : r <= 3 ? '#D9A21B' : r === 4 ? C.good : '#4E6E8E')

export function LoadChart({ series }: { series: StartPoint[] }) {
  const data = rows(series)
  if (data.length === 0) return <Frame title="Pitch count" note="No starts to chart."><div /></Frame>
  const from = Math.max(0, data.length - 3)
  return (
    <Frame title="Pitches per outing and rest" note="Amber: 3 days of rest or fewer. Green: 4 days. Blue: 5 or more. The dashed line is 100 pitches.">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="#ece8de" vertical={false} />
          {xAxis(data)}
          <YAxis tick={axis} width={44} domain={[0, (m: number) => Math.max(110, Math.ceil(m / 10) * 10)]} />
          <ReferenceArea x1={from - 0.5} x2={data.length - 0.5} fill={SHADE} />
          <ReferenceLine y={100} stroke={GREY} strokeDasharray="4 3" />
          <Tooltip formatter={(v, _n, item) => [`${v} pitches, ${(item.payload as Row).restDays == null ? 'first outing' : `${(item.payload as Row).restDays} days of rest`}`, '']} labelFormatter={i => (data[Number(i)] ? `${data[Number(i)].label} vs ${data[Number(i)].opp ?? ''}` : '')} contentStyle={{ fontFamily: SANS, fontSize: 12, borderRadius: 8 }} />
          <Bar dataKey="pitches" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {data.map(r => <Cell key={r.i} fill={restColour(r.restDays)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  )
}

function Trend({ series, k, title, note, unit, nd }: { series: StartPoint[]; k: 'z' | 'a'; title: string; note: string; unit: string; nd: number }) {
  const data = rows(series)
  const base = baseline(series, p => p[k])
  const vals = data.map(r => r[k]).filter((x): x is number => x != null)
  if (vals.length < 3) return <Frame title={title} note="Not enough readings to chart." h={170}><div /></Frame>
  const pad = k === 'z' ? 0.15 : 3
  const from = Math.max(0, data.length - 3)
  return (
    <Frame title={title} note={note} h={170}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="#ece8de" vertical={false} />
          {xAxis(data)}
          <YAxis domain={[Math.min(...vals) - pad, Math.max(...vals) + pad]} tick={axis} width={44} tickFormatter={(v: number) => v.toFixed(nd)} />
          <ReferenceArea x1={from} x2={Math.max(0, data.length - 1)} fill={SHADE} />
          {base != null && <ReferenceLine y={base} stroke={GREY} strokeDasharray="4 3" />}
          <Tooltip formatter={v => [`${Number(v).toFixed(nd)} ${unit}`, title]} labelFormatter={i => data[Number(i)]?.label ?? ''} contentStyle={{ fontFamily: SANS, fontSize: 12, borderRadius: 8 }} />
          <Line type="monotone" dataKey={k} stroke="#1A1A1A" strokeWidth={2} dot={{ r: 2.5, fill: '#1A1A1A' }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  )
}

export const ReleaseChart = ({ series }: { series: StartPoint[] }) => <Trend series={series} k="z" title="Release height" note="Feet, on his main fastball. Dashed: earlier starts." unit="ft" nd={2} />
export const ArmChart = ({ series }: { series: StartPoint[] }) => <Trend series={series} k="a" title="Arm angle" note="Degrees, on his main fastball. Dashed: earlier starts." unit="°" nd={0} />
