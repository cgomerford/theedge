// src/lib/pitch-shape/data.ts
//
// SERVER-ONLY readers for the Pitch Shape Lab. Pages read cached rows; nothing here (or anywhere in
// the Shape feature) fetches Baseball Savant at render time.
//
//   pitch_shape_bins    league counts per shape bin — exists (supabase/migrations/20261017180000);
//                       its writer (.github/workflows/shape-bins.yml) is not built yet, so until it
//                       runs these return [] and every view shows its empty state.
//   pitch_shape_pitcher a pitcher's own average shape per pitch type, sample pitches and small
//                       splits (migration 20261019120000; writer shape-pitcher.yml). getShapeLabData()
//                       returns null when he has no rows (empty state, no guess).
//
// CONTRACT the writer must honour (single source of truth is here + model.ts BIN_WIDTH):
//   span       = LEAGUE_SPAN for the league neighborhoods the lab reads
//   coord_era  = LEAGUE_COORD_ERA (rows from other tracking eras are never pooled with these)

import { createAdminClient } from '@/lib/supabase'
import { diagOf, leagueOf, type Diag, type DiagRow } from './diagnostics'
import { MLB_TEAMS } from '@/lib/teams'
import { aggregateSeason } from './aggregate'
import { FIELD, MIN_COMPARE_PITCHES, pickField, shapeDistance, type ComparePitcher, type SetupRow } from './compare'
import {
  FREE_SANDBOX_TYPES, GATE, PITCH_NAMES,
  type BatterSideSplit, type CountSplit, type Hand, type MonthPoint, type PitchViewMonth, type PitcherHit, type PitcherPitchShape, type ShapeBin, type ShapeLabData,
} from './model'

import { LOC_COLS, type LocationPayload, type LocationWindow } from './location'

export const LEAGUE_SPAN = '2024-2026'
export const LEAGUE_COORD_ERA = '2026'

const PAGE = 1000 // PostgREST caps a response at 1,000 rows → page through
const PARALLEL_PAGES = 8

type BinRow = {
  velo_bin: number; ivb_bin: number; hb_bin: number; slot_bin: number
  n_pitches: number; n_swings: number; n_whiffs: number; n_called_strikes: number; n_csw: number
  n_bbe: number; xwoba_con_sum: string | number; n_hard_hit: number; n_gb: number
}

const BIN_COLS = 'velo_bin,ivb_bin,hb_bin,slot_bin,n_pitches,n_swings,n_whiffs,n_called_strikes,n_csw,n_bbe,xwoba_con_sum,n_hard_hit,n_gb'

const toBin = (r: BinRow): ShapeBin => ({
  veloBin: r.velo_bin, ivbBin: r.ivb_bin, hbBin: r.hb_bin, slotBin: r.slot_bin,
  pitches: r.n_pitches, swings: r.n_swings, whiffs: r.n_whiffs, calledStrikes: r.n_called_strikes, csw: r.n_csw,
  bbe: r.n_bbe, xwobaConSum: Number(r.xwoba_con_sum), hardHit: r.n_hard_hit, gb: r.n_gb,
})

// League bins change weekly, so keep them in this server's memory for an hour instead of re-paging
// the table on every request. Per-process cache: a cold server just re-reads.
const BIN_TTL_MS = 60 * 60 * 1000
const binCache = new Map<string, { at: number; bins: ShapeBin[] }>()

/** League bins for one pitch type + hand. [] on error or when the table has no rows yet. */
export async function getLeagueBins(pitchType: string, hand: Hand): Promise<ShapeBin[]> {
  const ck = `${pitchType}|${hand}`
  const hit = binCache.get(ck)
  if (hit && Date.now() - hit.at < BIN_TTL_MS) return hit.bins

  const supa = createAdminClient()
  const page = (from: number) =>
    supa
      .from('pitch_shape_bins')
      .select(BIN_COLS, from === 0 ? { count: 'exact' } : undefined)
      .eq('span', LEAGUE_SPAN)
      .eq('coord_era', LEAGUE_COORD_ERA)
      .eq('pitch_type', pitchType)
      .eq('p_throws', hand)
      .order('velo_bin').order('ivb_bin').order('hb_bin').order('slot_bin')
      .range(from, from + PAGE - 1)

  // Page 1 also returns the total row count, so the remaining pages can be fetched in parallel.
  const first = await page(0)
  if (first.error) {
    console.error('[getLeagueBins] Supabase error:', first.error.message)
    return []
  }
  const out = ((first.data ?? []) as unknown as BinRow[]).map(toBin)
  const total = first.count ?? out.length
  const offsets: number[] = []
  for (let from = PAGE; from < total; from += PAGE) offsets.push(from)
  for (let i = 0; i < offsets.length; i += PARALLEL_PAGES) {
    const results = await Promise.all(offsets.slice(i, i + PARALLEL_PAGES).map(page))
    for (const r of results) {
      if (r.error) {
        console.error('[getLeagueBins] Supabase error:', r.error.message)
        return [] // a missing page would silently skew every rate: fail to the empty state
      }
      for (const row of (r.data ?? []) as unknown as BinRow[]) out.push(toBin(row))
    }
  }
  if (out.length > 0) binCache.set(ck, { at: Date.now(), bins: out })
  return out
}

