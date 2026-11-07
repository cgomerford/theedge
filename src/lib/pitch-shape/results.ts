import 'server-only'
// src/lib/pitch-shape/results.ts
//
// Server reads for the Pitch Shape Lab's results heat map and Shape Score board. Tables (read only here): pitch_shape_results (league outcomes at 0.1 in on the
// movement map), pitch_shape_results_pitcher (each pitcher's own outcomes on each pitch type), pitch_shape_pitcher (his average shape). Written by
// scripts/build_pitch_shape_results.py. Nothing is computed from Savant in a render path.
// Data functions return null / [] on failure with a logged reason; an empty table is an empty state, never a guess.

import { createAdminClient } from '@/lib/supabase'
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
async function loadRows(type: string, hand: Hand): Promise<Map<number, number[]> | null> {
  const thisYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = FIRST_SEASON; y <= thisYear; y++) years.push(y)
  const out = new Map<number, number[]>()
  const missing: number[] = []
  for (const y of years) {
    const hit = rowCache.get(`${y}|${type}|${hand}`)
    if (hit && Date.now() - hit.at <= TTL_MS) out.set(y, hit.cells); else missing.push(y)
  }
  if (missing.length) {
    const { data, error } = await createAdminClient().from('pitch_shape_results').select('span,cells')
      .in('span', missing.map(String)).eq('coord_era', LEAGUE_COORD_ERA).eq('pitch_type', type).eq('p_throws', hand)
    if (error) { logOnce('loadRows:Supabase error', 'getResultsPayload', 'Supabase error', error.message); return null }
    for (const d of (data ?? []) as unknown as { span: string; cells: number[] }[]) {
      rowCache.set(`${d.span}|${type}|${hand}`, { at: Date.now(), cells: d.cells })
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
export async function getResultsPayload(type: string, hand: Hand, half = 12, margin = 2.5): Promise<ResultsPayload | null> {
  const rows = await loadRows(type, hand)
  if (!rows) return null
  const [hb0, ivb0] = centre(rows)
  return crop(rows, hb0, ivb0, half, margin)
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
  /** ESPN fantasy ownership, percent of leagues that roster him (0 to 100); null when ESPN has no match for him */
  owned: number | null
  /** how established he is: All-Star and major selections, MLB debut year (null when the MLB Stats API could not be read) */
  profile: Profile | null
  /** his own sample on this pitch is under the usual minimum: the comparison is shown, but it is a small sample */
  small: boolean
  /** 1 to 99: where the shape's runs saved per 100 ranks among the shapes pitchers throw for this pitch type and hand */
  score: number | null
  gap: number | null; verdict: Verdict | null
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


type SeasonStat = { era: number | null; xera: number | null; fip: number | null; ip: number | null; xeraPa: number | null }
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
    const { data, error } = await supa.from('pitcher_stats').select('player_id,era,xera,fip,innings_pitched').eq('season', season).order('player_id').range(from, from + 999)
    if (error) { logOnce('getSeasonStats', 'getSeasonStats', 'Supabase error', error.message); return null }
    for (const r of (data ?? []) as unknown as { player_id: number; era: unknown; xera: unknown; fip: unknown; innings_pitched: unknown }[]) {
      map.set(r.player_id, { era: numOrNull(r.era), xera: numOrNull(r.xera), fip: numOrNull(r.fip), ip: numOrNull(r.innings_pitched), xeraPa: null })
    }
    if ((data ?? []).length < 1000) break
  }
  // xERA from Savant's expected-statistics file (pitch_shape_pitcher_expected, written by build_pitch_shape_results.py) fills the pitchers pitcher_stats has none for, and carries the sample behind it.
  // Until that table exists this is skipped and pitcher_stats alone is used.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('pitch_shape_pitcher_expected').select('pitcher_id,pa,era,xera').eq('season', season).order('pitcher_id').range(from, from + 999)
    if (error) { logOnce('getSeasonStats:expected', 'getSeasonStats', 'pitch_shape_pitcher_expected', error.message); break }
    for (const r of (data ?? []) as unknown as { pitcher_id: number; pa: number; era: unknown; xera: unknown }[]) {
      const cur = map.get(r.pitcher_id) ?? { era: null, xera: null, fip: null, ip: null, xeraPa: null }
      map.set(r.pitcher_id, { ...cur, era: cur.era ?? numOrNull(r.era), xera: numOrNull(r.xera) ?? cur.xera, xeraPa: numOrNull(r.xera) != null ? r.pa : null })
    }
    if ((data ?? []).length < 1000) break
  }
  statsCache.set(season, { at: Date.now(), map })
  return map
}
