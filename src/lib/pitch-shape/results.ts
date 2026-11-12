import 'server-only'
// src/lib/pitch-shape/results.ts
//
// Server reads for the Pitch Shape Lab's results heat map and Shape Score board. Tables (read only here): pitch_shape_results (league outcomes at 0.1 in on the
// movement map), pitch_shape_results_pitcher (each pitcher's own outcomes on each pitch type), pitch_shape_pitcher (his average shape). Written by
// scripts/build_pitch_shape_results.py. Nothing is computed from Savant in a render path.
// Data functions return null / [] on failure with a logged reason; an empty table is an empty state, never a guess.

import { createAdminClient } from '@/lib/supabase'
import { milbDb } from '@/lib/milb-shape/dev-db'
import { limitsFor } from '@/lib/milb-shape/limits'
import { isMilb, type Level } from '@/lib/milb-shape/levels'
import { LEVEL_LABEL } from '@/lib/milb-shape/levels'
import { translate, type Translation } from '@/lib/milb-shape/translate'
import { logOnce } from '@/lib/log'
import { MLB_TEAMS } from '@/lib/teams'
import {
  STRIDE, MIN_OWN_PITCHES, makeResultsGrid, measuresOf, percentile, pitcherSums, resultsVsShape, runsSaved, windowSums, zeroSums, FIELDS,
  type Measures, type ResultsPayload, type Sums, type Verdict,
} from './results-math'
import { LEAGUE_COORD_ERA } from './data'
import { getOverallLines, type OverallLine } from './overall'
import { getProfiles, type Profile } from './profile'
import { getOwnershipIndex } from '@/lib/fantasy-ownership'
import type { Hand } from './model'

const FIRST_SEASON = 2024
const TTL_MS = 60 * 60 * 1000
type Row = { at: number; cells: number[] }
const rowCache = new Map<string, Row>()

/** Every season's full cell array for one pitch type and hand (large, so cached per process for an hour). */
async function loadRows(type: string, hand: Hand, level: Level = 'mlb', season?: number): Promise<Map<number, number[]> | null> {
  const thisYear = new Date().getFullYear()
  const milb = isMilb(level)
  const years: number[] = []
  if (milb) years.push(season ?? thisYear)   // a minor-league level is one season
  else for (let y = FIRST_SEASON; y <= thisYear; y++) years.push(y)
  // the cache key carries the level for minor leagues; MLB keeps its own
  const ck = (y: number | string) => (milb ? `${level}|${y}|${type}|${hand}` : `${y}|${type}|${hand}`)
  const out = new Map<number, number[]>()
  const missing: number[] = []
  for (const y of years) {
    const hit = rowCache.get(ck(y))
    if (hit && Date.now() - hit.at <= TTL_MS) out.set(y, hit.cells); else missing.push(y)
  }
  if (missing.length) {
    const sel = milb
      ? (await milbDb()).from('pitch_shape_results_milb').select('span,cells').eq('level', level).in('span', missing.map(String))
      : createAdminClient().from('pitch_shape_results').select('span,cells').in('span', missing.map(String)).eq('coord_era', LEAGUE_COORD_ERA)
    const { data, error } = await sel.eq('pitch_type', type).eq('p_throws', hand)
    if (error) { logOnce('loadRows:Supabase error', 'getResultsPayload', 'Supabase error', error.message); return null }
    for (const d of (data ?? []) as unknown as { span: string; cells: number[] }[]) {
      rowCache.set(ck(d.span), { at: Date.now(), cells: d.cells })
      out.set(Number(d.span), d.cells)
    }
  }
  return out.size ? out : null
}

function centre(rows: Map<number, number[]>): [number, number] {
  let n = 0, sh = 0, si = 0
  for (const cells of rows.values()) for (let k = 0; k < cells.length; k += STRIDE) { const c = cells[k + 2]; n += c; sh += cells[k] * c; si += cells[k + 1] * c }
  return n ? [Math.round(sh / n) / 10, Math.round(si / n) / 10] : [0, 0]
}

