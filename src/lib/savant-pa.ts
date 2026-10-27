// src/lib/savant-pa.ts
//
// The stacked-filter ("deep") engine, with NO database: it pulls Baseball Savant's per-pitch Statcast
// CSV one game-day at a time, turns the pitches into ONE ROW PER PLATE APPEARANCE in memory, and runs
// the filters / grouping on those rows. (An earlier version stored them in a Supabase table; that was
// dropped on request.)
//
//   schedule (MLB Stats API)  → which days had games in the selected seasons / game types
//   Savant CSV, per day       → pitches  → derivePlateAppearances()  → compact PA rows
//   cache                     → memory + a folder in the OS temp dir (finished days never change)
//   aggregatePa()             → the same numbers the SQL version produced
//
// ARCHITECTURE NOTE (CLAUDE.md says "never fetch Savant CSVs in the render path"): this runs only from
// the Pro-gated /api/stats/query route, never during page render, with `cache: 'no-store'` (so the
// 2 MB Next fetch-cache ceiling doesn't apply). A busy day is ~3 MB / ~9 s, so a whole regular season
// (~185 days) is loaded in batches — the route reports progress and the page keeps asking until the
// range is complete. Postseasons are a handful of days and are quick. Cached days persist on disk in
// local/dev and for the life of a server instance on Vercel (/tmp is per-instance).
//
// Verified against MLB boxscores (30 games, two days): plate appearances, at-bats, hits, home runs,
// strikeouts and walks all matched exactly.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CURRENT_SEASON, type PaParams } from '@/lib/stats-query-catalog'

// ── plate-appearance rows ───────────────────────────────────────────────

export type PaRow = {
  game_pk: number; at_bat_number: number; game_date: string; season: number; game_type: string
  inning: number; half: 'Top' | 'Bot'; outs: number; base_state: number; score_diff: number
  batter_id: number; pitcher_id: number; stand: string | null; p_throws: string | null
  batter_team: string; pitcher_team: string
  pitches: number; last_balls: number | null; last_strikes: number | null
  events: string; is_ab: boolean; is_hit: boolean; total_bases: number; runs_on_play: number
  woba_value: number | null; woba_denom: number | null; xwoba_value: number | null
  launch_speed: number | null; launch_angle?: number | null; hit_distance?: number | null; bb_type?: string | null; is_bbe: boolean; is_hard_hit: boolean; is_barrel: boolean
}

/** Events that complete a plate appearance. Others with an `events` value (caught_stealing_*, pickoff_*,
 *  truncated_pa, ...) ended an inning mid-at-bat and are not plate appearances — checked against MLB's box score. */
const PA_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'walk', 'intent_walk', 'hit_by_pitch', 'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play', 'sac_fly', 'sac_fly_double_play',
  'sac_bunt', 'sac_bunt_double_play', 'fielders_choice', 'fielders_choice_out', 'field_error', 'catcher_interf',
])
const HIT_TB: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }
const NOT_AB = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_fly_double_play', 'sac_bunt', 'sac_bunt_double_play', 'catcher_interf'])

const num = (v: string | undefined): number | null => {
  if (v == null) return null
  const t = v.trim()
  if (t === '' || t.toLowerCase() === 'null') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** RFC-4180 CSV → array of header-keyed records. Handles quoted fields ("Gilbert, Drew"), "" escapes and a leading BOM. */
export function parseCsv(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)   // Savant files can start with a UTF-8 BOM that corrupts the first header
  const rows: string[][] = []
  let row: string[] = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const head = rows[0]
  return rows.slice(1).map(r => { const o: Record<string, string> = {}; head.forEach((h, i) => { o[h] = r[i] ?? '' }); return o })
}

