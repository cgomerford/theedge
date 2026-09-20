'use client'

// src/components/team/charts.tsx
//
// The interactive (Recharts) pieces of the team page. Everything else on the
// page is server-rendered divs/SVG — these need client state (mode toggle,
// hover tooltips), so they live in their own client file and take plain,
// already-computed props (no fetching here).
//
//   SeasonTimelineChart  one chart, four views of the same game-by-game data
//   TeamRadar            12-axis identity radar (rank → percentile)
//   Donut                small composition donut (age / hands / innings share)
//
// Responsive layout uses ResponsiveContainer + fixed heights; no Tailwind
// responsive classes (unreliable under Turbopack, per CLAUDE.md).

import { useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid,
  Radar, RadarChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import type { TimelinePoint } from '@/lib/team-profile/season'
import type { RadarAxis } from '@/lib/team-profile'
import { MONO, SANS, DISPLAY } from './ui'

const AXIS = { fontSize: 10, fontFamily: MONO, fill: '#a89e8c' }
const GRID = '#f1eee6'

type Mode = 'over500' | 'roll' | 'runs' | 'diff'
const MODES: { key: Mode; label: string; blurb: string }[] = [
  { key: 'over500', label: 'Games over .500', blurb: 'Wins minus losses after every game. Above the line = a winning record.' },
  { key: 'roll', label: '10-game win %', blurb: 'Win percentage over the previous 10 games. The dashed line is .500.' },
  { key: 'runs', label: 'Runs for / against', blurb: 'Runs scored vs allowed per game over the previous 10 games.' },
  { key: 'diff', label: 'Run differential', blurb: 'Cumulative runs scored minus runs allowed across the season.' },
]

function TimelineTip({ active, payload, mode }: { active?: boolean; payload?: { payload: TimelinePoint }[]; mode: Mode }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ background: '#1A1A1A', color: '#FAF8F3', padding: '8px 10px', fontFamily: MONO, fontSize: 11, lineHeight: 1.5, borderRadius: 8 }}>
      <div style={{ opacity: 0.6 }}>Game {p.n} · {p.date}</div>
      <div>{p.label}</div>
      <div style={{ opacity: 0.85 }}>
        {p.w}–{p.l}
        {mode === 'over500' && ` · ${p.over500 > 0 ? '+' : ''}${p.over500}`}
        {mode === 'roll' && p.rollPct != null && ` · L10 ${(p.rollPct * 100).toFixed(0)}%`}
        {mode === 'runs' && p.rollRs != null && ` · ${p.rollRs.toFixed(1)} for / ${p.rollRa?.toFixed(1)} against`}
        {mode === 'diff' && ` · run diff ${p.cumDiff > 0 ? '+' : ''}${p.cumDiff}`}
      </div>
    </div>
  )
}

export function SeasonTimelineChart({ points, color }: { points: TimelinePoint[]; color: string }) {
  const [mode, setMode] = useState<Mode>('over500')
  const active = MODES.find(m => m.key === mode)!

  // Gradient split so the area is team-colored above zero and muted below.
  const key = mode === 'diff' ? 'cumDiff' : 'over500'
  const vals = points.map(p => p[key])
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals)
  const off = max === min ? 0.5 : max / (max - min)

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {MODES.map(m => (
          <button
            key={m.key} type="button" onClick={() => setMode(m.key)}
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer',
              padding: '6px 10px', borderRadius: 8, border: `1px solid ${mode === m.key ? '#1A1A1A' : '#e7e2d8'}`,
              background: mode === m.key ? '#1A1A1A' : '#fff', color: mode === m.key ? '#FAF8F3' : '#5b5347',
            }}
          >{m.label}</button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: '#8a8275', margin: '0 0 8px', fontFamily: SANS, fontStyle: 'italic' }}>{active.blurb}</p>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          {mode === 'over500' || mode === 'diff' ? (
            <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tl-split" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor={color} stopOpacity={0.85} />
                  <stop offset={off} stopColor={color} stopOpacity={0.15} />
                  <stop offset={off} stopColor="#B23A2E" stopOpacity={0.15} />
                  <stop offset={1} stopColor="#B23A2E" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="n" tick={AXIS} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} minTickGap={28} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<TimelineTip mode={mode} />} />
              <ReferenceLine y={0} stroke="#1A1A1A" strokeDasharray="3 3" />
              <Area type="monotone" dataKey={key} stroke={color} strokeWidth={2} fill="url(#tl-split)" isAnimationActive={false} />
            </AreaChart>
          ) : mode === 'roll' ? (
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="n" tick={AXIS} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} minTickGap={28} />
              <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={v => `${Math.round(Number(v) * 100)}%`} tick={AXIS} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<TimelineTip mode={mode} />} />
              <ReferenceLine y={0.5} stroke="#1A1A1A" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="rollPct" stroke={color} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          ) : (
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="n" tick={AXIS} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} minTickGap={28} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={36} domain={['auto', 'auto']} />
              <Tooltip content={<TimelineTip mode={mode} />} />
              <Line type="monotone" dataKey="rollRs" name="Runs scored" stroke={color} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="rollRa" name="Runs allowed" stroke="#8a8275" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {mode === 'runs' && (
        <div style={{ display: 'flex', gap: 16, fontFamily: MONO, fontSize: 10, color: '#5b5347', marginTop: 6 }}>
          <span><span style={{ display: 'inline-block', width: 14, height: 3, background: color, verticalAlign: 'middle', marginRight: 5 }} />Runs scored</span>
          <span><span style={{ display: 'inline-block', width: 14, height: 0, borderTop: '2px dashed #8a8275', verticalAlign: 'middle', marginRight: 5 }} />Runs allowed</span>
        </div>
      )}
    </div>
  )
}

