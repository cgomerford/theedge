// src/components/dashboard/PlayerRadarChart.tsx
'use client'

// Multi-player radar overlay (up to 4). Fed entirely by the percentiles
// PlayersDashboard.tsx already pulls from /api/lab/percentile — this is
// the SAME percentile claim BattingTabContent.tsx's Chart.js radar makes
// ("percentile rank vs qualified MLB players"), just rebuilt on recharts
// so more than one player can overlay cleanly with a shared legend.

import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, Legend } from 'recharts'

export type RadarPlayer = {
  name: string
  color: string
  axes: { label: string; value: number; raw: string }[]
}

export default function PlayerRadarChart({ players, title }: { players: RadarPlayer[]; title: string }) {
  if (players.length === 0 || players[0].axes.length === 0) return null

  const axisLabels = players[0].axes.map(a => a.label)
  const data = axisLabels.map((label, i) => {
    const row: Record<string, any> = { axis: label }
    players.forEach(p => {
      row[p.name] = p.axes[i]?.value ?? 0
      row[`raw_${p.name}`] = p.axes[i]?.raw ?? '—'
    })
    return row
  })

  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3">⊕ {title} — percentile rank vs qualified MLB players, 0-100</div>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#e7e2d6" />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#57534e' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8, fontFamily: 'monospace', fill: '#a8a29e' }} tickCount={3} />
          {players.map(p => (
            <Radar key={p.name} name={p.name} dataKey={p.name} stroke={p.color} fill={p.color} fillOpacity={0.18} strokeWidth={2} />
          ))}
          <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }} />
          <Tooltip formatter={(value, name, props: any) => [`${value} (${props.payload[`raw_${name}`]})`, name]} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}