/** Pitch types that have league rows, FF first. [] until the writer has run. */
export async function getAvailablePitchTypes(): Promise<string[]> {
  const supa = createAdminClient()
  // One tiny query per known pitch type (head-only count) — avoids paging the whole table.
  const known = Object.keys(PITCH_NAMES)
  const counts = await Promise.all(known.map(async t => {
    const { count, error } = await supa
      .from('pitch_shape_bins')
      .select('pitch_type', { count: 'exact', head: true })
      .eq('span', LEAGUE_SPAN).eq('coord_era', LEAGUE_COORD_ERA).eq('pitch_type', t).gt('n_pitches', 0)
    if (error) console.error('[getAvailablePitchTypes] Supabase error:', error.message)
    return error ? 0 : count ?? 0
  }))
  const order = ['FF', 'ST', 'SL', 'SI', 'FC', 'CH', 'CU', 'KC', 'FS', 'SV']
  return order.filter(t => (counts[known.indexOf(t)] ?? 0) > 0)
}

type PitcherRow = {
  season: number; pitcher_id: number; pitch_type: string; pitcher_name: string; team_abbr: string | null; p_throws: string
  n_pitches: number; velo: string | number; ivb: string | number; hb: string | number; slot: string | number
  sd_hb: string | number; sd_ivb: string | number; n_swings: number; n_whiffs: number
  points: { hb: number; ivb: number }[] | null
  counts: { label: string; swings: number; whiffs: number }[] | null
  batter_sides: { label: string; bbe: number; xwoba_sum: number }[] | null
  monthly: { label: string; velo: number | null; pitches: number }[] | null
}

const shapeOf = (r: PitcherRow) => ({
  velo: Number(r.velo), ivb: Number(r.ivb), hb: Number(r.hb), slot: Number(r.slot),
  sdHb: Number(r.sd_hb), sdIvb: Number(r.sd_ivb), n: r.n_pitches,
})

// Team colours by Savant abbreviation. Only Arizona differs from src/lib/teams.ts (Savant: AZ, ours: ARI).
const ABBR_ALIAS: Record<string, string> = { AZ: 'ARI' }
function teamColor(abbr: string | null): string {
  const a = abbr ? (ABBR_ALIAS[abbr] ?? abbr) : ''
  const t = MLB_TEAMS.find(x => x.abbrev === a)
  return t?.primary_color ?? '#1A1A1A'
}

type MonthlyRow = {
  pitcher_id?: number; pitch_type: string; month: number; n_pitches: number
  release_pos_x: string | number; release_pos_y: string | number; release_pos_z: string | number; release_extension: string | number | null
  release_speed: string | number; release_spin_rate: string | number | null
  vx0: string | number; vy0: string | number; vz0: string | number; ax: string | number; ay: string | number; az: string | number
  plate_x: string | number; plate_z: string | number; sz_top: string | number; sz_bot: string | number; ivb: string | number; hb: string | number
  n_swings: number | null; n_whiffs: number | null; n_csw: number | null; n_bbe: number | null; xwoba_con_sum: string | number | null; n_weak?: number | null
}

type AbsRow = { game_date: string; pitch_type: string | null; is_overturned: boolean }

/** ABS challenges on this pitcher's pitches in a season, keyed `${pitchType}|${month}` -> { n, upheld }. {} on error / none. */
async function getAbsByMonth(pitcherId: number, season: number): Promise<Record<string, { n: number; upheld: number }>> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('abs_challenge_log')
    .select('game_date,pitch_type,is_overturned')
    .eq('pitcher_id', pitcherId)
    .gte('game_date', `${season}-01-01`)
    .lte('game_date', `${season}-12-31`)
    .limit(1000)   // one row per challenge on his pitches: far under the 1,000-row PostgREST cap
  if (error) {
    console.error('[getAbsByMonth] Supabase error:', error.message)
    return {}
  }
  const out: Record<string, { n: number; upheld: number }> = {}
  for (const r of (data ?? []) as unknown as AbsRow[]) {
    if (!r.pitch_type) continue
    const k = `${r.pitch_type}|${Number(r.game_date.slice(5, 7))}`
    const o = (out[k] ??= { n: 0, upheld: 0 })
    o.n += 1
    if (!r.is_overturned) o.upheld += 1
  }
  return out
}