export function TeamRadar({ axes, color }: { axes: RadarAxis[]; color: string }) {
  const data = axes.map(a => ({ ...a, full: 100 }))
  return (
    <div style={{ height: 330 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#e7e2d8" />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 10, fontFamily: MONO, fill: '#5b5347' }} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const a = payload[0].payload as RadarAxis
              return (
                <div style={{ background: '#1A1A1A', color: '#FAF8F3', padding: '6px 9px', fontFamily: MONO, fontSize: 11, borderRadius: 8 }}>
                  {a.label}: {a.display}{a.rank != null ? ` · #${a.rank} of 30` : ''}
                </div>
              )
            }}
          />
          <Radar dataKey="pct" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.3} isAnimationActive={false} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

export type DonutSlice = { label: string; value: number; color: string }

export function Donut({ slices, center, height = 150 }: { slices: DonutSlice[]; center?: string; height?: number }) {
  const total = slices.reduce((a, s) => a + s.value, 0)
  if (total <= 0) return <p style={{ fontSize: 12, color: '#a89e8c', fontStyle: 'italic', padding: '30px 0', textAlign: 'center' }}>No data yet.</p>
  return (
    <div>
      <div style={{ height, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" strokeWidth={2} stroke="#fff" isAnimationActive={false}>
              {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Pie>
            <Tooltip formatter={(v: unknown, n: unknown) => [typeof v === 'number' ? String(v) : '—', String(n)]} />
          </PieChart>
        </ResponsiveContainer>
        {center && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontFamily: DISPLAY, fontWeight: 800, fontSize: 22, color: '#1A1A1A' }}>{center}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8, fontFamily: MONO, fontSize: 10, color: '#5b5347' }}>
        {slices.map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, display: 'inline-block' }} />{s.label} {s.value}
          </span>
        ))}
      </div>
    </div>
  )
}

export type ScatterPt = { name: string; x: number; y: number; z: number }

/** Age (x) vs a production number (y), dot size = playing time. Used in the Pro roster panel. */
// `yKind` is a plain string, NOT a formatter function — functions can't cross the
// server → client component boundary.
export function AgeScatter({ points, color, yLabel, yKind, reverseY }: { points: ScatterPt[]; color: string; yLabel: string; yKind: 'rate3' | 'dec2'; reverseY?: boolean }) {
  const yFmt = (v: number) => (yKind === 'rate3' ? v.toFixed(3).replace(/^0/, '') : v.toFixed(2))
  if (points.length === 0) return <p style={{ fontSize: 12, color: '#a89e8c', fontStyle: 'italic', textAlign: 'center', padding: '30px 0' }}>Not enough data yet.</p>
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="x" name="Age" domain={['dataMin - 1', 'dataMax + 1']} tick={AXIS} tickLine={false} axisLine={{ stroke: '#e7e2d8' }} label={{ value: 'Age', position: 'insideBottom', offset: -8, fontSize: 10, fontFamily: MONO, fill: '#a89e8c' }} />
          <YAxis type="number" dataKey="y" name={yLabel} domain={['auto', 'auto']} reversed={reverseY} tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={v => yFmt(Number(v))} />
          <ZAxis type="number" dataKey="z" range={[40, 260]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as ScatterPt
              return <div style={{ background: '#1A1A1A', color: '#FAF8F3', padding: '6px 9px', fontFamily: MONO, fontSize: 11, borderRadius: 8 }}>{p.name} · age {p.x} · {yLabel} {yFmt(p.y)}</div>
            }}
          />
          <Scatter data={points} fill={color} fillOpacity={0.7} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