function crop(rows: Map<number, number[]>, hb0: number, ivb0: number, half: number, margin: number): ResultsPayload {
  const lo = (c: number) => Math.round((c - half - margin) * 10), hi = (c: number) => Math.round((c + half + margin) * 10)
  const hbLo = lo(hb0), hbHi = hi(hb0), ivLo = lo(ivb0), ivHi = hi(ivb0)
  const seasons = [...rows.keys()].sort((a, b) => a - b).map(season => {
    const all = rows.get(season) as number[]
    const cells: number[] = []
    for (let k = 0; k < all.length; k += STRIDE) {
      const hb = all[k], iv = all[k + 1]
      if (hb >= hbLo && hb <= hbHi && iv >= ivLo && iv <= ivHi) for (let j = 0; j < STRIDE; j++) cells.push(all[k + j])
    }
    return { season, cells }
  })
  return { seasons, latest: seasons[seasons.length - 1].season, hb0, ivb0, half, margin }
}

/** League outcomes around the league's own average movement for one pitch type and hand, cropped to the window the map draws. null = no rows yet (empty state). */
export async function getResultsPayload(type: string, hand: Hand, half = 12, margin = 2.5, level: Level = 'mlb', season?: number): Promise<ResultsPayload | null> {
  const rows = await loadRows(type, hand, level, season)
  if (!rows) return null
  const [hb0, ivb0] = centre(rows)
  return crop(rows, hb0, ivb0, half, margin)
}

/** League outcomes around a chosen centre (a pitcher's own average shape) instead of the league's, for the pitcher detail: smaller than the whole map, so it is cheap to send. */
export async function getResultsPayloadAround(type: string, hand: Hand, hb0: number, ivb0: number, half: number, margin = 0, level: Level = 'mlb', season?: number): Promise<ResultsPayload | null> {
  const rows = await loadRows(type, hand, level, season)
  return rows ? crop(rows, hb0, ivb0, half, margin) : null
}

const SCALED = new Set(['rv', 'w', 'x'])
/** Every league pitch of the type and hand, summed (real units). */
function leagueSums(rows: Map<number, number[]>, only?: number): Sums {
  const s = zeroSums()
  for (const [season, cells] of rows) {
    if (only != null && season !== only) continue
    for (let k = 0; k < cells.length; k += STRIDE) FIELDS.forEach((f, j) => { s[f] += cells[k + 2 + j] / (SCALED.has(f) ? 1000 : 1) })
  }
  return s
}

export type BoardRow = {
  pitcherId: number; name: string; teamAbbr: string; pitches: number; hb: number; ivb: number
  /** his own spread (one standard deviation, inches), average speed and arm angle on this pitch, for sizing the shape window and showing his shape numbers */
  sdHb: number | null; sdIvb: number | null; velo: number | null; slot: number | null
  /** what league pitches shaped like his have produced (all seasons added up, +/-1 in window) */
  shape: Measures & { saved: number | null }
  /** what his own pitch has produced this season */
  own: Measures & { saved: number | null }
  /** the same measures with no sample gate (null only when there is nothing), so a detail view can show every stat and label thin ones */
  shapeRaw: Measures & { saved: number | null }
  ownRaw: Measures & { saved: number | null }
  /** his whole season, all pitch types: total pitches and where his runs allowed, wOBA and xwOBA rank among pitchers (null when the table is empty) */
  overall: OverallLine | null
  /** his season line from pitcher_stats (ERA, xERA, FIP, innings pitched); null when we hold none for him */
  stats: { era: number | null; xera: number | null; fip: number | null; ip: number | null; /** plate appearances behind the xERA (Savant); null when it came from pitcher_stats */ xeraPa: number | null } | null
  /** how he is used this season, from starts, games, saves and holds: a starter (half or more of his games are starts), a closer (5+ saves), a setup man (5+ holds) or another reliever; null when we hold no games for him */
  role: 'starter' | 'closer' | 'setup' | 'reliever' | null
  /** ESPN fantasy ownership, percent of leagues that roster him (0 to 100); null when ESPN has no match for him */
  owned: number | null
  /** how established he is: All-Star and major selections, MLB debut year (null when the MLB Stats API could not be read) */
  profile: Profile | null
  /** his own sample on this pitch is under the usual minimum: the comparison is shown, but it is a small sample */
  small: boolean
  /** 1 to 99: where the shape's runs saved per 100 ranks among the shapes pitchers throw for this pitch type and hand */
  score: number | null
  gap: number | null; verdict: Verdict | null
  /** minor-league boards only: does this shape's success at his level carry to MLB, from what MLB pitches with the same movement have produced (null for MLB rows and when either side is too thin) */
  translation?: Translation | null
}
export type Board = { type: string; hand: Hand; season: number; league: Measures; rows: BoardRow[]; /** sorted runs saved of every scored shape, for placing any spot on the map */ dist: number[] }