/** Month-by-month release point, speed, break and results for one pitcher + season, grouped by pitch type. {} on error / no rows. */
export async function getPitchViewMonths(pitcherId: number, season: number): Promise<Record<string, PitchViewMonth[]>> {
  const supa = createAdminClient()
  const BASE = 'pitch_type,month,n_pitches,release_pos_x,release_pos_y,release_pos_z,release_extension,release_speed,release_spin_rate,vx0,vy0,vz0,ax,ay,az,plate_x,plate_z,sz_top,sz_bot,ivb,hb'
  const query = (cols: string) => supa.from('pitch_shape_monthly').select(cols).eq('pitcher_id', pitcherId).eq('season', season).order('month', { ascending: true })
  // Newest columns first; each tier drops what the database does not have yet so the shape story always loads.
  let { data, error } = await query(`${BASE},n_swings,n_whiffs,n_csw,n_bbe,xwoba_con_sum,n_weak`)
  if (error?.code === '42703') {
    console.error('[getPitchViewMonths] n_weak missing, run migration 20261020120000:', error.message)
    ;({ data, error } = await query(`${BASE},n_swings,n_whiffs,n_csw,n_bbe,xwoba_con_sum`))
  }
  if (error?.code === '42703') {
    console.error('[getPitchViewMonths] outcome columns missing, run migration 20261019210000:', error.message)
    ;({ data, error } = await query(BASE))
  }
  if (error) {
    console.error('[getPitchViewMonths] Supabase error:', error.message)
    return {}
  }
  const abs = await getAbsByMonth(pitcherId, season)   // separate await, not a slot in a positional Promise.all
  const out: Record<string, PitchViewMonth[]> = {}
  for (const r of (data ?? []) as unknown as MonthlyRow[]) {
    ;(out[r.pitch_type] ??= []).push(monthlyToView(r, season, abs[`${r.pitch_type}|${r.month}`]))
  }
  return out
}

const numOrNull = (v: string | number | null | undefined) => (v == null ? null : Number(v))   // numeric columns arrive as strings

function monthlyToView(r: MonthlyRow, season: number, ab?: { n: number; upheld: number }): PitchViewMonth {
  return {
    month: r.month, n: r.n_pitches, season,
    releaseX: Number(r.release_pos_x), releaseY: Number(r.release_pos_y), releaseZ: Number(r.release_pos_z), extension: numOrNull(r.release_extension),
    speed: Number(r.release_speed), spin: numOrNull(r.release_spin_rate),
    vx0: Number(r.vx0), vy0: Number(r.vy0), vz0: Number(r.vz0), ax: Number(r.ax), ay: Number(r.ay), az: Number(r.az),
    plateX: Number(r.plate_x), plateZ: Number(r.plate_z), szTop: Number(r.sz_top), szBot: Number(r.sz_bot), ivb: Number(r.ivb), hb: Number(r.hb),
    nSwings: r.n_swings ?? null, nWhiffs: r.n_whiffs ?? null, nCsw: r.n_csw ?? null, nBbe: r.n_bbe ?? null, xwobaConSum: numOrNull(r.xwoba_con_sum),
    nWeak: r.n_weak ?? null,
    absN: ab ? ab.n : 0, absUpheld: ab ? ab.upheld : 0,
  }
}

type CompareRow = {
  pitcher_id: number; pitcher_name: string; team_abbr: string | null; n_pitches: number
  velo: string | number; ivb: string | number; hb: string | number; slot: string | number
  n_swings: number; n_whiffs: number
  n_taken?: number | null; n_gift?: number | null; n_miss?: number | null; setup?: SetupRow[] | null
}

/**
 * For each of his pitch types: him, then the closest teammate and the closest league pitchers of the same type and
 * hand (see compare.ts), with each one's whole-season flight path for the animation and his ABS record on that
 * pitch. {} on error. A type he has no comparable season of is simply absent (empty state, no guess).
 */
