// src/components/nfl/NflWrCushionSeparationChart.tsx
//
// WR analog of the QB dumbbell: cushion (space at snap) vs separation
// (space at catch). A WR who gains separation beyond their cushion is
// winning the route; one who loses ground is getting caught up.

'use client'

import { useState } from 'react'
import type { WrNgsSeasonProfile } from '@/lib/nfl/queries'
import NflQbHoverCard from './NflQbHoverCard'

export default function NflWrCushionSeparationChart({ profiles }: { profiles: WrNgsSeasonProfile[] }) {
  const [hover, setHover] = useState<{ p: WrNgsSeasonProfile; x: number; y: number } | null>(null)

  if (profiles.length === 0) {
    return <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No data yet.</div>
    </div>
  }

  const sorted = [...profiles].sort((a, b) => b.avgSeparation - a.avgSeparation)
  const allValues = sorted.flatMap((r) => [r.avgCushion, r.avgSeparation])
  const min = Math.min(...allValues) - 0.5
  const max = Math.max(...allValues) + 0.5

  const width = 720
  const rowHeight = 22
  const leftPad = 150
  const rightPad = 24
  const topPad = 10
  const chartWidth = width - leftPad - rightPad
  const height = sorted.length * rowHeight + topPad + 10
  const scaleX = (v: number) => leftPad + ((v - min) / (max - min)) * chartWidth

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 20, overflowX: 'auto', position: 'relative' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#78716C', display: 'inline-block' }} /> Cushion (at snap)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF5722', display: 'inline-block' }} /> Separation (at catch, team color)
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 600 }}>
        {sorted.map((p, i) => {
          const y = topPad + i * rowHeight + rowHeight / 2
          const x1 = scaleX(p.avgCushion)
          const x2 = scaleX(p.avgSeparation)
          const teamColor = p.teamColor ?? '#FF5722'
          return (
            <g key={p.playerId} onMouseEnter={(e) => setHover({ p, x: e.clientX, y: e.clientY })} onMouseMove={(e) => setHover({ p, x: e.clientX, y: e.clientY })} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={y - rowHeight / 2} width={width} height={rowHeight} fill="transparent" />
              <text x={leftPad - 10} y={y + 3} textAnchor="end" fontFamily="'JetBrains Mono', monospace" fontSize={10} fill="#1A1A1A">
                {p.playerName} ({p.teamId})
              </text>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke={teamColor} strokeWidth={2} strokeOpacity={0.55} />
              <circle cx={x1} cy={y} r={4} fill="#78716C" />
              <circle cx={x2} cy={y} r={4} fill={teamColor} />
            </g>
          )
        })}
      </svg>
      {hover && (
        <div style={{ position: 'fixed', left: hover.x + 14, top: hover.y - 10, zIndex: 50, pointerEvents: 'none' }}>
          <NflQbHoverCard
            headshotUrl={hover.p.headshotUrl} teamColor={hover.p.teamColor} playerName={hover.p.playerName} teamId={hover.p.teamId} yearsExp={null}
            statLabel="Cushion → Separation" statValue={`${hover.p.avgCushion.toFixed(1)} → ${hover.p.avgSeparation.toFixed(1)} yds`}
            statExplainer="Space given at the snap vs space actually created by the catch point."
          />
        </div>
      )}
    </div>
  )
}
