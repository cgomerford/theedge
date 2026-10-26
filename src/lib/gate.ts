// Works out what one viewer gets for one Pro module, and spends the free deep look when it is used.
//   pro                       -> 'pro'    (open, no note)
//   free, deep look left      -> 'pro' + freeLook: the module opens in full and today's deep look is spent on it
//   free, same module today   -> 'pro' + freeLook (re-opening costs nothing)
//   free, deep look used      -> 'member' (labels only, then the upgrade row)
//   signed out                -> 'anon'   (labels only, then "Create account")
// Server only. Pages call resolveViewer(feature, key) once and hand the result to the gate.

import { getCurrentSubscriber } from '@/lib/auth'
import { getViewerTier } from '@/lib/require-pro'
import type { ViewerTier } from '@/lib/require-pro-types'
import { hasDeepLookLeft, isTodaysModule, recordDeepLook } from '@/lib/deep-look'

export type ResolvedViewer = { tier: ViewerTier; freeLook: boolean }

export async function resolveViewer(feature: string, key: string): Promise<ResolvedViewer> {
  const tier = await getViewerTier()
  if (tier !== 'member') return { tier, freeLook: false }
  const sub = await getCurrentSubscriber()
  if (!sub) return { tier: 'anon', freeLook: false }
  if (await isTodaysModule(sub.id, feature, key)) return { tier: 'pro', freeLook: true }
  if (await hasDeepLookLeft(sub.id)) {
    if (await recordDeepLook(sub.id, feature, key)) return { tier: 'pro', freeLook: true }
  }
  return { tier: 'member', freeLook: false }
}

/** For API routes: may this request see data for a module a free account is allowed today? Spends the look if it is still free. */
export async function allowDeepLookFor(feature: string, key: string): Promise<boolean> {
  const r = await resolveViewer(feature, key)
  return r.tier === 'pro'
}