export async function getPitchCompare(pitcherId: number, season: number, hand: Hand, types: string[]): Promise<Record<string, ComparePitcher[]>> {
  const supa = createAdminClient()
  const BASE = 'pitcher_id,pitcher_name,team_abbr,n_pitches,velo,ivb,hb,slot,n_swings,n_whiffs'
  const out: Record<string, ComparePitcher[]> = {}
  await Promise.all(types.map(async t => {
    const q = (cols: string) => supa.from('pitch_shape_pitcher').select(cols).eq('season', season).eq('pitch_type', t).eq('p_throws', hand).gte('n_pitches', MIN_COMPARE_PITCHES).limit(1000)
    let { data, error } = await q(`${BASE},n_taken,n_gift,n_miss,setup`)
    if (error?.code === '42703') {
      console.error('[getPitchCompare] call/setup columns missing, run migration 20261020180000:', error.message)
      ;({ data, error } = await q(BASE))
    }
    if (error) { console.error('[getPitchCompare] Supabase error:', error.message); return }
    const rows = (data ?? []) as unknown as CompareRow[]
    const me = rows.find(r => r.pitcher_id === pitcherId)
    if (!me) return
    const shape = (r: CompareRow) => ({ velo: Number(r.velo), ivb: Number(r.ivb), hb: Number(r.hb), slot: Number(r.slot) })
    const mk = (r: CompareRow): ComparePitcher => ({
      pitcherId: r.pitcher_id, name: r.pitcher_name, teamAbbr: r.team_abbr ?? '', isSelf: r.pitcher_id === pitcherId,
      isTeammate: r.pitcher_id !== pitcherId && r.team_abbr != null && r.team_abbr === me.team_abbr,
      distance: shapeDistance(shape(me), shape(r)), nPitches: r.n_pitches, ...shape(r),
      nSwings: r.n_swings, nWhiffs: r.n_whiffs,
      nTaken: r.n_taken ?? null, nGift: r.n_gift ?? null, nMiss: r.n_miss ?? null,
      absN: 0, absOverturned: 0, setup: r.setup ?? null, flight: null,
    })
    const subject = mk(me)
    const field = pickField(subject, rows.filter(r => r.pitcher_id !== pitcherId).map(mk))
    const ids = field.map(f => f.pitcherId)

    // each one's whole-season flight path (from his monthly rows) and ABS record on this pitch; separate awaits
    const mres = await supa.from('pitch_shape_monthly').select('pitcher_id,pitch_type,month,n_pitches,release_pos_x,release_pos_y,release_pos_z,release_extension,release_speed,release_spin_rate,vx0,vy0,vz0,ax,ay,az,plate_x,plate_z,sz_top,sz_bot,ivb,hb')
      .eq('season', season).eq('pitch_type', t).in('pitcher_id', ids).limit(1000)
    if (mres.error) console.error('[getPitchCompare] monthly Supabase error:', mres.error.message)
    const byP = new Map<number, PitchViewMonth[]>()
    for (const r of (mres.data ?? []) as unknown as MonthlyRow[]) {
      const pid = r.pitcher_id as number
      byP.set(pid, [...(byP.get(pid) ?? []), monthlyToView(r, season)])
    }
    const ares = await supa.from('abs_challenge_log').select('pitcher_id,is_overturned').eq('pitch_type', t).in('pitcher_id', ids)
      .gte('game_date', `${season}-01-01`).lte('game_date', `${season}-12-31`).limit(1000)
    if (ares.error) console.error('[getPitchCompare] abs Supabase error:', ares.error.message)
    const abs = new Map<number, { n: number; over: number }>()
    for (const r of (ares.data ?? []) as unknown as { pitcher_id: number; is_overturned: boolean }[]) {
      const o = abs.get(r.pitcher_id) ?? { n: 0, over: 0 }
      o.n += 1; if (r.is_overturned) o.over += 1
      abs.set(r.pitcher_id, o)
    }
    out[t] = field.map(f => ({ ...f, flight: aggregateSeason(season, byP.get(f.pitcherId) ?? []), absN: abs.get(f.pitcherId)?.n ?? 0, absOverturned: abs.get(f.pitcherId)?.over ?? 0 }))
  }))
  return out
}

export type MovementSeasonCells = {
  season: number
  /** flat, five numbers per 0.1 in cell inside the window: hb10, ivb10, pitches, swings, whiffs (tenths of an inch) */
  cells: number[]
  /** every league pitch of this type + hand that season */
  league: { pitches: number; swings: number; whiffs: number }
}

export type MovementCellsPayload = {
  /** oldest first; the page shows the latest alone, or all of them added up */
  seasons: MovementSeasonCells[]
  latest: number
  /** window centre (his average shape, inches), half-width shown, extra margin so smoothing near the edge is exact */
  hb0: number; ivb0: number; half: number; margin: number
  /** set when only the older pooled rows exist (span '2024-2026'): one set of cells, no season split, so no 2026-only view yet */
  pooledLabel?: string
  /** share of league pitches (%) with less arm-side break / less induced vertical break than his average: latest season alone, and all seasons pooled */
  pct: { latest: { hb: number; ivb: number }; all: { hb: number; ivb: number } }
}

/** pitch-weighted mean movement (inches) over every cell of the given rows */
function leagueCenter(rows: { cells: number[] }[]): [number, number] {
  let n = 0, sh = 0, si = 0
  for (const r of rows) for (let k = 0; k < r.cells.length; k += 5) { const c = r.cells[k + 2]; n += c; sh += r.cells[k] * c; si += r.cells[k + 1] * c }
  return n ? [Math.round(sh / n) / 10, Math.round(si / n) / 10] : [0, 0]
}

const MAP_FIRST_SEASON = 2024   // the first season build_pitch_shape_cells.py reads
const POOLED_SPAN = '2024-2026'  // the first version of the table: one pooled row per type and hand; used until the per-season rows exist
const CELLS_TTL_MS = 60 * 60 * 1000
type CellsRow = { at: number; n_pitches: number; n_swings: number; n_whiffs: number; cells: number[] }
const cellsCache = new Map<string, CellsRow>()

/**
 * League pitches at 0.1 in resolution around one pitcher's average movement (pitch_shape_cells, one row per season,
 * written by build_pitch_shape_cells.py), cropped to the window the map draws. null when the table has no rows
 * (empty state). Each full row is large (tens of thousands of cells), so it is cached per process for an hour and only
 * the window leaves.
 */
