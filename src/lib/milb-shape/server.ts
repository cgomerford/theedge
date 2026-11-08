import 'server-only'
// src/lib/milb-shape/server.ts
//
// Server readers for minor-league coverage: which season a level has, and what it can show (the capability service). Reads pitch_shape_milb_runs, the one row per level
// and season the importer writes last. Cached ten minutes per level and season; the key always carries both, so one level's numbers can never answer for another.
// An unloaded level answers NO_CAPS (coverage 'none'), never an invented number.

import { milbDb } from './dev-db'
import { logOnce } from '@/lib/log'
import { MLB_CAPS, NO_CAPS, type Capabilities } from './capability'
import { isMilb, parseSeason, type Level } from './levels'

const TTL = 10 * 60 * 1000
const caps = new Map<string, { at: number; v: Capabilities }>()
const latest = new Map<string, { at: number; v: number | null }>()

/** The newest season that has a completed run for the level, or null when nothing is loaded. */
export async function latestMilbSeason(level: Level): Promise<number | null> {
  if (!isMilb(level)) return null
  const hit = latest.get(level)
  if (hit && Date.now() - hit.at < TTL) return hit.v
  const { data, error } = await (await milbDb()).from('pitch_shape_milb_runs').select('season').eq('level', level).order('season', { ascending: false }).limit(1)
  if (error) { logOnce('milb.latest', 'latestMilbSeason', 'Supabase error', error.message); return null }
  const v = (data as unknown as { season: number }[] | null)?.[0]?.season ?? null
  latest.set(level, { at: Date.now(), v })
  return v
}

/** The season a request means: the one asked for when it is a plausible year, else the level's newest loaded season, else this year. MLB returns this year (its readers pick their own seasons). */
export async function resolveSeason(level: Level, raw: string | null): Promise<number> {
  const now = new Date().getFullYear()
  if (!isMilb(level)) return now
  if (raw != null && raw !== '' && Number.isInteger(Number(raw))) return parseSeason(raw, now)
  return (await latestMilbSeason(level)) ?? now
}

export async function getCapabilities(level: Level, season: number): Promise<Capabilities> {
  if (!isMilb(level)) return MLB_CAPS(season)
  const key = `${level}|${season}`
  const hit = caps.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.v
  const { data, error } = await (await milbDb()).from('pitch_shape_milb_runs').select('summary,complete,fetched_at').eq('level', level).eq('season', season).maybeSingle()
  if (error) { logOnce('milb.caps', 'getCapabilities', 'Supabase error', error.message); return NO_CAPS(level, season) }
  const row = data as unknown as { summary?: { capabilities?: Capabilities }; complete?: boolean } | null
  const c = row?.summary?.capabilities
  const v: Capabilities = c && c.level === level && c.season === season ? { ...c, coverage: row?.complete === false ? 'partial' : c.coverage } : NO_CAPS(level, season)
  caps.set(key, { at: Date.now(), v })
  return v
}
