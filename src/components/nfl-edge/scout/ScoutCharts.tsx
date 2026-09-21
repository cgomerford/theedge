'use client'

// src/components/nfl-edge/scout/ScoutCharts.tsx
//
// The Recharts pieces of the Scout Report: dual-team line trends and grouped bars. Plain-data props only.

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, MONO } from '@/components/team/ui'

const AXIS = { fontSize: 10, fontFamily: MONO, fill: '#a89e8c' }
const TIP = { fontFamily: MONO, fontSize: 11, borderRadius: 8 }

export type TrendSeries = { name: string; color: string; points: { week: number; v: number | null }[] }

export function TrendLines({ series, unit = 'EPA/play', zero = true }: { series: TrendSeries[]; unit?: string; zero?: boolean }) {
  const weeks = [...new Set(series.flatMap(s => s.points.map(p => p.week)))].sort((a, b) => a - b)
  if (weeks.length < 2) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '34px 0', margin: 0 }}>Trend lines need at least two played games.</p>
  const data = weeks.map(w => Object.fromEntries([['week', w], ...series.map(s => [s.name, s.points.find(p => p.week === w)?.v ?? null])]))
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#f1eee6" vertical={false} />
          <XAxis dataKey="week" tick={AXIS} tickFormatter={(w: number) => `Wk ${w}`} />
          <YAxis tick={AXIS} tickFormatter={(v: number) => (v >= 0 ? '+' : '') + v.toFixed(2)} />
          {zero && <ReferenceLine y={0} stroke="#1A1A1A" strokeOpacity={0.3} />}
          <Tooltip contentStyle={TIP} formatter={(v) => (v == null ? '—' : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)} ${unit}`)} />
          <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 10 }} />
          {series.map(s => <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2.4} dot={{ r: 3 }} connectNulls isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export type BarGroup = { label: string; [team: string]: number | string | null }

export function GroupedBars({ groups, teams, fmt = 'epa' }: { groups: BarGroup[]; teams: { id: string; color: string }[]; fmt?: 'epa' | 'pct' }) {
  if (!groups.length || groups.every(g => teams.every(t => g[t.id] == null))) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', textAlign: 'center', padding: '34px 0', margin: 0 }}>Not enough plays yet.</p>
  const f = (v: number) => (fmt === 'pct' ? `${(v * 100).toFixed(0)}%` : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`)
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={groups} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#f1eee6" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} />
          <YAxis tick={AXIS} tickFormatter={f} />
          {fmt === 'epa' && <ReferenceLine y={0} stroke="#1A1A1A" strokeOpacity={0.3} />}
          <Tooltip contentStyle={TIP} formatter={(v) => (v == null ? '—' : f(Number(v)))} />
          <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 10 }} />
          {teams.map(t => <Bar key={t.id} dataKey={t.id} fill={t.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
