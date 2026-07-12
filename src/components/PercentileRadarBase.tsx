'use client'

import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend, Tooltip } from 'recharts'

export type RadarSeries = { id: string; name: string; color: string; values: Record<string, number | null> }
export type RadarAxis = { key: string; label: string }

export default function PercentileRadarBase({ axes, series }: { axes: RadarAxis[]; series: RadarSeries[] }) {
  const data = axes.map(axis => {
    const row: Record<string, string | number | null> = { axis: axis.label }
    for (const s of series) row[s.id] = s.values[axis.key] ?? 0
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="#E7E5E4" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fontFamily: 'monospace', fill: '#78716C' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 8, fontFamily: 'monospace', fill: '#D6D3D1' }} tickCount={5} />
        {series.map(s => (
          <Radar key={s.id} name={s.name} dataKey={s.id} stroke={s.color} fill={s.color} fillOpacity={0.15} strokeWidth={2} />
        ))}
        <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
        <Tooltip formatter={(v: any) => `${v}th percentile`} />
      </RadarChart>
    </ResponsiveContainer>
  )
}