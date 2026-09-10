// src/components/nfl/NflQbWeeklyRibbon.tsx
// FULL REPLACEMENT — fixes the area fill to shade ONLY the gap between
// the two lines (stacked transparent base + visible gap segment),
// instead of incorrectly filling from zero up to the intended line.

'use client'

import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { QbNgsWeeklyPoint } from '@/lib/nfl/queries'

export default function NflQbWeeklyRibbon({ weekly, playerName, season }: { weekly: QbNgsWeeklyPoint[]; playerName: string; season: number }) {
  if (weekly.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No weekly NGS data yet for this player.</div>
      </div>
    )
  }

  // Precompute the stacked-area inputs: a transparent base up to the
  // lower of the two lines, then a visible "gap" segment on top sized
  // to exactly reach the higher line. Since completed is (almost)
  // always <= intended in this data, base = completed and gap =
  // intended - completed; guarded with Math.max(0, ...) in case a week
  // has completed > intended (a real possibility with a small sample).
  const chartData = weekly.map((w) => {
    const intended = w.intendedAirYards
    const completed = w.completedAirYards
    const base = intended != null && completed != null ? Math.min(intended, completed) : null
    const gap = intended != null && completed != null ? Math.abs(intended - completed) : null
    return { ...w, base, gap }
  })

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: '20px 24px' }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, textAlign: 'center', color: '#1A1A1A', marginBottom: 2 }}>
        {playerName}, {season} — Intended vs Completed Air Yards
      </div>
      <div style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 12, textAlign: 'center', color: '#78716C', marginBottom: 16 }}>
        Shaded gap is that week's differential — the wider it gets, the more the deep shots weren't landing.
      </div>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700 }}>
          <span style={{ width: 18, height: 3, background: '#1A1A1A', display: 'inline-block' }} /> Intended AY
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700 }}>
          <span style={{ width: 18, height: 3, background: '#FF5722', display: 'inline-block' }} /> Completed AY
        </span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="rgba(26,26,26,0.06)" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={{ stroke: 'rgba(26,26,26,0.2)' }} tickLine={false} label={{ value: 'Week', position: 'insideBottom', offset: -4, fontSize: 10, fill: '#78716C' }} />
          <YAxis tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={false} tickLine={false} width={36} domain={['dataMin - 1', 'dataMax + 1']} />
          <Tooltip
            contentStyle={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", borderRadius: 4 }}
            formatter={(value: any, name: any) => {
              if (name === 'base' || name === 'gap') return [null, null] // suppress the stacking helpers from the tooltip
              return [typeof value === 'number' ? `${value.toFixed(1)} yds` : '—', name]
            }}
          />

          {/* Invisible base, stacked, just to push the visible gap segment up to the right starting point */}
          <Area type="monotone" dataKey="base" stackId="gap" stroke="none" fill="transparent" name="base" legendType="none" isAnimationActive={false} />
          <Area type="monotone" dataKey="gap" stackId="gap" stroke="none" fill="#78716C" fillOpacity={0.15} name="gap" legendType="none" isAnimationActive={false} />

          <Line type="monotone" dataKey="intendedAirYards" name="Intended AY" stroke="#1A1A1A" strokeWidth={2.5} dot={{ r: 3.5, fill: '#1A1A1A' }} connectNulls />
          <Line type="monotone" dataKey="completedAirYards" name="Completed AY" stroke="#FF5722" strokeWidth={2.5} dot={{ r: 3.5, fill: '#FF5722' }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}