export async function getMovementCells(type: string, hand: Hand, hb0In: number | null, ivb0In: number | null, half: number, margin = 2.5): Promise<MovementCellsPayload | null> {
  const thisYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = MAP_FIRST_SEASON; y <= thisYear; y++) years.push(y)
  const rows = new Map<number, CellsRow>()
  const missing: number[] = []
  for (const y of years) {
    const hit = cellsCache.get(`${y}|${LEAGUE_COORD_ERA}|${type}|${hand}`)
    if (hit && Date.now() - hit.at <= CELLS_TTL_MS) rows.set(y, hit); else missing.push(y)
  }
  if (missing.length) {
    const supa = createAdminClient()
    const { data, error } = await supa
      .from('pitch_shape_cells').select('span,n_pitches,n_swings,n_whiffs,cells')
      .in('span', missing.map(String)).eq('coord_era', LEAGUE_COORD_ERA).eq('pitch_type', type).eq('p_throws', hand)
    if (error) { console.error('[getMovementCells] Supabase error:', error.message); return null }
    for (const d of (data ?? []) as unknown as { span: string; n_pitches: number; n_swings: number; n_whiffs: number; cells: number[] }[]) {
      const row = { at: Date.now(), n_pitches: d.n_pitches, n_swings: d.n_swings, n_whiffs: d.n_whiffs, cells: d.cells }
      cellsCache.set(`${d.span}|${LEAGUE_COORD_ERA}|${type}|${hand}`, row)
      rows.set(Number(d.span), row)
    }
  }
  const have = [...rows.keys()].sort((x, y) => x - y)
  if (have.length === 0) return getPooledMovementCells(type, hand, hb0In, ivb0In, half, margin)
  // null centre = the league's own average movement for this type and hand (the main lab page's map is league-wide)
  const [hb0, ivb0] = hb0In != null && ivb0In != null ? [hb0In, ivb0In] : leagueCenter([...rows.values()])
  const lo = (c: number) => Math.round((c - half - margin) * 10), hi = (c: number) => Math.round((c + half + margin) * 10)
  const hbLo = lo(hb0), hbHi = hi(hb0), ivLo = lo(ivb0), ivHi = hi(ivb0)
  const h0 = Math.round(hb0 * 10), i0 = Math.round(ivb0 * 10)
  const tally = { allBelowHb: 0, allBelowIvb: 0, allTotal: 0, latBelowHb: 0, latBelowIvb: 0, latTotal: 0 }
  const latest = have[have.length - 1]
  const seasons: MovementSeasonCells[] = have.map(y => {
    const row = rows.get(y) as CellsRow
    const all = row.cells
    const cells: number[] = []
    for (let k = 0; k < all.length; k += 5) {
      const hb = all[k], iv = all[k + 1], n = all[k + 2]
      const bh = hb < h0 ? n : hb === h0 ? n / 2 : 0, bi = iv < i0 ? n : iv === i0 ? n / 2 : 0
      tally.allTotal += n; tally.allBelowHb += bh; tally.allBelowIvb += bi
      if (y === latest) { tally.latTotal += n; tally.latBelowHb += bh; tally.latBelowIvb += bi }
      if (hb >= hbLo && hb <= hbHi && iv >= ivLo && iv <= ivHi) cells.push(hb, iv, n, all[k + 3], all[k + 4])
    }
    return { season: y, cells, league: { pitches: row.n_pitches, swings: row.n_swings, whiffs: row.n_whiffs } }
  })
  const pc = (below: number, total: number) => (total ? (below / total) * 100 : 0)
  return {
    seasons, latest, hb0, ivb0, half, margin,
    pct: { latest: { hb: pc(tally.latBelowHb, tally.latTotal), ivb: pc(tally.latBelowIvb, tally.latTotal) }, all: { hb: pc(tally.allBelowHb, tally.allTotal), ivb: pc(tally.allBelowIvb, tally.allTotal) } },
  }
}

/** Fallback: the pooled rows (span '2024-2026'). Shown as a single span; the page hides the 2026-only choice. */
async function getPooledMovementCells(type: string, hand: Hand, hb0In: number | null, ivb0In: number | null, half: number, margin: number): Promise<MovementCellsPayload | null> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('pitch_shape_cells').select('n_pitches,n_swings,n_whiffs,cells')
    .eq('span', POOLED_SPAN).eq('coord_era', LEAGUE_COORD_ERA).eq('pitch_type', type).eq('p_throws', hand).maybeSingle()
  if (error) { console.error('[getPooledMovementCells] Supabase error:', error.message); return null }
  if (!data) return null
  const d = data as unknown as { n_pitches: number; n_swings: number; n_whiffs: number; cells: number[] }
  const [hb0, ivb0] = hb0In != null && ivb0In != null ? [hb0In, ivb0In] : leagueCenter([{ cells: d.cells }])
  const lo = (c: number) => Math.round((c - half - margin) * 10), hi = (c: number) => Math.round((c + half + margin) * 10)
  const hbLo = lo(hb0), hbHi = hi(hb0), ivLo = lo(ivb0), ivHi = hi(ivb0)
  const h0 = Math.round(hb0 * 10), i0 = Math.round(ivb0 * 10)
  const cells: number[] = []
  let total = 0, bh = 0, bi = 0
  for (let k = 0; k < d.cells.length; k += 5) {
    const hb = d.cells[k], iv = d.cells[k + 1], n = d.cells[k + 2]
    total += n
    bh += hb < h0 ? n : hb === h0 ? n / 2 : 0
    bi += iv < i0 ? n : iv === i0 ? n / 2 : 0
    if (hb >= hbLo && hb <= hbHi && iv >= ivLo && iv <= ivHi) cells.push(hb, iv, n, d.cells[k + 3], d.cells[k + 4])
  }
  const pc = (b: number) => (total ? (b / total) * 100 : 0)
  const pct = { hb: pc(bh), ivb: pc(bi) }
  return {
    seasons: [{ season: new Date().getFullYear(), cells, league: { pitches: d.n_pitches, swings: d.n_swings, whiffs: d.n_whiffs } }],
    latest: new Date().getFullYear(), hb0, ivb0, half, margin, pooledLabel: '2024–2026', pct: { latest: pct, all: pct },
  }
}