/** A pitcher is listed with 100+ pitches of the type; his own results are compared with his shape from 100 pitches, flagged as a small sample under MIN_OWN_PITCHES. */
const BOARD_MIN_PITCHES = 100
const SMALL_MIN_PITCHES = 100
const trim = (m: Measures) => m

/**
 * Shape Score board for one pitch type and hand: every pitcher with 200+ pitches of it in the latest season, the league results for his shape, and his own results.
 * The shape window pools all seasons (a bigger sample); his own results are the latest season. null = the results tables are empty (empty state).
 */
export async function getShapeBoard(type: string, hand: Hand): Promise<Board | null> {
  const rows = await loadRows(type, hand)
  if (!rows) return null
  const season = Math.max(...rows.keys())
  const [hb0, ivb0] = centre(rows)
  const grid = makeResultsGrid(crop(rows, hb0, ivb0, 16, 1), 'all')
  const league = measuresOf(leagueSums(rows))
  const supa = createAdminClient()
  const overallLines = await getOverallLines(season)   // separate await: a cached whole-season pass
  const [shapes, owns] = await Promise.all([
    supa.from('pitch_shape_pitcher').select('pitcher_id,pitcher_name,team_abbr,n_pitches,hb,ivb,sd_hb,sd_ivb,velo,slot').eq('season', season).eq('pitch_type', type).eq('p_throws', hand).gte('n_pitches', BOARD_MIN_PITCHES).limit(1000),
    supa.from('pitch_shape_results_pitcher').select('pitcher_id,n_pitches,n_swings,n_whiffs,rv_n,rv,pa,ab,hits,tb,woba_den,woba_sum,xwoba_sum').eq('season', season).eq('pitch_type', type).eq('p_throws', hand).limit(1000),
  ])
  if (shapes.error) { logOnce('getShapeBoard:shapes', 'getShapeBoard', 'Supabase error', shapes.error.message); return null }
  if (owns.error) { logOnce('getShapeBoard:owns', 'getShapeBoard', 'Supabase error', owns.error.message); return null }
  type Own = { pitcher_id: number; n_pitches: number; n_swings: number; n_whiffs: number; rv_n: number; rv: string | number; pa: number; ab: number; hits: number; tb: number; woba_den: string | number; woba_sum: string | number; xwoba_sum: string | number }
  const ownBy = new Map(((owns.data ?? []) as unknown as Own[]).map(o => [o.pitcher_id, o]))
  type Sh = { pitcher_id: number; pitcher_name: string; team_abbr: string | null; n_pitches: number; hb: string | number; ivb: string | number; sd_hb: string | number | null; sd_ivb: string | number | null; velo: string | number | null; slot: string | number | null }
  const list = ((shapes.data ?? []) as unknown as Sh[]).map(p => {
    const hb = Number(p.hb), ivb = Number(p.ivb)
    const sm = measuresOf(windowSums(grid, Math.round(hb * 10), Math.round(ivb * 10), 10))
    const o = ownBy.get(p.pitcher_id)
    const osum = o ? pitcherSums({ ...o, rv: Number(o.rv), woba_den: Number(o.woba_den), woba_sum: Number(o.woba_sum), xwoba_sum: Number(o.xwoba_sum) }) : null
    const om = osum ? measuresOf(osum) : null
    const ssum = windowSums(grid, Math.round(hb * 10), Math.round(ivb * 10), 10)
    return { p, hb, ivb, sm, om, smRaw: measuresOf(ssum, false), omRaw: osum ? measuresOf(osum, false) : measuresOf(zeroSums(), false) }
  })
  const seasonStats = await getSeasonStats(season)   // separate await: one cached read of pitcher_stats
  const ownedMap = await getOwnedMap()   // separate await: one cached read of fantasy_ownership
  const profiles = await getProfiles(list.map(r => r.p.pitcher_id))   // separate await: the MLB Stats API, cached a day
  const savedOf = (m: Measures) => runsSaved(m, league)
  const dist = list.map(r => savedOf(r.sm)).filter((v): v is number => v != null).sort((a, b) => a - b)
  const out: BoardRow[] = list.map(({ p, hb, ivb, sm, om, smRaw, omRaw }) => {
    const shapeSaved = savedOf(sm)
    const ownSaved = om && om.n.rv >= MIN_OWN_PITCHES ? savedOf(om) : null
    const small = om != null && om.n.rv >= SMALL_MIN_PITCHES && om.n.rv < MIN_OWN_PITCHES
    const cmp = resultsVsShape(small ? runsSaved(omRaw, league) : ownSaved, shapeSaved)
    const tm = MLB_TEAMS.find(t => t.abbrev === p.team_abbr)
    return {
      pitcherId: p.pitcher_id, name: p.pitcher_name, teamAbbr: tm?.abbrev ?? p.team_abbr ?? '', pitches: p.n_pitches, hb, ivb,
      sdHb: p.sd_hb == null ? null : Number(p.sd_hb), sdIvb: p.sd_ivb == null ? null : Number(p.sd_ivb), velo: p.velo == null ? null : Number(p.velo), slot: p.slot == null ? null : Number(p.slot),
      shape: { ...trim(sm), saved: shapeSaved },
      own: { ...(om ?? measuresOf(zeroSums())), saved: ownSaved },
      shapeRaw: { ...smRaw, saved: runsSaved(smRaw, { ...league }) },
      ownRaw: { ...omRaw, saved: runsSaved(omRaw, { ...league }) },
      overall: overallLines?.get(p.pitcher_id) ?? null,
      profile: profiles?.get(p.pitcher_id) ?? null,
      stats: seasonStats?.get(p.pitcher_id) ?? null,
      owned: ownedMap?.get(p.pitcher_id) ?? null,
      role: roleOf(seasonStats?.get(p.pitcher_id)),
      small,
      score: shapeSaved == null ? null : percentile(dist, shapeSaved),
      gap: cmp?.gap ?? null, verdict: cmp?.verdict ?? null,
    }
  })
  return { type, hand, season, league, rows: out, dist }
}


