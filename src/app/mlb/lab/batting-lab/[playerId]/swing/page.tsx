// src/app/mlb/lab/batting-lab/[playerId]/swing/page.tsx
//
// Batting Lab "Swing" tab: the Swing Changes section of the Contact Lab for this hitter. Server page: reads the precomputed monthly swing rows and
// his monthly contact rows (no Savant fetch in the render path). Sign-up gate only: ../layout.tsx checks the session; outside the (pro) group.

import SwingChanges from '@/components/contact-lab/SwingChanges'
import { Empty } from '@/components/team/ui'
import { getContactProfile } from '@/lib/contact-profile/data'
import { getSwingMonthly } from '@/lib/nerve-centre/data'
import { labBatterId } from '@/lib/lab-player'

export const dynamic = 'force-dynamic'

export default async function BattingSwingPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId: requestedId } = await params
  // Signed out: the sample player's data, never the requested player's (the layout labels it as an example).
  const playerId = String(await labBatterId(Number(requestedId)))
  const id = Number(playerId)
  const contact = await getContactProfile(id)
  const season = contact?.season ?? new Date().getFullYear()
  const swing = await getSwingMonthly(id, season)
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '8px 24px 100px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#FF5722', marginTop: 22 }}>⊕ SWING</div>
      <h1 style={{ margin: '2px 0 6px', fontWeight: 800, fontSize: 'clamp(28px,4.4vw,44px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>Did his swing change?</h1>
      <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 720, margin: '0 0 18px', lineHeight: 1.5 }}>
        Setup and swing month by month, beside what happened to his contact over the same months. A description, not a claim about cause.
      </p>
      {swing
        ? <SwingChanges swing={swing.mine} contact={(contact?.months ?? []).map(m => ({ month: m.month, n_bbe: m.n_bbe, pull_air: m.pull_air, barrel: m.barrel }))} season={season} name={contact?.name ?? null} />
        : <Empty>Monthly swing data isn’t built for this hitter yet.</Empty>}
    </div>
  )
}