/** Pitch rows → plate-appearance rows (pure; unit-testable offline). */
export function derivePlateAppearances(pitches: Record<string, string>[]): PaRow[] {
  const byPa = new Map<string, Record<string, string>[]>()
  for (const r of pitches) {
    const gp = num(r.game_pk), ab = num(r.at_bat_number)
    if (gp == null || ab == null) continue
    const k = `${gp}|${ab}`
    const list = byPa.get(k)
    if (list) list.push(r); else byPa.set(k, [r])
  }
  const out: PaRow[] = []
  for (const list of byPa.values()) {
    list.sort((a, b) => (num(a.pitch_number) ?? 0) - (num(b.pitch_number) ?? 0))
    const first = list[0], last = list[list.length - 1]
    const ev = (last.events ?? '').trim()
    if (!PA_EVENTS.has(ev)) continue

    const top = (first.inning_topbot ?? '').trim() === 'Top'
    const batScore = num(first.bat_score), fldScore = num(first.fld_score)
    const outs = num(first.outs_when_up), inning = num(first.inning)
    const batter = num(first.batter), pitcher = num(first.pitcher)
    if (batScore == null || fldScore == null || outs == null || inning == null || batter == null || pitcher == null) continue

    // The situation is read from the FIRST pitch: runners can move mid-PA, but "with runners in scoring
    // position" means the base state the plate appearance started in.
    const baseState = (first.on_1b?.trim() ? 1 : 0) | (first.on_2b?.trim() ? 2 : 0) | (first.on_3b?.trim() ? 4 : 0)
    const ls = num(last.launch_speed)
    const wobaV = num(last.woba_value)
    const est = num(last.estimated_woba_using_speedangle)
    const postBat = num(last.post_bat_score), lastBat = num(last.bat_score)
    const maxPn = Math.max(...list.map(p => num(p.pitch_number) ?? 0))

    out.push({
      game_pk: num(first.game_pk)!, at_bat_number: num(first.at_bat_number)!,
      game_date: first.game_date, season: Number(first.game_year), game_type: first.game_type,
      inning, half: top ? 'Top' : 'Bot', outs, base_state: baseState, score_diff: batScore - fldScore,
      batter_id: batter, pitcher_id: pitcher, stand: first.stand || null, p_throws: first.p_throws || null,
      batter_team: top ? first.away_team : first.home_team, pitcher_team: top ? first.home_team : first.away_team,
      pitches: maxPn || list.length, last_balls: num(last.balls), last_strikes: num(last.strikes),
      events: ev, is_ab: !NOT_AB.has(ev), is_hit: ev in HIT_TB, total_bases: HIT_TB[ev] ?? 0,
      runs_on_play: postBat != null && lastBat != null ? Math.max(0, postBat - lastBat) : 0,
      woba_value: wobaV, woba_denom: num(last.woba_denom),
      // Statcast xwOBA where the ball was tracked; otherwise the actual wOBA value (walks, strikeouts).
      xwoba_value: est ?? wobaV,
      launch_speed: ls, launch_angle: num(last.launch_angle), hit_distance: num(last.hit_distance_sc), bb_type: (last.bb_type ?? '').trim() || null, is_bbe: ls != null, is_hard_hit: ls != null && ls >= 95, is_barrel: num(last.launch_speed_angle) === 6,
    })
  }
  return out
}

// ── fetching + caching, one day at a time ───────────────────────────────

const SAVANT = 'https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfGT=R%7CF%7CD%7CL%7CW%7C&hfSea={y}%7C&player_type=batter&game_date_gt={d}&game_date_lt={d}&type=details'
// v2: rows now also carry launch angle, hit distance and trajectory (older cached days lack them and are re-pulled).
const CACHE_DIR = path.join(os.tmpdir(), 'edge-savant-pa-v2')
const DAYS = new Map<string, { at: number; rows: PaRow[] }>()
const MAX_DAYS_IN_MEMORY = 420
const FRESH_MS = 30 * 60_000                      // today / yesterday may still be changing
const todayIso = () => new Date().toISOString().slice(0, 10)
const isSettled = (day: string) => day < new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10)