const gridCache = new Map<string, { at: number; grid: ReturnType<typeof makeResultsGrid>; league: Measures }>()
/**
 * What league pitches of one type and hand shaped like (hb, ivb) have saved per 100 pitches (all seasons added up, +/-1 in), and the league's runs allowed per 100 for the type,
 * so a pitcher's own pitch can be set against its shape. null when the results tables hold nothing for the type. Grids are cached for an hour.
 */
export async function getShapeSavedFor(type: string, hand: Hand, hb: number, ivb: number): Promise<{ shapeSaved: number | null; leagueRuns100: number | null } | null> {
  const k = `${type}|${hand}`
  let hit = gridCache.get(k)
  if (!hit || Date.now() - hit.at > TTL_MS) {
    const rows = await loadRows(type, hand)
    if (!rows) return null
    const [hb0, ivb0] = centre(rows)
    hit = { at: Date.now(), grid: makeResultsGrid(crop(rows, hb0, ivb0, 16, 1), 'all'), league: measuresOf(leagueSums(rows)) }
    gridCache.set(k, hit)
  }
  const m = measuresOf(windowSums(hit.grid, Math.round(hb * 10), Math.round(ivb * 10), 10))
  return { shapeSaved: runsSaved(m, hit.league), leagueRuns100: hit.league.runs100 }
}


type SeasonStat = { starts: number | null; games: number | null; saves: number | null; holds: number | null; era: number | null; xera: number | null; fip: number | null; ip: number | null; xeraPa: number | null }
/** A starter if half or more of his games are starts; otherwise a closer (5+ saves), a setup man (5+ holds) or another reliever. */
export function roleOf(s: { starts: number | null; games: number | null; saves: number | null; holds: number | null } | null | undefined): BoardRow['role'] {
  if (!s || s.games == null || s.games <= 0) return null
  if ((s.starts ?? 0) / s.games >= 0.5) return 'starter'
  if ((s.saves ?? 0) >= 5) return 'closer'
  if ((s.holds ?? 0) >= 5) return 'setup'
  return 'reliever'
}

let ownedCache: { at: number; map: Map<number, number> } | null = null
/** ESPN percent rostered by MLB player id (fantasy_ownership, refreshed daily by its own cron), cached an hour. null on failure (logged). */
async function getOwnedMap(): Promise<Map<number, number> | null> {
  if (ownedCache && Date.now() - ownedCache.at < 3_600_000) return ownedCache.map
  try {
    const { byMlbId } = await getOwnershipIndex()
    const map = new Map<number, number>()
    for (const [id, r] of byMlbId) if (r.percent_owned != null) map.set(id, r.percent_owned)
    ownedCache = { at: Date.now(), map }
    return map
  } catch (e) {
    logOnce('getOwnedMap', 'getOwnedMap', 'failed', e instanceof Error ? e.message : String(e))
    return null
  }
}

