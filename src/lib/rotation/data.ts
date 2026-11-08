import 'server-only'
// src/lib/rotation/data.ts
//
// Reads rotation_apps and rotation_pitchers (written by scripts/build_rotation_board.py) for the Rotation Lab, cached half an hour. null when the tables are
// missing or empty (logged), so the page says so plainly instead of showing invented numbers. PostgREST caps a response at 1,000 rows and a season holds about
// 20,000 appearances, so it reads a page at a time.
//
// LOCAL DEVELOPMENT ONLY: when the tables are missing or empty, read the file written by
//   python3 scripts/build_rotation_board.py --parquet models/data/pitches_2026.parquet --json .dev-cache/rotation.json
// Never used in a deployed build (NODE_ENV is 'production' there).

import fs from 'node:fs'
import path from 'node:path'
import { createAdminClient } from '@/lib/supabase'
import { logOnce } from '@/lib/log'
import { MLB_TEAMS } from '@/lib/teams'
import { readTeam, type App, type FbBlock, type Info, type PitcherRead, type TeamRotation } from './flags'

type AppRow = { player_id: number; game_pk: number; game_date: string; team: string; opp: string | null; is_start: boolean; pitches: number; bf: number; outs: number; k: number; bb: number; csw: number | string | null; fb: Record<string, FbBlock> | null }
type PitRow = { player_id: number; name: string; throws: string | null; team: string | null; il_code: string | null; il_desc: string | null }

export type RotationData = { season: number; asOf: string; updated: string | null; byPlayer: Map<number, App[]>; info: Map<number, Info> }

const toApp = (r: AppRow): App => ({
  gamePk: Number(r.game_pk), date: String(r.game_date).slice(0, 10), team: r.team, opp: r.opp, isStart: !!r.is_start,
  pitches: Number(r.pitches), bf: Number(r.bf), outs: Number(r.outs), k: Number(r.k), bb: Number(r.bb), csw: r.csw == null ? null : Number(r.csw), fb: r.fb ?? {},
})

function assemble(season: number, apps: AppRow[], pits: PitRow[], updated: string | null): RotationData | null {
  if (apps.length === 0) return null
  const byPlayer = new Map<number, App[]>()
  let asOf = ''
  for (const r of apps) {
    const a = toApp(r)
    if (a.date > asOf) asOf = a.date
    const id = Number(r.player_id)
    const list = byPlayer.get(id)
    if (list) list.push(a); else byPlayer.set(id, [a])
  }
  const info = new Map<number, Info>()
  for (const p of pits) info.set(Number(p.player_id), { name: p.name, throws: p.throws, team: p.team, ilCode: p.il_code, ilDesc: p.il_desc })
  return { season, asOf, updated, byPlayer, info }
}

function devFile(): RotationData | null {
  if (process.env.NODE_ENV !== 'development') return null
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.dev-cache', 'rotation.json'), 'utf8')) as { apps: AppRow[]; pitchers: PitRow[] }
    return assemble(Number((j.apps[0] as unknown as { season: number }).season), j.apps, j.pitchers, null)
  } catch { return null }
}

let hit: { at: number; data: RotationData } | null = null
const TTL = 30 * 60 * 1000

export async function getRotationData(): Promise<RotationData | null> {
  if (hit && Date.now() - hit.at < TTL) return hit.data
  const supa = createAdminClient()
  const latest = await supa.from('rotation_apps').select('season').order('season', { ascending: false }).limit(1)
  if (latest.error) { logOnce('rotation.latest', 'getRotationData', 'Supabase error', latest.error.message); return devFile() }
  const season = (latest.data as { season: number }[] | null)?.[0]?.season
  if (typeof season !== 'number') return devFile()
  const apps: AppRow[] = []
  let updated: string | null = null
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('rotation_apps')
      .select('player_id,game_pk,game_date,team,opp,is_start,pitches,bf,outs,k,bb,csw,fb,updated_at').eq('season', season).order('game_pk').order('player_id').range(from, from + 999)
    if (error) { logOnce('rotation.apps', 'getRotationData', 'Supabase error', error.message); return devFile() }
    const page = (data ?? []) as unknown as (AppRow & { updated_at: string })[]
    for (const r of page) { apps.push(r); if (!updated || r.updated_at > updated) updated = r.updated_at }
    if (page.length < 1000) break
  }
  const pits: PitRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('rotation_pitchers').select('player_id,name,throws,team,il_code,il_desc').eq('season', season).order('player_id').range(from, from + 999)
    if (error) { logOnce('rotation.pitchers', 'getRotationData', 'Supabase error', error.message); return devFile() }
    const page = (data ?? []) as unknown as PitRow[]
    pits.push(...page)
    if (page.length < 1000) break
  }
  const out = assemble(season, apps, pits, updated)
  if (!out) return devFile()
  hit = { at: Date.now(), data: out }
  return out
}

/** One club's rotation, read against its own starts. */
export function getTeamRotation(d: RotationData, abbr: string): TeamRotation {
  return readTeam(abbr, d.byPlayer, d.info, d.asOf)
}

export type LeagueRow = { abbr: string; name: string; id: number; flagged: number; watch: number; steady: number; thin: number; out: number; rotation: number; lead: PitcherRead | null }

/** Every club's rotation status counts, flagged first. A lead is the rotation arm with the most fired signals. */
export function getLeagueBoard(d: RotationData): LeagueRow[] {
  const rows = MLB_TEAMS.map(t => {
    const r = readTeam(t.abbrev, d.byPlayer, d.info, d.asOf)
    const count = (s: PitcherRead['status']) => r.rotation.filter(p => p.status === s).length
    const fired = (p: PitcherRead) => p.signals.filter(s => s.key !== 'miss' && (s.level === 'watch' || s.level === 'flag')).length
    const lead = [...r.rotation].filter(p => p.status === 'flagged').sort((a, b) => fired(b) - fired(a))[0] ?? null
    return { abbr: t.abbrev, name: t.short, id: t.id, flagged: count('flagged'), watch: count('watch'), steady: count('steady'), thin: count('thin'), out: r.rotation.filter(p => p.status === 'out').length + r.out.length, rotation: r.rotation.length, lead }
  })
  return rows.sort((a, b) => b.flagged - a.flagged || b.watch - a.watch || a.name.localeCompare(b.name))
}