export type Thrower = {
  pitcherId: number; name: string; teamAbbr: string
  nPitches: number; velo: number; ivb: number; hb: number; slot: number
  nSwings: number; nWhiffs: number
  /** how many of his sampled pitches (up to 60 per pitch type and season) land inside the chosen window, and how many were sampled */
  inSpot: number; sample: number
  /** share of his sampled pitches in the window, and that share applied to all his pitches of this type (a rough count: the sample is small) */
  share: number; estPitches: number
  /** his sampled pitches as [hb, ivb] in inches (up to 60), so the map can draw them as dots */
  points: [number, number][]
  /** location, calls, repeatability and contact numbers for the ahead / behind section (null where the data is not loaded yet) */
  diag: Diag
}

const MIN_IN_SPOT = 3   // fewer than 3 of 60 sampled pitches in the window is noise, not a pitcher who throws it there

/**
 * Pitchers who actually throw {type} into a square window around a chosen spot on the movement map, from the sample of
 * up to 60 of each pitcher's pitches kept in pitch_shape_pitcher (min 300 pitches of the type that season). Most in the
 * spot first. [] on error / none. The sample is random, so shares are approximate.
 */
const THROWER_BASE_COLS = 'pitcher_id,pitcher_name,team_abbr,n_pitches,velo,ivb,hb,slot,n_swings,n_whiffs,points,sd_hb,sd_ivb,n_taken,n_gift,n_miss,batter_sides'
const THROWER_DIAG_COLS = ',n_loc,n_zone,n_heart,n_ooz,n_chase,n_bbe,xwoba_con_sum,n_bbe_w,woba_con_sum'

export type ThrowersResult = { throwers: Thrower[]; /** the same figures pooled over every pitcher of this pitch type, hand and season */ league: Diag }

export async function getThrowers(type: string, hand: Hand, hb: number, ivb: number, radius: number, season: number, limit = 40): Promise<Thrower[]> {
  return (await getThrowersDetailed(type, hand, hb, ivb, radius, season, limit)).throwers
}

/**
 * Same as getThrowers, plus each pitcher's diagnostics and the league figures to set them against. The diagnostic columns come from
 * supabase/migrations/20261031100000_pitch_shape_pitcher_diagnostics.sql; until that is applied the select without them is used, so nothing else breaks.
 */
export async function getThrowersDetailed(type: string, hand: Hand, hb: number, ivb: number, radius: number, season: number, limit = 40): Promise<ThrowersResult> {
  const supa = createAdminClient()
  const ask = (cols: string) => supa
    .from('pitch_shape_pitcher')
    .select(cols)
    .eq('season', season).eq('pitch_type', type).eq('p_throws', hand).gte('n_pitches', MIN_COMPARE_PITCHES)
    .limit(1000)
  let { data, error } = await ask(THROWER_BASE_COLS + THROWER_DIAG_COLS)
  if (error && /column|does not exist/i.test(error.message)) ({ data, error } = await ask(THROWER_BASE_COLS))
  if (error) { console.error('[getThrowers] Supabase error:', error.message); return { throwers: [], league: leagueOf([]) } }
  type Row = DiagRow & { pitcher_id: number; pitcher_name: string; team_abbr: string | null; velo: string | number; ivb: string | number; hb: string | number; slot: string | number; n_swings: number; n_whiffs: number; points: { hb: number; ivb: number }[] | null }
  const rows = (data ?? []) as unknown as Row[]
  const out: Thrower[] = []
  for (const r of rows) {
    const pts = r.points ?? []
    if (pts.length === 0) continue
    const k = pts.filter(p => Math.abs(p.hb - hb) <= radius && Math.abs(p.ivb - ivb) <= radius).length
    if (k < MIN_IN_SPOT) continue
    const share = k / pts.length
    out.push({
      pitcherId: r.pitcher_id, name: r.pitcher_name, teamAbbr: r.team_abbr ?? '', nPitches: r.n_pitches,
      velo: Number(r.velo), ivb: Number(r.ivb), hb: Number(r.hb), slot: Number(r.slot), nSwings: r.n_swings, nWhiffs: r.n_whiffs,
      inSpot: k, sample: pts.length, share, estPitches: Math.round(share * r.n_pitches),
      points: pts.map(p => [Math.round(p.hb * 10) / 10, Math.round(p.ivb * 10) / 10] as [number, number]),
      diag: diagOf(r),
    })
  }
  return { throwers: out.sort((a, b) => b.estPitches - a.estPitches).slice(0, limit), league: leagueOf(rows) }
}

