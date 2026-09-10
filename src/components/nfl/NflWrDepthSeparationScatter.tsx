// src/components/nfl/NflWrDepthSeparationScatter.tsx

'use client'

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { WrNgsSeasonProfile } from '@/lib/nfl/queries'
import NflQbHoverCard from './NflQbHoverCard'

export default function NflWrDepthSeparationScatter({ profiles }: { profiles: WrNgsSeasonProfile[] }) {
  if (profiles.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No data yet.</div>
      </div>
    )
  }
  const data = profiles.map((p) => ({ x: p.avgIntendedAirYards, y: p.avgSeparation, profile: p }))
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 8 }}>
        X: how deep they're targeted · Y: separation created. Bottom-right (deep + tight) is the hardest role to fill.
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
          <XAxis type="number" dataKey="x" name="Intended AY" tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={{ stroke: 'rgba(26,26,26,0.2)' }} tickLine={false} label={{ value: 'Avg Target Depth', position: 'insideBottom', offset: -14, fontSize: 10, fill: '#78716C' }} />
          <YAxis type="number" dataKey="y" name="Separation" tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const p = (payload[0].payload as { profile: WrNgsSeasonProfile }).profile
              return <NflQbHoverCard headshotUrl={p.headshotUrl} teamColor={p.teamColor} playerName={p.playerName} teamId={p.teamId} yearsExp={null} statLabel="Depth / Separation" statValue={`${p.avgIntendedAirYards.toFixed(1)} AY, ${p.avgSeparation.toFixed(1)} yds sep`} />
            }}
          />
          <Scatter data={data} fillOpacity={0.85} r={5}>
            {data.map((d, i) => <Cell key={i} fill={d.profile.teamColor ?? '#FF5722'} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
