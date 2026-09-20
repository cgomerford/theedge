'use client'

// src/components/pitching-lab/EdgePlusRadarChart.tsx
//
// "Pull every pitch into one graphic" — an overlaid radar chart, every
// pitch type as its own colored polygon on the same 6 real Edge+
// component axes (see src/lib/edge-plus.ts: whiff%, hard-hit%, xwOBA,
// movement, velo, put-away%, each a real league percentile). Same numbers
// as the per-pitch EdgePlusCard breakdown below this — just laid over one
// shared set of axes so which pitch wins where is visible at a glance.

import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { pitchColor } from '@/lib/mlb'
import type { EdgePlusComponent } from '@/lib/edge-plus'

export type RadarPitch = { pitchType: string; name: string; components: EdgePlusComponent[] }

export default function EdgePlusRadarChart({ pitches }: { pitches: RadarPitch[] }) {
  const withData = pitches.filter(p => p.components.some(c => c.percentile != null))
  if (withData.length === 0) return null

  // Fixed axis order — every pitch's components array is built from the
  // same EDGE_PLUS_WEIGHTS iteration order, so index i means the same
  // component for every pitch.
  const axisLabels = withData[0].components.map(c => c.label)
  const data = axisLabels.map((label, i) => {
    const row: Record<string, string | number | null> = { axis: label }
    for (const p of withData) row[p.pitchType] = p.components[i]?.percentile ?? null
    return row
  })

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-orange-600 font-bold mb-1">Edge+, one graphic</p>
      <p className="text-[10px] font-mono text-stone-400 mb-3">Every pitch overlaid on the same 6 real percentile axes — where each one wins, and where it doesn&apos;t.</p>
      <ResponsiveContainer width="100%" height={360}>
        <RadarChart data={data} outerRadius="68%">
          <PolarGrid stroke="#e7e5e4" />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#78716c' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v}th pctile` : '—')} />
          <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10 }} />
          {withData.map(p => (
            <Radar key={p.pitchType} name={p.name} dataKey={p.pitchType} stroke={pitchColor(p.pitchType)} fill={pitchColor(p.pitchType)} fillOpacity={0.14} strokeWidth={2} isAnimationActive={false} />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
