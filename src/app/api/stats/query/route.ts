// src/app/api/stats/query/route.ts
//
// GET /api/stats/query — backs the "Ask the Stats" lab on /mlb/stats.
// Every parameter is validated against the catalog whitelist before it is
// interpolated into an MLB Stats API URL (no raw user text reaches the URL).

import { NextRequest, NextResponse } from 'next/server'
import { runQuery, stripForFree } from '@/lib/stats-query'
import { isProViewer } from '@/lib/require-pro'
import { runDeepQuery } from '@/lib/pa-query'
import { resolveViewer, checkLookup, chargeLookup, questionKey, hasRows, anonCookie, perDayFor } from '@/lib/ask-lookups'
import { MLB_TEAMS } from '@/lib/teams'
import {
  GAME_TYPES, CURRENT_SEASON, isStandardMetric, defaultMetric, deepSupports, FIRST_SEASON, DEFAULT_QUERY, isValidSplit, familyFor, metricByKey,
  isDeepMetric, DEEP_GROUP_BY, type DeepFilters, type Group, type HitFilter, type QueryState, type ViewMode, type Who,
} from '@/lib/stats-query-catalog'

export const maxDuration = 60

const BB_OK = new Set(['ground_ball', 'line_drive', 'fly_ball', 'popup'])
const rng = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined)

/** Batted-ball limits: only plain numbers in believable ranges and known trajectory names are accepted. */
function parseHit(v: unknown): HitFilter | undefined {
  if (!v || typeof v !== 'object') return undefined
  const h = v as Record<string, unknown>
  const out: HitFilter = {
    evMin: rng(h.evMin, 0, 130), evMax: rng(h.evMax, 0, 130),
    laMin: rng(h.laMin, -90, 90), laMax: rng(h.laMax, -90, 90),
    distMin: rng(h.distMin, 0, 600), distMax: rng(h.distMax, 0, 600),
    bbTypes: (Array.isArray(h.bbTypes) ? h.bbTypes : []).filter((t): t is string => typeof t === 'string' && BB_OK.has(t)),
    rank: h.rank === 'closest' ? 'closest' : undefined,
  }
  const r = h.ref as Record<string, unknown> | undefined
  if (r && typeof r.ev === 'number' && Number.isFinite(r.ev)) {
    out.ref = { ev: r.ev, la: typeof r.la === 'number' ? r.la : null, dist: typeof r.dist === 'number' ? r.dist : null }
  }
  if (!out.bbTypes?.length) delete out.bbTypes
  return Object.values(out).some(x => x !== undefined) ? out : undefined
}

/** A club limit must be a real club abbreviation and a player limit a plain id — nothing else is accepted. */
function parseWho(v: unknown): Who | undefined {
  if (!v || typeof v !== 'object') return undefined
  const w = v as Record<string, unknown>
  const out: Who = {}
  if (typeof w.team === 'string' && MLB_TEAMS.some(t => t.abbrev === w.team)) {
    out.team = w.team
    out.teamRole = w.teamRole === 'bat' || w.teamRole === 'field' ? w.teamRole : 'any'
  }
  if (typeof w.playerId === 'number' && Number.isInteger(w.playerId) && w.playerId > 0 && w.playerId < 1e9) {
    out.playerId = w.playerId
    out.playerName = typeof w.playerName === 'string' ? w.playerName.slice(0, 60) : undefined
    out.playerRole = w.playerRole === 'bat' || w.playerRole === 'pitch' ? w.playerRole : 'any'
    if (typeof w.opponentId === 'number' && Number.isInteger(w.opponentId) && w.opponentId > 0 && w.opponentId < 1e9 && out.playerRole !== 'any') out.opponentId = w.opponentId
  }
  return out.team || out.playerId ? out : undefined
}

const VIEWS: ViewMode[] = ['summary', 'breakdown', 'trend', 'compare', 'teams', 'players', 'recent']