const statsCache = new Map<number, { at: number; map: Map<number, SeasonStat> }>()
const numOrNull = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** Every pitcher's ERA, xERA, FIP and innings for a season (pitcher_stats), cached an hour. null on failure (logged). */
async function getSeasonStats(season: number): Promise<Map<number, SeasonStat> | null> {
  const hit = statsCache.get(season)
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.map
  const supa = createAdminClient()
  const map = new Map<number, SeasonStat>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('pitcher_stats').select('player_id,era,xera,fip,innings_pitched,starts,games_played,saves,holds').eq('season', season).order('player_id').range(from, from + 999)
    if (error) { logOnce('getSeasonStats', 'getSeasonStats', 'Supabase error', error.message); return null }
    for (const r of (data ?? []) as unknown as { player_id: number; era: unknown; xera: unknown; fip: unknown; innings_pitched: unknown; starts: unknown; games_played: unknown; saves: unknown; holds: unknown }[]) {
      map.set(r.player_id, { starts: numOrNull(r.starts), games: numOrNull(r.games_played), saves: numOrNull(r.saves), holds: numOrNull(r.holds), era: numOrNull(r.era), xera: numOrNull(r.xera), fip: numOrNull(r.fip), ip: numOrNull(r.innings_pitched), xeraPa: null })
    }
    if ((data ?? []).length < 1000) break
  }
  // xERA from Savant's expected-statistics file (pitch_shape_pitcher_expected, written by build_pitch_shape_results.py) fills the pitchers pitcher_stats has none for, and carries the sample behind it.
  // Until that table exists this is skipped and pitcher_stats alone is used.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('pitch_shape_pitcher_expected').select('pitcher_id,pa,era,xera').eq('season', season).order('pitcher_id').range(from, from + 999)
    if (error) { logOnce('getSeasonStats:expected', 'getSeasonStats', 'pitch_shape_pitcher_expected', error.message); break }
    for (const r of (data ?? []) as unknown as { pitcher_id: number; pa: number; era: unknown; xera: unknown }[]) {
      const cur = map.get(r.pitcher_id) ?? { starts: null, games: null, saves: null, holds: null, era: null, xera: null, fip: null, ip: null, xeraPa: null }
      map.set(r.pitcher_id, { ...cur, era: cur.era ?? numOrNull(r.era), xera: numOrNull(r.xera) ?? cur.xera, xeraPa: numOrNull(r.xera) != null ? r.pa : null })
    }
    if ((data ?? []).length < 1000) break
  }
  statsCache.set(season, { at: Date.now(), map })
  return map
}


export type MilbVsShape = {
  level: Level; season: number; type: string; hand: Hand; pitcherId: number
  /** the level's own average runs allowed per 100 pitches of this type and hand */
  leagueRuns100: number | null
  /** his own pitch at this level, and pitches shaped like it at this level (+/-1 in); every measure is null under its sample gate */
  own: Measures & { saved: number | null }
  shape: Measures & { saved: number | null }
  ownRaw: Measures & { saved: number | null }
  shapeRaw: Measures & { saved: number | null }
  /** level-only: ahead of, level with, or behind the pitches shaped like his at this level */
  gap: number | null; verdict: Verdict | null
  /** 1 to 99: where this shape's runs saved per 100 ranks among the shapes pitchers throw at THIS level (never an MLB percentile); null under the gates */
  score: number | null
  /** pitchers at this level with this pitch that the score ranks */
  ranked: number
  small: boolean
}

/**
 * A minor-league pitcher's own results on one pitch against what pitches shaped like it have produced at the SAME level and season, plus where that shape ranks among
 * the level's shapes. Nothing from MLB is read. null when the level's results tables hold nothing for the pitch (empty state).
 */
