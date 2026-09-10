// src/components/nfl/NflQbAggressivenessScatter.tsx
// FULL REPLACEMENT — team-colored points + rich hover card.

'use client'

import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { QbNgsSeasonProfile } from '@/lib/nfl/queries'
import NflQbHoverCard from './NflQbHoverCard'

export default function NflQbAggressivenessScatter({ profiles }: { profiles: QbNgsSeasonProfile[] }) {
  if (profiles.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No data yet.</div>
      </div>
    )
  }

  const data = profiles.map((p) => ({ x: p.avgIntendedAirYards, y: p.aggressiveness, profile: p }))

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.1)', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 8 }}>
        X: how deep they aim · Y: how often into tight coverage. Deep + tight (top right) is the hardest throw profile.
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
          <XAxis type="number" dataKey="x" name="Intended AY" tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={{ stroke: 'rgba(26,26,26,0.2)' }} tickLine={false} label={{ value: 'Avg Intended Air Yards', position: 'insideBottom', offset: -14, fontSize: 10, fill: '#78716C' }} />
          <YAxis type="number" dataKey="y" name="Aggressiveness %" tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: '#78716C' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const p = (payload[0].payload as { profile: QbNgsSeasonProfile }).profile
              return (
                <NflQbHoverCard
                  headshotUrl={p.headshotUrl} teamColor={p.teamColor} playerName={p.playerName} teamId={p.teamId} yearsExp={null}
                  statLabel="Aggressiveness" statValue={`${p.aggressiveness.toFixed(1)}%`}
                  statExplainer="Share of attempts thrown into tight coverage (defender within 1 yard at the catch point)."
                />
              )
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