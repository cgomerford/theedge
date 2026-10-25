import { getCurrentSubscriber } from '@/lib/auth'
import { getFollowState } from '@/lib/follows'
import FollowButton from './FollowButton'

// Server component: looks up who is viewing and whether they already follow this player/team, then renders the button.
export default async function FollowControl({ kind, refId, name }: { kind: 'player' | 'team'; refId: string; name: string }) {
  const sub = await getCurrentSubscriber()
  const state = sub ? await getFollowState(sub, kind, refId) : { following: false, atLimit: false }
  return <FollowButton kind={kind} refId={refId} name={name} signedIn={Boolean(sub)} following={state.following} atLimit={state.atLimit} />
}