export async function getMilbVsShape(level: Level, season: number, type: string, hand: Hand, pitcherId: number): Promise<MilbVsShape | null> {
  if (!isMilb(level) || !Number.isInteger(pitcherId)) return null
  const rows = await loadRows(type, hand, level, season)
  if (!rows) return null
  const lim = limitsFor(level), g = lim.gated
  const [hb0, ivb0] = centre(rows)
  const grid = makeResultsGrid(crop(rows, hb0, ivb0, 16, 1), 'all')
  const league = measuresOf(leagueSums(rows), g)
  const supa = await milbDb()
  const [shapes, owns] = await Promise.all([
    supa.from('pitch_shape_pitcher_milb').select('pitcher_id,n_pitches,hb,ivb').eq('level', level).eq('season', season).eq('pitch_type', type).eq('p_throws', hand).gte('n_pitches', lim.boardPitches).limit(1000),
    supa.from('pitch_shape_results_pitcher_milb').select('pitcher_id,n_pitches,n_swings,n_whiffs,rv_n,rv,pa,ab,hits,tb,woba_den,woba_sum,xwoba_sum').eq('level', level).eq('season', season).eq('pitch_type', type).eq('p_throws', hand).eq('pitcher_id', pitcherId).maybeSingle(),
  ])
  if (shapes.error) { logOnce('getMilbVsShape:shapes', 'getMilbVsShape', 'Supabase error', shapes.error.message); return null }
  if (owns.error) { logOnce('getMilbVsShape:owns', 'getMilbVsShape', 'Supabase error', owns.error.message); return null }
  const list = (shapes.data ?? []) as unknown as { pitcher_id: number; n_pitches: number; hb: string | number; ivb: string | number }[]
  const mine = list.find(x => x.pitcher_id === pitcherId)
  if (!mine) return null
  const savedOf = (m: Measures) => runsSaved(m, league)
  const dist = list.map(p => savedOf(measuresOf(windowSums(grid, Math.round(Number(p.hb) * 10), Math.round(Number(p.ivb) * 10), 10), g))).filter((v): v is number => v != null).sort((a, b) => a - b)
  const ssum = windowSums(grid, Math.round(Number(mine.hb) * 10), Math.round(Number(mine.ivb) * 10), 10)
  const sm = measuresOf(ssum, g), smRaw = measuresOf(ssum, false)
  type Own = { n_pitches: number; n_swings: number; n_whiffs: number; rv_n: number; rv: string | number; pa: number; ab: number; hits: number; tb: number; woba_den: string | number; woba_sum: string | number; xwoba_sum: string | number }
  const o = owns.data as unknown as Own | null
  const osum = o ? pitcherSums({ ...o, rv: Number(o.rv), woba_den: Number(o.woba_den), woba_sum: Number(o.woba_sum), xwoba_sum: Number(o.xwoba_sum) }) : null
  const om = osum ? measuresOf(osum, g) : measuresOf(zeroSums(), g), omRaw = osum ? measuresOf(osum, false) : measuresOf(zeroSums(), false)
  const shapeSaved = savedOf(sm)
  const small = om.n.rv >= SMALL_MIN_PITCHES && om.n.rv < lim.ownPitches
  const ownSaved = om.n.rv >= lim.ownPitches ? savedOf(om) : null
  const cmp = resultsVsShape(small ? runsSaved(omRaw, league) : ownSaved, shapeSaved)
  return {
    level, season, type, hand, pitcherId, leagueRuns100: league.runs100,
    own: { ...om, saved: ownSaved }, shape: { ...sm, saved: shapeSaved }, ownRaw: { ...omRaw, saved: runsSaved(omRaw, league) }, shapeRaw: { ...smRaw, saved: runsSaved(smRaw, league) },
    gap: cmp?.gap ?? null, verdict: cmp?.verdict ?? null, score: shapeSaved == null ? null : percentile(dist, shapeSaved), ranked: dist.length, small,
  }
}


export type MlbLite = { pitches: number; whiff: number | null; saved: number | null; woba: number | null; xwoba: number | null; swings: number; rvPitches: number }
const lite = (m: Measures, saved: number | null): MlbLite => ({ pitches: m.pitches, whiff: m.whiff, saved, woba: m.woba, xwoba: m.xwoba, swings: m.n.swings, rvPitches: m.n.rv })

/**
 * What MLB pitches of this type and hand shaped like (hb, ivb) have produced (all seasons added up, +/-1 in, any speed and arm angle), with the league's runs allowed per 100 for
 * the type. Used to show a minor-league pitch's closest MLB shape: it describes MLB pitches, and is never applied to the minor-league pitcher as his result. null when empty.
 */
