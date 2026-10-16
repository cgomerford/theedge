// src/lib/front-office/blueprint.ts
//
// Reads for the Roster Blueprint. Written by scripts/compute_roster_blueprint.py
// (single writer). Team rows are free; the player list is Pro and is only
// queried when the caller has already established isPro.

import { createAdminClient } from '@/lib/supabase'

export const ACQ_TYPES = ['draft', 'international', 'trade', 'mlb_fa', 'milb_fa', 'waiver', 'rule5'] as const
export type AcqType = (typeof ACQ_TYPES)[number]
export type AcqKey = AcqType | 'unclassified'

export const ACQ_LABEL: Record<AcqKey, string> = {
  draft: 'Draft', international: 'International', trade: 'Trade', mlb_fa: 'MLB free agency',
  milb_fa: 'Minor-league signing', waiver: 'Waivers', rule5: 'Rule 5', unclassified: 'Not classified',
}
export const ACQ_COLOR: Record<AcqKey, string> = {
  draft: '#1D9E75', international: '#5DCAA5', trade: '#FF5722', mlb_fa: '#1A1A1A',
  milb_fa: '#8a8275', waiver: '#FDE047', rule5: '#F0997B', unclassified: '#e7e2d8',
}

export type BlueprintTeam = {
  teamId: number
  asOf: string
  war: Record<AcqKey, number>
  counts: Record<AcqKey, number>
  totalWar: number
  homegrownShare: number | null   // (draft + international) share of positive WAR
  tradeShare: number | null
  claimedWar: number              // waivers + Rule 5
  payrollRank: number | null
}

export type BlueprintPlayer = {
  playerId: number; name: string; position: string | null; type: AcqKey
  fromName: string | null; date: string | null; war: number
}

const KEYS: AcqKey[] = [...ACQ_TYPES, 'unclassified']
const zero = (): Record<AcqKey, number> => Object.fromEntries(KEYS.map(k => [k, 0])) as Record<AcqKey, number>

function fill(raw: unknown): Record<AcqKey, number> {
  const out = zero()
  for (const k of KEYS) out[k] = Number((raw as Record<string, unknown> | null)?.[k] ?? 0) || 0   // jsonb numbers can arrive as strings
  return out
}

export async function getBlueprint(season: number): Promise<BlueprintTeam[]> {
  const { data, error } = await createAdminClient()
    .from('team_blueprint_snapshot')
    .select('team_id, as_of, war_by_type, counts_by_type, payroll_rank')
    .eq('season', season)
  if (error) {
    console.error('[getBlueprint] Supabase error:', error.message)
    return []
  }
  return ((data ?? []) as any[]).map(r => {
    const war = fill(r.war_by_type)
    const total = KEYS.reduce((a, k) => a + war[k], 0)
    const classified = total - war.unclassified
    return {
      teamId: Number(r.team_id), asOf: String(r.as_of), war, counts: fill(r.counts_by_type), totalWar: total,
      homegrownShare: classified > 0 ? (war.draft + war.international) / classified : null,
      tradeShare: classified > 0 ? war.trade / classified : null,
      claimedWar: war.waiver + war.rule5,
      payrollRank: r.payroll_rank == null ? null : Number(r.payroll_rank),
    }
  })
}

/** Pro only — caller must have checked isPro before calling. */
export async function getBlueprintPlayers(teamId: number, season: number): Promise<BlueprintPlayer[]> {
  const { data, error } = await createAdminClient()
    .from('roster_acquisitions')
    .select('player_id, player_name, position, acquisition_type, acquired_from_name, acquired_date, war')
    .eq('team_id', teamId).eq('season', season)
    .order('war', { ascending: false })
    .limit(1000)
  if (error) {
    console.error('[getBlueprintPlayers] Supabase error:', error.message)
    return []
  }
  return ((data ?? []) as any[]).map(r => ({
    playerId: Number(r.player_id), name: String(r.player_name ?? ''), position: r.position ?? null,
    type: r.acquisition_type as AcqKey, fromName: r.acquired_from_name ?? null, date: r.acquired_date ?? null,
    war: Number(r.war) || 0,
  }))
}
