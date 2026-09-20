'use client'

// src/components/pitching-lab/PitchGradeRadar.tsx
//
// "How does this pitch grade?" — a layered radar: this pitch's real
// percentiles (vs every other pitcher's same pitch type, league-wide —
// see src/lib/pitch-type-percentiles.ts) laid over a flat 50th-percentile
// "league average" reference ring. Two data layers on one chart, both
// real (one computed, one a constant baseline) — no fabricated axis.

import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { PitchGradeStat } from '@/lib/pitch-type-percentiles'

export default function PitchGradeRadar({
  stats, color, poolSize,
}: {
  stats: PitchGradeStat[]
  color: string
  poolSize: number
}) {
  const withPct = stats.filter(s => s.percentile != null)
  if (withPct.length < 3) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex items-center justify-center h-64">
        <p className="text-xs font-serif italic text-stone-400 text-center">Not enough league-wide same-pitch-type data yet to grade this pitch.</p>
      </div>
    )
  }

  const axes = withPct.map(s => ({ axis: s.label, thisPitch: s.percentile!, league: 50 }))

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">How this pitch grades</p>
      <p className="text-xs font-serif text-stone-400 italic mb-3">
        Percentile vs {poolSize} pitchers league-wide throwing the same pitch type — layered over the 50th-percentile average.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={axes} outerRadius="70%">
          <PolarGrid stroke="#e7e5e4" />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#78716c' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v}th pctile` : '—')} />
          <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10 }} />
          <Radar name="League avg" dataKey="league" stroke="#a8a29e" fill="#a8a29e" fillOpacity={0.08} strokeWidth={1} strokeDasharray="3 3" />
          <Radar name="This pitch" dataKey="thisPitch" stroke={color} fill={color} fillOpacity={0.3} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
