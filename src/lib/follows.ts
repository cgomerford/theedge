// Follows. Teams live on subscribers.teams (the same list the preferences page edits); players live in player_follows
// (supabase/migrations/20261026100000_player_follows.sql). Free accounts: 10 players, 3 teams. Pro has no limit.
// Single writer for player_follows: this file. Every function returns null / [] on failure and logs with its name.

import { createAdminClient } from '@/lib/supabase'
import type { AuthSubscriber } from '@/lib/auth'
import { FREE_LIMITS } from '@/lib/follows/config'
import { getDevView } from '@/lib/dev-view'

export const FOLLOW_LIMITS = FREE_LIMITS
export type FollowKind = 'player' | 'team'

export type PlayerFollow = { player_id: number; player_name: string }

// Local "view as Pro" only (next dev, never a deployed build): when that view is on and the list is empty, these three players are shown as followed, so the follows row, /me and
// the Follow buttons can be seen filled in. Read-only: nothing is written to player_follows. Ids checked against the MLB people search.
const DEV_PRO_DEMO_FOLLOWS: PlayerFollow[] = [
  { player_id: 547180, player_name: 'Bryce Harper' },
  { player_id: 681082, player_name: 'Bryson Stott' },
  { player_id: 664761, player_name: 'Alec Bohm' },
]

export async function getPlayerFollows(subscriberId: string): Promise<PlayerFollow[]> {
  const { data, error } = await createAdminClient()
    .from('player_follows')
    .select('player_id, player_name')
    .eq('subscriber_id', subscriberId)
    .order('created_at', { ascending: false })
    .range(0, 999)
  if (error) {
    console.error('[getPlayerFollows] Supabase error:', error.message)
    return []
  }
  const rows = ((data ?? []) as { player_id: number | string; player_name: string }[]).map(r => ({
    player_id: Number(r.player_id),
    player_name: r.player_name,
  }))
  if (rows.length === 0 && (await getDevView()) === 'pro') return DEV_PRO_DEMO_FOLLOWS
  return rows
}

export type FollowState = { following: boolean; atLimit: boolean }

export async function getFollowState(sub: AuthSubscriber, kind: FollowKind, ref: string): Promise<FollowState> {
  if (kind === 'team') {
    const following = sub.teams.includes(ref)
    return { following, atLimit: !sub.is_pro && !following && sub.teams.length >= FOLLOW_LIMITS.team }
  }
  const follows = await getPlayerFollows(sub.id)
  const following = follows.some(f => f.player_id === Number(ref))
  return { following, atLimit: !sub.is_pro && !following && follows.length >= FOLLOW_LIMITS.player }
}

export type ToggleResult = { ok: true; following: boolean } | { ok: false; error: 'limit' | 'unavailable' | 'invalid' }

export async function toggleFollow(sub: AuthSubscriber, kind: FollowKind, ref: string, name: string): Promise<ToggleResult> {
  const supa = createAdminClient()

  if (kind === 'team') {
    const has = sub.teams.includes(ref)
    if (!has && !sub.is_pro && sub.teams.length >= FOLLOW_LIMITS.team) return { ok: false, error: 'limit' }
    const teams = has ? sub.teams.filter(t => t !== ref) : [...sub.teams, ref]
    const { error } = await supa.from('subscribers').update({ teams }).eq('id', sub.id)
    if (error) {
      console.error('[toggleFollow] team update error:', error.message)
      return { ok: false, error: 'unavailable' }
    }
    return { ok: true, following: !has }
  }

  const playerId = Number(ref)
  if (!Number.isInteger(playerId) || playerId <= 0) return { ok: false, error: 'invalid' }

  const { data: existing, error: readError } = await supa
    .from('player_follows')
    .select('player_id')
    .eq('subscriber_id', sub.id)
    .eq('player_id', playerId)
    .maybeSingle()
  if (readError) {
    console.error('[toggleFollow] read error:', readError.message)
    return { ok: false, error: 'unavailable' }
  }

  if (existing) {
    const { error } = await supa.from('player_follows').delete().eq('subscriber_id', sub.id).eq('player_id', playerId)
    if (error) {
      console.error('[toggleFollow] delete error:', error.message)
      return { ok: false, error: 'unavailable' }
    }
    return { ok: true, following: false }
  }

  if (!sub.is_pro) {
    const { count, error } = await supa.from('player_follows').select('player_id', { count: 'exact', head: true }).eq('subscriber_id', sub.id)
    if (error) {
      console.error('[toggleFollow] count error:', error.message)
      return { ok: false, error: 'unavailable' }
    }
    if ((count ?? 0) >= FOLLOW_LIMITS.player) return { ok: false, error: 'limit' }
  }

  const { error } = await supa.from('player_follows').insert({ subscriber_id: sub.id, player_id: playerId, player_name: name.slice(0, 120) })
  if (error) {
    console.error('[toggleFollow] insert error:', error.message)
    return { ok: false, error: 'unavailable' }
  }
  return { ok: true, following: true }
}
