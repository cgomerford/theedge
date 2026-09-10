// src/components/nfl/NflQbBeeswarm.tsx
// FULL REPLACEMENT — team-colored points + rich hover card.

'use client'

import { ScatterChart, Scatter, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { QbNgsSeasonProfile } from '@/lib/nfl/queries'
import NflQbHoverCard from './NflQbHoverCard'

export default function NflQbBeeswarm({ profiles }: { profiles: QbNgsSeasonProfile[] }) {
  if (profiles.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No data yet.</div>
      </div>
    )
  }

  const sorted = [...profiles].sort((a, b) => a.avgIntendedAirYards - b.avgIntendedAirYards)
  const median = sorted[Math.floor(sorted.length / 2)].avgIntendedAirYards

  const buckets = new Map<number, number>()
  const data = sorted.map((p) => {
    const bucket = Math.round(p.avgIntendedAirYards * 4) / 4
    const idx = buckets.get(bucket) ?? 0
    buckets.set(bucket, idx + 1)
    const jitter = (idx % 2 === 0 ? 1 : -1) * Math.ceil(idx / 2) * 8
    return { x: p.avgIntendedAirYards, y: jitter, profile: p }
  })

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 8 }}>
        League distribution of intended air yards · median {median.toFixed(1)}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 20, right: 24, bottom: 20, left: 24 }}>
          <XAxis type="number" dataKey="x" tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={{ stroke: 'rgba(26,26,26,0.2)' }} tickLine={false} />
          <YAxis type="number" dataKey="y" hide domain={[-80, 80]} />
          <ReferenceLine x={median} stroke="#FF5722" strokeDasharray="4 4" label={{ value: 'median', fontSize: 9, fill: '#FF5722' }} />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const p = (payload[0].payload as { profile: QbNgsSeasonProfile }).profile
              return (
                <NflQbHoverCard
                  headshotUrl={p.headshotUrl} teamColor={p.teamColor} playerName={p.playerName} teamId={p.teamId} yearsExp={null}
                  statLabel="Intended AY" statValue={p.avgIntendedAirYards.toFixed(1)}
                  statExplainer="Average depth of target on every attempt, tracked by NGS."
                />
              )
            }}
          />
          <Scatter data={data} fillOpacity={0.85} r={5}>
            {data.map((d, i) => <Cell key={i} fill={d.profile.teamColor ?? '#1A1A1A'} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}