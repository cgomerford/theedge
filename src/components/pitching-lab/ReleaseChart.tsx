'use client'

// src/components/pitching-lab/ReleaseChart.tsx
//
// "Arm angle vs location and release point — is there a trend?" Two real
// panels from the same raw pitch log (src/lib/pitcher-pitch-log.ts,
// release_pos_x/z + arm_angle — confirmed real Statcast columns):
//   - Release point scatter (release_pos_x vs release_pos_z), colored by
//     pitch type — do all his pitches come from the same release point
//     (tunneling) or does one pitch "leak"?
//   - Arm angle by start, over the season — a real drift here is a
//     mechanical/fatigue signal; a flat line means his slot hasn't moved.

import { useEffect, useMemo, useState } from 'react'
import { ScatterChart, Scatter, LineChart, Line, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { pitchColor } from '@/lib/mlb'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'

const SEASON = new Date().getFullYear()
const AXIS_TICK = { fontSize: 9, fontFamily: 'monospace', fill: '#a8a29e' }
const NO_ANIM = { isAnimationActive: false } as const

function shortDate(d: string): string {
  const parts = d.split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d
}

export default function ReleaseChart({ pitcherId }: { pitcherId: number }) {
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${SEASON}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setLog(json.error ? 'error' : json) })
      .catch(() => { if (!cancelled) setLog('error') })
    return () => { cancelled = true }
  }, [pitcherId])

  const byPitchType = useMemo(() => {
    if (!log || log === 'error') return []
    const groups = new Map<string, { x: number; y: number }[]>()
    for (const p of log.pitches) {
      if (p.releasePosX == null || p.releasePosZ == null) continue
      if (!groups.has(p.pitchType)) groups.set(p.pitchType, [])
      groups.get(p.pitchType)!.push({ x: p.releasePosX, y: p.releasePosZ })
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [log])

  const armAngleByStart = useMemo(() => {
    if (!log || log === 'error') return []
    const byDate = new Map<string, { sum: number; n: number }>()
    for (const p of log.pitches) {
      if (p.armAngle == null) continue
      if (!byDate.has(p.date)) byDate.set(p.date, { sum: 0, n: 0 })
      const d = byDate.get(p.date)!
      d.sum += p.armAngle; d.n++
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({ date: shortDate(date), fullDate: date, armAngle: Math.round((d.sum / d.n) * 10) / 10 }))
  }, [log])

  if (log === 'error') {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Couldn&apos;t load release-point data right now.</div>
  }
  if (log === null) {
    return <div className="bg-white border border-stone-200 rounded-xl p-10 text-center text-[12px] text-stone-400">Pulling release point / arm angle data…</div>
  }
  if (byPitchType.length === 0 && armAngleByStart.length === 0) return null

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Release point</p>
        <p className="text-[10px] font-mono text-stone-400 mb-3">Horizontal × vertical release, real per-pitch — same release point across pitches = better tunneling.</p>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
            <XAxis type="number" dataKey="x" name="Horizontal release (ft)" tick={AXIS_TICK} domain={['auto', 'auto']} />
            <YAxis type="number" dataKey="y" name="Release height (ft)" tick={AXIS_TICK} domain={['auto', 'auto']} width={32} />
            <ZAxis range={[12, 12]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(2) : '—')} />
            <Legend wrapperStyle={{ fontSize: 9, fontFamily: 'monospace' }} />
            {byPitchType.map(([pt, pts]) => (
              <Scatter {...NO_ANIM} key={pt} name={log.pitchNames[pt] ?? pt} data={pts} fill={pitchColor(pt)} fillOpacity={0.35} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Arm angle by start</p>
        <p className="text-[10px] font-mono text-stone-400 mb-3">Real, degrees — a real drift here is a mechanical or fatigue signal, not noise.</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={armAngleByStart} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f1ea" />
            <XAxis dataKey="date" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} width={40} unit="°" />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}°` : '—')} labelFormatter={(_, p) => p?.[0]?.payload?.fullDate ?? ''} />
            <Line {...NO_ANIM} type="monotone" dataKey="armAngle" name="Arm angle" stroke="#7C3AED" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
