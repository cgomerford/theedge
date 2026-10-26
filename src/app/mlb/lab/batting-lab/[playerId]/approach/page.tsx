// src/app/mlb/lab/batting-lab/[playerId]/approach/page.tsx
//
// Batting Lab "Approach" tab (the old Decisions tab). Server page: reads the precomputed swing-decision rows for this batter (getSwingLabData — no
// Savant fetch in the render path) and hands them to the client Approach. SIGN-UP gate only: ../layout.tsx checks the session; this tab sits outside
// the (pro) group and has no Pro data (the league tables it reads are public aggregates).

import { getSwingLabData } from '@/lib/swing-decisions/data'
import Approach from '@/components/swing-lab/Approach'
import { labBatterId } from '@/lib/lab-player'

export const dynamic = 'force-dynamic'

export default async function BattingApproachPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId: requestedId } = await params
  // Signed out: the sample player's data, never the requested player's (the layout labels it as an example).
  const playerId = String(await labBatterId(Number(requestedId)))
  const data = await getSwingLabData(Number(playerId))
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '8px 24px 100px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#FF5722', marginTop: 22 }}>⊕ APPROACH</div>
      <h1 style={{ margin: '2px 0 6px', fontWeight: 800, fontSize: 'clamp(28px,4.4vw,44px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>What he swings at, and when</h1>
      <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 720, margin: '0 0 8px', lineHeight: 1.5 }}>
        Results come after the choice. This page looks at the choice itself: which pitches he swings at and which he takes, in the zone and outside it, count by count, against the league’s average.
      </p>
      <Approach data={data} />
    </div>
  )
}
