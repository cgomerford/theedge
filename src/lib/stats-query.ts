// src/lib/stats-query.ts
//
// Engine behind /api/stats/query (the "Ask the Stats" lab on /stats).
//
// DATA: MLB Stats API only (free, no auth). League totals are built by
// summing the 30 team rows from /teams/stats — never by averaging averages —
// and every rate (AVG, OPS, ERA, ...) is recomputed from the summed counting
// stats in stats-query-catalog.ts.
//
// GOTCHAS (curl-verified 2026-10-17):
//   * statSplits silently returns only 50 rows unless `limit` is passed —
//     a 30-team league total would be quietly wrong. Every call sets limit.
//   * Only ONE sitCode applies at a time (no intersections).
//   * Pitch-type / vs-division / days-of-rest codes return nothing at team
//     level, so they are not in the catalog.
//
// This is an on-demand analytics endpoint (not a page render path): results
// are memoised in-process (past seasons are immutable → 24h; the current
// season → 30 min) and calls go through throttledMlbFetch (max 6 in flight)
// to avoid ECONNRESET bursts. Table ownership: reads only, writes nothing.

import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'
import { MLB_TEAMS } from '@/lib/teams'
import {
  SUM_FIELDS, SAMPLE, SAMPLE_FIELD, FIELD_POSITIONS, CURRENT_SEASON, FIRST_SEASON, FREE_FIELDS, familyFor, familySplits, splitLabel,
  type Group, type QueryState, type Totals,
} from '@/lib/stats-query-catalog'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

type StatBlob = Record<string, unknown>
type TeamRow = { teamId: number; name: string; code: string; stat: Totals }

// ── in-process cache ────────────────────────────────────────────────────

const CACHE = new Map<string, { at: number; ttl: number; value: unknown }>()
const MAX_ENTRIES = 400
const TTL_PAST = 24 * 3600_000
const TTL_LIVE = 30 * 60_000

export async function memo<T>(key: string, season: number, load: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key)
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T
  const value = await load()
  if (CACHE.size >= MAX_ENTRIES) CACHE.delete(CACHE.keys().next().value as string)
  CACHE.set(key, { at: Date.now(), ttl: season < CURRENT_SEASON ? TTL_PAST : TTL_LIVE, value })
  return value
}

// ── fetch helpers ───────────────────────────────────────────────────────

export function pickTotals(group: Group, stat: StatBlob): Totals {
  const out: Totals = {}
  for (const k of SUM_FIELDS[group]) {
    const v = Number(stat[k])
    out[k] = Number.isFinite(v) ? v : 0
  }
  if (group === 'fielding') {
    // MLB writes innings in baseball notation ("225.1" = 225 and one-third) — convert to outs so sums are exact.
    const [whole, frac] = String(stat.innings ?? '0').split('.')
    out.inningsOuts = Number(whole) * 3 + Number(frac ?? 0)
    if (!Number.isFinite(out.inningsOuts)) out.inningsOuts = 0
  }
  return out
}

async function getJson(url: string, timeoutMs: number): Promise<any> {
  const res = await throttledMlbFetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`MLB Stats API ${res.status}`)
  return res.json()
}

/** Team rows for one season. `codes` empty → plain season totals (code ''). */
async function fetchTeamRows(group: Group, gameType: string, season: number, codes: string[]): Promise<TeamRow[]> {
  const key = `teams|${group}|${gameType}|${season}|${codes.join(',')}`
  return memo(key, season, async () => {
    const base = `${MLB_API}/teams/stats?group=${group}&gameType=${gameType}&season=${season}&sportIds=1&limit=3000`
    const url = codes.length
      ? `${base}&stats=statSplits&sitCodes=${codes.join(',')}`
      : `${base}&stats=season`
    let data: any
    try {
      data = await getJson(url, 30_000)
    } catch (e) {
      console.error('[fetchTeamRows] MLB API error:', (e as Error).message, { group, gameType, season })
      throw e
    }
    const splits: any[] = data?.stats?.[0]?.splits ?? []
    return splits.map(s => ({
      teamId: Number(s.team?.id),
      name: String(s.team?.name ?? ''),
      code: codes.length ? String(s.split?.code ?? '') : '',
      stat: pickTotals(group, s.stat ?? {}),
    }))
  })
}

function seasonsOf(q: Pick<QueryState, 'from' | 'to'>): number[] {
  const from = Math.max(FIRST_SEASON, Math.min(q.from, q.to))
  const to = Math.min(CURRENT_SEASON, Math.max(q.from, q.to))
  const out: number[] = []
  for (let y = from; y <= to; y++) out.push(y)
  return out
}

