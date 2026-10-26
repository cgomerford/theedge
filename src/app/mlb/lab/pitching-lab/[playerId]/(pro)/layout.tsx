// src/app/mlb/lab/pitching-lab/[playerId]/(pro)/layout.tsx
//
// The Pitching Lab Pro tabs behind the page's one ProGate: Arsenal, Location, Hot Zone Overlay, Sequencing, H2H, Trends, Stuff.
// Opening one of these tabs IS the choice to spend a free account's daily deep look (claim). The Shape tab sits outside this
// group because it shares ONE look with Pitch Shape Lab (feature 'pitch_shape'). Overview is free. The tabs' data APIs check the
// same look (lib/deep-look.ts). A route group: it adds no URL segment.

import { getMlbPerson } from '@/lib/mlb-person.server-fetch-allowed'
import ProGate from '@/components/pro/ProGate'
import DemoFrame from '@/components/pro/DemoFrame'
import { isSignedIn } from '@/lib/require-signup'

export default async function ProPitchingTabs({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  const name = person?.fullName ?? 'this player'
  // Signed out: the parent layout already shows the sample demo for every tab.
  if (!(await isSignedIn())) return <>{children}</>
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <ProGate feature="pitching_lab" entityId={playerId} source="pitching_lab" claim shell={<DemoFrame lab="pitching" realName={name}>{children}</DemoFrame>} who={{ lab: 'pitching', name }} full={async () => children} />
    </div>
  )
}
