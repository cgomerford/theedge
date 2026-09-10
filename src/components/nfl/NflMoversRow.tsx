// src/components/nfl/NflMoversRow.tsx
//
// Compact biggest-mover cards, 5 across. Normalizes 5 differently-shaped
// mover types (rush/pass/receiving/fantasy/team) into one consistent
// card so they render identically despite different underlying stats.

import type { RushEpaYoyMover, PassEpaYoyMover, RecEpaYoyMover, FantasyYoyMover, TeamEpaYoyMover } from '@/lib/nfl/queries'

type NormalizedMover = {
  label: string
  seasons: string
  delta: number
  deltaDecimals: number
  name: string
  sub: string
  stat1Label: string
  stat1Value: string
  stat2Label: string
  stat2Value: string
} | null

function CompactCard({ mover }: { mover: NormalizedMover }) {
  if (!mover) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 16, minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', fontStyle: 'italic', textAlign: 'center' }}>Not enough data yet</div>
      </div>
    )
  }

  const sign = mover.delta >= 0 ? '+' : ''

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderTop: '3px solid #FF5722', padding: 16 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, color: '#FF5722', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
        {mover.label}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3', marginBottom: 8 }}>
        {mover.seasons}
      </div>

      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 34, lineHeight: 0.95, color: '#1A1A1A', letterSpacing: '-0.01em' }}>
        {sign}{mover.delta.toFixed(mover.deltaDecimals)}
      </div>

      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 14, color: '#1A1A1A', marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {mover.name}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#78716C', marginBottom: 10 }}>
        {mover.sub}
      </div>

      <div style={{ display: 'flex', gap: 12, paddingTop: 10, borderTop: '1px solid rgba(26,26,26,0.06)' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#A3A3A3', textTransform: 'uppercase' }}>{mover.stat1Label}</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{mover.stat1Value}</div>
        </div>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#A3A3A3', textTransform: 'uppercase' }}>{mover.stat2Label}</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{mover.stat2Value}</div>
        </div>
      </div>
    </div>
  )
}

export default function NflMoversRow({
  rush, pass, receiving, fantasy, team,
}: {
  rush: RushEpaYoyMover | null
  pass: PassEpaYoyMover | null
  receiving: RecEpaYoyMover | null
  fantasy: FantasyYoyMover | null
  team: TeamEpaYoyMover | null
}) {
  const cards: NormalizedMover[] = [
    rush && {
      label: 'Rush EPA/Carry', seasons: `${rush.priorSeason} → ${rush.season}`,
      delta: rush.delta, deltaDecimals: 2, name: rush.playerName, sub: rush.teamId,
      stat1Label: `${rush.season}`, stat1Value: rush.epaPerCarry.toFixed(2),
      stat2Label: 'Carries', stat2Value: String(rush.carries),
    },
    pass && {
      label: 'Pass EPA/Att', seasons: `${pass.priorSeason} → ${pass.season}`,
      delta: pass.delta, deltaDecimals: 2, name: pass.playerName, sub: pass.teamId,
      stat1Label: `${pass.season}`, stat1Value: pass.epaPerAtt.toFixed(2),
      stat2Label: 'Attempts', stat2Value: String(pass.attempts),
    },
    receiving && {
      label: 'Rec EPA/Target', seasons: `${receiving.priorSeason} → ${receiving.season}`,
      delta: receiving.delta, deltaDecimals: 2, name: receiving.playerName, sub: receiving.teamId,
      stat1Label: `${receiving.season}`, stat1Value: receiving.epaPerTarget.toFixed(2),
      stat2Label: 'Targets', stat2Value: String(receiving.targets),
    },
    fantasy && {
      label: 'Fantasy PPR Pts', seasons: `${fantasy.priorSeason} → ${fantasy.season}`,
      delta: fantasy.delta, deltaDecimals: 1, name: fantasy.playerName, sub: fantasy.teamId,
      stat1Label: `${fantasy.season}`, stat1Value: fantasy.points.toFixed(1),
      stat2Label: `${fantasy.priorSeason}`, stat2Value: fantasy.priorPoints.toFixed(1),
    },
    team && {
      label: 'Team Off EPA/Play', seasons: `${team.priorSeason} → ${team.season}`,
      delta: team.delta, deltaDecimals: 2, name: team.teamId, sub: 'League-wide',
      stat1Label: `${team.season}`, stat1Value: team.offEpaPerPlay.toFixed(2),
      stat2Label: `${team.priorSeason}`, stat2Value: team.priorOffEpaPerPlay.toFixed(2),
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
      {cards.map((c, i) => <CompactCard key={i} mover={c} />)}
    </div>
  )
}