function int(v: string | null, fallback: number, lo: number, hi: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams

  const groupParam = sp.get('group')
  const group: Group = groupParam === 'pitching' || groupParam === 'fielding' ? groupParam : 'hitting'
  const view = VIEWS.includes(sp.get('view') as ViewMode) ? (sp.get('view') as ViewMode) : 'summary'
  // 'ALL' (every game type) exists only for the last-time finder.
  const gameType = GAME_TYPES.some(g => g.key === sp.get('gameType')) || (view === 'recent' && sp.get('gameType') === 'ALL') ? (sp.get('gameType') as string) : DEFAULT_QUERY.gameType
  const from = int(sp.get('from'), CURRENT_SEASON, FIRST_SEASON, CURRENT_SEASON)
  const to = int(sp.get('to'), CURRENT_SEASON, FIRST_SEASON, CURRENT_SEASON)
  const splitParam = sp.get('split') ?? ''
  const split = splitParam && isValidSplit(splitParam, group) ? splitParam : ''
  const family = familyFor(sp.get('family') ?? '') ? (sp.get('family') as string) : DEFAULT_QUERY.family
  const metricParam = sp.get('metric') ?? ''
  // Pro is decided here from the session, never from a client flag.
  const pro = await isProViewer()
  let metric = metricByKey(metricParam)?.group === group ? metricParam : defaultMetric(group)
  if (!pro && !isStandardMetric(metric)) metric = defaultMetric(group)
  const minSample = int(sp.get('minSample'), 10, 1, 1000)
  const years = (sp.get('years') ?? '').split(',').map(Number)
    .filter(y => Number.isInteger(y) && y >= FIRST_SEASON && y <= CURRENT_SEASON)
    .filter((y, i, a) => a.indexOf(y) === i).slice(0, 12)

  if (splitParam && !split) {
    return NextResponse.json({ error: `"${splitParam}" is not a valid filter for ${group}.` }, { status: 400 })
  }

  // Deep (plate-appearance) engine: stackable filters. Pro-only, validated field by field.
  let deep: DeepFilters | null = null
  // "When did this last happen" always runs on plate appearances: a single quick-mode situation becomes a one-chip stack.
  const deepParam = sp.get('deep') ?? (view === 'recent' ? JSON.stringify({ stack: split ? [split] : [] }) : null)
  if (deepParam) {
    // The "last time it happened" finder is open to everyone (within the daily lookups): every field is validated below and the finder is capped to the newest stretch of games.
    const finderOnly = view === 'recent'
    if (!pro && !finderOnly) return NextResponse.json({ error: 'Stacked filters are a Pro feature.' }, { status: 403 })
    if (group === 'fielding') return NextResponse.json({ error: 'Stacked filters are not available for fielding.' }, { status: 400 })
    try {
      const d = JSON.parse(deepParam) as Record<string, unknown>
      const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined)
      const stack = (Array.isArray(d.stack) ? d.stack : []).filter((c): c is string => typeof c === 'string' && deepSupports(c, group)).slice(0, 12)
      deep = {
        stack,
        pitchesMin: num(d.pitchesMin, 1, 30), pitchesMax: num(d.pitchesMax, 1, 30),
        inningFrom: num(d.inningFrom, 1, 20), inningTo: num(d.inningTo, 1, 20),
        scoreMin: num(d.scoreMin, -30, 30), scoreMax: num(d.scoreMax, -30, 30),
        events: (Array.isArray(d.events) ? d.events : []).filter((e): e is string => typeof e === 'string' && /^[a-z_]{3,40}$/.test(e)).slice(0, 14),
        who: parseWho(d.who),
        hit: parseHit(d.hit),
      }
    } catch {
      return NextResponse.json({ error: 'Could not read the stacked filters.' }, { status: 400 })
    }
    if (!isDeepMetric(metric, group)) metric = defaultMetric(group)
    if (view === 'breakdown' && !DEEP_GROUP_BY[family]) {
      return NextResponse.json({ error: 'That grouping is not available with stacked filters.' }, { status: 400 })
    }
  }

  // Team breakdown is a Pro feature: free requests silently get the plain result.
  const teams = pro && sp.get('teams') === '1'

  const q: QueryState = { group, gameType, from, to, split: deep ? '' : split, family, metric, view, minSample, years: years.length ? years : DEFAULT_QUERY.years, teams, deep }
  // Lookup allowance (Free and signed-out). Pro is never counted; any database problem lets the request run uncounted.
  const viewer = await resolveViewer(req)
  const key = questionKey(q)
  const check = viewer.kind === 'pro' ? null : await checkLookup(viewer, key)
  const noStore = { 'Cache-Control': 'private, no-store' }
  const limited = () => NextResponse.json({ error: "You've used today's lookups.", limit: true, left: 0, perDay: perDayFor(viewer) }, { status: 429, headers: noStore })
  if (check && !check.allowed) return limited()
  try {
    const result = deep ? await runDeepQuery(q) : await (async () => { const full = await runQuery(q); return pro ? full : stripForFree(full) })()
    // private: the body differs for Pro vs free viewers, so a shared cache must not store it.
    if (viewer.kind === 'pro') return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=300' } })
    let left = check?.left ?? null
    const rows = hasRows(result)
    if (rows) {
      const ch = await chargeLookup(viewer, key)
      if (!ch.ok) return limited()
      left = ch.left
    }
    const res = NextResponse.json({ ...result, lookupsLeft: left, perDay: left == null ? null : perDayFor(viewer) }, { headers: noStore })
    const c = rows ? anonCookie(viewer) : null
    if (c) res.cookies.set(c.name, c.value, c.options)
    return res
  } catch (e) {
    console.error('[stats/query] failed:', (e as Error).message)
    // Stacked filters pull Baseball Savant, so say which source failed.
    const msg = deep ? `${(e as Error).message} Try again in a moment.` : 'MLB Stats API did not respond. Try again in a moment.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
