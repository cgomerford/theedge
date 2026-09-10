// src/components/nfl/NflWrWhosWho.tsx

import type { WrNgsSeasonProfile } from '@/lib/nfl/queries'
import NflQbAvatar from './NflQbAvatar'

function pickExtreme(profiles: WrNgsSeasonProfile[], by: (p: WrNgsSeasonProfile) => number, direction: 'max' | 'min') {
  if (profiles.length === 0) return null
  return [...profiles].sort((a, b) => (direction === 'max' ? by(b) - by(a) : by(a) - by(b)))[0]
}

function WhoCard({ label, sub, player, value, valueLabel }: { label: string; sub: string; player: WrNgsSeasonProfile | null; value: string; valueLabel: string }) {
  if (!player) {
    return <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 20, minHeight: 140 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', fontStyle: 'italic' }}>Not enough data yet</div>
    </div>
  }
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderTop: '3px solid #FF5722', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#FF5722', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', marginBottom: 10 }}>{sub}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NflQbAvatar headshotUrl={player.headshotUrl} playerName={player.playerName} teamColor={player.teamColor} size={28} />
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: '#1A1A1A' }}>
          {player.playerName} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 400, color: '#78716C' }}>· {player.teamId}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 32, color: '#1A1A1A' }}>{value}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', textTransform: 'uppercase' }}>{valueLabel}</span>
      </div>
    </div>
  )
}

export default function NflWrWhosWho({ profiles }: { profiles: WrNgsSeasonProfile[] }) {
  const deepestThreat = pickExtreme(profiles, (p) => p.avgIntendedAirYards, 'max')
  const bestSeparator = pickExtreme(profiles, (p) => p.avgSeparation, 'max')
  const bestYacMerchant = pickExtreme(profiles, (p) => p.avgYacAboveExpectation, 'max')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
      <WhoCard label="Deepest Threat" sub="Highest avg intended air yards" player={deepestThreat} value={deepestThreat ? deepestThreat.avgIntendedAirYards.toFixed(1) : '—'} valueLabel="Yds" />
      <WhoCard label="Best Separator" sub="Most separation at the catch point" player={bestSeparator} value={bestSeparator ? bestSeparator.avgSeparation.toFixed(1) : '—'} valueLabel="Yds sep" />
      <WhoCard label="YAC Merchant" sub="Most yards after catch above expectation" player={bestYacMerchant} value={bestYacMerchant ? `+${bestYacMerchant.avgYacAboveExpectation.toFixed(1)}` : '—'} valueLabel="YAC vs exp" />
    </div>
  )
}
