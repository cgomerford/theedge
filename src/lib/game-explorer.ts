// src/lib/game-explorer.ts
//
// Data for the Games pages on The Stats (/mlb/stats/games and /mlb/stats/games/[gamePk]).
//   getScoreboard(date)  → every game on a date (live, final, upcoming) with its line score
//   getGameExplorer(pk)  → one game in full: line score, box, and EVERY plate appearance with its pitches
//
// Read-only, MLB Stats API only (free, no auth), throttled. Nothing is stored: a live game is re-read every
// 15 seconds, a finished game is cached longer. Field names were curl-verified against a finished game
// (gamePk 849816) — pitchData.coordinates.pX / pZ (feet, catcher's view), pitchData.zone, details.call.code,
// details.type.code, hitData.launchSpeed / launchAngle / totalDistance, playEvents[].count is the count AFTER
// that pitch (so the count BEFORE a pitch is the previous event's count).
//
// Situation at the START of each plate appearance (outs, runners, score) is MLB's "after" of the previous play —
// the same rule stats-live.ts uses (momentsFromPlays), kept consistent so the "last time" search lines up.

import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'

const API = 'https://statsapi.mlb.com/api'

export type PitchCall = 'ball' | 'called_strike' | 'swinging_strike' | 'foul' | 'in_play' | 'other'

export type ExPitch = {
  n: number
  type: string          // MLB code: FF, SL, ...
  typeName: string
  speed: number | null
  x: number | null      // plate_x, feet, catcher's view (negative = 3B side)
  z: number | null      // plate_z, feet
  zone: number | null
  call: PitchCall
  callText: string
  countBefore: string   // "balls-strikes" BEFORE this pitch
  ev: number | null; la: number | null; dist: number | null; bbType: string | null
  /** where the ball came down / was fielded, MLB field coordinates (home plate ≈ 125, 199; 2.5 ft per unit) */
  hx: number | null; hy: number | null
}

export type ExPlay = {
  id: number                       // atBatIndex (0-based)
  inning: number; half: 'Top' | 'Bot'
  batterId: number; batter: string; stand: string
  pitcherId: number; pitcher: string; throws: string
  outs: number; baseState: number  // at the START of the plate appearance; bit1=1st, 2=2nd, 4=3rd
  scoreDiff: number                // batting team minus fielding team, at the start
  awayAfter: number; homeAfter: number
  event: string; description: string
  scoring: boolean; complete: boolean
  balls: number; strikes: number   // count now (or at the end if complete)
  pitches: ExPitch[]
  szTop: number | null; szBottom: number | null
}

export type ExPlayer = { id: number; name: string; pos: string; line: string }
export type ExTeam = { id: number; abbr: string; name: string }
/** Distances to the fence in feet, from MLB's venue record. A marker a park does not publish is null (never estimated). */
export type ExField = { leftLine: number | null; left: number | null; leftCenter: number | null; center: number | null; rightCenter: number | null; right: number | null; rightLine: number | null }
export type ExVenue = { id: number; name: string; roof: string; field: ExField }

export type ExGame = {
  gamePk: number
  state: 'Live' | 'Final' | 'Preview'
  detailed: string
  gameType: string
  date: string
  away: ExTeam; home: ExTeam
  venue: ExVenue
  awayRuns: number; homeRuns: number
  awayHits: number; homeHits: number; awayErrors: number; homeErrors: number
  innings: { away: number | null; home: number | null }[]
  inning: number; half: 'Top' | 'Bot'; outs: number; balls: number; strikes: number; baseState: number
  currentBatter: string; currentPitcher: string
  decisions: { winner: string | null; loser: string | null; save: string | null }
  lineups: { away: { batters: ExPlayer[]; pitchers: ExPlayer[] }; home: { batters: ExPlayer[]; pitchers: ExPlayer[] } }
  plays: ExPlay[]
  updatedAt: string
}

