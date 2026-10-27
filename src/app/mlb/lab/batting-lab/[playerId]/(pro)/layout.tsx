// src/app/mlb/lab/batting-lab/[playerId]/(pro)/layout.tsx
//
// The Batting Lab tabs behind the page's one ProGate: Hot Zone Overlay, Sequencing, Trends, H2H.
// Opening one of these tabs IS the choice to spend a free account's daily deep look, so the gate claims (claim): one look opens
// every one of these tabs for this batter that day. The Reaction tab is outside this group and never claims (Pro only).
// Overview, vs pitch type and Location Lab are open to everyone; the Nerve Centre tabs are in (member). The tabs' data APIs check the same look (lib/deep-look.ts), so bypassing the
// page does not reach the data. A route group: it adds no URL segment.

import { getMlbPerson } from '@/lib/mlb-person.server-fetch-allowed'
import ProGate from '@/components/pro/ProGate'
import DemoFrame from '@/components/pro/DemoFrame'
import { isSignedIn } from '@/lib/require-signup'
import LockedTab from '@/components/pro/LockedTab'

export default async function ProBattingTabs({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  const name = person?.fullName ?? 'this player'
  // Signed out: these tabs need an account. Nothing is read or rendered for them.
  if (!(await isSignedIn())) return <LockedTab name={name} lab="batting" />
  return (
    <div style={{ margin: '0 auto' }}>
      <ProGate feature="batting_lab" entityId={playerId} source="batting_lab" claim shell={<DemoFrame lab="batting" realName={name}>{children}</DemoFrame>} who={{ lab: 'batting', name }} full={async () => children} />
    </div>
  )
}
