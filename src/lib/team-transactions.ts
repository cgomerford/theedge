import { createAdminClient } from './supabase'

export type TeamTransaction = {
  transaction_id: number
  player_id: number
  player_name: string
  team_id?: number | null
  team_name?: string | null
  category: 'IL' | 'ACTIVATION' | 'CALLUP' | 'OPTION' | 'DFA' | 'RELEASE' | 'OUTRIGHTED' | 'TRADE' | 'SIGNING' | 'SUSPENSION' | 'STATUS' | 'OTHER'
  type_code: string
  il_days: number | null
  injury_reason: string | null
  description: string
  transaction_date: string
  from_team_name: string | null
  to_team_name: string | null
  is_milb_move: boolean
  from_team_id: number | null
  to_team_id: number | null
  from_affiliate_level: string | null
  to_affiliate_level: string | null
}

// Categories that matter for the GM Lab — ignore STATUS/OTHER noise
const HIGH_VALUE_CATEGORIES = ['IL', 'ACTIVATION', 'CALLUP', 'OPTION', 'DFA', 'RELEASE', 'TRADE', 'SIGNING', 'SUSPENSION']

// ── Per-team fetch (GM Lab) ────────────────────────────────────────────────────

export async function getTeamTransactions(
  teamId: number,
  days: number = 14
): Promise<TeamTransaction[]> {
  const supa = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { data, error } = await supa
    .from('team_transactions')
    .select('transaction_id, player_id, player_name, category, type_code, il_days, injury_reason, description, transaction_date, from_team_id, from_team_name, from_affiliate_level, to_team_id, to_team_name, to_affiliate_level, is_milb_move')
    .eq('team_id', teamId)
    .in('category', HIGH_VALUE_CATEGORIES)
    .gte('transaction_date', since)
    .order('transaction_date', { ascending: false })
    .limit(20)

  if (error) {
    console.error('getTeamTransactions error:', error.message)
    return []
  }

  return (data ?? []) as TeamTransaction[]
}

// ── Per-team IL list (GM Lab) ─────────────────────────────────────────────────

export async function getTeamILList(teamId: number): Promise<TeamTransaction[]> {
  const supa = createAdminClient()
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { data: ilPlacements } = await supa
    .from('team_transactions')
    .select('player_id, player_name, il_days, injury_reason, transaction_date, description, transaction_id, category, type_code, from_team_name, to_team_name, from_team_id, to_team_id, from_affiliate_level, to_affiliate_level, is_milb_move')
    .eq('team_id', teamId)
    .eq('category', 'IL')
    .gte('transaction_date', since)
    .order('transaction_date', { ascending: false })

  if (!ilPlacements?.length) return []

  const { data: activations } = await supa
    .from('team_transactions')
    .select('player_id, transaction_date')
    .eq('team_id', teamId)
    .eq('category', 'ACTIVATION')
    .gte('transaction_date', since)

  const activatedIds = new Set((activations ?? []).map(a => a.player_id))

  return (ilPlacements as TeamTransaction[]).filter(p => !activatedIds.has(p.player_id))
}

// ── All-teams fetch (Fantasy Desk) ────────────────────────────────────────────

export async function getAllRecentTransactions(
  days: number = 14,
  categories: string[] = HIGH_VALUE_CATEGORIES
): Promise<TeamTransaction[]> {
  const supa = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { data, error } = await supa
    .from('team_transactions')
    .select('transaction_id, player_id, player_name, team_id, team_name, category, type_code, il_days, injury_reason, description, transaction_date, from_team_id, from_team_name, from_affiliate_level, to_team_id, to_team_name, to_affiliate_level, is_milb_move')
    .in('category', categories)
    .gte('transaction_date', since)
    .order('transaction_date', { ascending: false })
    .limit(60)

  if (error) {
    console.error('getAllRecentTransactions error:', error.message)
    return []
  }

  return (data ?? []) as TeamTransaction[]
}

// ── All-teams active IL list (Fantasy Desk) ───────────────────────────────────

export async function getAllActiveIL(): Promise<TeamTransaction[]> {
  const supa = createAdminClient()
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const { data: placements } = await supa
    .from('team_transactions')
    .select('transaction_id, player_id, player_name, team_id, team_name, category, il_days, injury_reason, transaction_date, from_team_name, to_team_name, from_team_id, to_team_id, from_affiliate_level, to_affiliate_level, is_milb_move, type_code, description')
    .eq('category', 'IL')
    .gte('transaction_date', since)
    .order('transaction_date', { ascending: false })
    .limit(100)

  if (!placements?.length) return []

  // Subtract players who have since been activated
  const { data: activations } = await supa
    .from('team_transactions')
    .select('player_id')
    .eq('category', 'ACTIVATION')
    .gte('transaction_date', since)

  const activatedIds = new Set((activations ?? []).map(a => a.player_id))

  return (placements as TeamTransaction[]).filter(p => !activatedIds.has(p.player_id))
}