// src/app/mlb/lab/batting-lab/[playerId]/outcomes/page.tsx
//
// Batting Lab "Outcomes" tab: the Three True Outcomes section of the Contact Lab for this hitter. Server page: reads precomputed batter_tto rows (no Savant
// fetch in the render path). Sign-up gate only: ../layout.tsx checks the session; outside the (pro) group.

import TtoSection from '@/components/contact-lab/TtoSection'
import { getContactProfile } from '@/lib/contact-profile/data'
import { getTtoLeaders, getTtoProfile } from '@/lib/nerve-centre/data'
import { labBatterId } from '@/lib/lab-player'

export const dynamic = 'force-dynamic'

export default async function BattingOutcomesPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId: requestedId } = await params
  // Signed out: the sample player's data, never the requested player's (the layout labels it as an example).
  const playerId = String(await labBatterId(Number(requestedId)))
  const id = Number(playerId)
  const contact = await getContactProfile(id)
  const season = contact?.season ?? new Date().getFullYear()
  const [profile, leaders] = await Promise.all([getTtoProfile(id, season), getTtoLeaders(season)])
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '8px 24px 100px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#FF5722', marginTop: 22 }}>⊕ OUTCOMES</div>
      <h1 style={{ margin: '2px 0 6px', fontWeight: 800, fontSize: 'clamp(28px,4.4vw,44px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>Three true outcomes</h1>
      <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 720, margin: '0 0 18px', lineHeight: 1.5 }}>
        How much of his game ends without the defence touching it, and in what mix. Counts first, rates second, with the sample on every number.
      </p>
      <TtoSection profile={profile} leaders={leaders} season={season} />
    </div>
  )
}
