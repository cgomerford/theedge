// src/components/nfl/NflQbDumbbellChart.tsx
// FULL REPLACEMENT — team-colored dots + rich hover card (manual hover
// state since this is custom SVG, not recharts).

'use client'

import { useState } from 'react'
import type { QbNgsSeasonProfile } from '@/lib/nfl/queries'
import NflQbHoverCard from './NflQbHoverCard'

export type DumbbellRow = { playerId: string; playerName: string; teamId: string; intended: number; completed: number; profile?: QbNgsSeasonProfile }

export default function NflQbDumbbellChart({ rows }: { rows: DumbbellRow[] }) {
  const [hover, setHover] = useState<{ row: DumbbellRow; x: number; y: number } | null>(null)

  if (rows.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>No data yet.</div>
      </div>
    )
  }

  const sorted = [...rows].sort((a, b) => b.intended - a.intended)
  const allValues = sorted.flatMap((r) => [r.intended, r.completed])
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
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1A1A1A', display: 'inline-block' }} /> Intended AY
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF5722', display: 'inline-block' }} /> Completed AY (team color)
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 600 }}>
        {sorted.map((r, i) => {
          const y = topPad + i * rowHeight + rowHeight / 2
          const x1 = scaleX(r.completed)
          const x2 = scaleX(r.intended)
          const teamColor = r.profile?.teamColor ?? '#FF5722'
          return (
            <g key={r.playerId} onMouseEnter={(e) => setHover({ row: r, x: e.clientX, y: e.clientY })} onMouseMove={(e) => setHover({ row: r, x: e.clientX, y: e.clientY })} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={y - rowHeight / 2} width={width} height={rowHeight} fill="transparent" />
              <text x={leftPad - 10} y={y + 3} textAnchor="end" fontFamily="'JetBrains Mono', monospace" fontSize={10} fill="#1A1A1A">
                {r.playerName} ({r.teamId})
              </text>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={teamColor} strokeWidth={2} strokeOpacity={0.55} />
              <circle cx={x1} cy={y} r={4} fill={teamColor} />
              <circle cx={x2} cy={y} r={4} fill="#1A1A1A" />
            </g>
          )
        })}
      </svg>

      {hover && hover.row.profile && (
        <div style={{ position: 'fixed', left: hover.x + 14, top: hover.y - 10, zIndex: 50, pointerEvents: 'none' }}>
          <NflQbHoverCard
            headshotUrl={hover.row.profile.headshotUrl} teamColor={hover.row.profile.teamColor}
            playerName={hover.row.playerName} teamId={hover.row.teamId} yearsExp={null}
            statLabel="Intended vs Completed" statValue={`${hover.row.intended.toFixed(1)} → ${hover.row.completed.toFixed(1)} AY`}
            statExplainer="How far they aim vs how far throws actually land."
          />
        </div>
      )}
    </div>
  )
}