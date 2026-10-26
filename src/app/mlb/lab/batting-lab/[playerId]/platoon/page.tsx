// src/app/mlb/lab/batting-lab/[playerId]/platoon/page.tsx
//
// Batting Lab "Platoon" tab: is his split against left-handed vs right-handed pitching real, or sample size? Server page: reads the precomputed rows (getPlatoonHitter, getPlatoonLeague;
// no Savant fetch in the render path) and hands them to the client PlatoonLive. SIGN-UP gate only: ../layout.tsx checks the session; this tab sits outside the (pro) group.

import PlatoonLive from '@/components/platoon-lab/PlatoonLive'
import { Empty } from '@/components/team/ui'
import { gapsOf, getPlatoonHitter, getPlatoonLeague } from '@/lib/platoon/data'
import { sidesOf } from '@/lib/platoon/model'
import { labBatterId } from '@/lib/lab-player'

export const dynamic = 'force-dynamic'

export default async function BattingPlatoonPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId: requestedId } = await params
  // Signed out: the sample player's data, never the requested player's (the layout labels it as an example).
  const playerId = String(await labBatterId(Number(requestedId)))
  const [found, league] = await Promise.all([getPlatoonHitter(Number(playerId)), getPlatoonLeague()])
  const sides = found ? sidesOf(found.hitter) : []
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '8px 24px 100px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#FF5722', marginTop: 22 }}>⊕ PLATOON</div>
      <h1 style={{ margin: '2px 0 6px', fontWeight: 800, fontSize: 'clamp(28px,4.4vw,44px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>Is the split real?</h1>
      <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 720, margin: '0 0 18px', lineHeight: 1.5 }}>
        How he does against left-handed and right-handed pitching, with the swing numbers that settle fast beside the results that take years. A description of what happened, with the sample behind every number.
      </p>
      {!found || sides.length === 0
        ? <Empty>Platoon data isn’t built for this hitter yet.</Empty>
        : <PlatoonLive hitter={found.hitter} updated={found.updated} league={league} mine={gapsOf(found.hitter.bySide[sides[0]])} />}
    </div>
  )
}