function readDisk(day: string): PaRow[] | null {
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${day}.json`), 'utf8')) as PaRow[] } catch { return null }
}
function writeDisk(day: string, rows: PaRow[]) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(path.join(CACHE_DIR, `${day}.json`), JSON.stringify(rows)) } catch { /* disk cache is best effort */ }
}

/** Cached rows for a day, or null when it still has to be fetched. */
function cachedDay(day: string): PaRow[] | null {
  const hit = DAYS.get(day)
  if (hit && (isSettled(day) || Date.now() - hit.at < FRESH_MS)) return hit.rows
  if (isSettled(day)) {
    const disk = readDisk(day)
    if (disk) { remember(day, disk); return disk }
  }
  return null
}
function remember(day: string, rows: PaRow[]) {
  if (DAYS.size >= MAX_DAYS_IN_MEMORY) DAYS.delete(DAYS.keys().next().value as string)
  DAYS.set(day, { at: Date.now(), rows })
}

async function fetchDay(day: string): Promise<PaRow[]> {
  const url = SAVANT.replace('{y}', day.slice(0, 4)).replaceAll('{d}', day)
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0 (The Edge stats)' }, signal: AbortSignal.timeout(45_000) })
      if (!res.ok) throw new Error(`Savant ${res.status}`)
      const rows = derivePlateAppearances(parseCsv(await res.text()))
      remember(day, rows)
      if (isSettled(day)) writeDisk(day, rows)
      return rows
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 800)) }
  }
  console.error('[fetchDay] Savant error:', day, (lastErr as Error)?.message)
  throw new Error(`Baseball Savant did not respond for ${day}.`)
}

/** Days with games in the selected seasons / game types (MLB schedule; one call per season). */
const SCHEDULE = new Map<string, { at: number; days: string[] }>()
async function gameDays(season: number, types: string[]): Promise<string[]> {
  const key = `${season}|${types.join(',')}`
  const hit = SCHEDULE.get(key)
  if (hit && Date.now() - hit.at < (season < CURRENT_SEASON ? 24 * 3600_000 : FRESH_MS)) return hit.days
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}&gameType=${types.join(',')}&fields=dates,date`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`MLB schedule ${res.status}`)
  const j = await res.json()
  const days = ((j.dates ?? []) as { date: string }[]).map(d => d.date).filter(d => d <= todayIso()).sort()
  SCHEDULE.set(key, { at: Date.now(), days })
  return days
}

export type LoadProgress = { done: number; total: number }

/**
 * Makes sure every game day in range is loaded, fetching at most `budget` new days per call (8 at a time: a day is a 3 MB CSV, so the pull is bandwidth-bound and parallel requests are what make it faster)
 * so a request stays inside the serverless time limit. Returns how many days are done out of the total.
 */
export async function ensureRange(seasons: number[], types: string[], budget = 24): Promise<LoadProgress & { days: string[] }> {
  const days: string[] = []
  for (const y of seasons) days.push(...await gameDays(y, types))
  const missing = days.filter(d => !cachedDay(d))
  const batch = missing.slice(0, budget)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(8, batch.length) }, async () => {
    while (i < batch.length) { const d = batch[i++]; await fetchDay(d) }
  }))
  return { done: days.length - (missing.length - batch.length), total: days.length, days }
}

/**
 * For "when did this last happen": loads game days NEWEST FIRST (across the given seasons, newest season first) and stops as soon as
 * `enough(daysSoFar)` says the loaded stretch already holds what was asked for. `days` is the unbroken newest stretch that is loaded.
 */
export async function ensureNewest(
  seasons: number[], types: string[], enough: (days: string[]) => boolean, budget = 24,
): Promise<LoadProgress & { days: string[]; finished: boolean }> {
  const days: string[] = []
  for (const y of [...seasons].sort((a, b) => b - a)) days.push(...[...await gameDays(y, types)].reverse())
  const stretch = () => { const i = days.findIndex(d => !cachedDay(d)); return days.slice(0, i === -1 ? days.length : i) }
  let have = stretch()
  if (have.length === days.length || enough(have)) return { done: have.length, total: days.length, days: have, finished: true }
  const batch = days.filter(d => !cachedDay(d)).slice(0, budget)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(8, batch.length) }, async () => {
    while (i < batch.length) { const d = batch[i++]; await fetchDay(d) }
  }))
  have = stretch()
  return { done: have.length, total: days.length, days: have, finished: have.length === days.length || enough(have) }
}

