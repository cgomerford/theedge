// src/lib/scout/abs-lab.ts
//
// Scout Report → ABS tab (lab layout). Adds three things to abs-desk.ts, all read from tables and feeds that already exist (no new table, cron or writer):
//   Where     every challenged pitch with its plate location (abs_challenge_log, written by scripts/fetch_abs_challenge_log.py, the single writer), turned into
//             "inches off the zone edge": signed distance from the ball's centre to the edge of the rule-book zone, positive outside, negative inside. A pitch
//             the ABS system calls a strike is one whose ball (radius 1.45 in) touches the zone, so a centre up to 1.45 in outside still counts. Approximate near
//             the top and bottom (the feed's zone top and bottom are not exactly the ABS zone, see the log script), so distances are shown rounded and labelled.
//   Umpire    who is behind the plate (MLB schedule `hydrate=officials`, one call for the whole season, kept in memory an hour; not the Next fetch cache, which
//             stops at 2 MB). Each umpire's challenges, overturn rate and average distance come from joining the log to those games by game_pk, so an umpire's
//             line is every challenge in the games he worked, league wide, not only this club's.
//   Teams     nothing new, the leaderboard from abs-desk.
// An umpire's line describes the games he worked. It does not say the umpire caused the challenges, and it is not a prediction.

import { createClient } from '@supabase/supabase-js'
import { getAbsDesk, type AbsClub } from './abs-desk'
import { BANDS, bandOf, MIN_UMP_GAMES } from './abs-consts'

const MLB = 'https://statsapi.mlb.com/api/v1'
const PAGE = 1000
const TTL_MS = 10 * 60 * 1000
const HALF_PLATE_FT = 8.5 / 12
export type AbsPoint = {
  pid: number | null; name: string | null
  side: 'b' | 'f'                 // b = batter challenged a called strike, f = catcher / pitcher challenged a called ball
  x: number; z: number; t: number; b: number   // plate location and the batter's zone top and bottom, feet
  d: number                                     // inches off the zone edge (+ outside, - inside)
  ov: 0 | 1
  inn: number; c: string                        // inning; count before the pitch ('' when unknown)
  pt: string; ump: number | null
}

export type UmpLine = { id: number; name: string; games: number; challenges: number; overturned: number; avgD: number | null; batterShare: number | null }

type Raw = {
  game_pk: number; game_date: string; inning: number; challenge_side: 'batting' | 'fielding'; challenging_team_id: number
  challenger_player_id: number | null; challenger_player_name: string | null; is_overturned: boolean
  plate_x: number | string | null; plate_z: number | string | null; sz_top: number | string | null; sz_bot: number | string | null
  balls: number | null; strikes: number | null; pitch_type: string | null
}
const COLS = 'game_pk, game_date, inning, challenge_side, challenging_team_id, challenger_player_id, challenger_player_name, is_overturned, plate_x, plate_z, sz_top, sz_bot, balls, strikes, pitch_type'

let logCache: { at: number; rows: Raw[] } | null = null
async function getLog(): Promise<Raw[]> {
  if (logCache && Date.now() - logCache.at < TTL_MS) return logCache.rows
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
  const rows: Raw[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supa.from('abs_challenge_log').select(COLS).order('play_id').range(offset, offset + PAGE - 1)
    if (error) { console.error('[getAbsLog] Supabase error:', error.message); break }
    rows.push(...((data ?? []) as unknown as Raw[]))
    if (!data || data.length < PAGE) break
  }
  if (rows.length > 0) logCache = { at: Date.now(), rows }
  return rows
}

/** Signed inches from the ball's centre to the edge of the zone (+ outside, - inside). Numeric columns arrive as strings, so everything is coerced. */
export function edgeInches(x: number, z: number, top: number, bot: number): number {
  const dx = Math.abs(x) - HALF_PLATE_FT, dz = Math.max(z - top, bot - z)
  const ft = dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz)
  return Math.round(ft * 120) / 10
}

// ─── Umpires ─────────────────────────────────────────────────────────────

