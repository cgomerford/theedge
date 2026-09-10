// src/components/nfl/NflBiggestMoverCard.tsx
//
// Hero-stat callout card -- one big headline number instead of a plain
// line chart, for the "this isn't just Excel" ask. Structural idea
// borrowed from a reference mockup (huge display number, player name,
// two supporting stats below) but restyled to Edge's actual brand:
// Fraunces for the display number, JetBrains Mono for labels, orange
// accent instead of the mockup's teal.

import type { RushEpaYoyMover } from '@/lib/nfl/queries'

export default function NflBiggestMoverCard({ mover }: { mover: RushEpaYoyMover | null }) {
  if (!mover) {
    return (
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 28, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontStyle: 'italic', color: '#A3A3A3' }}>
          Not enough season-over-season carries yet to call a mover.
        </div>
      </div>
    )
  }

  const sign = mover.delta >= 0 ? '+' : ''

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', padding: 24 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: '#FF5722', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
        Rush EPA/Carry · Biggest Riser
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#A3A3A3', letterSpacing: '0.04em', marginBottom: 12 }}>
        {mover.priorSeason} → {mover.season}
      </div>

      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 72, lineHeight: 0.9, color: '#1A1A1A', letterSpacing: '-0.02em' }}>
        {sign}{mover.delta.toFixed(2)}
      </div>

      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, color: '#1A1A1A', marginTop: 12 }}>
        {mover.playerName} <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 400, color: '#78716C' }}>· {mover.teamId}</span>
      </div>

      <div style={{ display: 'flex', gap: 32, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(26,26,26,0.08)' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {mover.season} EPA/Carry
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: '#1A1A1A' }}>
            {mover.epaPerCarry.toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {mover.priorSeason} EPA/Carry
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: '#A3A3A3' }}>
            {mover.priorEpaPerCarry.toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Carries
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: '#1A1A1A' }}>
            {mover.carries}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Rush Yds
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: '#1A1A1A' }}>
            {mover.rushYards.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  )
}