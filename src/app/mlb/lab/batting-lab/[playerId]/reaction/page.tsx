// Batting Lab → Reaction Window. Pro only: a free account's daily deep look can never open it, and this page never claims one.
// Anyone who cannot open it sees the real tab as a labelled example.
import { ProGateRow } from '@/components/pro/ProGateView'
import DemoFrame from '@/components/pro/DemoFrame'
import { getViewerTier } from '@/lib/require-pro'
import { isSignedIn } from '@/lib/require-signup'
import { getMlbPerson } from '@/lib/mlb-person.server-fetch-allowed'
import ReactionTab from './ReactionTab'

export default async function ReactionPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const tier = await getViewerTier()
  if (tier === 'pro') return <div style={{ maxWidth: 1100, margin: '0 auto' }}><ReactionTab /></div>
  // Signed out: the layout already frames this as an example and adds the create-account row.
  if (!(await isSignedIn())) return <div style={{ maxWidth: 1100, margin: '0 auto' }}><ReactionTab /></div>
  const person = await getMlbPerson(Number(playerId))
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <DemoFrame lab="batting" realName={person?.fullName ?? 'this player'}><ReactionTab /></DemoFrame>
      <ProGateRow tier={tier === 'member' ? 'member' : 'anon'} source="batting_reaction" lockedLine="The Reaction Window is part of Pro." />
    </div>
  )
}
