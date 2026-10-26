import 'server-only'
// The free deep look: a free account opens ONE full Pro module a day. Unit of a look = one feature for one entity for one
// Europe/London day (re-opening the same one is free). State lives in public.deep_looks (supabase/migrations/..._deep_looks.sql);
// the day is worked out in SQL, so it is DST-safe and never depends on the server clock.
// Fails closed: any Supabase error (table or function not created yet, network) is 'unavailable' for free users, logged once, never thrown.
// Pro never reaches the database here.

import { getCurrentSubscriber } from '@/lib/auth'
import { isProViewer } from '@/lib/require-pro'
import { createAdminClient } from '@/lib/supabase'
import { isSampleEntity } from '@/lib/lab-sample'
import type { DeepLookFeature } from '@/lib/deep-look-types'

export const DEEP_LOOKS_PER_DAY = 1

export type { DeepLookFeature } from '@/lib/deep-look-types'
export type DeepLookState = 'pro' | 'signed_out' | 'look_left' | 'this_look' | 'used' | 'unavailable'

let warned = false
function unavailable(code: string | undefined): 'unavailable' {
  if (!warned) { warned = true; console.warn('[deep-look] unavailable', code ?? 'error') }
  return 'unavailable'
}

export async function getDeepLookState(feature: DeepLookFeature, entityId: string): Promise<DeepLookState> {
  if (await isProViewer()) return 'pro'
  const sub = await getCurrentSubscriber()
  if (!sub) return 'signed_out'
  try {
    const supa = createAdminClient()
    const has = await supa.rpc('has_deep_look', { p_subscriber: sub.id, p_feature: feature, p_entity: String(entityId) })
    if (has.error) return unavailable(has.error.code)
    if (has.data === true) return 'this_look'
    const used = await supa.rpc('deep_looks_used_today', { p_subscriber: sub.id })
    if (used.error) return unavailable(used.error.code)
    return Number(used.data) >= DEEP_LOOKS_PER_DAY ? 'used' : 'look_left'
  } catch (e) {
    return unavailable(e instanceof Error ? e.message : undefined)
  }
}

/** Spend today's look on this feature + entity if one is left. Claims nothing for Pro or signed-out visitors. */
export async function claimDeepLook(feature: DeepLookFeature, entityId: string): Promise<DeepLookState> {
  if (await isProViewer()) return 'pro'
  const sub = await getCurrentSubscriber()
  if (!sub) return 'signed_out'
  try {
    const supa = createAdminClient()
    const { data, error } = await supa.rpc('claim_deep_look', { p_subscriber: sub.id, p_feature: feature, p_entity: String(entityId), p_limit: DEEP_LOOKS_PER_DAY })
    if (error) return unavailable(error.code)
    // Funnel events (look_used / look_limit_hit): skipped, there is no funnel_events helper in this codebase.
    return data === 'claimed' || data === 'existing' ? 'this_look' : 'used'
  } catch (e) {
    return unavailable(e instanceof Error ? e.message : undefined)
  }
}

/** For API guards: true if Pro or this exact feature + entity is today's look. Never claims. */
export async function canReadDeepData(feature: DeepLookFeature, entityId: string): Promise<boolean> {
  if (isSampleEntity(feature, entityId)) return true // the lab preview's sample players are public (lib/lab-sample.ts)
  const s = await getDeepLookState(feature, entityId)
  return s === 'pro' || s === 'this_look'
}

/** API guard: null when allowed, otherwise the same 403 shape requirePro uses. */
export async function requireDeepLook(feature: DeepLookFeature, entityId: string | number | null | undefined): Promise<Response | null> {
  if (entityId != null && entityId !== '' && (await canReadDeepData(feature, String(entityId)))) return null
  return Response.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
}

/** API guard for routes several modules share: null when Pro, or when ANY listed (feature, entity) is today's look. */
export async function requireAnyDeepLook(candidates: Array<[DeepLookFeature, string | null | undefined]>): Promise<Response | null> {
  for (const [feature, id] of candidates) {
    if (id != null && id !== '' && (await canReadDeepData(feature, String(id)))) return null
  }
  // Pro viewers pass even when no id was sent (getDeepLookState returns 'pro' before looking at the entity).
  if (await isProViewer()) return null
  return Response.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
}
