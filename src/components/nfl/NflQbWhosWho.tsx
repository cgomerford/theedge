// src/components/nfl/NflQbWhosWho.tsx
//
// Three callout cards answering "who's the checkdown passer / downfield
// thrower / rushing QB" directly, using the same tag data that powers
// the tags shown elsewhere. Picks the single most extreme QB per tag.

import type { QbNgsSeasonProfile } from '@/lib/nfl/queries'

function pickExtreme(profiles: QbNgsSeasonProfile[], by: (p: QbNgsSeasonProfile) => number, direction: 'max' | 'min') {
  if (profiles.length === 0) return null
  return [...profiles].sort((a, b) => (direction === 'max' ? by(b) - by(a) : by(a) - by(b)))[0]
}

function WhoCard({ label, sub, player, value, valueLabel }: { label: string; sub: string; player: QbNgsSeasonProfile | null; value: string; valueLabel: string }) {
  if (!player) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 20, minHeight: 140 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', fontStyle: 'italic' }}>Not enough data yet</div>
      </div>
    )
  }
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderTop: '3px solid #FF5722', padding: 20 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#FF5722', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', marginBottom: 10 }}>{sub}</div>
      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, color: '#1A1A1A' }}>
        {player.playerName} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 400, color: '#78716C' }}>· {player.teamId}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 32, color: '#1A1A1A' }}>{value}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', textTransform: 'uppercase' }}>{valueLabel}</span>
      </div>
    </div>
  )
}

export default function NflQbWhosWho({ profiles }: { profiles: QbNgsSeasonProfile[] }) {
  const mostDownfield = pickExtreme(profiles, (p) => p.avgIntendedAirYards, 'max')
  const biggestCheckdown = pickExtreme(profiles, (p) => p.avgAirYardsToSticks, 'min')
  const qualifiedRushers = profiles.filter((p) => p.carries > 20 && p.rushEpaPerCarry != null)
  const mostProminentRusher = pickExtreme(qualifiedRushers, (p) => p.carries, 'max')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
      <WhoCard
        label="Most Downfield"
        sub="Highest avg intended air yards"
        player={mostDownfield}
        value={mostDownfield ? mostDownfield.avgIntendedAirYards.toFixed(1) : '—'}
        valueLabel="Yds"
      />
      <WhoCard
        label="Biggest Checkdown Artist"
        sub="Most negative air yards to sticks"
        player={biggestCheckdown}
        value={biggestCheckdown ? biggestCheckdown.avgAirYardsToSticks.toFixed(1) : '—'}
        valueLabel="Yds to sticks"
      />
      <WhoCard
        label="Most Prominent Rusher"
        sub="Most carries among qualified QBs"
        player={mostProminentRusher}
        value={mostProminentRusher ? String(mostProminentRusher.carries) : '—'}
        valueLabel="Carries"
      />
    </div>
  )
}