async function mlbGrid(type: string, hand: Hand) {
  const k = `${type}|${hand}`
  let hit = gridCache.get(k)
  if (!hit || Date.now() - hit.at > TTL_MS) {
    const rows = await loadRows(type, hand)
    if (!rows) return null
    const [hb0, ivb0] = centre(rows)
    hit = { at: Date.now(), grid: makeResultsGrid(crop(rows, hb0, ivb0, 16, 1), 'all'), league: measuresOf(leagueSums(rows)) }
    gridCache.set(k, hit)
  }
  return hit
}

export async function getMlbShapeMeasures(type: string, hand: Hand, hb: number, ivb: number): Promise<{ shape: MlbLite; leagueRuns100: number | null; leagueWhiff: number | null } | null> {
  const hit = await mlbGrid(type, hand)
  if (!hit) return null
  const m = measuresOf(windowSums(hit.grid, Math.round(hb * 10), Math.round(ivb * 10), 10))
  return { shape: lite(m, runsSaved(m, hit.league)), leagueRuns100: hit.league.runs100, leagueWhiff: hit.league.whiff }
}

/** Several MLB pitchers' own results on one pitch type this season, against the MLB league's runs per 100. Pitchers without a row are left out. */
export async function getMlbPitcherResults(type: string, hand: Hand, season: number, ids: number[]): Promise<Map<number, MlbLite>> {
  const out = new Map<number, MlbLite>()
  if (ids.length === 0) return out
  const rows = await loadRows(type, hand)
  if (!rows) return out
  const league = measuresOf(leagueSums(rows))
  const { data, error } = await createAdminClient().from('pitch_shape_results_pitcher').select('pitcher_id,n_pitches,n_swings,n_whiffs,rv_n,rv,pa,ab,hits,tb,woba_den,woba_sum,xwoba_sum')
    .eq('season', season).eq('pitch_type', type).eq('p_throws', hand).in('pitcher_id', ids)
  if (error) { logOnce('getMlbPitcherResults', 'getMlbPitcherResults', 'Supabase error', error.message); return out }
  type R = { pitcher_id: number; n_pitches: number; n_swings: number; n_whiffs: number; rv_n: number; rv: string | number; pa: number; ab: number; hits: number; tb: number; woba_den: string | number; woba_sum: string | number; xwoba_sum: string | number }
  for (const r of (data ?? []) as unknown as R[]) {
    const m = measuresOf(pitcherSums({ ...r, rv: Number(r.rv), woba_den: Number(r.woba_den), woba_sum: Number(r.woba_sum), xwoba_sum: Number(r.xwoba_sum) }), false)
    out.set(r.pitcher_id, lite(m, runsSaved(m, league)))
  }
  return out
}


/**
 * The Shape Score board for one minor-league level: every pitcher with 100+ pitches of the type at that level and season, what pitches shaped like his have produced AT THAT LEVEL
 * (+/-1 in), and his own results, with a level-only Shape Score (his shape's runs saved per 100 ranked among that level's shapes). The same BoardRow as the MLB board; what only
 * MLB has (season line, ERA and xERA, ESPN ownership, role, All-Star history, whole-season ranks) is null. null = the level's outcome tables hold nothing for the pitch yet.
 */