export type BoardGame = {
  gamePk: number
  state: 'Live' | 'Final' | 'Preview'
  detailed: string
  gameType: string
  startTime: string
  away: ExTeam; home: ExTeam
  awayRuns: number | null; homeRuns: number | null
  innings: { away: number | null; home: number | null }[]
  awayHits: number | null; homeHits: number | null; awayErrors: number | null; homeErrors: number | null
  inning: number; half: 'Top' | 'Bot'; outs: number; balls: number; strikes: number; baseState: number
  batter: string; pitcher: string
  winner: string | null; loser: string | null
}

// ── small cache so a page that polls never hammers MLB ──────────────────
const CACHE = new Map<string, { at: number; value: unknown }>()
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value as T
  const value = await load()
  CACHE.set(key, { at: Date.now(), value })
  if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value as string)
  return value
}

async function getJson(url: string): Promise<any> {
  const res = await throttledMlbFetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`MLB Stats API ${res.status}`)
  return res.json()
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const state = (s: unknown): 'Live' | 'Final' | 'Preview' => (s === 'Live' ? 'Live' : s === 'Final' ? 'Final' : 'Preview')

function pitchCall(d: any): PitchCall {
  if (d?.isInPlay) return 'in_play'
  const c = String(d?.call?.code ?? '')
  if (c === 'B' || c === '*B' || c === 'I' || c === 'P' || c === 'H') return 'ball' // ball, ball in dirt, intentional, pitchout, hit by pitch
  if (c === 'C') return 'called_strike'
  if (c === 'S' || c === 'W' || c === 'M' || c === 'Q' || c === 'T' || c === 'O') return 'swinging_strike' // swinging, blocked, missed bunt, foul tip (a strike, not a foul)
  if (c === 'F' || c === 'L' || c === 'R') return 'foul' // foul, foul bunt, foul pitchout
  return 'other'
}

function shapePlay(p: any, prev: any | null): ExPlay {
  const top = !!p.about?.isTopInning
  const sameHalf = !!prev && prev.about?.inning === p.about?.inning && !!prev.about?.isTopInning === top
  const outs = sameHalf ? Number(prev.count?.outs ?? 0) : 0
  const mp = prev?.matchup ?? {}
  const baseState = sameHalf ? ((mp.postOnFirst ? 1 : 0) | (mp.postOnSecond ? 2 : 0) | (mp.postOnThird ? 4 : 0)) : 0
  const away = Number(prev?.result?.awayScore ?? 0), home = Number(prev?.result?.homeScore ?? 0)
  const events: any[] = (p.playEvents ?? []).filter((e: any) => e.isPitch)
  const szTop = num(events.find(e => num(e.pitchData?.strikeZoneTop) != null)?.pitchData?.strikeZoneTop)
  const szBottom = num(events.find(e => num(e.pitchData?.strikeZoneBottom) != null)?.pitchData?.strikeZoneBottom)
  const pitches: ExPitch[] = events.map((e, i) => {
    const before = i === 0 ? { balls: 0, strikes: 0 } : events[i - 1].count ?? { balls: 0, strikes: 0 }
    return {
      n: i + 1, type: String(e.details?.type?.code ?? ''), typeName: String(e.details?.type?.description ?? 'Unknown'),
      speed: num(e.pitchData?.startSpeed), x: num(e.pitchData?.coordinates?.pX), z: num(e.pitchData?.coordinates?.pZ),
      zone: num(e.pitchData?.zone), call: pitchCall(e.details), callText: String(e.details?.description ?? ''),
      countBefore: `${before.balls ?? 0}-${before.strikes ?? 0}`,
      ev: num(e.hitData?.launchSpeed), la: num(e.hitData?.launchAngle), dist: num(e.hitData?.totalDistance),
      bbType: typeof e.hitData?.trajectory === 'string' ? e.hitData.trajectory : null,
      hx: num(e.hitData?.coordinates?.coordX), hy: num(e.hitData?.coordinates?.coordY),
    }
  })
  return {
    id: Number(p.atBatIndex),
    inning: Number(p.about?.inning ?? 0), half: top ? 'Top' : 'Bot',
    batterId: Number(p.matchup?.batter?.id ?? 0), batter: String(p.matchup?.batter?.fullName ?? ''), stand: String(p.matchup?.batSide?.code ?? ''),
    pitcherId: Number(p.matchup?.pitcher?.id ?? 0), pitcher: String(p.matchup?.pitcher?.fullName ?? ''), throws: String(p.matchup?.pitchHand?.code ?? ''),
    outs: Math.min(2, outs), baseState, scoreDiff: top ? away - home : home - away,
    awayAfter: Number(p.result?.awayScore ?? away), homeAfter: Number(p.result?.homeScore ?? home),
    event: String(p.result?.event ?? ''), description: String(p.result?.description ?? ''),
    scoring: !!p.about?.isScoringPlay, complete: !!p.about?.isComplete,
    balls: Number(p.count?.balls ?? 0), strikes: Number(p.count?.strikes ?? 0),
    pitches, szTop, szBottom,
  }
}

