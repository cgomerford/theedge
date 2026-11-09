// src/lib/milb-shape/exhibition.ts
//
// The two exhibition levels of the Pitch Shape Lab: Spring Training ('st') and the Arizona Fall League ('afl'). Both are short, and neither is a complete Savant minor-league source:
//
//   Spring Training   Savant's major-league endpoint with game type S (see savant.ts). Games are the major-league clubs' own spring games, taken from the MLB Stats API schedule
//                     (sport 1, game type S) with BOTH clubs on the major-league team list, so college, World Baseball Classic and NPB exhibition games are left out. Savant has no
//                     arm angle for these pitches; it stays null.
//   Arizona Fall    Not on Savant (every date probed on both endpoints returned nothing, 2026-11-09). Its pitches are read from the MLB Stats API game feed of every Final game
//   League          in league 119 (curl-verified 2026-11-09: 87 of 98 games final, induced vertical break, horizontal break and speed on ~99% of pitches). The feed has no arm angle,
//                   no run value and no expected stats, so those are null and pending in the interface. Parks the feed does not track (Kino Veterans Memorial Stadium) simply
//                   produce no pitches and are counted in the coverage rows.
//
// The feed's pitches are turned into the SAME row shape the Savant CSV has (the aggregator's only input), with the unit conversions already proven in normalise.ts:
//   pfx_x (feet, catcher's view) = -breakHorizontal / 12 for both hands (RHP: hb = +bh;  LHP: hb = -bh;  hbFromPfxX gives hb back), pfx_z (feet) = breakVerticalInduced / 12.
// Nothing here writes anywhere: it builds rows for the Aggregator, and the importer decides whether to write.

import type { Chunk, ChunkCache } from './savant'
import { fetchRange, type FetchReport, type Fetcher } from './savant'
import { Aggregator } from './aggregate'
import { AFL_LEAGUE_ID } from './levels'
import { emptyRejects, mergeRejects, type Rejects } from './league'
import crypto from 'node:crypto'

const STATS = 'https://statsapi.mlb.com/api/v1'
const STATS11 = 'https://statsapi.mlb.com/api/v1.1'

export type ExhibitionDeps = {
  fetcher: Fetcher
  getJson: (url: string) => Promise<unknown>
  cache?: ChunkCache
  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
  gapMs?: number
}

type ApiGameLite = { gamePk: number; gameType?: string; officialDate?: string; status?: { abstractGameState?: string }; teams: { home: { team: { id: number } }; away: { team: { id: number } } }; venue?: { name?: string } }
const gamesOf = (j: unknown): ApiGameLite[] => ((j as { dates?: { games: ApiGameLite[] }[] }).dates ?? []).flatMap(d => d.games)

// ---- Spring Training ----------------------------------------------------------------------------------------------------------------------------------

export type SpringRegistry = { games: Map<number, { date: string; home: string; away: string }>; first: string | null; last: string | null; skipped: number }

/** Spring games between two major-league clubs, from the Stats API. A game with a club outside the major-league list (college, WBC, NPB) is counted in `skipped` and left out. */
export async function loadSpringRegistry(deps: ExhibitionDeps, season: number, start: string, end: string): Promise<SpringRegistry> {
  const teams = ((await deps.getJson(`${STATS}/teams?sportId=1&season=${season}`)) as { teams?: { id: number; abbreviation?: string }[] }).teams ?? []
  const abbr = new Map(teams.map(t => [t.id, (t.abbreviation ?? '').toUpperCase()]))
  const j = await deps.getJson(`${STATS}/schedule?sportId=1&gameType=S&startDate=${start}&endDate=${end}`)
  const games = new Map<number, { date: string; home: string; away: string }>()
  let skipped = 0
  for (const g of gamesOf(j)) {
    const h = abbr.get(g.teams.home.team.id), a = abbr.get(g.teams.away.team.id)
    if (!h || !a) { skipped++; continue }
    games.set(g.gamePk, { date: g.officialDate ?? '', home: h, away: a })
  }
  const dates = [...games.values()].map(g => g.date).filter(Boolean).sort()
  return { games, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, skipped }
}

/** Keep Savant rows whose game is a verified spring game between two major-league clubs. Everything else is counted, never added. */
export function filterSpring<T extends { game_pk?: unknown }>(rows: T[], reg: SpringRegistry): { rows: T[]; rejects: Rejects } {
  const rejects = emptyRejects()
  const kept: T[] = []
  const bad = new Set<number>()
  for (const r of rows) {
    const pk = Number(r.game_pk)
    if (!reg.games.has(pk)) { rejects.unresolved++; bad.add(pk); continue }
    rejects.kept.st++
    kept.push(r)
  }
  rejects.quarantinedGames = [...bad].sort((a, b) => a - b)
  return { rows: kept, rejects }
}

