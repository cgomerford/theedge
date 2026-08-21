// src/components/nfl/FantasyOwnershipPreview.tsx
'use client'

import { useState, useEffect } from 'react'
import { Avatar } from '@/app/nfl/NFLHomepage'
import type { FantasyOwnershipEntry, FantasyProTeam } from '@/lib/nfl/fantasy-ownership'

type Props = {
  players: FantasyOwnershipEntry[]
  proTeams: FantasyProTeam[]
}

const ROTATE_MS = 4000

export default function FantasyOwnershipPreview({ players, proTeams }: Props) {
  const [idx, setIdx] = useState(0)
  const teamById = new Map(proTeams.map(t => [t.id, t]))

  useEffect(() => {
    if (players.length <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % Math.min(players.length, 10)), ROTATE_MS)
    return () => clearInterval(t)
  }, [players.length])

  if (players.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 24, textAlign: 'center' }}>
        <div className="s" style={{ fontSize: 13, fontStyle: 'italic', color: '#A3A3A3' }}>No ownership data yet.</div>
      </div>
    )
  }

  const p = players[idx]
  const team = teamById.get(p.proTeamId)

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)' }}>
      <div style={{ padding: '14px 16px', borderLeft: `3px solid ${team?.color ?? '#A3A3A3'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className="m" style={{ fontSize: 8, fontWeight: 700, color: '#FF5722', background: 'rgba(255,87,34,0.08)', padding: '2px 8px', letterSpacing: '0.06em' }}>
            {p.position}
          </span>
          <span className="m" style={{ fontSize: 9, color: '#A3A3A3' }}>{team?.abbrev ?? '—'}</span>
          {p.injured && (
            <span className="m" style={{ fontSize: 8, fontWeight: 700, color: '#DC2626' }}>{p.injuryStatus}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
  <Avatar url={p.headshotUrl} size={40} />
  <div className="s" style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A' }}>{p.fullName}</div>
</div>
        <div className="s" style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A', marginBottom: 8 }}>{p.fullName}</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div>
            <div className="s" style={{ fontSize: 20, fontWeight: 700, color: '#1A1A1A', lineHeight: 1 }}>{p.percentOwned.toFixed(1)}%</div>
            <div className="m" style={{ fontSize: 8, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Owned</div>
          </div>
          <div>
            <div className="s" style={{ fontSize: 20, fontWeight: 700, color: '#1A1A1A', lineHeight: 1 }}>{p.percentStarted.toFixed(1)}%</div>
            <div className="m" style={{ fontSize: 8, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Started</div>
          </div>
          {p.latestFantasyPoints !== null && (
            <div>
              <div className="s" style={{ fontSize: 20, fontWeight: 700, color: '#FF5722', lineHeight: 1 }}>{p.latestFantasyPoints.toFixed(1)}</div>
              <div className="m" style={{ fontSize: 8, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Last Pts</div>
            </div>
          )}
        </div>
      </div>
      {/* Progress dots — shows which of the rotating set is active */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 12px' }}>
        {players.slice(0, 10).map((_, i) => (
          <div key={i} style={{ height: 2, flex: 1, background: i === idx ? '#FF5722' : 'rgba(26,26,26,0.08)', transition: 'background 0.2s' }} />
        ))}
      </div>
    </div>
  )
}