// src/lib/pitcher-situational-zones.ts
//
// Real zone data broken out by count situation (first pitch / even / 2-strike
// / 3-ball) AND batter side (all/vs_lhb/vs_rhb) — the count-filter gap
// Location Lab's header comment flagged as a real, undone thing. Rather
// than a new weekly cron table + backfill, this does a single LIVE
// per-pitcher Savant CSV pull (same endpoint + parsing pattern already
// proven in pitcher-statcast-profile.ts and /api/pitcher-arsenal) and
// aggregates zones from it on the fly — no new pipeline, no new table,
// real-time as of the last cached fetch.
//
// Two aggregations come out of the same one CSV pass:
//   - bySituation[situation][split][zone]  — the overall zone grid (what
//     Location Lab already shows, just bucketed by count situation too)
//   - byPitchSituation[situation][pitchType][zone] — same cells, scoped to
//     one pitch type, needed by the game-plan recommender (lib/game-plan.ts)
//     to know WHICH pitch is strongest in WHICH zone for a given count.
//
// Situation bucketing (a categorization choice, not a fetched fact):
//   2strike   — strikes === 2 (highest leverage, checked first)
//   3ball     — balls === 3 (and strikes < 2)
//   first_pitch — balls === 0 && strikes === 0
//   even      — everything else
//
// 2026-09-16: added a finer, composable dimension alongside the coarse
//4-bucket Situation above (kept as-is for backward compat with the
// existing game-plan wristband) — exact count (0-0..3-2) and real
// baserunner state, both from the same one CSV pass. Baserunner state
// comes from real on_1b/on_2b/on_3b columns (each holds the runner's
// Statcast id when occupied, blank when not — same columns, same
// presence-only parsing already proven in pitcher-pitch-log.ts /
// batter-pitch-log.ts; verified live against this exact endpoint before
// building on it, per house rules). Rather than precompute every
// count×baseState cross product as its own nested structure (would
// explode the response and still not let the UI combine "any count +
// RISP" freely), every real pitch is kept as one fine-grained row
// (pitchType, zone, exact count, base state, batter stand + the same
// raw accumulator fields used everywhere else in this file) and rolled
// up on demand via rollUpZones/rollUpByPitchZones — same math as the
// existing per-situation reduction, just parameterized. A season's worth
// of pitches (at most a few thousand rows, a dozen small numeric fields
// each) is the same order of magnitude already shipped by
// pitcher-pitch-log.ts, so this stays one fetch, no new pipeline.

import type { Cell } from '@/components/pitching-lab/ZoneGrid'
import { withSavantCache } from '@/lib/savant-cache'

const SEASON_FALLBACK = new Date().getFullYear()
const HARD_HIT_MPH = 95
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const TOTAL_BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }
const ALL_ZONES = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14'])

export type Situation = 'first_pitch' | 'even' | '2strike' | '3ball'
export const SITUATIONS: Situation[] = ['first_pitch', 'even', '2strike', '3ball']
export const SITUATION_LABELS: Record<Situation, string> = {
  first_pitch: 'First pitch', even: 'Even count', '2strike': '2-strike', '3ball': '3-ball',
}

export type Split = 'all' | 'vs_lhb' | 'vs_rhb'

// Real baserunner state, classified from on_1b/on_2b/on_3b presence.
export type BaseState = 'empty' | 'man_on_1st' | 'man_on_2nd' | 'man_on_3rd' | '1st_2nd' | '1st_3rd' | '2nd_3rd' | 'loaded'
export const BASE_STATES: BaseState[] = ['empty', 'man_on_1st', 'man_on_2nd', 'man_on_3rd', '1st_2nd', '1st_3rd', '2nd_3rd', 'loaded']
export const BASE_STATE_LABELS: Record<BaseState, string> = {
  empty: 'Bases empty', man_on_1st: 'Man on 1st', man_on_2nd: 'Man on 2nd', man_on_3rd: 'Man on 3rd',
  '1st_2nd': '1st & 2nd', '1st_3rd': '1st & 3rd', '2nd_3rd': '2nd & 3rd', loaded: 'Bases loaded',
}
// RISP is a real UNION of states (any runner in scoring position), not a
// 9th mutually-exclusive bucket — applied at roll-up time via rollUpZones/
// rollUpByPitchZones, never stored as its own accumulator.
export const RISP_STATES: BaseState[] = ['man_on_2nd', 'man_on_3rd', '1st_2nd', '1st_3rd', '2nd_3rd', 'loaded']