export type ExhibitionResult = {
  agg: Aggregator
  fetch: FetchReport
  rejects: Rejects
  notes: string[]
  firstDate: string | null; lastDate: string | null
  complete: boolean
  gamesInSchedule: number
}

export async function buildSpring(o: { season: number; start?: string; end?: string; chunkDays?: number; cap?: number }, deps: ExhibitionDeps): Promise<ExhibitionResult> {
  const start = o.start ?? `${o.season}-02-01`, end = o.end ?? `${o.season}-04-05`
  const reg = await loadSpringRegistry(deps, o.season, start, end)
  if (!reg.first || !reg.last) throw new Error(`[buildSpring] the schedule has no major-league spring games between ${start} and ${end}`)
  const agg = new Aggregator('st', o.season)
  let rejects = emptyRejects()
  const rep = await fetchRange({ start: reg.first, end: reg.last, season: o.season, level: 'st', fetcher: deps.fetcher, cache: deps.cache, sleep: deps.sleep, log: deps.log, chunkDays: o.chunkDays, gapMs: deps.gapMs, cap: o.cap }, rows => {
    const f = filterSpring(rows, reg)
    rejects = mergeRejects(rejects, f.rejects)
    for (const r of f.rows) agg.add(r)
  })
  return {
    agg, fetch: rep, rejects, firstDate: reg.first, lastDate: reg.last, complete: rep.gaps.length === 0, gamesInSchedule: reg.games.size,
    notes: [`${reg.games.size} spring games between two major-league clubs; ${reg.skipped} scheduled games with a club outside the major-league list (college, WBC, NPB) left out`],
  }
}

// ---- Arizona Fall League (game feed) -------------------------------------------------------------------------------------------------------------------

type FeedCall = { code?: string }
type FeedEvent = {
  isPitch?: boolean; pitchNumber?: number
  details?: { call?: FeedCall; type?: { code?: string } }
  count?: { balls?: number; strikes?: number }
  pitchData?: { startSpeed?: number; extension?: number; zone?: number; coordinates?: { pX?: number; pZ?: number }; breaks?: { spinRate?: number; breakVerticalInduced?: number; breakHorizontal?: number } }
  hitData?: { launchSpeed?: number; trajectory?: string }
}
type FeedPlay = {
  result?: { eventType?: string }
  about?: { atBatIndex?: number; isTopInning?: boolean }
  matchup?: { batter?: { id?: number }; batSide?: { code?: string }; pitcher?: { id?: number; fullName?: string }; pitchHand?: { code?: string } }
  playEvents?: FeedEvent[]
}
export type Feed = {
  gameData?: { datetime?: { officialDate?: string }; teams?: { home?: { abbreviation?: string }; away?: { abbreviation?: string } } }
  liveData?: { plays?: { allPlays?: FeedPlay[] } }
}

/** The feed's call code as the Savant `description` the aggregator counts swings, whiffs and called strikes from. Calls that are none of those map to their own word (ball, hit by pitch). */
const DESCRIPTION: Record<string, string> = {
  B: 'ball', '*B': 'blocked_ball', I: 'ball', P: 'ball', V: 'ball', C: 'called_strike', S: 'swinging_strike', W: 'swinging_strike_blocked', Q: 'swinging_strike',
  F: 'foul', T: 'foul_tip', R: 'foul', L: 'foul_bunt', M: 'missed_bunt', O: 'foul_tip', X: 'hit_into_play', D: 'hit_into_play', E: 'hit_into_play', H: 'hit_by_pitch',
}
const BB_TYPE: Record<string, string> = { ground_ball: 'ground_ball', line_drive: 'line_drive', fly_ball: 'fly_ball', popup: 'popup' }