/** All plate-appearance rows for already-loaded days. */
export function rowsFor(days: string[], types: string[]): PaRow[] {
  const out: PaRow[] = []
  for (const d of days) for (const r of cachedDay(d) ?? DAYS.get(d)?.rows ?? []) if (types.includes(r.game_type)) out.push(r)
  return out
}

// ── filtering + grouping (the same semantics the SQL function had) ─────

export type PaAgg = {
  grp: string; grp2: string; pa: number; ab: number; h: number; d2: number; d3: number; hr: number
  bb: number; ibb: number; hbp: number; so: number; sf: number; sh: number; tb: number; runs: number
  woba_num: number; woba_den: number; xwoba_num: number; bbe: number; ev_sum: number; hard_hit: number; barrels: number
}

export type PaQuery = PaParams & {
  group_by?: string
  split_by?: 'batter_team' | 'pitcher_team'
  min_pa?: number
  row_limit?: number
}

const groupKey = (r: PaRow, by: string | undefined): string => {
  switch (by) {
    case 'season': return String(r.season)
    case 'game_type': return r.game_type
    case 'inning': return String(r.inning)
    case 'half': return r.half
    case 'outs': return String(r.outs)
    case 'base_state': return String(r.base_state)
    case 'pitches': return String(r.pitches)
    case 'stand': return r.stand ?? '?'
    case 'p_throws': return r.p_throws ?? '?'
    case 'batter_team': return r.batter_team
    case 'pitcher_team': return r.pitcher_team
    case 'batter_id': return String(r.batter_id)
    case 'pitcher_id': return String(r.pitcher_id)
    case 'events': return r.events
    case 'last_count': return `${r.last_balls ?? '?'}-${r.last_strikes ?? '?'}`
    case 'score_diff': return String(r.score_diff)
    default: return 'all'
  }
}

/** A range limit only matches when the ball HAS that measurement (a strikeout has no exit velocity). */
const inRange = (v: number | null, lo?: number, hi?: number): boolean =>
  lo == null && hi == null ? true : v != null && (lo == null || v >= lo) && (hi == null || v <= hi)

const matches = (r: PaRow, p: PaQuery): boolean =>
  (p.inning_from == null || r.inning >= p.inning_from) &&
  (p.inning_to == null || r.inning <= p.inning_to) &&
  (p.half == null || r.half === p.half) &&
  (p.outs == null || p.outs.includes(r.outs)) &&
  (p.base_states == null || p.base_states.includes(r.base_state)) &&
  (p.pitches_min == null || r.pitches >= p.pitches_min) &&
  (p.pitches_max == null || r.pitches <= p.pitches_max) &&
  (p.score_diff_min == null || r.score_diff >= p.score_diff_min) &&
  (p.score_diff_max == null || r.score_diff <= p.score_diff_max) &&
  (p.stand == null || r.stand === p.stand) &&
  (p.p_throws == null || r.p_throws === p.p_throws) &&
  (p.last_balls == null || r.last_balls === p.last_balls) &&
  (p.last_strikes == null || r.last_strikes === p.last_strikes) &&
  (p.events == null || p.events.includes(r.events)) &&
  inRange(r.launch_speed, p.ev_min, p.ev_max) &&
  inRange(r.launch_angle ?? null, p.la_min, p.la_max) &&
  inRange(r.hit_distance ?? null, p.dist_min, p.dist_max) &&
  (p.bb_types == null || (r.bb_type != null && p.bb_types.includes(r.bb_type))) &&
  (p.batter_team == null || r.batter_team === p.batter_team) &&
  (p.pitcher_team == null || r.pitcher_team === p.pitcher_team) &&
  (p.any_team == null || r.batter_team === p.any_team || r.pitcher_team === p.any_team) &&
  (p.batter_id == null || r.batter_id === p.batter_id) &&
  (p.pitcher_id == null || r.pitcher_id === p.pitcher_id) &&
  (p.any_player == null || r.batter_id === p.any_player || r.pitcher_id === p.any_player)

