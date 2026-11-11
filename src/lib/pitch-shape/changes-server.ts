import 'server-only'
// src/lib/pitch-shape/changes-server.ts
//
// Server readers for "what changed": a pitcher's shape moving during a season, pitches added or dropped, the gap between his fastball and his other pitches opening or closing, and pitches
// that exist at one level but not another. Everything is read from tables the pipeline already writes (pitch_shape_monthly, pitch_shape_pitcher, pitch_shape_pitcher_milb); nothing is
// fetched from Savant here. The rules live in changes.ts. Read only: this file writes nothing. League-wide answers are cached an hour (they change when the nightly job runs).

import { createAdminClient } from '@/lib/supabase'
import { milbDb } from '@/lib/milb-shape/dev-db'
import { latestMilbSeason } from '@/lib/milb-shape/server'
import type { Level } from '@/lib/milb-shape/levels'
import { logOnce } from '@/lib/log'
import { SEPARATION_FLAG, pitchChanges, separations, usageChanges, type MonthRow, type PitchChange, type Separation, type UsageChange } from './changes'

export type PitcherRef = { id: number; name: string; team: string }
export type SeasonChanges = {
  season: number
  changes: (PitchChange & { pitcher: PitcherRef })[]
  usage: (UsageChange & { pitcher: PitcherRef })[]
  separation: (Separation & { pitcher: PitcherRef })[]
}
export type PitcherChanges = { season: number; changes: PitchChange[]; usage: UsageChange[]; separation: Separation[] }

type Raw = { pitcher_id: number; pitch_type: string; month: number; n_pitches: number; release_pos_x: string | number; release_pos_z: string | number; release_extension: string | number | null; release_speed: string | number; release_spin_rate: string | number | null; ivb: string | number; hb: string | number }
const COLS = 'pitcher_id,pitch_type,month,n_pitches,release_pos_x,release_pos_z,release_extension,release_speed,release_spin_rate,ivb,hb'
const num = (v: string | number | null) => (v == null ? null : Number(v))   // numeric columns arrive as strings
const toRow = (r: Raw): MonthRow => ({ pitchType: r.pitch_type, month: r.month, n: r.n_pitches, speed: Number(r.release_speed), spin: num(r.release_spin_rate), ivb: Number(r.ivb), hb: Number(r.hb), relX: Number(r.release_pos_x), relZ: Number(r.release_pos_z), ext: num(r.release_extension) })

/** Every monthly row of a season (PostgREST returns 1,000 at a time, so this pages), or null on a database error (logged). */
async function seasonRows(season: number): Promise<Map<number, MonthRow[]> | null> {
  const supa = createAdminClient()
  const by = new Map<number, MonthRow[]>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('pitch_shape_monthly').select(COLS).eq('season', season).order('pitcher_id').order('pitch_type').order('month').range(from, from + 999)
    if (error) { logOnce('changes.rows', 'seasonRows', 'Supabase error', error.message); return null }
    const rows = (data ?? []) as unknown as Raw[]
    for (const r of rows) (by.get(r.pitcher_id) ?? by.set(r.pitcher_id, []).get(r.pitcher_id)!).push(toRow(r))
    if (rows.length < 1000) break
  }
  return by
}

type NameRow = { pitcher_id: number; pitcher_name: string | null; team_abbr: string | null }
/** Name and club of every pitcher with a season row, from pitch_shape_pitcher (MLB) or pitch_shape_pitcher_milb (level). */
async function pitcherNames(season: number, level: Level = 'mlb'): Promise<Map<number, PitcherRef>> {
  const out = new Map<number, PitcherRef>()
  const supa = level === 'mlb' ? createAdminClient() : await milbDb()
  for (let from = 0; ; from += 1000) {
    const base = level === 'mlb' ? supa.from('pitch_shape_pitcher').select('pitcher_id,pitcher_name,team_abbr').eq('season', season) : supa.from('pitch_shape_pitcher_milb').select('pitcher_id,pitcher_name,team_abbr').eq('level', level).eq('season', season)
    const { data, error } = await base.order('pitcher_id').range(from, from + 999)
    if (error) { logOnce('changes.names', 'pitcherNames', 'Supabase error', error.message); break }
    const rows = (data ?? []) as unknown as NameRow[]
    for (const r of rows) if (!out.has(r.pitcher_id)) out.set(r.pitcher_id, { id: r.pitcher_id, name: r.pitcher_name ?? `#${r.pitcher_id}`, team: r.team_abbr ?? '' })
    if (rows.length < 1000) break
  }
  return out
}

const cache = new Map<string, { at: number; v: unknown }>()
const TTL = 60 * 60 * 1000
async function cached<T>(key: string, make: () => Promise<T | null>): Promise<T | null> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.v as T
  const v = await make()
  if (v != null) cache.set(key, { at: Date.now(), v })
  return v
}

