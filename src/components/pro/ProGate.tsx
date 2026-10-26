import { headers } from 'next/headers'
import { getDeepLookState, claimDeepLook, type DeepLookFeature } from '@/lib/deep-look'
import { ProGateRow, FREE_LOOK_NOTE, type LabWho } from './ProGateView'

// The ONE Pro gate a page may carry (server component). `full()` is only called for Pro or the viewer's look for this entity, so Pro
// data is never loaded, rendered or passed to a client component for anyone else. `shell` is labels only (no numbers, n or dates).
// claim = true only where opening the page is itself the choice to spend the look (the lab Pro tabs); everywhere else
// a free account sees an "Open" button and visiting alone never spends the look.

export default async function ProGate({ feature, entityId, full, shell, source, claim = false, who }: {
  /** lab tabs: names the player in the signed-out line ("Sign up to see Yordan Alvarez's hot zones.") */
  who?: LabWho
  feature: DeepLookFeature
  entityId: string
  full: () => Promise<React.ReactNode>
  shell: React.ReactNode
  source: string
  claim?: boolean
}) {
  let state = await getDeepLookState(feature, entityId)
  // Next.js link prefetches must never spend a look.
  const h = await headers()
  const prefetch = !!h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || !!h.get('sec-purpose')?.includes('prefetch')
  if (claim && !prefetch && state === 'look_left') state = await claimDeepLook(feature, entityId)

  if (state === 'pro') return <>{await full()}</>
  if (state === 'this_look') {
    return (
      <>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#8a8275' }}>{FREE_LOOK_NOTE}</p>
        {await full()}
      </>
    )
  }
  const tier = state === 'look_left' || state === 'used' ? 'member' : 'anon'
  return (
    <section aria-label={feature}>
      <div>{shell}</div>
      <ProGateRow tier={tier} source={source} openable={state === 'look_left' ? { feature, entityId } : undefined} noButton={state === 'unavailable'} who={who} />
    </section>
  )
}