function classifyBaseState(on1: boolean, on2: boolean, on3: boolean): BaseState {
  if (on1 && on2 && on3) return 'loaded'
  if (on2 && on3) return '2nd_3rd'
  if (on1 && on3) return '1st_3rd'
  if (on1 && on2) return '1st_2nd'
  if (on3) return 'man_on_3rd'
  if (on2) return 'man_on_2nd'
  if (on1) return 'man_on_1st'
  return 'empty'
}

export type ExactCount = '0-0' | '1-0' | '0-1' | '1-1' | '2-0' | '0-2' | '2-1' | '1-2' | '3-0' | '3-1' | '2-2' | '3-2'
export const EXACT_COUNTS: ExactCount[] = ['0-0', '1-0', '0-1', '1-1', '2-0', '0-2', '2-1', '1-2', '3-0', '3-1', '2-2', '3-2']
const EXACT_COUNT_SET = new Set<string>(EXACT_COUNTS)

// Same classification the main aggregation loop uses (strikes===2 checked
// first, then balls===3, then 0-0, else even) — exposed so a caller that
// needs one of the coarse 4 buckets can still route through the
// exact-count-based rollUp* helpers (e.g. layering a baserunner filter
// on top of a coarse situation, which the precomputed bySituation/
// byPitchSituation structures can't do on their own).
export const SITUATION_TO_COUNTS: Record<Situation, ExactCount[]> = {
  first_pitch: ['0-0'],
  even: ['1-0', '0-1', '1-1', '2-0', '2-1'],
  '2strike': ['0-2', '1-2', '2-2', '3-2'],
  '3ball': ['3-0', '3-1'],
}

export type FineEntry = {
  pitchType: string; zone: string; count: ExactCount; baseState: BaseState; stand: 'L' | 'R' | ''
  pitches: number; swings: number; whiffs: number; ab: number; hits: number; totalBases: number
  battedBalls: number; hardHit: number; wobaSum: number; wobaCount: number; rvSum: number; rvCount: number
}

