// Bridges the deep-look state to the older tier-based pieces (ProGateView and the client components that take a tier).
//   pro / this_look  -> 'pro'    (open; this_look adds the muted "your free deep look" line)
//   used             -> 'member' (labels only + upgrade)
//   look_left        -> 'member' with openable = true (labels + "open your free deep look")
//   signed_out / unavailable -> 'anon' (labels + create account; no price)
import { getDeepLookState, claimDeepLook, type DeepLookFeature, type DeepLookState } from '@/lib/deep-look'
import type { ViewerTier } from '@/lib/require-pro-types'

export type ResolvedViewer = { tier: ViewerTier; freeLook: boolean; state: DeepLookState }

export function tierOf(state: DeepLookState): ResolvedViewer {
  if (state === 'pro') return { tier: 'pro', freeLook: false, state }
  if (state === 'this_look') return { tier: 'pro', freeLook: true, state }
  if (state === 'used' || state === 'look_left') return { tier: 'member', freeLook: false, state }
  return { tier: 'anon', freeLook: false, state }
}

/** claim = true only where opening the page is itself the choice to spend the look (the lab Pro tabs). */
export async function resolveViewer(feature: DeepLookFeature, entityId: string, claim = false): Promise<ResolvedViewer> {
  let state = await getDeepLookState(feature, entityId)
  if (claim && state === 'look_left') state = await claimDeepLook(feature, entityId)
  return tierOf(state)
}
