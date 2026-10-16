// src/lib/front-office/team.ts
//
// Reads for the team Front Office page. The snapshot is written by
// scripts/compute_team_front_office.py (single writer); contracts live in
// player_contract_seasons (scripts/load_contracts_csv.py). Nothing here calls
// an external API, and nothing is estimated: a missing number is null.

import { createAdminClient } from '@/lib/supabase'
import { MLB_TEAMS } from '@/lib/teams'

// The Front Office is locked to one club for now. Change here to point it elsewhere.
export const FO_TEAM = MLB_TEAMS.find(t => t.slug === 'phillies')!

export type RosterPlayer = {
  id: number; name: string; pos: string; isPitcher: boolean; age: number | null; bats: string | null; throws: string | null
  status: string; statusText: string; war: number | null; wrcPlus: number | null; fip: number | null
  g: number | null
  // hitters
  pa: number | null; avg: number | null; obp: number | null; slg: number | null; ops: number | null
  hr: number | null; rbi: number | null; sb: number | null
  // pitchers
  gs: number | null; ip: number | null; era: number | null; whip: number | null; sv: number | null
  so: number | null; bb: number | null
}

export type Prospect = {
  id: number; name: string; pos: string; isPitcher: boolean; age: number; level: string; levelSportId: number
  bats: string | null; throws: string | null; g: number | null
  pa: number | null; avg: number | null; obp: number | null; slg: number | null; ops: number | null; hr: number | null; sb: number | null
  ip: number | null; era: number | null; whip: number | null; so: number | null; bb: number | null; gs: number | null
}

export type TeamSnapshot = { teamId: number; season: number; asOf: string; roster: RosterPlayer[]; prospects: Prospect[] }

export type ContractYear = { playerId: number; season: number; salary: number; deferred: number; guaranteed: boolean; option: string | null; sourceUrl: string; verifiedAt: string }

// jsonb numbers can arrive as strings; coerce, and keep null as null (never 0).
const n = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v))

export async function getTeamSnapshot(teamId: number): Promise<TeamSnapshot | null> {
  const { data, error } = await createAdminClient()
    .from('team_front_office_snapshot')
    .select('team_id, season, as_of, roster, prospects')
    .eq('team_id', teamId)
    .order('season', { ascending: false })
    .limit(1)
  if (error) {
    console.error('[getTeamSnapshot] Supabase error:', error.message)
    return null
  }
  const r = ((data ?? []) as any[])[0]
  if (!r) return null
  const roster: RosterPlayer[] = ((r.roster ?? []) as any[]).map(p => ({
    id: Number(p.id), name: String(p.name), pos: String(p.pos), isPitcher: Boolean(p.is_pitcher), age: n(p.age),
    bats: s(p.bats), throws: s(p.throws), status: String(p.status), statusText: String(p.status_text ?? ''),
    war: n(p.war), wrcPlus: n(p.wrc_plus), fip: n(p.fip), g: n(p.g),
    pa: n(p.pa), avg: n(p.avg), obp: n(p.obp), slg: n(p.slg), ops: n(p.ops), hr: n(p.hr), rbi: n(p.rbi), sb: n(p.sb),
    gs: n(p.gs), ip: n(p.ip), era: n(p.era), whip: n(p.whip), sv: n(p.sv), so: n(p.so), bb: n(p.bb),
  }))
  const prospects: Prospect[] = ((r.prospects ?? []) as any[]).map(p => ({
    id: Number(p.id), name: String(p.name), pos: String(p.pos ?? ''), isPitcher: Boolean(p.is_pitcher), age: Number(p.age),
    level: String(p.level), levelSportId: Number(p.level_sport_id), bats: s(p.bats), throws: s(p.throws), g: n(p.g),
    pa: n(p.pa), avg: n(p.avg), obp: n(p.obp), slg: n(p.slg), ops: n(p.ops), hr: n(p.hr), sb: n(p.sb),
    ip: n(p.ip), era: n(p.era), whip: n(p.whip), so: n(p.so), bb: n(p.bb), gs: n(p.gs),
  }))
  return { teamId: Number(r.team_id), season: Number(r.season), asOf: String(r.as_of), roster, prospects }
}

/** Contract rows for the given players, from this season onward. Empty until the table is loaded by hand. */
export async function getContracts(playerIds: number[], fromSeason: number): Promise<ContractYear[]> {
  if (playerIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('player_contract_seasons')
    .select('player_id, season, salary_usd, deferred_usd, guaranteed, option_type, source_url, verified_at')
    .in('player_id', playerIds)
    .gte('season', fromSeason)
    .order('season', { ascending: true })
    .limit(1000)
  if (error) {
    console.error('[getContracts] Supabase error:', error.message)
    return []
  }
  return ((data ?? []) as any[]).map(r => ({
    playerId: Number(r.player_id), season: Number(r.season), salary: Number(r.salary_usd) || 0,   // bigint/numeric can arrive as strings
    deferred: Number(r.deferred_usd) || 0, guaranteed: Boolean(r.guaranteed), option: s(r.option_type),
    sourceUrl: String(r.source_url), verifiedAt: String(r.verified_at),
  }))
}