/** One game's feed to Savant-shaped pitch rows. Pure: the caller fetches. A pitch with no tracking is still a row (so coverage counts it) but has null speed and movement. */
export function rowsFromFeed(feed: Feed, gamePk: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const date = feed.gameData?.datetime?.officialDate ?? ''
  const home = (feed.gameData?.teams?.home?.abbreviation ?? '').toUpperCase(), away = (feed.gameData?.teams?.away?.abbreviation ?? '').toUpperCase()
  for (const play of feed.liveData?.plays?.allPlays ?? []) {
    const pid = play.matchup?.pitcher?.id
    const hand = play.matchup?.pitchHand?.code
    const events = (play.playEvents ?? []).filter(e => e.isPitch)
    let balls = 0, strikes = 0
    events.forEach((e, i) => {
      const bh = e.pitchData?.breaks?.breakHorizontal, bv = e.pitchData?.breaks?.breakVerticalInduced
      const callCode = e.details?.call?.code ?? ''
      const last = i === events.length - 1
      out.push({
        game_pk: gamePk, game_date: date, home_team: home, away_team: away, inning_topbot: play.about?.isTopInning ? 'Top' : 'Bot',
        at_bat_number: (play.about?.atBatIndex ?? 0) + 1, pitch_number: e.pitchNumber ?? i + 1,
        pitcher: pid, player_name: play.matchup?.pitcher?.fullName ?? '', p_throws: hand ?? '', stand: play.matchup?.batSide?.code ?? '',
        pitch_type: e.details?.type?.code ?? '', release_speed: e.pitchData?.startSpeed ?? '',
        pfx_x: typeof bh === 'number' ? -bh / 12 : '', pfx_z: typeof bv === 'number' ? bv / 12 : '',
        release_extension: e.pitchData?.extension ?? '', release_spin_rate: e.pitchData?.breaks?.spinRate ?? '',
        plate_x: e.pitchData?.coordinates?.pX ?? '', plate_z: e.pitchData?.coordinates?.pZ ?? '', zone: e.pitchData?.zone ?? '',
        description: DESCRIPTION[callCode] ?? '', events: last ? play.result?.eventType ?? '' : '',
        balls, strikes,
        launch_speed: e.hitData?.launchSpeed ?? '', bb_type: BB_TYPE[e.hitData?.trajectory ?? ''] ?? '',
        // no arm angle, run value or expected stats in the feed: left absent, so they are counted as missing and shown as pending
      })
      balls = e.count?.balls ?? balls; strikes = e.count?.strikes ?? strikes   // the count AFTER this pitch is the count BEFORE the next
    })
  }
  return out
}

const sha = (s: string) => crypto.createHash('sha1').update(s).digest('hex')

export async function buildAfl(o: { season: number; start?: string; end?: string }, deps: ExhibitionDeps): Promise<ExhibitionResult> {
  const start = o.start ?? `${o.season}-09-25`, end = o.end ?? `${o.season}-11-20`
  const log = deps.log ?? (() => undefined)
  const sched = gamesOf(await deps.getJson(`${STATS}/schedule?sportId=17&leagueId=${AFL_LEAGUE_ID}&season=${o.season}&startDate=${start}&endDate=${end}`))
  if (sched.length === 0) throw new Error(`[buildAfl] the schedule has no Arizona Fall League games between ${start} and ${end}`)
  const final = sched.filter(g => g.status?.abstractGameState === 'Final').sort((a, b) => (a.officialDate ?? '').localeCompare(b.officialDate ?? '') || a.gamePk - b.gamePk)
  const agg = new Aggregator('afl', o.season)
  const rep: FetchReport = { requests: 0, fromCache: 0, truncatedChunks: [], gaps: [], chunks: 0 }
  const rejects = emptyRejects()
  let tracked = 0, untrackedGames = 0
  const sleep = deps.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)))
  const gapMs = deps.gapMs ?? 300
  let last = 0
  for (const g of final) {
    const url = `${STATS11}/game/${g.gamePk}/feed/live`
    const key = sha(url)
    let text = deps.cache ? await deps.cache.get(key) : null
    if (text != null) rep.fromCache++
    else {
      let ok = false
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const wait = gapMs - (Date.now() - last); if (wait > 0) await sleep(wait)
        last = Date.now(); rep.requests++
        try { text = JSON.stringify(await deps.getJson(url)); if (deps.cache) await deps.cache.set(key, text); ok = true } catch (e) { log(`  game ${g.gamePk}: ${e instanceof Error ? e.message : e}, try ${attempt + 1}/4`); await sleep(1500 * 2 ** attempt) }
      }
      if (!ok) { rep.gaps.push({ start: g.officialDate ?? '', end: g.officialDate ?? '', reason: `game ${g.gamePk}: the feed could not be read` }); continue }
    }
    const rows = rowsFromFeed(JSON.parse(text as string) as Feed, g.gamePk)
    const trackedHere = rows.filter(r => r.release_speed !== '' && r.pfx_x !== '').length
    tracked += trackedHere
    if (rows.length > 0 && trackedHere === 0) untrackedGames++
    rep.chunks++
    rejects.kept.afl += rows.length
    for (const r of rows) agg.add(r)
  }
  const dates = final.map(g => g.officialDate ?? '').filter(Boolean)
  const notes = [
    `${sched.length} games scheduled, ${final.length} final`,
    `${untrackedGames} final games had no tracked pitches (parks the game feed does not track, such as Kino Veterans Memorial Stadium) and contribute no pitches`,
    `${tracked} tracked pitches`,
  ]
  return { agg, fetch: rep, rejects, notes, firstDate: dates[0] ?? null, lastDate: dates[dates.length - 1] ?? null, complete: rep.gaps.length === 0, gamesInSchedule: sched.length }
}

export type { Chunk }
