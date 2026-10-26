// Works out what one viewer gets for one Pro module.
//   pro                              -> 'pro'    (open, no note)
//   free, signed in, this module     -> 'pro' + freeLook: the first module they opened today opens in full (and again for free)
//   free, signed in, another module  -> 'member' (labels only, then the upgrade row)
//   signed out                       -> 'anon'   (barebones shell, "Sign up to see this for free")
// Which module is "theirs" for the day is a signed cookie set by the proxy (see deep-look-cookie.ts); nothing is written here.
// Server only. Pages call resolveViewer(feature, key) once and hand the result to the gate.

import { getViewerTier } from '@/lib/require-pro'
import type { ViewerTier } from '@/lib/require-pro-types'
import { claimLook, isTodaysModule } from '@/lib/deep-look'
import { getCurrentSubscriber } from '@/lib/auth'

export type ResolvedViewer = { tier: ViewerTier; freeLook: boolean }

export async function resolveViewer(feature: string, key: string): Promise<ResolvedViewer> {
  const tier = await getViewerTier()
  if (tier !== 'member') return { tier, freeLook: false }
  return (await isTodaysModule(feature, key)) ? { tier: 'pro', freeLook: true } : { tier: 'member', freeLook: false }
}

/** For API route handlers: may this signed-in free account use this module's data today? Claims today's look if it is still free. */
export async function allowDeepLookFor(feature: string, key: string): Promise<boolean> {
  if (!(await getCurrentSubscriber())) return false
  return claimLook(feature, key)
}