/** League-wide: the biggest in-season moves, every pitch added or dropped, and the fastball gaps that opened or closed. null when the table cannot be read. */
export function getSeasonChanges(season: number): Promise<SeasonChanges | null> {
  return cached(`season:${season}`, async () => {
    const [rows, names] = await Promise.all([seasonRows(season), pitcherNames(season)])
    if (!rows) return null
    const out: SeasonChanges = { season, changes: [], usage: [], separation: [] }
    for (const [id, rs] of rows) {
      const pitcher = names.get(id)
      if (!pitcher) continue   // no season line for him: nothing to name him with
      for (const c of pitchChanges(rs)) if (c.flagged.length) out.changes.push({ ...c, pitcher })
      for (const u of usageChanges(rs)) out.usage.push({ ...u, pitcher })
      for (const s of separations(rs)) if (Math.abs(s.change) >= SEPARATION_FLAG) out.separation.push({ ...s, pitcher })
    }
    out.changes.sort((a, b) => b.score - a.score)
    out.separation.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    out.changes = out.changes.slice(0, 150)
    out.separation = out.separation.slice(0, 80)
    out.usage = out.usage.slice(0, 120)
    return out
  })
}

/** One pitcher: every pitch's change (flagged or not), his added and dropped pitches, and his fastball gaps. */
export async function getPitcherChanges(id: number, season: number): Promise<PitcherChanges | null> {
  const { data, error } = await createAdminClient().from('pitch_shape_monthly').select(COLS).eq('season', season).eq('pitcher_id', id).order('month')
  if (error) { logOnce('changes.pitcher', 'getPitcherChanges', 'Supabase error', error.message); return null }
  const rows = ((data ?? []) as unknown as Raw[]).map(toRow)
  if (rows.length === 0) return { season, changes: [], usage: [], separation: [] }
  return { season, changes: pitchChanges(rows), usage: usageChanges(rows), separation: separations(rows) }
}

// ---- pitches that exist at one level and not another -----------------------------------------------------------------------------------------------------------------

export type LevelDrop = {
  pitcher: PitcherRef
  pitchType: string
  /** 'not-in-mlb': thrown at the lower level, not (or under 50 pitches) in MLB; 'new-in-mlb': in MLB, not at the lower level */
  kind: 'not-in-mlb' | 'new-in-mlb'
  level: Level
  nLevel: number
  nMlb: number
}
type PRow = { pitcher_id: number; pitch_type: string; n_pitches: number }

/** A pitch counts as one he throws at a level from this many pitches; under the importer's own minimum it is simply not in the table. */
const THROWN = 100
/** Both levels need this many pitches in all, so a short stint is never read as a change of repertoire. */
const BOTH_LEVELS_MIN = 300

async function repertoires(level: Level, season: number): Promise<Map<number, Map<string, number>>> {
  const out = new Map<number, Map<string, number>>()
  const supa = level === 'mlb' ? createAdminClient() : await milbDb()
  for (let from = 0; ; from += 1000) {
    const base = level === 'mlb' ? supa.from('pitch_shape_pitcher').select('pitcher_id,pitch_type,n_pitches').eq('season', season) : supa.from('pitch_shape_pitcher_milb').select('pitcher_id,pitch_type,n_pitches').eq('level', level).eq('season', season)
    const { data, error } = await base.order('pitcher_id').order('pitch_type').range(from, from + 999)
    if (error) { logOnce('changes.rep', 'repertoires', 'Supabase error', error.message); break }
    const rows = (data ?? []) as unknown as PRow[]
    for (const r of rows) { const m = out.get(r.pitcher_id) ?? out.set(r.pitcher_id, new Map()).get(r.pitcher_id)!; m.set(r.pitch_type, (m.get(r.pitch_type) ?? 0) + Number(r.n_pitches)) }
    if (rows.length < 1000) break
  }
  return out
}

/** Pitchers seen at MLB and at a lower level (or in Spring Training) in the same pitching year: pitches he throws at one and not the other. */
export function getLevelDrops(season: number): Promise<{ season: number; drops: LevelDrop[] } | null> {
  return cached(`levels:${season}`, async () => {
    const [mlb, names] = await Promise.all([repertoires('mlb', season), pitcherNames(season)])
    if (mlb.size === 0) return null
    const drops: LevelDrop[] = []
    for (const level of ['fsl', 'aaa', 'afl', 'st'] as const) {
      const s = await latestMilbSeason(level)
      if (s == null || Math.abs(s - season) > 1) continue   // only a level loaded for this pitching year
      const [low, lowNames] = await Promise.all([repertoires(level, s), pitcherNames(s, level)])
      for (const [id, lowTypes] of low) {
        const hi = mlb.get(id)
        if (!hi) continue
        const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
        if (sum(lowTypes) < BOTH_LEVELS_MIN || sum(hi) < BOTH_LEVELS_MIN) continue
        const pitcher = names.get(id) ?? lowNames.get(id)
        if (!pitcher) continue
        for (const [t, n] of lowTypes) if (n >= THROWN && (hi.get(t) ?? 0) < 50) drops.push({ pitcher, pitchType: t, kind: 'not-in-mlb', level, nLevel: n, nMlb: hi.get(t) ?? 0 })
        for (const [t, n] of hi) if (n >= THROWN && (lowTypes.get(t) ?? 0) < 50) drops.push({ pitcher, pitchType: t, kind: 'new-in-mlb', level, nLevel: lowTypes.get(t) ?? 0, nMlb: n })
      }
    }
    drops.sort((a, b) => Math.max(b.nLevel, b.nMlb) - Math.max(a.nLevel, a.nMlb))
    return { season, drops: drops.slice(0, 200) }
  })
}