export type PitcherSituationalZones = {
  pitcherId: number
  season: number
  totalPitches: number
  pitchNames: Record<string, string>
  bySituation: Record<Situation, Record<Split, Record<string, Cell>>>
  byPitchSituation: Record<Situation, Record<string, Record<string, Cell>>> // [situation][pitchType][zone]
  fine: FineEntry[] // every real pitch, one row per (pitchType, zone, exact count, base state, stand) combo — see rollUpZones/rollUpByPitchZones
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

type Accum = {
  pitches: number; swings: number; whiffs: number
  ab: number; hits: number; totalBases: number
  battedBalls: number; hardHit: number
  wobaSum: number; wobaCount: number
  rvSum: number; rvCount: number
}
function freshAccum(): Accum {
  return { pitches: 0, swings: 0, whiffs: 0, ab: 0, hits: 0, totalBases: 0, battedBalls: 0, hardHit: 0, wobaSum: 0, wobaCount: 0, rvSum: 0, rvCount: 0 }
}

function reduceAccum(a: Accum): Cell {
  return {
    pitches: a.pitches,
    swings: a.swings,
    whiffs: a.whiffs,
    ab: a.ab,
    batted_balls: a.battedBalls,
    usage_pct: 0, // filled in per-group after totals are known
    ba_against: a.ab > 0 ? Math.round((a.hits / a.ab) * 1000) / 1000 : null,
    slg_against: a.ab > 0 ? Math.round((a.totalBases / a.ab) * 1000) / 1000 : null,
    whiff_pct: a.swings > 0 ? Math.round((a.whiffs / a.swings) * 1000) / 10 : null,
    hard_hit_pct: a.battedBalls > 0 ? Math.round((a.hardHit / a.battedBalls) * 1000) / 10 : null,
    woba_against: a.wobaCount > 0 ? Math.round((a.wobaSum / a.wobaCount) * 1000) / 1000 : null,
    run_value_per_100: a.rvCount > 0 ? Math.round((a.rvSum / a.rvCount) * 1000) / 10 : null,
  } as Cell
}
// Public alias — same reduction, reused by the roll-up helpers below (and
// safe to import into client components: pure function, no fetch/server
// dependency in this module beyond the one async fetch function itself).
export const reduceCell = reduceAccum

function addInto(a: Accum, f: FineEntry) {
  a.pitches += f.pitches; a.swings += f.swings; a.whiffs += f.whiffs; a.ab += f.ab
  a.hits += f.hits; a.totalBases += f.totalBases; a.battedBalls += f.battedBalls; a.hardHit += f.hardHit
  a.wobaSum += f.wobaSum; a.wobaCount += f.wobaCount; a.rvSum += f.rvSum; a.rvCount += f.rvCount
}

function matchesFilter(
  f: FineEntry,
  opts: { counts?: ExactCount[] | 'any'; baseStates?: BaseState[] | 'any'; split?: Split },
): boolean {
  if (opts.counts && opts.counts !== 'any' && !opts.counts.includes(f.count)) return false
  if (opts.baseStates && opts.baseStates !== 'any' && !opts.baseStates.includes(f.baseState)) return false
  const split = opts.split ?? 'all'
  if (split === 'vs_lhb' && f.stand !== 'L') return false
  if (split === 'vs_rhb' && f.stand !== 'R') return false
  return true
}

/**
 * Roll up the fine-grained per-pitch rows into one zone grid — every real
 * pitch matching the given count/baseState/split filter, regardless of
 * pitch type. `counts`/`baseStates` default to 'any' (no filter on that
 * dimension); `split` defaults to 'all'.
 */
export function rollUpZones(
  fine: FineEntry[],
  opts: { counts?: ExactCount[] | 'any'; baseStates?: BaseState[] | 'any'; split?: Split },
): Record<string, Cell> {
  const zoneAccum = new Map<string, Accum>()
  let grandTotal = 0
  for (const f of fine) {
    if (!matchesFilter(f, opts)) continue
    if (!zoneAccum.has(f.zone)) zoneAccum.set(f.zone, freshAccum())
    addInto(zoneAccum.get(f.zone)!, f)
    grandTotal += f.pitches
  }
  const out: Record<string, Cell> = {}
  for (const [zone, accum] of zoneAccum) {
    const cell = reduceCell(accum)
    ;(cell as { usage_pct: number }).usage_pct = grandTotal > 0 ? Math.round((accum.pitches / grandTotal) * 1000) / 10 : 0
    out[zone] = cell
  }
  return out
}

/**
 * Same as rollUpZones, but scoped per pitch type (usage_pct is relative
 * to that pitch type's own total within the filter, matching
 * byPitchSituation's existing convention) — what game-plan.ts needs to
 * know which pitch is strongest in which zone for a given count/baseState.
 */
export function rollUpByPitchZones(
  fine: FineEntry[],
  opts: { counts?: ExactCount[] | 'any'; baseStates?: BaseState[] | 'any'; split?: Split },
): Record<string, Record<string, Cell>> {
  const byPitch = new Map<string, Map<string, Accum>>()
  const pitchTotal = new Map<string, number>()
  for (const f of fine) {
    if (!matchesFilter(f, opts)) continue
    if (!byPitch.has(f.pitchType)) byPitch.set(f.pitchType, new Map())
    const zm = byPitch.get(f.pitchType)!
    if (!zm.has(f.zone)) zm.set(f.zone, freshAccum())
    addInto(zm.get(f.zone)!, f)
    pitchTotal.set(f.pitchType, (pitchTotal.get(f.pitchType) ?? 0) + f.pitches)
  }
  const out: Record<string, Record<string, Cell>> = {}
  for (const [pitchType, zm] of byPitch) {
    const total = pitchTotal.get(pitchType) ?? 0
    const zones: Record<string, Cell> = {}
    for (const [zone, accum] of zm) {
      const cell = reduceCell(accum)
      ;(cell as { usage_pct: number }).usage_pct = total > 0 ? Math.round((accum.pitches / total) * 1000) / 10 : 0
      zones[zone] = cell
    }
    out[pitchType] = zones
  }
  return out
}

// 2026-09-17: this is the same full-season per-pitch CSV fetch pattern
// as batter-pitch-log.ts's getBatterPitchLog — a real starter's season
// pitch count routinely exceeds Next's 2MB fetch-cache item ceiling, so
// `next: { revalidate }` below was silently a no-op (confirmed the same
// class of bug as series-matchup.ts's getBatterRawPitchLog before that
// fix). Routed through the same withSavantCache Supabase cache-aside
// table now instead of fetching live on every call.
export async function getPitcherSituationalZones(pitcherId: number, season = SEASON_FALLBACK): Promise<PitcherSituationalZones | null> {
  return withSavantCache(
    `pitcher-situational-zones:${pitcherId}:${season}`,
    21600,
    () => fetchPitcherSituationalZones(pitcherId, season),
  )
}

async function fetchPitcherSituationalZones(pitcherId: number, season = SEASON_FALLBACK): Promise<PitcherSituationalZones | null> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=pitcher`,
    `&pitchers_lookup%5B%5D=${pitcherId}`,
    `&game_date_gt=${season}-01-01&game_date_lt=${season}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc&type=details',
  ].join('')

  let text: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 },
    })
    if (!res.ok) return null
    text = await res.text()
  } catch {
    return null
  }

  const lines = text.trim().split('\n')
  if (lines.length < 2) return null

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿?"|"$/g, ''))
  const idx = (name: string) => headers.indexOf(name)
  const iPitchType = idx('pitch_type')
  const iPitchName = idx('pitch_name')
  const iBalls = idx('balls')
  const iStrikes = idx('strikes')
  const iZone = idx('zone')
  const iStand = idx('stand')
  const iDesc = idx('description')
  const iType = idx('type')
  const iEvents = idx('events')
  const iLaunchSpeed = idx('launch_speed')
  const iEstWoba = idx('estimated_woba_using_speedangle')
  const iRunExp = idx('delta_run_exp')
  const iOn1b = idx('on_1b')
  const iOn2b = idx('on_2b')
  const iOn3b = idx('on_3b')

  if (iPitchType === -1 || iBalls === -1 || iStrikes === -1 || iZone === -1) return null

  const bySituation: Record<Situation, Record<Split, Map<string, Accum>>> = {
    first_pitch: { all: new Map(), vs_lhb: new Map(), vs_rhb: new Map() },
    even:        { all: new Map(), vs_lhb: new Map(), vs_rhb: new Map() },
    '2strike':   { all: new Map(), vs_lhb: new Map(), vs_rhb: new Map() },
    '3ball':     { all: new Map(), vs_lhb: new Map(), vs_rhb: new Map() },
  }
  const byPitchSituation: Record<Situation, Map<string, Map<string, Accum>>> = {
    first_pitch: new Map(), even: new Map(), '2strike': new Map(), '3ball': new Map(),
  }
  const pitchNames: Record<string, string> = {}
  const situationTotals: Record<Situation, Record<Split, number>> = {
    first_pitch: { all: 0, vs_lhb: 0, vs_rhb: 0 },
    even: { all: 0, vs_lhb: 0, vs_rhb: 0 },
    '2strike': { all: 0, vs_lhb: 0, vs_rhb: 0 },
    '3ball': { all: 0, vs_lhb: 0, vs_rhb: 0 },
  }

  let totalPitches = 0
  const fineMap = new Map<string, FineEntry>()

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, ''))
    const pitchType = cells[iPitchType]
    const balls = Number(cells[iBalls])
    const strikes = Number(cells[iStrikes])
    const zone = String(Math.trunc(Number(cells[iZone])))
    if (!pitchType || Number.isNaN(balls) || Number.isNaN(strikes) || !ALL_ZONES.has(zone)) continue

    totalPitches++
    if (iPitchName !== -1 && cells[iPitchName] && !pitchNames[pitchType]) pitchNames[pitchType] = cells[iPitchName]

    const situation: Situation = strikes === 2 ? '2strike' : balls === 3 ? '3ball' : (balls === 0 && strikes === 0) ? 'first_pitch' : 'even'
    const stand = iStand !== -1 ? cells[iStand] : ''
    const splits: Split[] = stand === 'L' ? ['all', 'vs_lhb'] : stand === 'R' ? ['all', 'vs_rhb'] : ['all']

    const desc = iDesc !== -1 ? cells[iDesc].toLowerCase() : ''
    const isSwing = ['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'].includes(desc)
    const isWhiff = ['swinging_strike', 'swinging_strike_blocked', 'swinging_pitchout'].includes(desc)
    const typeCode = iType !== -1 ? cells[iType] : ''
    const isBattedBall = typeCode === 'X'
    const launchSpeed = iLaunchSpeed !== -1 ? Number(cells[iLaunchSpeed]) : NaN
    const eventName = iEvents !== -1 ? cells[iEvents] : ''
    const wobaVal = iEstWoba !== -1 ? Number(cells[iEstWoba]) : NaN
    const rv = iRunExp !== -1 ? Number(cells[iRunExp]) : NaN

    function applyTo(accum: Accum) {
      accum.pitches++
      if (isSwing) accum.swings++
      if (isWhiff) accum.whiffs++
      if (eventName) {
        accum.ab++
        if (HIT_EVENTS.has(eventName)) { accum.hits++; accum.totalBases += TOTAL_BASES[eventName] ?? 0 }
      }
      if (isBattedBall) {
        accum.battedBalls++
        if (!Number.isNaN(launchSpeed) && launchSpeed >= HARD_HIT_MPH) accum.hardHit++
        // estimated_woba_using_speedangle is only real on a batted ball —
        // Savant's CSV fills it with literal '0' (not blank) on every
        // other pitch, which would otherwise dilute the average toward
        // zero if counted unconditionally (confirmed against a real
        // pitcher's raw CSV: type='S' rows carry '0' here, not '').
        if (!Number.isNaN(wobaVal)) { accum.wobaSum += wobaVal; accum.wobaCount++ }
      }
      if (!Number.isNaN(rv)) { accum.rvSum += rv; accum.rvCount++ }
    }

    for (const split of splits) {
      const m = bySituation[situation][split]
      if (!m.has(zone)) m.set(zone, freshAccum())
      applyTo(m.get(zone)!)
      situationTotals[situation][split]++
    }

    if (!byPitchSituation[situation].has(pitchType)) byPitchSituation[situation].set(pitchType, new Map())
    const pm = byPitchSituation[situation].get(pitchType)!
    if (!pm.has(zone)) pm.set(zone, freshAccum())
    applyTo(pm.get(zone)!)

    // Fine-grained row — exact count + real baserunner state, for
    // rollUpZones/rollUpByPitchZones (Hot Zone Overlay's count/situation
    // manipulation). Skipped only for the handful of malformed rows where
    // balls/strikes don't form a legal count (e.g. bad CSV data).
    const exactCountStr = `${balls}-${strikes}`
    if (EXACT_COUNT_SET.has(exactCountStr)) {
      const exactCount = exactCountStr as ExactCount
      const on1 = iOn1b !== -1 && cells[iOn1b] !== ''
      const on2 = iOn2b !== -1 && cells[iOn2b] !== ''
      const on3 = iOn3b !== -1 && cells[iOn3b] !== ''
      const baseState = classifyBaseState(on1, on2, on3)
      const standCode: 'L' | 'R' | '' = stand === 'L' ? 'L' : stand === 'R' ? 'R' : ''
      const fineKey = `${pitchType}|${zone}|${exactCount}|${baseState}|${standCode}`
      if (!fineMap.has(fineKey)) {
        fineMap.set(fineKey, {
          pitchType, zone, count: exactCount, baseState, stand: standCode,
          pitches: 0, swings: 0, whiffs: 0, ab: 0, hits: 0, totalBases: 0,
          battedBalls: 0, hardHit: 0, wobaSum: 0, wobaCount: 0, rvSum: 0, rvCount: 0,
        })
      }
      applyTo(fineMap.get(fineKey)!)
    }
  }

  if (totalPitches === 0) return null

  const outBySituation: PitcherSituationalZones['bySituation'] = { first_pitch: { all: {}, vs_lhb: {}, vs_rhb: {} }, even: { all: {}, vs_lhb: {}, vs_rhb: {} }, '2strike': { all: {}, vs_lhb: {}, vs_rhb: {} }, '3ball': { all: {}, vs_lhb: {}, vs_rhb: {} } }
  for (const situation of SITUATIONS) {
    for (const split of ['all', 'vs_lhb', 'vs_rhb'] as Split[]) {
      const total = situationTotals[situation][split]
      const zoneMap = bySituation[situation][split]
      const out: Record<string, Cell> = {}
      for (const [zone, accum] of zoneMap) {
        const cell = reduceAccum(accum)
        ;(cell as { usage_pct: number }).usage_pct = total > 0 ? Math.round((accum.pitches / total) * 1000) / 10 : 0
        out[zone] = cell
      }
      outBySituation[situation][split] = out
    }
  }

  const outByPitchSituation: PitcherSituationalZones['byPitchSituation'] = { first_pitch: {}, even: {}, '2strike': {}, '3ball': {} }
  for (const situation of SITUATIONS) {
    for (const [pitchType, zoneMap] of byPitchSituation[situation]) {
      const pitchTotal = [...zoneMap.values()].reduce((s, a) => s + a.pitches, 0)
      const out: Record<string, Cell> = {}
      for (const [zone, accum] of zoneMap) {
        const cell = reduceAccum(accum)
        ;(cell as { usage_pct: number }).usage_pct = pitchTotal > 0 ? Math.round((accum.pitches / pitchTotal) * 1000) / 10 : 0
        out[zone] = cell
      }
      outByPitchSituation[situation][pitchType] = out
    }
  }

  return {
    pitcherId,
    season,
    totalPitches,
    pitchNames,
    bySituation: outBySituation,
    byPitchSituation: outByPitchSituation,
    fine: [...fineMap.values()],
  }
}
