'use client'

// src/components/pitch-shape/MonthOutcomes.tsx
//
// Trend: ONE chart, many lines. Toggle any of the seven measures on or off and read them period by period
// (months, or seasons). Measures have different units, so each line is drawn on its own range (lowest period at
// the bottom, highest at the top); the tooltip shows the real number and its sample. The standout period for a
// measure is a gold dot on its line. Periods under the gates in monthStats.ts are left off, never estimated.
// Descriptions of what already happened. Source: pitch_shape_monthly.

import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, Empty, Foot } from '@/components/team/ui'
import type { PitchViewMonth } from '@/lib/pitch-shape/model'
import { MIN_N } from './pitchViewScene'
import { GATES, GOLD, METRICS, isThinWeak, periodLabel, periodValues, standout, type Metric } from './monthStats'

const COLOR: Record<Metric, string> = { whiff: '#FF5722', xw: '#1A1A1A', weak: '#1D9E75', velo: '#3B6FD4', spin: '#8A5CF6', move: '#A0722A', abs: '#8a8275' }

type Row = { label: string } & Partial<Record<Metric | `${Metric}_raw` | `${Metric}_n`, number | null>>

export default function MonthOutcomes({ periods, pitchName, unit }: { periods: PitchViewMonth[]; pitchName: string; unit: 'month' | 'season' }) {
  const [on, setOn] = useState<Set<Metric>>(new Set<Metric>(['whiff', 'xw', 'weak']))
  const lc = pitchName.toLowerCase()
  const vals = periods.map(periodValues)
  const stand = Object.fromEntries(METRICS.map(m => [m.key, standout(vals, m.key)])) as Record<Metric, { best: number | null; worst: number | null }>
  const range = (k: Metric) => {
    const xs = vals.map(v => v[k]).filter((x): x is number => x != null)
    return xs.length >= 2 ? { lo: Math.min(...xs), hi: Math.max(...xs) } : null
  }
  const rows: Row[] = periods.map((p, i) => {
    const row: Row = { label: periodLabel(p) }
    for (const m of METRICS) {
      const raw = vals[i][m.key]
      const r = range(m.key)
      row[m.key] = raw != null && r ? (r.hi === r.lo ? 50 : ((raw - r.lo) / (r.hi - r.lo)) * 100) : null
      row[`${m.key}_raw`] = raw
      row[`${m.key}_n`] = vals[i].n[m.key]
    }
    return row
  })
  const has = periods.some(m => m.nSwings != null)
  const toggle = (k: Metric) => setOn(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })

  const Tip = ({ active, label, payload }: { active?: boolean; label?: string; payload?: { payload: Row }[] }) => {
    if (!active || !payload?.length) return null
    const row = payload[0].payload
    return (
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 10px', fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,.08)' }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
        {METRICS.filter(m => on.has(m.key)).map(m => {
          const raw = row[`${m.key}_raw`]
          const idx = periods.findIndex(p => periodLabel(p) === label)
          return (
            <div key={m.key} style={{ display: 'flex', gap: 8, justifyContent: 'space-between', color: COLOR[m.key], fontVariantNumeric: 'tabular-nums' }}>
              <span>{m.title}</span>
              <b>{raw == null ? '—' : `${m.fmt(raw)}${m.unit}`}{idx >= 0 && stand[m.key].best === idx ? '' : ''}{m.key === 'weak' && idx >= 0 && raw != null && isThinWeak(periods[idx]) ? ' †' : ''} <span style={{ fontWeight: 500, color: C.faint }}>n={row[`${m.key}_n`] ?? 0}</span></b>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 22 }}>
      <div className="pv-k">Trend · did the changes help?</div>
      <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.01em', margin: '2px 0 10px', color: C.ink }}>The {lc}, {unit} by {unit}</div>
      {!has ? (
        <Empty>Results by {unit} aren’t built for this pitch yet.</Empty>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
          <div className="pv-row" style={{ marginTop: 0 }}>
            <span className="pv-k">Lines</span>
            {METRICS.map(m => {
              const ok = range(m.key) != null
              const active = on.has(m.key)
              return (
                <button key={m.key} type="button" className="pv-pill" onClick={() => toggle(m.key)} aria-pressed={active} disabled={!ok}
                  style={{ opacity: ok ? 1 : 0.45, borderColor: active ? COLOR[m.key] : undefined, background: active ? '#fff' : '#f7f4ec', color: active ? COLOR[m.key] : C.mute, fontWeight: 800 }}>
                  <i style={{ display: 'inline-block', width: 14, height: 3, borderRadius: 2, background: active ? COLOR[m.key] : C.line, marginRight: 6, verticalAlign: 'middle' }} />
                  {m.title}{m.key === 'xw' ? ' (lower = better)' : ''}
                </button>
              )
            })}
          </div>
          <div role="img" aria-label={`Trend lines for the ${lc}, ${unit} by ${unit}`} style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={C.soft} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.mute }} tickLine={false} axisLine={{ stroke: C.line }} />
                <YAxis domain={[-6, 106]} ticks={[0, 50, 100]} tickFormatter={(v: number) => (v === 0 ? 'low' : v === 100 ? 'high' : '')} tick={{ fontSize: 10, fill: C.faint }} tickLine={false} axisLine={false} width={34} />
                <Tooltip content={<Tip />} />
                {METRICS.filter(m => on.has(m.key) && range(m.key)).map(m => (
                  <Line key={m.key} type="monotone" dataKey={m.key} stroke={COLOR[m.key]} strokeWidth={2} connectNulls={false} isAnimationActive={false}
                    dot={(d: { cx?: number; cy?: number; index?: number; value?: number | null }) => {
                      if (d.cx == null || d.cy == null || d.value == null) return <g key={`${m.key}-${d.index}`} />
                      const gold = stand[m.key].best === d.index
                      return gold
                        ? <circle key={`${m.key}-${d.index}`} cx={d.cx} cy={d.cy} r={7} fill={GOLD.fill} stroke={COLOR[m.key]} strokeWidth={2} />
                        : <circle key={`${m.key}-${d.index}`} cx={d.cx} cy={d.cy} r={3.5} fill={COLOR[m.key]} stroke="#fff" strokeWidth={1.5} />
                    }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {on.size === 0 && <p className="pv-note">Turn a line on to see it.</p>}
          <p className="pv-note" style={{ fontSize: 11.5, marginBottom: 0 }}>
            Each line runs from its lowest {unit} (bottom) to its highest (top), so measures on different scales can share one chart. Hover for the real numbers and the sample behind each point. Gold dot = standout {unit} for that measure.
          </p>
        </div>
      )}
      <Foot>
        A {unit} needs {MIN_N}+ pitches, and {GATES.swings}+ swings (whiffs) or {GATES.bbe}+ balls in play (contact; {GATES.weak}+ for soft contact, a lower bar with a thinner sample, marked †), to be drawn; thinner ones are left off, not estimated. A {unit} is a small sample: read these as a description of that stretch.
      </Foot>
    </div>
  )
}