type Sched = { hp: Map<number, { id: number; name: string }>; games: Map<number, number> }
let schedCache: { at: number; key: string; v: Sched } | null = null
async function getPlateUmpires(season: string, throughDate: string): Promise<Sched | null> {
  const key = `${season}|${throughDate}`
  if (schedCache && schedCache.key === key && Date.now() - schedCache.at < 60 * 60 * 1000) return schedCache.v
  try {
    const res = await fetch(`${MLB}/schedule?sportId=1&startDate=${season}-03-01&endDate=${throughDate}&hydrate=officials&fields=dates,games,gamePk,status,abstractGameState,officials,official,id,fullName,officialType`,
      { cache: 'no-store', signal: AbortSignal.timeout(25000) })
    if (!res.ok) { console.error('[getPlateUmpires] schedule HTTP', res.status); return null }
    const hp = new Map<number, { id: number; name: string }>(), games = new Map<number, number>()
    for (const d of (await res.json()).dates ?? []) for (const g of d.games ?? []) {
      const o = (g.officials ?? []).find((x: { officialType?: string }) => x.officialType === 'Home Plate')
      if (!o?.official?.id) continue
      hp.set(g.gamePk, { id: o.official.id, name: o.official.fullName })
      if (g.status?.abstractGameState === 'Final') games.set(o.official.id, (games.get(o.official.id) ?? 0) + 1)
    }
    const v = { hp, games }
    schedCache = { at: Date.now(), key, v }
    return v
  } catch (err) {
    console.error('[getPlateUmpires] failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────

export type AbsLabClub = {
  desk: AbsClub | null
  points: AbsPoint[]
}
export type AbsLab = {
  clubs: { away: AbsLabClub; home: AbsLabClub }
  /** every challenge in the log, reduced to what the distance charts compare against */
  league: { n: number; ov: number; avgD: number | null; avgDOverturned: number | null; avgDUpheld: number | null; bands: { n: number; ov: number }[] }
  tonight: { ump: { id: number; name: string } | null; line: UmpLine | null; points: AbsPoint[] }
  umpires: UmpLine[]
}

export async function getAbsLab(away: { id: number; abbr: string }, home: { id: number; abbr: string }, gameDate: string, gamePk: number): Promise<AbsLab> {
  const [rows, awayDesk, homeDesk] = await Promise.all([getLog().catch(() => [] as Raw[]), getAbsDesk(away.id, away.abbr, gameDate), getAbsDesk(home.id, home.abbr, gameDate)])
  const season = gameDate.slice(0, 4)
  const sched = await getPlateUmpires(season, gameDate)

  const toPoint = (r: Raw): AbsPoint | null => {
    const x = Number(r.plate_x), z = Number(r.plate_z), t = Number(r.sz_top), b = Number(r.sz_bot)
    if (r.plate_x == null || r.plate_z == null || r.sz_top == null || r.sz_bot == null || ![x, z, t, b].every(Number.isFinite)) return null
    return {
      pid: r.challenger_player_id, name: r.challenger_player_name, side: r.challenge_side === 'batting' ? 'b' : 'f',
      x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000, t, b, d: edgeInches(x, z, t, b), ov: r.is_overturned ? 1 : 0,
      inn: r.inning, c: r.balls != null && r.strikes != null ? `${r.balls}-${r.strikes}` : '', pt: r.pitch_type ?? '', ump: sched?.hp.get(r.game_pk)?.id ?? null,
    }
  }

  const all: { r: Raw; p: AbsPoint }[] = []
  for (const r of rows) { const p = toPoint(r); if (p) all.push({ r, p }) }
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
  const league = {
    n: all.length, ov: all.filter(x => x.p.ov).length, avgD: mean(all.map(x => x.p.d)),
    avgDOverturned: mean(all.filter(x => x.p.ov).map(x => x.p.d)), avgDUpheld: mean(all.filter(x => !x.p.ov).map(x => x.p.d)),
    bands: BANDS.map((_, i) => { const xs = all.filter(x => bandOf(x.p.d) === i); return { n: xs.length, ov: xs.filter(x => x.p.ov).length } }),
  }

  const byUmp = new Map<number, AbsPoint[]>()
  for (const { p } of all) if (p.ump != null) byUmp.set(p.ump, [...(byUmp.get(p.ump) ?? []), p])
  const names = new Map<number, string>()
  for (const v of sched?.hp.values() ?? []) names.set(v.id, v.name)
  const lineOf = (id: number): UmpLine => {
    const ps = byUmp.get(id) ?? []
    return { id, name: names.get(id) ?? String(id), games: sched?.games.get(id) ?? 0, challenges: ps.length, overturned: ps.filter(p => p.ov).length, avgD: mean(ps.map(p => p.d)), batterShare: ps.length ? Math.round((ps.filter(p => p.side === 'b').length / ps.length) * 100) : null }
  }
  const umpires = sched ? [...sched.games.keys()].filter(id => (sched.games.get(id) ?? 0) >= MIN_UMP_GAMES).map(lineOf).sort((a, b) => b.challenges / b.games - a.challenges / a.games) : []
  const ump = sched?.hp.get(gamePk) ?? null

  const clubPoints = (teamId: number) => all.filter(x => x.r.challenging_team_id === teamId).map(x => x.p)
  return {
    clubs: { away: { desk: awayDesk, points: clubPoints(away.id) }, home: { desk: homeDesk, points: clubPoints(home.id) } },
    league, umpires,
    tonight: { ump, line: ump ? lineOf(ump.id) : null, points: ump ? byUmp.get(ump.id) ?? [] : [] },
  }
}
