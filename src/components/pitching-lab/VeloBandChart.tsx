'use client'

// src/components/pitching-lab/VeloBandChart.tsx
//
// Velo per pitch over the last 8 starts — a fade shows up per pitch type
// here, not just blended into one overall number. Moved onto the Arsenal
// tab (below the pitch-mix donut) since that's where usage/mix context
// already lives; same real per-pitch log as everywhere else in this app.

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { pitchColor } from '@/lib/mlb'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'

const SEASON = new Date().getFullYear()
const AXIS_TICK = { fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }
const NO_ANIM = { isAnimationActive: false } as const

function shortDate(d: string): string {
  const parts = d.split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d
}

// Real least-squares linear fit over the real per-start averages (x =
// start index, y = avg velo) — only the fitted value at the first and
// last real data point is returned so a <Line dataKey> can overlay it as
// a straight segment on this chart's categorical (date) x-axis via
// connectNulls, same real-trend technique already used for the
// single-game velo scatter (EdgePlusGameCard.tsx's linearTrend()).
function linearTrendAtEnds(values: (number | null)[]): (number | null)[] {
  const points = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null)
  const out: (number | null)[] = values.map(() => null)
  if (points.length < 2) return out
  const n = points.length
  const sumX = points.reduce((s, p) => s + p.i, 0)
  const sumY = points.reduce((s, p) => s + p.v, 0)
  const sumXY = points.reduce((s, p) => s + p.i * p.v, 0)
  const sumXX = points.reduce((s, p) => s + p.i * p.i, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return out
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const first = points[0].i, last = points[points.length - 1].i
  out[first] = Math.round((slope * first + intercept) * 10) / 10
  out[last] = Math.round((slope * last + intercept) * 10) / 10
  return out
}

export default function VeloBandChart({ pitcherId }: { pitcherId: number }) {
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [pitcherId])

  const topPitches = useMemo(() => {
    if (!log || log === 'error') return []
    const counts = new Map<string, number>()
    for (const p of log.pitches) counts.set(p.pitchType, (counts.get(p.pitchType) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pt]) => pt)
  }, [log])

  const veloByStartData = useMemo(() => {
    if (!log || log === 'error') return []
    const dates = [...new Set(log.pitches.map(p => p.date))].sort()
    const last8 = dates.slice(-8)
    const byDatePitch = new Map<string, Map<string, { sum: number; n: number }>>()
    for (const p of log.pitches) {
      if (!last8.includes(p.date) || p.velo == null || !topPitches.includes(p.pitchType)) continue
      if (!byDatePitch.has(p.date)) byDatePitch.set(p.date, new Map())
      const m = byDatePitch.get(p.date)!
      if (!m.has(p.pitchType)) m.set(p.pitchType, { sum: 0, n: 0 })
      const e = m.get(p.pitchType)!
      e.sum += p.velo; e.n++
    }
    const rows = last8.map(date => {
      const row: Record<string, string | number | null> = { date: shortDate(date), fullDate: date }
      const m = byDatePitch.get(date)
      for (const pt of topPitches) row[pt] = m?.get(pt) ? Math.round((m.get(pt)!.sum / m.get(pt)!.n) * 10) / 10 : null
      return row
    })
    // Real linear trend per pitch, overlaid as its own sparse series (only
    // the fitted first/last values are set) so it draws as a straight
    // dashed segment across the real per-start averages above.
    for (const pt of topPitches) {
      const trend = linearTrendAtEnds(rows.map(r => r[pt] as number | null))
      rows.forEach((r, i) => { r[`${pt}__trend`] = trend[i] })
    }
    return rows
  }, [log, topPitches])

  if (log === 'error' || log === null || veloByStartData.length === 0) return null

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Velo band by pitch — last 8 starts</p>
      <p className="text-[10px] font-mono text-stone-400 mb-3">Top 5 pitches by usage, average velo per start — faint dashed line is each pitch&apos;s real linear trend across these starts.</p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={veloByStartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
          <XAxis dataKey="date" tick={AXIS_TICK} />
          <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} width={36} unit=" mph" />
          <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)} mph` : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
          <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
          {topPitches.map(pt => (
            <Line {...NO_ANIM} key={pt} type="monotone" dataKey={pt} name={log.pitchNames[pt] ?? pt} stroke={pitchColor(pt)} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          ))}
          {topPitches.map(pt => (
            <Line
              {...NO_ANIM} key={`${pt}-trend`} type="linear" dataKey={`${pt}__trend`}
              stroke={pitchColor(pt)} strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="4 3"
              dot={false} activeDot={false} legendType="none" connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