/** The Shape tab's payload for one pitcher. null = no shape rows for him (empty state). */
export async function getShapeLabData(pitcherId: number): Promise<ShapeLabData | null> {
  if (!Number.isInteger(pitcherId) || pitcherId <= 0) return null
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('pitch_shape_pitcher')
    .select('season,pitcher_id,pitch_type,pitcher_name,team_abbr,p_throws,n_pitches,velo,ivb,hb,slot,sd_hb,sd_ivb,n_swings,n_whiffs,points,counts,batter_sides,monthly')
    .eq('pitcher_id', pitcherId)
    .order('season', { ascending: false })
  if (error) {
    console.error('[getShapeLabData] Supabase error:', error.message)
    return null
  }
  const rows = (data ?? []) as unknown as PitcherRow[]
  if (rows.length === 0) return null

  const season = rows[0].season // most recent season he has rows for
  const cur = rows.filter(r => r.season === season).sort((a, b) => b.n_pitches - a.n_pitches)
  const prevRows = new Map(rows.filter(r => r.season === season - 1).map(r => [r.pitch_type, r]))
  const hand: Hand = cur[0].p_throws === 'L' ? 'L' : 'R'
  const types = cur.map(r => r.pitch_type).filter(t => t in PITCH_NAMES)

  const binLists = await Promise.all(types.map(t => getLeagueBins(t, hand)))
  const bins: Record<string, ShapeBin[]> = {}
  types.forEach((t, k) => { bins[t] = binLists[k] })

  const pitches: PitcherPitchShape[] = cur.filter(r => types.includes(r.pitch_type)).map(r => {
    const p = prevRows.get(r.pitch_type)
    return {
      pitchType: r.pitch_type,
      current: shapeOf(r),
      prev: p ? shapeOf(p) : null,
      points: r.points ?? [],
      own: { whiff: r.n_swings >= GATE.swings ? r.n_whiffs / r.n_swings : null, swings: r.n_swings },
    }
  })

  const counts: Record<string, CountSplit[] | null> = {}
  const batterSides: Record<string, BatterSideSplit[] | null> = {}
  const monthly: Record<string, MonthPoint[] | null> = {}
  const ORDER = ['Ahead in count', 'Even count', 'Behind in count']
  for (const r of cur) {
    counts[r.pitch_type] = r.counts
      ? [...r.counts].sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label))
          .map(c => ({ label: c.label, swings: c.swings, whiff: c.swings >= GATE.swings ? c.whiffs / c.swings : null }))
      : null
    batterSides[r.pitch_type] = r.batter_sides
      ? r.batter_sides.map(b => ({ label: b.label, bbe: b.bbe, xwobaCon: b.bbe >= GATE.bbe ? b.xwoba_sum / b.bbe : null }))
      : null
    monthly[r.pitch_type] = r.monthly ? r.monthly.map(m => ({ label: m.label, velo: m.velo, pitches: m.pitches })) : null
  }

  // separate await (not another slot in a positional Promise.all)
  const view = await getPitchViewMonths(pitcherId, season)
  const viewPrev = await getPitchViewMonths(pitcherId, season - 1)
  const compare = await getPitchCompare(pitcherId, season, hand, types)
  const viewSeasons: Record<string, Record<string, PitchViewMonth[]>> = { [season - 1]: viewPrev, [season]: view }

  return {
    pitcherId, name: cur[0].pitcher_name, hand, teamAbbr: cur[0].team_abbr ?? '', teamColor: teamColor(cur[0].team_abbr),
    season, prevSeason: season - 1, leagueSpan: LEAGUE_SPAN.replace('-', '–'),
    pitches, bins, counts, batterSides, monthly, view, viewSeasons, compare,
    // The validation job (stability / within-season r) is not built yet: honest "Not computed yet".
    validation: { stability: null, within: null },
  }
}

/**
 * Pitcher search for the Shape Sandbox: name contains `q`, most recent season he has rows in (this
 * season or last). `proTypes` false returns only the free sandbox pitch types, so a non-Pro viewer
 * never receives a locked type's shape. [] on error.
 */
