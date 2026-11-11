import 'server-only'
// src/lib/milb-shape/compare-server.ts
//
// Reads each level's pitcher rows for one pitch type and hand and hands them to compare.ts. MLB reads pitch_shape_pitcher for this season; Triple-A and the Florida State
// League read pitch_shape_pitcher_milb for the newest season loaded. Cached half an hour per pitch type and hand. A level with no rows is left out, never filled in.

import { createAdminClient } from '@/lib/supabase'
import { logOnce } from '@/lib/log'
import { milbDb } from './dev-db'
import { meanDelta, movers, summarise, type LevelSummary, type Mover, type PRow, type Shape } from './compare'
import { latestMilbSeason } from './server'
import type { Level } from './levels'
import { limitsFor } from './limits'

const COLS = 'pitcher_id,pitcher_name,team_abbr,n_pitches,velo,ivb,hb,slot,n_swings,n_whiffs'
const TTL = 30 * 60 * 1000
const cache = new Map<string, { at: number; v: LevelsCompared }>()

/** any two levels, lower first (Florida State League, Arizona Fall League, Triple-A, Spring Training, MLB): the pitchers who threw this pitch at both */
export type Pair = `${Level}-${Level}`
export type MoverSet = { pair: Pair; low: Level; high: Level; count: number; mean: (Shape & { n: number }) | null; list: Mover[] }
export type LevelsCompared = { levels: LevelSummary[]; movers: MoverSet[] }

async function rowsFor(level: Level, type: string, hand: string): Promise<{ season: number; rows: PRow[] } | null> {
  const milb = level !== 'mlb'
  const season = milb ? await latestMilbSeason(level) : new Date().getFullYear()
  if (season == null) return null
  const supa = milb ? await milbDb() : createAdminClient()
  const rows: PRow[] = []
  for (let from = 0; ; from += 1000) {
    const base = milb ? supa.from('pitch_shape_pitcher_milb').select(COLS).eq('level', level) : supa.from('pitch_shape_pitcher').select(COLS)
    const { data, error } = await base.eq('season', season).eq('pitch_type', type).eq('p_throws', hand).order('pitcher_id').range(from, from + 999)
    if (error) { logOnce(`levels.${level}`, 'getLevelsCompared', 'Supabase error', error.message); return null }
    const page = (data ?? []) as unknown as PRow[]
    rows.push(...page)
    if (page.length < 1000) break
  }
  // the exhibition levels list a pitcher from 30 pitches (limits.ts); the other levels keep every row the importer wrote
  const lim = limitsFor(level)
  const kept = lim.gated ? rows : rows.filter(r => Number(r.n_pitches) >= lim.comparePitches)
  return kept.length ? { season, rows: kept } : null
}

export async function getLevelsCompared(type: string, hand: string): Promise<LevelsCompared> {
  const key = `${type}|${hand}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.v
  const lv: Level[] = ['mlb', 'aaa', 'fsl', 'afl', 'st']
  const got = await Promise.all(lv.map(l => rowsFor(l, type, hand)))
  const by = new Map<Level, { season: number; rows: PRow[] }>()
  lv.forEach((l, i) => { const g = got[i]; if (g) by.set(l, g) })
  const levels = lv.map(l => { const g = by.get(l); return g ? summarise(l, g.season, g.rows) : null }).filter((x): x is LevelSummary => x != null)
  const ORDER: Level[] = ['fsl', 'afl', 'aaa', 'st', 'mlb']   // lowest to highest
  const ms: MoverSet[] = []
  for (let i = 0; i < ORDER.length; i++) for (let j = i + 1; j < ORDER.length; j++) {
    const low = ORDER[i], high = ORDER[j]
    const a = by.get(low), b = by.get(high)
    if (!a || !b) continue
    // a short exhibition stay (Arizona Fall League, Spring Training) has fewer pitches of one type than a season, so it needs a lower bar than the 150 the full levels use
    const min = limitsFor(low).gated && limitsFor(high).gated ? 150 : 50
    const list = movers({ level: low, rows: a.rows }, { level: high, rows: b.rows }, min)
    ms.push({ pair: `${low}-${high}`, low, high, count: list.length, mean: meanDelta(list), list: list.slice(0, 40) })
  }
  const v = { levels, movers: ms }
  cache.set(key, { at: Date.now(), v })
  return v
}