export function aggregatePa(rows: PaRow[], p: PaQuery): PaAgg[] {
  const acc = new Map<string, PaAgg>()
  for (const r of rows) {
    if (!matches(r, p)) continue
    const g1 = groupKey(r, p.group_by), g2 = p.split_by ? groupKey(r, p.split_by) : ''
    const k = `${g1}\u0000${g2}`
    let a = acc.get(k)
    if (!a) {
      a = { grp: g1, grp2: g2, pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, ibb: 0, hbp: 0, so: 0, sf: 0, sh: 0, tb: 0, runs: 0, woba_num: 0, woba_den: 0, xwoba_num: 0, bbe: 0, ev_sum: 0, hard_hit: 0, barrels: 0 }
      acc.set(k, a)
    }
    const e = r.events
    a.pa++
    if (r.is_ab) a.ab++
    if (r.is_hit) a.h++
    if (e === 'double') a.d2++
    if (e === 'triple') a.d3++
    if (e === 'home_run') a.hr++
    if (e === 'walk' || e === 'intent_walk') a.bb++
    if (e === 'intent_walk') a.ibb++
    if (e === 'hit_by_pitch') a.hbp++
    if (e === 'strikeout' || e === 'strikeout_double_play') a.so++
    if (e === 'sac_fly' || e === 'sac_fly_double_play') a.sf++
    if (e === 'sac_bunt' || e === 'sac_bunt_double_play') a.sh++
    a.tb += r.total_bases
    a.runs += r.runs_on_play
    a.woba_num += r.woba_value ?? 0
    a.woba_den += r.woba_denom ?? 0
    a.xwoba_num += r.xwoba_value ?? 0
    if (r.is_bbe) { a.bbe++; a.ev_sum += r.launch_speed ?? 0 }
    if (r.is_hard_hit) a.hard_hit++
    if (r.is_barrel) a.barrels++
  }
  // PA-count groups only (no splitting by club) honour min_pa; the club split is a breakdown of those groups.
  let out = [...acc.values()]
  if (p.min_pa && p.min_pa > 1) {
    const totals = new Map<string, number>()
    for (const a of out) totals.set(a.grp, (totals.get(a.grp) ?? 0) + a.pa)
    out = out.filter(a => (totals.get(a.grp) ?? 0) >= p.min_pa!)
  }
  out.sort((a, b) => b.pa - a.pa)
  return out.slice(0, p.row_limit ?? 5000)
}

/** Plate appearances matching the filters, newest first (for "when did this last happen"). */
export function recentMatches(rows: PaRow[], p: PaQuery, limit = 30): { total: number; hits: PaRow[] } {
  const all = rows.filter(r => matches(r, p))
  const newest = (a: PaRow, b: PaRow) => b.game_date.localeCompare(a.game_date) || b.game_pk - a.game_pk || b.at_bat_number - a.at_bat_number
  const ref = p.ref
  if (p.rank === 'closest' && ref) {
    // distance in "how many tolerances off": ~3 mph, ~6° and ~25 ft each count as one step; ties go to the newer hit
    const off = (r: PaRow) => Math.hypot(
      ((r.launch_speed ?? ref.ev) - ref.ev) / 3,
      ref.la != null ? (((r.launch_angle ?? ref.la) - ref.la) / 6) : 0,
      ref.dist != null ? (((r.hit_distance ?? ref.dist) - ref.dist) / 25) : 0)
    all.sort((a, b) => off(a) - off(b) || newest(a, b))
  } else all.sort(newest)
  return { total: all.length, hits: all.slice(0, limit) }
}

/** What a loaded range covers — shown in the UI so a gap is never hidden. */
export function coverageOf(rows: PaRow[]): { season: number; type: string; first: string; last: string; pas: number }[] {
  const m = new Map<string, { season: number; type: string; first: string; last: string; pas: number }>()
  for (const r of rows) {
    const k = `${r.season}|${r.game_type}`
    const c = m.get(k)
    if (!c) m.set(k, { season: r.season, type: r.game_type, first: r.game_date, last: r.game_date, pas: 1 })
    else { c.pas++; if (r.game_date < c.first) c.first = r.game_date; if (r.game_date > c.last) c.last = r.game_date }
  }
  return [...m.values()].sort((a, b) => b.season - a.season || a.type.localeCompare(b.type))
}
