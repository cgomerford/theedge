// src/components/nfl/NflQbHoverCard.tsx
// FULL REPLACEMENT

import NflQbAvatar from './NflQbAvatar'

export default function NflQbHoverCard({
  headshotUrl, teamColor, playerName, teamId, yearsExp, statLabel, statValue, statExplainer,
}: {
  headshotUrl: string | null
  teamColor: string | null
  playerName: string
  teamId: string
  yearsExp: number | null
  statLabel: string
  statValue: string
  statExplainer?: string
}) {
  return (
    <div style={{ background: '#1A1A1A', color: '#fff', borderRadius: 6, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: 240, borderLeft: `4px solid ${teamColor ?? '#FF5722'}`, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
      <NflQbAvatar headshotUrl={headshotUrl} playerName={playerName} teamColor={teamColor} size={36} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{playerName}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#D4D0C8' }}>
          {teamId}{yearsExp != null ? ` · ${yearsExp}yr exp` : ''}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, marginTop: 4 }}>
          {statLabel}: {statValue}
        </div>
        {statExplainer && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3', marginTop: 3, lineHeight: 1.4 }}>{statExplainer}</div>
        )}
      </div>
    </div>
  )
}