export async function getMilbBoard(level: Level, season: number, type: string, hand: Hand): Promise<Board | null> {
  if (!isMilb(level)) return null
  const rows = await loadRows(type, hand, level, season)
  if (!rows) return null
  const lim = limitsFor(level), g = lim.gated
  const [hb0, ivb0] = centre(rows)
  const grid = makeResultsGrid(crop(rows, hb0, ivb0, 16, 1), 'all')
  const league = measuresOf(leagueSums(rows), g)
  const supa = await milbDb()
  const [shapes, owns] = await Promise.all([
    supa.from('pitch_shape_pitcher_milb').select('pitcher_id,pitcher_name,team_abbr,n_pitches,hb,ivb,sd_hb,sd_ivb,velo,slot').eq('level', level).eq('season', season).eq('pitch_type', type).eq('p_throws', hand).gte('n_pitches', lim.boardPitches).limit(1000),
    supa.from('pitch_shape_results_pitcher_milb').select('pitcher_id,n_pitches,n_swings,n_whiffs,rv_n,rv,pa,ab,hits,tb,woba_den,woba_sum,xwoba_sum').eq('level', level).eq('season', season).eq('pitch_type', type).eq('p_throws', hand).limit(1000),
  ])
  if (shapes.error) { logOnce('getMilbBoard:shapes', 'getMilbBoard', 'Supabase error', shapes.error.message); return null }
  if (owns.error) { logOnce('getMilbBoard:owns', 'getMilbBoard', 'Supabase error', owns.error.message); return null }
  type Own = { pitcher_id: number; n_pitches: number; n_swings: number; n_whiffs: number; rv_n: number; rv: string | number; pa: number; ab: number; hits: number; tb: number; woba_den: string | number; woba_sum: string | number; xwoba_sum: string | number }
  const ownBy = new Map(((owns.data ?? []) as unknown as Own[]).map(o => [o.pitcher_id, o]))
  type Sh = { pitcher_id: number; pitcher_name: string; team_abbr: string | null; n_pitches: number; hb: string | number; ivb: string | number; sd_hb: string | number | null; sd_ivb: string | number | null; velo: string | number | null; slot: string | number | null }
  const list = ((shapes.data ?? []) as unknown as Sh[]).map(p => {
    const hb = Number(p.hb), ivb = Number(p.ivb)
    const ssum = windowSums(grid, Math.round(hb * 10), Math.round(ivb * 10), 10)
    const o = ownBy.get(p.pitcher_id)
    const osum = o ? pitcherSums({ ...o, rv: Number(o.rv), woba_den: Number(o.woba_den), woba_sum: Number(o.woba_sum), xwoba_sum: Number(o.xwoba_sum) }) : null
    return { p, hb, ivb, sm: measuresOf(ssum, g), smRaw: measuresOf(ssum, false), om: osum ? measuresOf(osum, g) : null, omRaw: osum ? measuresOf(osum, false) : measuresOf(zeroSums(), false) }
  })
  const savedOf = (m: Measures) => runsSaved(m, league)
  const dist = list.map(r => savedOf(r.sm)).filter((v): v is number => v != null).sort((a, b) => a - b)
  const mlbSide = await mlbGrid(type, hand)   // MLB pitches with the same movement, to flag a shape that works here but has not worked there
  const out: BoardRow[] = list.map(({ p, hb, ivb, sm, smRaw, om, omRaw }) => {
    const shapeSaved = savedOf(sm)
    const mm = mlbSide ? measuresOf(windowSums(mlbSide.grid, Math.round(hb * 10), Math.round(ivb * 10), 10)) : null   // the MLB side keeps MLB's own gate
    const ownSaved = om && om.n.rv >= lim.ownPitches ? savedOf(om) : null
    const small = om != null && om.n.rv >= SMALL_MIN_PITCHES && om.n.rv < lim.ownPitches
    const cmp = resultsVsShape(small ? runsSaved(omRaw, league) : ownSaved, shapeSaved)
    return {
      pitcherId: p.pitcher_id, name: p.pitcher_name, teamAbbr: p.team_abbr ?? '', pitches: p.n_pitches, hb, ivb,
      sdHb: p.sd_hb == null ? null : Number(p.sd_hb), sdIvb: p.sd_ivb == null ? null : Number(p.sd_ivb), velo: p.velo == null ? null : Number(p.velo), slot: p.slot == null ? null : Number(p.slot),
      shape: { ...sm, saved: shapeSaved }, own: { ...(om ?? measuresOf(zeroSums(), g)), saved: ownSaved },
      shapeRaw: { ...smRaw, saved: runsSaved(smRaw, league) }, ownRaw: { ...omRaw, saved: runsSaved(omRaw, league) },
      overall: null, profile: null, stats: null, owned: null, role: null,
      small, score: shapeSaved == null ? null : percentile(dist, shapeSaved), gap: cmp?.gap ?? null, verdict: cmp?.verdict ?? null,
      translation: translate({
        levelLabel: LEVEL_LABEL[level], level: { saved: shapeSaved, whiff: sm.whiff, pitches: sm.pitches }, levelAvgWhiff: league.whiff,
        mlb: mm && mlbSide ? { saved: runsSaved(mm, mlbSide.league), whiff: mm.whiff, pitches: mm.pitches } : null, mlbAvgWhiff: mlbSide?.league.whiff ?? null,
      }),
    }
  })
  return { type, hand, season, league, rows: out, dist }
}