function sumInto(acc: Totals, add: Totals) {
  for (const k of Object.keys(add)) acc[k] = (acc[k] ?? 0) + add[k]
}
function sumRows(rows: TeamRow[]): Totals | null {
  if (!rows.length) return null
  const acc: Totals = {}
  for (const r of rows) sumInto(acc, r.stat)
  return acc
}

/** Per-club totals for a set of team rows (summed when a club appears in several rows, e.g. several seasons). */
function partsOf(rows: TeamRow[]): TeamPart[] {
  const m = new Map<number, TeamPart>()
  for (const r of rows) {
    const cur = m.get(r.teamId) ?? { abbr: abbrOf(r.teamId), name: r.name, totals: {} }
    sumInto(cur.totals, r.stat)
    m.set(r.teamId, cur)
  }
  return [...m.values()]
}

// ── result shapes ───────────────────────────────────────────────────────

export type TeamOut = { teamId: number; name: string; abbr: string; totals: Totals }
export type PlayerOut = { id: number; name: string; teamId: number | null; abbr: string; totals: Totals; pos?: string }
export type TeamPart = { abbr: string; name: string; totals: Totals }
export type BreakdownRow = { code: string; label: string; totals: Totals | null; teams?: TeamPart[] }

export type DeepCoverage = { season: number; type: string; first: string; last: string; pas: number }

/** One plate appearance that matched the situation (view 'recent' — "when did this last happen"). */
export type RecentHit = {
  gamePk: number; date: string; atBat: number; inning: number; half: 'Top' | 'Bot'; outs: number; baseState: number; scoreDiff: number
  batterId: number; batter: string; pitcherId: number; pitcher: string; battingTeam: string; fieldingTeam: string; homeTeam: string; awayTeam: string
  pitches: number; event: string; count: string
  ev: number | null; la: number | null   // exit velocity (mph) / launch angle of the batted ball
  dist: number | null; bbType: string | null   // distance (ft) and trajectory
}

export type QueryResult = {
  query: QueryState
  engine?: 'quick' | 'deep'
  coverage?: DeepCoverage[]       // deep engine: which seasons / game types the pulled Savant days cover
  seasons: number[]
  league: Totals | null          // the selected split, summed across seasons
  baseline: Totals | null        // same selection with no situation filter
  bySeason?: { season: number; totals: Totals | null; baseline: Totals | null; teams?: TeamPart[] }[]
  recent?: RecentHit[]            // view 'recent': matching plate appearances, newest first
  recentTotal?: number            // how many matched in all (the list is capped)
  loading?: { done: number; total: number }   // deep engine: Savant days pulled so far — not a result yet, ask again
  leagueTeams?: TeamPart[]       // summary: every club's share of the league total (when teams were requested)
  breakdown?: BreakdownRow[]
  teams?: TeamOut[]
  players?: PlayerOut[]
  playersTruncated?: boolean
}

const abbrOf = (id: number) => MLB_TEAMS.find(t => t.id === id)?.abbrev ?? ''

// ── entry point ─────────────────────────────────────────────────────────

// ── games, counted once ─────────────────────────────────────────────────
// Every game appears in BOTH clubs' rows, so a league row that just adds the clubs up shows each game twice.
//  • no situation, or a situation both clubs always share (innings 1–8, day/night, month, weekday, turf/grass,
//    before/after the break): unique games = team-games ÷ 2
//  • home / away: each game has exactly one home club, so the sum is already unique games
//  • anything else (9th inning, extras, bases loaded, ...): one club can have it without the other, so the
//    number of games cannot be derived — stored as −1 and shown as "—" rather than guessed.
// The raw team-game total is kept as `teamGames` for the per-game rates (R/G, HR/G ...).
const HALF_CODES = new Set([
  '', 'd', 'n', 'g', 't', '3', '4', '5', '6', '7', '8', '9', 'preas', 'posas', 'dmo', 'dtu', 'dwe', 'dth', 'dfr', 'dsa', 'dsu',
  'i01', 'i02', 'i03', 'i04', 'i05', 'i06', 'i07', 'i08', 'ig01',
])
const FULL_CODES = new Set(['h', 'a'])

function adjustGames(t: Totals | null, code: string): Totals | null {
  if (!t) return t
  const factor = HALF_CODES.has(code) ? 0.5 : FULL_CODES.has(code) ? 1 : null
  const out: Totals = { ...t, teamGames: t.teamGames ?? t.gamesPlayed ?? t.games ?? 0 }
  for (const k of ['gamesPlayed', 'games']) if (k in out) out[k] = factor == null ? -1 : Math.round(out[k] * factor)
  return out
}