function shapeRoster(team: any): { batters: ExPlayer[]; pitchers: ExPlayer[] } {
  const players = team?.players ?? {}
  const get = (id: number): ExPlayer | null => {
    const p = players[`ID${id}`]
    if (!p) return null
    return { id, name: String(p.person?.fullName ?? ''), pos: String(p.position?.abbreviation ?? ''), line: '' }
  }
  const batters = (team?.batters ?? []).map((id: number) => {
    const b = get(id); if (!b) return null
    const s = players[`ID${id}`]?.stats?.batting
    return { ...b, line: typeof s?.summary === 'string' ? s.summary : '' }
  }).filter(Boolean) as ExPlayer[]
  const pitchers = (team?.pitchers ?? []).map((id: number) => {
    const b = get(id); if (!b) return null
    const s = players[`ID${id}`]?.stats?.pitching
    const note = typeof s?.note === 'string' && s.note ? ` ${s.note}` : ''
    return { ...b, line: `${s?.summary ?? ''}${note}`.trim() }
  }).filter(Boolean) as ExPlayer[]
  return { batters, pitchers }
}

function shapeVenue(v: any): ExVenue {
  const f = v?.fieldInfo ?? {}
  return {
    id: Number(v?.id ?? 0), name: String(v?.name ?? ''), roof: String(f.roofType ?? ''),
    field: { leftLine: num(f.leftLine), left: num(f.left), leftCenter: num(f.leftCenter), center: num(f.center), rightCenter: num(f.rightCenter), right: num(f.right), rightLine: num(f.rightLine) },
  }
}

const team = (t: any): ExTeam => ({ id: Number(t?.id ?? 0), abbr: String(t?.abbreviation ?? ''), name: String(t?.name ?? '') })