// Names are stored with accents (Sánchez, Muñoz). Typing "Sanchez" should still find them, so the
// letters that carry accents become single-character wildcards in the ilike pattern.
const accentTolerant = (term: string) => term.replace(/[aeiouncAEIOUNC]/g, '_')
const plain = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export async function searchPitchers(q: string, proTypes: boolean): Promise<PitcherHit[]> {
  const term = q.replace(/[%_,()*\\]/g, ' ').trim().slice(0, 40)
  if (term.length < 2) return []
  const supa = createAdminClient()
  const minSeason = new Date().getFullYear() - 1
  let query = supa
    .from('pitch_shape_pitcher')
    .select('season,pitcher_id,pitch_type,pitcher_name,team_abbr,p_throws,n_pitches,velo,ivb,hb,slot')
    .ilike('pitcher_name', `%${accentTolerant(term)}%`)
    .gte('season', minSeason)
    .order('season', { ascending: false })
    .order('n_pitches', { ascending: false })
    .limit(120)
  if (!proTypes) query = query.in('pitch_type', [...FREE_SANDBOX_TYPES])
  const { data, error } = await query
  if (error) {
    console.error('[searchPitchers] Supabase error:', error.message)
    return []
  }
  type R = { season: number; pitcher_id: number; pitch_type: string; pitcher_name: string; team_abbr: string | null; p_throws: string; n_pitches: number; velo: string | number; ivb: string | number; hb: string | number; slot: string | number }
  const byId = new Map<number, PitcherHit>()
  for (const r of (data ?? []) as unknown as R[]) {
    let h = byId.get(r.pitcher_id)
    if (!h) {
      h = { id: r.pitcher_id, name: r.pitcher_name, team: r.team_abbr ?? '', hand: r.p_throws === 'L' ? 'L' : 'R', season: r.season, pitches: [] }
      byId.set(r.pitcher_id, h)
    }
    if (r.season !== h.season || !(r.pitch_type in PITCH_NAMES)) continue // latest season only
    h.pitches.push({ pitchType: r.pitch_type, n: r.n_pitches, shape: { velo: Number(r.velo), ivb: Number(r.ivb), hb: Number(r.hb), slot: Number(r.slot) } })
  }
  // The wildcard pattern is loose by design; keep only names that really contain the term once accents are ignored.
  const want = plain(term)
  return [...byId.values()].filter(h => h.pitches.length > 0 && plain(h.name).includes(want)).slice(0, 8)
}

// ---------- location panel (where pitches near a movement spot cross the plate) ----------
// pitch_shape_locations (migration 20261021100000; writer shape-locations.yml): one row per season x pitch type x hand,
// movement in 0.5 in bins x a 24 x 28 location grid (see location.ts). A full row is large, so it is cached per process
// for an hour and only the window's totals leave.

type LocRow = { at: number; bins: number[] }
const locCache = new Map<string, LocRow>()

/**
 * League pitches whose movement is within a square window (+-radius inches, bins counted by their centre) of a spot,
 * summed to location cells: for the latest season alone and for every season that has rows added up. null when the table
 * has no rows for this type and hand (empty state).
 */
export async function getLocationWindow(type: string, hand: Hand, hb: number, ivb: number, radius: number): Promise<LocationPayload | null> {
  const thisYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = MAP_FIRST_SEASON; y <= thisYear; y++) years.push(y)
  const rows = new Map<number, LocRow>()
  const missing: number[] = []
  for (const y of years) {
    const hit = locCache.get(`${y}|${LEAGUE_COORD_ERA}|${type}|${hand}`)
    if (hit && Date.now() - hit.at <= CELLS_TTL_MS) rows.set(y, hit); else missing.push(y)
  }
  if (missing.length) {
    const { data, error } = await createAdminClient()
      .from('pitch_shape_locations').select('span,bins')
      .in('span', missing.map(String)).eq('coord_era', LEAGUE_COORD_ERA).eq('pitch_type', type).eq('p_throws', hand)
    if (error) { console.error('[getLocationWindow] Supabase error:', error.message); return null }
    for (const d of (data ?? []) as unknown as { span: string; bins: number[] }[]) {
      const row = { at: Date.now(), bins: d.bins }
      locCache.set(`${d.span}|${LEAGUE_COORD_ERA}|${type}|${hand}`, row)
      rows.set(Number(d.span), row)
    }
  }
  const have = [...rows.keys()].sort((a, b) => a - b)
  if (have.length === 0) return null
  const latest = have[have.length - 1]
  const sum = (ys: number[]): LocationWindow => {
    const acc = new Map<number, number>()
    let n = 0
    for (const y of ys) {
      const b = (rows.get(y) as LocRow).bins
      for (let k = 0; k < b.length; k += 5) {
        // movement bin [i/2, i/2 + 0.5): counted when its centre is inside the window
        if (Math.abs((b[k] + 0.5) / 2 - hb) > radius || Math.abs((b[k + 1] + 0.5) / 2 - ivb) > radius) continue
        const cell = b[k + 3] * LOC_COLS + b[k + 2]
        acc.set(cell, (acc.get(cell) ?? 0) + b[k + 4]); n += b[k + 4]
      }
    }
    const cells: number[] = []
    for (const [cell, c] of acc) cells.push(cell % LOC_COLS, Math.floor(cell / LOC_COLS), c)
    return { n, cells }
  }
  return { seasons: have, latest, latestWindow: sum([latest]), allWindow: sum(have) }
}