function finalizeGames(r: QueryResult, q: QueryState): QueryResult {
  const split = q.split
  const league = r.league, baseline = r.baseline   // may be the same object when there is no situation
  r.league = q.view === 'players' ? adjustGames(league, 'players') : adjustGames(league, q.view === 'breakdown' ? '' : split)
  r.baseline = adjustGames(baseline, '')
  if (r.bySeason) r.bySeason = r.bySeason.map(s => ({ ...s, totals: adjustGames(s.totals, split), baseline: adjustGames(s.baseline, '') }))
  if (r.breakdown) r.breakdown = r.breakdown.map(b => ({ ...b, totals: adjustGames(b.totals, q.family === 'fieldpos' ? `pos:${b.code}` : b.code) }))
  return r
}

export async function runQuery(q: QueryState): Promise<QueryResult> {
  return finalizeGames(await runQueryRaw(q), q)
}

async function runQueryRaw(q: QueryState): Promise<QueryResult> {
  const seasons = seasonsOf(q)
  const { group, gameType, split, view } = q
  const result: QueryResult = { query: q, seasons, league: null, baseline: null }

  if (view === 'players') return runPlayers(q, seasons, result)

  if (view === 'breakdown' && group === 'fielding' && q.family === 'fieldpos') {
    // MLB's team endpoint silently ignores its `position` parameter (curl-verified: all nine positions
    // returned identical totals), so positions are built from player-level fielding rows, which each
    // carry the position played, and summed by position across the league.
    const perSeason = await Promise.all(seasons.map(async y => ({
      players: await fetchPlayerRows(group, gameType, y, split),
      base: await fetchTeamRows(group, gameType, y, split ? [split] : []),
    })))
    result.breakdown = FIELD_POSITIONS.map(d => {
      const acc: Totals = {}; let any = false
      for (const s of perSeason) for (const p of s.players) {
        if (p.pos === d.code) { sumInto(acc, p.totals); any = true }
      }
      return { code: d.code, label: d.label, totals: any ? acc : null }
    })
    const base: Totals = {}; let anyBase = false
    for (const s of perSeason) { const t = sumRows(s.base); if (t) { sumInto(base, t); anyBase = true } }
    result.baseline = anyBase ? base : null
    return result
  }

  if (view === 'breakdown') {
    const fam = familyFor(q.family)
    const defs = fam ? familySplits(fam, group) : []
    const codes = defs.map(d => d.code)
    const perSeason = await Promise.all(seasons.map(async y => ({
      rows: await fetchTeamRows(group, gameType, y, codes),
      base: await fetchTeamRows(group, gameType, y, []),
    })))
    result.breakdown = defs.map(d => {
      const acc: Totals = {}
      let any = false
      for (const s of perSeason) {
        const t = sumRows(s.rows.filter(r => r.code === d.code))
        if (t) { sumInto(acc, t); any = true }
      }
      return { code: d.code, label: d.label, totals: any ? acc : null, teams: q.teams ? partsOf(perSeason.flatMap(s => s.rows.filter(r => r.code === d.code))) : undefined }
    })
    const base: Totals = {}
    let anyBase = false
    for (const s of perSeason) { const t = sumRows(s.base); if (t) { sumInto(base, t); anyBase = true } }
    result.baseline = anyBase ? base : null
    return result
  }

  if (view === 'compare') {
    // Specific, non-contiguous seasons — each one kept separate (never summed together).
    const years = [...new Set(q.years)].filter(y => y >= FIRST_SEASON && y <= CURRENT_SEASON).slice(0, 12)
    const per = await Promise.all(years.map(async y => ({
      season: y,
      rows: await fetchTeamRows(group, gameType, y, split ? [split] : []),
      base: split ? await fetchTeamRows(group, gameType, y, []) : null,
    })))
    result.seasons = years
    result.bySeason = per.map(p => ({ season: p.season, totals: sumRows(p.rows), baseline: p.base ? sumRows(p.base) : sumRows(p.rows), teams: q.teams ? partsOf(p.rows) : undefined }))
    return result
  }

  // summary / trend / teams share one fetch: the chosen split (or plain totals) + the unfiltered baseline
  const per = await Promise.all(seasons.map(async y => ({
    season: y,
    rows: await fetchTeamRows(group, gameType, y, split ? [split] : []),
    base: split ? await fetchTeamRows(group, gameType, y, []) : null,
  })))

  const lg: Totals = {}; let anyLg = false
  const bs: Totals = {}; let anyBs = false
  const teamAcc = new Map<number, TeamOut>()
  for (const p of per) {
    const t = sumRows(p.rows)
    if (t) { sumInto(lg, t); anyLg = true }
    if (p.base) { const b = sumRows(p.base); if (b) { sumInto(bs, b); anyBs = true } }
    for (const r of p.rows) {
      const cur = teamAcc.get(r.teamId) ?? { teamId: r.teamId, name: r.name, abbr: abbrOf(r.teamId), totals: {} }
      sumInto(cur.totals, r.stat)
      cur.name = r.name
      teamAcc.set(r.teamId, cur)
    }
  }
  result.league = anyLg ? lg : null
  result.baseline = split ? (anyBs ? bs : null) : result.league

  if (view === 'trend') {
    result.bySeason = per.map(p => ({
      season: p.season,
      totals: sumRows(p.rows),
      baseline: p.base ? sumRows(p.base) : sumRows(p.rows),
      teams: q.teams ? partsOf(p.rows) : undefined,
    }))
  }
  if (q.teams && (view === 'summary' || view === 'trend')) result.leagueTeams = partsOf(per.flatMap(p => p.rows))
  if (view === 'teams') result.teams = [...teamAcc.values()]
  return result
}

