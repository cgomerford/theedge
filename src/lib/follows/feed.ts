// src/lib/follows/feed.ts
//
// "For your follows": real transaction rows for the clubs and players a person follows, from team_transactions (filled daily by scripts/fetch_team_transactions.py).
// One read of the stored table, last 30 days, newest first. Returns [] on failure with a logged reason; nothing is invented.

import { createAdminClient } from '@/lib/supabase'

export type FeedRow = { date: string; text: string; who: string; kind: 'team' | 'player' }
const CATS = ['IL', 'ACTIVATION', 'CALLUP', 'OPTION', 'DFA', 'RELEASE', 'OUTRIGHTED', 'TRADE', 'SIGNING', 'SUSPENSION']

export async function getFollowFeed(teamIds: { id: number; short: string }[], playerIds: { id: number; name: string }[], limit = 6): Promise<FeedRow[]> {
  if (teamIds.length === 0 && playerIds.length === 0) return []
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const supa = createAdminClient()
  const ors = [teamIds.length ? `team_id.in.(${teamIds.map(t => t.id).join(',')})` : '', playerIds.length ? `player_id.in.(${playerIds.map(p => p.id).join(',')})` : ''].filter(Boolean).join(',')
  const { data, error } = await supa.from('team_transactions').select('transaction_id, team_id, player_id, player_name, category, description, transaction_date').or(ors).in('category', CATS).gte('transaction_date', since).order('transaction_date', { ascending: false }).limit(60)
  if (error) { console.error('[getFollowFeed] Supabase error:', error.message); return [] }
  const seen = new Set<number>()
  const out: FeedRow[] = []
  for (const r of (data ?? []) as { transaction_id: number; team_id: number | null; player_id: number; player_name: string; description: string; transaction_date: string }[]) {
    if (seen.has(r.transaction_id)) continue
    seen.add(r.transaction_id)
    const p = playerIds.find(x => x.id === Number(r.player_id))
    const t = teamIds.find(x => x.id === Number(r.team_id))
    out.push(p ? { date: r.transaction_date, text: `${p.name} transaction: ${r.description}`, who: p.name, kind: 'player' } : { date: r.transaction_date, text: `${t?.short ?? 'Club'} transaction: ${r.description}`, who: t?.short ?? 'Club', kind: 'team' })
    if (out.length >= limit) break
  }
  return out
}
