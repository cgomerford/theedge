// src/components/nfl/QbRadarCarousel.tsx

'use client'

import { useEffect, useState } from 'react'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts'
import type { QbRadarProfile } from '@/lib/nfl/queries'

export interface QbRadarEntry {
  profile: QbRadarProfile
  name: string
}

export function QbRadarCarousel({ entries, intervalMs = 6000 }: { entries: QbRadarEntry[]; intervalMs?: number }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (entries.length <= 1) return
    const id = setInterval(() => setActive((a) => (a + 1) % entries.length), intervalMs)
    return () => clearInterval(id)
  }, [entries.length, intervalMs])

  if (entries.length === 0) return null

  const current = entries[Math.min(active, entries.length - 1)]
  const data = current.profile.axes.map((a) => ({ axis: a.label, percentile: a.percentile, raw: a.value }))

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{current.name}</h3>
      </div>
      <p className="panel-note">
        Percentile vs. every qualified QB (100+ attempts) this season — rotating through the top {entries.length} passers by yards. Click a dot to jump.
      </p>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="#E7E5E4" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: '#78716C', fontFamily: 'JetBrains Mono, monospace' }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="percentile" stroke="#FF5722" fill="#FF5722" fillOpacity={0.35} strokeWidth={2} isAnimationActive={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', borderRadius: 12 }}
              formatter={(value: unknown, _name: unknown, item: any) => {
                const raw = item?.payload?.raw as number | undefined
                return [`${value}th pct.${raw != null ? ` · ${raw.toFixed(2)} raw` : ''}`, 'Rank']
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 4 }}>
        {entries.map((e, i) => (
          <button
            key={e.profile.playerId}
            onClick={() => setActive(i)}
            aria-label={`Show ${e.name}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              background: i === active ? '#FF5722' : '#E7E5E4',
            }}
          />
        ))}
      </div>
    </div>
  )
}
