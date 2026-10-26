// src/app/mlb/lab/batting-lab/[playerId]/contact/page.tsx
//
// Batting Lab "Contact" tab. Server page: reads the precomputed contact-profile rows for this batter (getContactProfile — no
// Savant fetch in the render path) and hands them to the client ContactTab. Sign-up gate only: ../layout.tsx checks the
// session; this tab sits outside the (pro) group and has no Pro data.

import { getContactLeaders, getContactProfile } from '@/lib/contact-profile/data'
import ContactTab from '@/components/contact-lab/ContactTab'
import { labBatterId } from '@/lib/lab-player'
import { demoOr } from '@/lib/lab-demo-server'

export const dynamic = 'force-dynamic'

export default async function BattingContactPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId: requestedId } = await params
  // Signed out: the sample player's data, never the requested player's (the layout labels it as an example).
  const playerId = String(await labBatterId(Number(requestedId)))
  const [data, leaders] = await Promise.all([demoOr('contactProfile', () => getContactProfile(Number(playerId))), demoOr('contactLeaders', () => getContactLeaders())])
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '8px 24px 100px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', fontWeight: 700, color: '#FF5722', marginTop: 22 }}>⊕ CONTACT</div>
      <h1 style={{ margin: '2px 0 6px', fontWeight: 800, fontSize: 'clamp(28px,4.4vw,44px)', letterSpacing: '-.02em', lineHeight: 1.05 }}>How hard, and where, he hits it</h1>
      <p style={{ color: '#5b5347', fontSize: 15, maxWidth: 720, margin: '0 0 18px', lineHeight: 1.5 }}>
        The quality of every ball he put in play, and the direction it went. Counts first, rates second, with the sample on every number.
      </p>
      <ContactTab data={data} leaders={leaders} />
    </div>
  )
}