// ── players ─────────────────────────────────────────────────────────────

const PLAYER_CAP = 400

async function fetchPlayerRows(group: Group, gameType: string, season: number, split: string): Promise<PlayerOut[]> {
  const key = `players|${group}|${gameType}|${season}|${split}`
  return memo(key, season, async () => {
    const base = `${MLB_API}/stats?group=${group}&gameType=${gameType}&season=${season}&sportIds=1&playerPool=ALL&limit=3000`
    const url = split ? `${base}&stats=statSplits&sitCodes=${split}` : `${base}&stats=season`
    let data: any
    try {
      data = await getJson(url, 60_000)
    } catch (e) {
      console.error('[fetchPlayerRows] MLB API error:', (e as Error).message, { group, gameType, season, split })
      throw e
    }
    const splits: any[] = data?.stats?.[0]?.splits ?? []
    return splits
      .filter(s => s.player?.id)
      .map(s => ({
        id: Number(s.player.id),
        name: String(s.player.fullName ?? ''),
        teamId: s.team?.id ? Number(s.team.id) : null,
        abbr: s.team?.id ? abbrOf(Number(s.team.id)) : '',
        pos: group === 'fielding' ? String(s.position?.abbreviation ?? '') : undefined,
        totals: pickTotals(group, s.stat ?? {}),
      }))
  })
}

async function runPlayers(q: QueryState, seasons: number[], result: QueryResult): Promise<QueryResult> {
  const { group, gameType, split } = q
  // The player endpoint is the slow one (several seconds per season), so cap the span.
  const span = seasons.slice(-5)
  const per = await Promise.all(span.map(y => fetchPlayerRows(group, gameType, y, split)))
  // Fielding has one row per player AND position, so those are kept apart.
  const byId = new Map<string, PlayerOut>()
  for (const rows of per) {
    for (const r of rows) {
      const k = `${r.id}|${r.pos ?? ''}`
      const cur = byId.get(k)
      if (cur) { sumInto(cur.totals, r.totals); cur.teamId = r.teamId; cur.abbr = r.abbr }
      else byId.set(k, { ...r, totals: { ...r.totals } })
    }
  }
  const sampleKey = SAMPLE_FIELD[group]
  const all = [...byId.values()].filter(p => (p.totals[sampleKey] ?? 0) >= q.minSample)
  all.sort((a, b) => (b.totals[sampleKey] ?? 0) - (a.totals[sampleKey] ?? 0))

  const lg: Totals = {}
  for (const p of byId.values()) sumInto(lg, p.totals)
  result.league = byId.size ? lg : null
  result.baseline = result.league
  result.seasons = span
  result.players = all.slice(0, PLAYER_CAP)
  result.playersTruncated = all.length > PLAYER_CAP || seasons.length > span.length
  return result
}

export { SAMPLE, splitLabel }

/**
 * Free viewers get only the raw fields the standard stats need. Advanced
 * metrics (FIP, ISO, per-pitch rates, ...) then compute to null, so they are
 * not just hidden in the UI — the inputs never leave the server.
 */
export function stripForFree(r: QueryResult): QueryResult {
  const keep = new Set(FREE_FIELDS[r.query.group])
  const cut = (t: Totals | null): Totals | null => {
    if (!t) return t
    const o: Totals = {}
    for (const k of Object.keys(t)) if (keep.has(k)) o[k] = t[k]
    return o
  }
  return {
    ...r,
    league: cut(r.league),
    baseline: cut(r.baseline),
    bySeason: r.bySeason?.map(s => ({ ...s, totals: cut(s.totals), baseline: cut(s.baseline), teams: s.teams?.map(t => ({ ...t, totals: cut(t.totals) as Totals })) })),
    breakdown: r.breakdown?.map(b => ({ ...b, totals: cut(b.totals), teams: b.teams?.map(t => ({ ...t, totals: cut(t.totals) as Totals })) })),
    leagueTeams: r.leagueTeams?.map(t => ({ ...t, totals: cut(t.totals) as Totals })),
    teams: r.teams?.map(t => ({ ...t, totals: cut(t.totals) as Totals })),
    players: r.players?.map(p => ({ ...p, totals: cut(p.totals) as Totals })),
  }
}
