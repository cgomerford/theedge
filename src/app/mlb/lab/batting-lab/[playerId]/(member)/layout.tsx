// src/app/mlb/lab/batting-lab/[playerId]/(member)/layout.tsx
//
// The Batting Lab tabs that read stored tables (spray, swing, contact, outcomes, platoon, approach): open to any signed-in member, no look
// spent. Signed-out visitors get the sign-in card and none of the tab's code or data. A route group: it adds no URL segment.

import { getMlbPerson } from '@/lib/mlb-person.server-fetch-allowed'
import { isSignedIn } from '@/lib/require-signup'
import LockedTab from '@/components/pro/LockedTab'

export default async function MemberBattingTabs({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  if (!(await isSignedIn())) return <LockedTab name={person?.fullName ?? 'this player'} lab="batting" />
  return <>{children}</>
}
