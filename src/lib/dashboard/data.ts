import 'server-only'
// src/lib/dashboard/data.ts
//
// Reads league_player_stats (written by scripts/build_league_player_stats.py) for the My x9Lab dashboard: every player of one role for one season, cached
// half an hour. null when the table is missing or empty (logged), so the page says so plainly instead of showing invented numbers. PostgREST caps a response
// at 1,000 rows and a season holds about 800 pitchers and 700 batters, so it still reads a page at a time.

import fs from 'node:fs'
import path from 'node:path'
import { createAdminClient } from '@/lib/supabase'
import { logOnce } from '@/lib/log'
import type { LeagueRow } from './compute'
import type { Role } from './stats'

type Hit = { at: number; rows: LeagueRow[]; season: number; updated: string | null }
const cache = new Map<string, Hit>()
const TTL = 30 * 60 * 1000

/** The newest season in the table, or null when it holds nothing. */
export async function latestSeason(): Promise<number | null> {
  const { data, error } = await createAdminClient().from('league_player_stats').select('season').order('season', { ascending: false }).limit(1)
  if (error) { logOnce('dashboard.latestSeason', 'latestSeason', 'Supabase error', error.message); return null }
  const s = (data as { season: number }[] | null)?.[0]?.season
  return typeof s === 'number' ? s : null
}

/**
 * LOCAL DEVELOPMENT ONLY: when the table is missing or empty, read the file written by
 *   python3 scripts/build_league_player_stats.py --json .dev-cache/league_player_stats.json
 * (the same Savant data the daily job writes). Never used in a deployed build (NODE_ENV is 'production' there).
 */
function devFile(role: Role): { rows: LeagueRow[]; season: number; updated: string | null } | null {
  if (process.env.NODE_ENV !== 'development') return null
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.dev-cache', 'league_player_stats.json'), 'utf8')) as { season: number; updated: string | null; rows: { player_id: number; role: Role; name: string; team_abbr: string | null; position: string | null; stats: Record<string, number> }[] }
    const rows = j.rows.filter(r => r.role === role).map(r => ({ id: r.player_id, name: r.name, team: r.team_abbr, pos: r.position, s: r.stats }))
    return rows.length ? { rows, season: j.season, updated: j.updated } : null
  } catch { return null }
}

export async function getLeagueRows(role: Role, season?: number): Promise<{ rows: LeagueRow[]; season: number; updated: string | null } | null> {
  const y = season ?? (await latestSeason())
  if (y == null) return devFile(role)
  const key = `${y}|${role}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return { rows: hit.rows, season: hit.season, updated: hit.updated }
  const supa = createAdminClient()
  const rows: LeagueRow[] = []
  let updated: string | null = null
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('league_player_stats').select('player_id,name,team_abbr,position,stats,updated_at').eq('season', y).eq('role', role).order('player_id').range(from, from + 999)
    if (error) { logOnce('dashboard.rows', 'getLeagueRows', 'Supabase error', error.message); return devFile(role) }
    const page = (data ?? []) as unknown as { player_id: number; name: string; team_abbr: string | null; position: string | null; stats: Record<string, number>; updated_at: string }[]
    for (const r of page) {
      rows.push({ id: Number(r.player_id), name: r.name, team: r.team_abbr, pos: r.position, s: r.stats ?? {} })
      if (!updated || r.updated_at > updated) updated = r.updated_at
    }
    if (page.length < 1000) break
  }
  if (rows.length === 0) return devFile(role)
  cache.set(key, { at: Date.now(), rows, season: y, updated })
  return { rows, season: y, updated }
}
