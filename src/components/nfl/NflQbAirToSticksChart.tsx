// src/components/nfl/NflQbAirToSticksChart.tsx

'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell, ResponsiveContainer } from 'recharts'
import type { QbNgsSeasonProfile } from '@/lib/nfl/queries'

export default function NflQbAirToSticksChart({ profiles }: { profiles: QbNgsSeasonProfile[] }) {
  const sorted = [...profiles].sort((a, b) => b.avgAirYardsToSticks - a.avgAirYardsToSticks)
  const data = sorted.map((p) => ({ name: `${p.playerName} (${p.teamId})`, value: p.avgAirYardsToSticks }))
  const height = Math.max(300, data.length * 20)

  if (data.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No data yet.</div>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 4 }}>
        Positive = average attempt is past the first-down marker. Negative = the offense is asking for YAC.
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="rgba(26,26,26,0.06)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={{ stroke: 'rgba(26,26,26,0.2)' }} tickLine={false} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#1A1A1A' }} axisLine={false} tickLine={false} />
          <ReferenceLine x={0} stroke="#1A1A1A" />
          <Tooltip
            contentStyle={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", borderRadius: 4 }}
            formatter={(v: any) => [`${Number(v).toFixed(2)} yds`, 'Air yards to sticks']}
          />
          <Bar dataKey="value" radius={[0, 2, 2, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? '#FF5722' : '#78716C'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}