/** One game in full. Returns null (and logs) if MLB does not answer or the game does not exist. */
export async function getGameExplorer(gamePk: number): Promise<ExGame | null> {
  if (!Number.isInteger(gamePk) || gamePk <= 0) return null
  try {
    // a finished game never changes, so it can be cached for a good while; a live game for 15 s
    const probe = CACHE.get(`game|${gamePk}`)
    const ttl = probe && (probe.value as ExGame).state === 'Final' ? 10 * 60_000 : 15_000
    return await cached(`game|${gamePk}`, ttl, async () => {
      const d = await getJson(`${API}/v1.1/game/${gamePk}/feed/live`)
      const ls = d?.liveData?.linescore
      if (!ls || !d?.gameData) return null
      const all: any[] = d.liveData?.plays?.allPlays ?? []
      const plays: ExPlay[] = []
      let prev: any = null
      for (const p of all) { plays.push(shapePlay(p, prev)); prev = p }
      const top = !!ls.isTopInning
      const off = ls.offense ?? {}
      const box = d.liveData?.boxscore?.teams ?? {}
      const dec = d.liveData?.decisions ?? {}
      return {
        gamePk, state: state(d.gameData?.status?.abstractGameState), detailed: String(d.gameData?.status?.detailedState ?? ''),
        gameType: String(d.gameData?.game?.type ?? 'R'), date: String(d.gameData?.datetime?.officialDate ?? ''),
        away: team(d.gameData?.teams?.away), home: team(d.gameData?.teams?.home),
        venue: shapeVenue(d.gameData?.venue),
        awayRuns: Number(ls.teams?.away?.runs ?? 0), homeRuns: Number(ls.teams?.home?.runs ?? 0),
        awayHits: Number(ls.teams?.away?.hits ?? 0), homeHits: Number(ls.teams?.home?.hits ?? 0),
        awayErrors: Number(ls.teams?.away?.errors ?? 0), homeErrors: Number(ls.teams?.home?.errors ?? 0),
        innings: (ls.innings ?? []).map((i: any) => ({ away: num(i.away?.runs), home: num(i.home?.runs) })),
        inning: Number(ls.currentInning ?? 0), half: top ? 'Top' : 'Bot', outs: Number(ls.outs ?? 0),
        balls: Number(ls.balls ?? 0), strikes: Number(ls.strikes ?? 0),
        baseState: (off.first ? 1 : 0) | (off.second ? 2 : 0) | (off.third ? 4 : 0),
        currentBatter: String(off.batter?.fullName ?? ''), currentPitcher: String(ls.defense?.pitcher?.fullName ?? ''),
        decisions: { winner: dec.winner?.fullName ?? null, loser: dec.loser?.fullName ?? null, save: dec.save?.fullName ?? null },
        lineups: { away: shapeRoster(box.away), home: shapeRoster(box.home) },
        plays, updatedAt: new Date().toISOString(),
      } as ExGame
    })
  } catch (e) {
    console.error('[getGameExplorer] failed:', gamePk, (e as Error).message)
    return null
  }
}

/** Every game on one date (ET). Never invents games: an empty or failed day returns []. */
export async function getScoreboard(date: string): Promise<BoardGame[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
    // a past day is settled; today / future days refresh every 15 s
    const ttl = date < today ? 10 * 60_000 : 15_000
    return await cached(`board|${date}`, ttl, async () => {
      const j = await getJson(`${API}/v1/schedule?sportId=1&date=${date}&hydrate=team,linescore,decisions`)
      const games: any[] = j.dates?.[0]?.games ?? []
      return games.map((g): BoardGame => {
        const ls = g.linescore ?? {}, off = ls.offense ?? {}
        const top = ls.isTopInning !== false
        return {
          gamePk: Number(g.gamePk), state: state(g.status?.abstractGameState), detailed: String(g.status?.detailedState ?? ''),
          gameType: String(g.gameType ?? 'R'), startTime: String(g.gameDate ?? ''),
          away: team(g.teams?.away?.team), home: team(g.teams?.home?.team),
          awayRuns: num(g.teams?.away?.score), homeRuns: num(g.teams?.home?.score),
          innings: (ls.innings ?? []).map((i: any) => ({ away: num(i.away?.runs), home: num(i.home?.runs) })),
          awayHits: num(ls.teams?.away?.hits), homeHits: num(ls.teams?.home?.hits),
          awayErrors: num(ls.teams?.away?.errors), homeErrors: num(ls.teams?.home?.errors),
          inning: Number(ls.currentInning ?? 0), half: top ? 'Top' : 'Bot', outs: Number(ls.outs ?? 0),
          balls: Number(ls.balls ?? 0), strikes: Number(ls.strikes ?? 0),
          baseState: (off.first ? 1 : 0) | (off.second ? 2 : 0) | (off.third ? 4 : 0),
          batter: String(off.batter?.fullName ?? ''), pitcher: String(ls.defense?.pitcher?.fullName ?? ''),
          winner: g.decisions?.winner?.fullName ?? null, loser: g.decisions?.loser?.fullName ?? null,
        }
      })
    })
  } catch (e) {
    console.error('[getScoreboard] failed:', date, (e as Error).message)
    return []
  }
}
