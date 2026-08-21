// src/components/nfl/RosterConstructionPreview.tsx
'use client'

import { useState, useEffect } from 'react'
import type { TeamDepthChart } from '@/lib/nfl/depth-charts'
import type { NFLTeamCard } from '@/lib/nfl'

type Props = {
  charts: TeamDepthChart[]   // pre-fetched for a rotating subset of teams — see page.tsx note
  teams: NFLTeamCard[]
}

const TEAM_ROTATE_MS = 6000
const SIDE_ROTATE_MS = 5000

export default function RosterConstructionPreview({ charts, teams }: Props) {
  const [teamIdx, setTeamIdx] = useState(0)
  const [side, setSide] = useState<'offense' | 'defense'>('offense')

  useEffect(() => {
    if (charts.length <= 1) return
    const t = setInterval(() => {
      setTeamIdx(i => (i + 1) % charts.length)
      setSide('offense') // reset to offense whenever we move to a new team
    }, TEAM_ROTATE_MS)
    return () => clearInterval(t)
  }, [charts.length])

  useEffect(() => {
    const t = setInterval(() => {
      setSide(s => (s === 'offense' ? 'defense' : 'offense'))
    }, SIDE_ROTATE_MS)
    return () => clearInterval(t)
  }, [])

  if (charts.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 24, textAlign: 'center' }}>
        <div className="s" style={{ fontSize: 13, fontStyle: 'italic', color: '#A3A3A3' }}>No depth chart data yet.</div>
      </div>
    )
  }

  const chart = charts[teamIdx]
  const team = teams.find(t => t.id === chart.teamId)
  const players = side === 'offense' ? chart.offense : chart.defense

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid rgba(26,26,26,0.06)', background: '#F5F1E8' }}>
        {team?.logo && <img src={team.logo} alt="" width={20} height={20} />}
        <span className="s" style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', flex: 1 }}>{team?.name ?? chart.teamId}</span>
        <span
          className="m"
          style={{
            fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: side === 'offense' ? '#FF5722' : '#185FA5',
            background: side === 'offense' ? 'rgba(255,87,34,0.1)' : 'rgba(24,95,165,0.1)',
            padding: '3px 8px',
          }}
        >
          {side}
        </span>
      </div>

      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {players.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <span className="s" style={{ fontSize: 12, fontStyle: 'italic', color: '#A3A3A3' }}>No {side} depth chart data for this team.</span>
          </div>
        ) : (
          players.map((p, i) => (
            <div key={p.athleteId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: i < players.length - 1 ? '1px solid rgba(26,26,26,0.04)' : 'none' }}>
              <span className="m" style={{ fontSize: 9, fontWeight: 700, color: '#A3A3A3', width: 30, flexShrink: 0 }}>{p.positionAbbr}</span>
              {p.headshotUrl && (
                <img
                  src={p.headshotUrl}
                  alt=""
                  width={24} height={24}
                  style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
                  onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
                />
              )}
              <span className="s" style={{ fontSize: 12.5, color: '#1A1A1A', flex: 1 }}>{p.name}</span>
            </div>
          ))
        )}
      </div>

      {/* Progress dots for team rotation */}
      <div style={{ display: 'flex', gap: 3, padding: '8px 14px', borderTop: '1px solid rgba(26,26,26,0.06)' }}>
        {charts.map((_, i) => (
          <div key={i} style={{ height: 2, flex: 1, background: i === teamIdx ? '#FF5722' : 'rgba(26,26,26,0.08)', transition: 'background 0.2s' }} />
        ))}
      </div>
    </div>
  )
}