// src/lib/mlb-live-feed.ts
//
// Fetch wrapper around the MLB Stats API live feed (GUMBO) and the schedule
// endpoint (used for doubleheader detection).
//
// VERIFY BEFORE TRUSTING IN PROD — same caveat as pregame-stats.ts: this is
// the undocumented statsapi.mlb.com surface, field names are community
// reverse-engineered. Run one real gamePk through this and diff the JSON
// before relying on it. The GUMBO feed is a LARGE payload (a full 9-inning
// game is thousands of lines) — do not poll this endpoint tightly. 30–60s
// during live innings is plenty; for postgame report generation you only
// need to call it once, on transition to Final.

import { teamAbbr } from '@/lib/mlb-assets'

const STATS_API_V1 = 'https://statsapi.mlb.com/api/v1'
const STATS_API_LIVE = 'https://statsapi.mlb.com/api/v1.1'

// ── Minimal GUMBO feed shape ────────────────────────────────────────────────
// Only the fields postgame-aggregate.ts actually reads. The real payload has
// dozens more fields (boxscore, decisions, weather, officials, review
// details, etc.) — extend this type as you need more of it.

export interface GumboPitchData {
  startSpeed?: number
  endSpeed?: number
  strikeZoneTop?: number
  strikeZoneBottom?: number
  coordinates?: { pX?: number; pZ?: number }
  breaks?: {
    breakLength?: number
    breakVerticalInduced?: number
    breakHorizontal?: number
    spinRate?: number
  }
  zone?: number
}

export interface GumboHitData {
  launchSpeed?: number
  launchAngle?: number
  totalDistance?: number
  trajectory?: string
  hardness?: string
  coordinates?: { coordX?: number; coordY?: number }
}

export interface GumboPlayEvent {
  details: {
    call?: { code?: string; description?: string }
    description?: string
    type?: { code?: string; description?: string }
    isInPlay?: boolean
    isStrike?: boolean
    isBall?: boolean
  }
  count?: { balls: number; strikes: number; outs: number }
  index: number
  pitchNumber?: number
  isPitch: boolean
  type: string
  pitchData?: GumboPitchData
  hitData?: GumboHitData
}

export interface GumboRunnerMovement {
  isOut: boolean
}

export interface GumboRunnerDetails {
  event?: string
  eventType?: string
  runner?: { id: number; fullName: string }
  responsiblePitcher?: { id: number } | null
  isScoringEvent?: boolean
  rbi?: boolean
  earned?: boolean
}

export interface GumboRunner {
  movement: GumboRunnerMovement
  details: GumboRunnerDetails
}

export interface GumboPlay {
  result: {
    type: string
    event: string
    eventType: string
    description: string
    rbi: number
    awayScore: number
    homeScore: number
    isOut: boolean
  }
  about: {
    atBatIndex: number
    halfInning: 'top' | 'bottom'
    inning: number
    isScoringPlay: boolean
    captivatingIndex: number
  }
  matchup: {
    batter: { id: number; fullName: string }
    pitcher: { id: number; fullName: string }
  }
  runners: GumboRunner[]
  playEvents: GumboPlayEvent[]
}

export interface GumboFeed {
  gamePk: number
  gameData: {
    game: { pk: number; type: string; doubleHeader: string; gameNumber: number }
    datetime: { officialDate: string }
    status: { abstractGameState: 'Preview' | 'Live' | 'Final' }
    teams: {
      away: { id: number; name: string; abbreviation: string }
      home: { id: number; name: string; abbreviation: string }
    }
  }
  liveData: {
    plays: { allPlays: GumboPlay[]; scoringPlays: number[] }
    linescore?: {
      innings: { num: number; away?: { runs?: number }; home?: { runs?: number } }[]
      teams: {
        away: { runs: number; hits: number; errors: number }
        home: { runs: number; hits: number; errors: number }
      }
    }
  }
}

export async function getLiveFeed(gamePk: number): Promise<GumboFeed | null> {
  try {
    const res = await fetch(`${STATS_API_LIVE}/game/${gamePk}/feed/live`, {
      // For an in-progress game you want fresh data; for a Final game this
      // is immutable, so callers generating a postgame report can cache
      // aggressively downstream (see the Supabase cache table).
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as GumboFeed
  } catch {
    return null
  }
}

// ── Doubleheader detection ──────────────────────────────────────────────────
// Returns every game on `date` between these two teams, sorted by game
// number. Most days this returns a single-element array.
//
// If you already have a `getScheduleForDate()` helper elsewhere (referenced
// in src/app/mlb/[slug]/page.tsx) that already carries `gameNumber` on each
// game object, prefer filtering that result instead of adding a second call
// — this is written standalone so it works either way.

export interface DoubleheaderGame {
  gamePk: number
  gameNumber: number
  status: 'Preview' | 'Live' | 'Final'
  gameDate: string
}

// ── Current series detection ────────────────────────────────────────────────
// For "today is game 3 of 4" — a series spans multiple *dates*, unlike a
// doubleheader which is two games on the *same* date. MLB's schedule
// endpoint tags each game with seriesGameNumber/gamesInSeries directly, so
// this reads those instead of trying to infer series boundaries from date
// gaps (off-days between series make that unreliable).

export interface SeriesGame {
  gamePk: number
  gameDate: string           // YYYY-MM-DD
  seriesGameNumber: number
  gamesInSeries: number
  status: 'Preview' | 'Live' | 'Final'
  homeTeamId: number
  awayTeamId: number
}

export async function getCurrentSeriesGames(
  date: string,
  teamAId: number,
  teamBId: number,
): Promise<SeriesGame[]> {
  try {
    // Look back far enough to catch the start of a longer series (4-game
    // series plus a possible off-day either side) — 7 days is a safe
    // buffer without pulling in an unrelated earlier series vs the same
    // opponent from a different trip.
    const start = shiftDate(date, -7)
    const url = `${STATS_API_V1}/schedule?sportId=1&teamId=${teamAId}&startDate=${start}&endDate=${date}`
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return []
    const data = await res.json()

    const candidates: SeriesGame[] = []
    for (const dateEntry of data.dates ?? []) {
      for (const g of dateEntry.games ?? []) {
        const home = g.teams?.home?.team?.id
        const away = g.teams?.away?.team?.id
        const matches =
          (home === teamAId && away === teamBId) || (home === teamBId && away === teamAId)
        if (!matches) continue
        candidates.push({
          gamePk: g.gamePk,
          gameDate: (g.gameDate as string).slice(0, 10),
          seriesGameNumber: g.seriesGameNumber ?? 1,
          gamesInSeries: g.gamesInSeries ?? 1,
          status: g.status?.abstractGameState ?? 'Preview',
          homeTeamId: home,
          awayTeamId: away,
        })
      }
    }
    candidates.sort((a, b) => a.gameDate.localeCompare(b.gameDate))

    // Find today's game in the window and use its gamesInSeries to trim to
    // just the current unbroken series (drops an earlier series vs the same
    // opponent that might otherwise be sitting in the 7-day lookback).
    const today = candidates.find(g => g.gameDate === date)
    if (!today) return candidates // fallback: return whatever we found

    return candidates.filter(
      g => g.gamesInSeries === today.gamesInSeries && g.seriesGameNumber <= today.gamesInSeries,
    ).filter(g => {
      // keep only the contiguous block that includes today — guards against
      // a same gamesInSeries count from an unrelated earlier series
      const distance = Math.abs(
        new Date(g.gameDate).getTime() - new Date(date).getTime(),
      ) / 86_400_000
      return distance <= today.gamesInSeries + 1
    })
  } catch {
    return []
  }
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Full day's slate (all teams) — used by the live tracker and the
// yesterday's-stats digest, neither of which is scoped to one matchup. ────

export interface DaySlateGame {
  gamePk: number
  gameDate: string          // ISO datetime of first pitch
  status: 'Preview' | 'Live' | 'Final'
  homeTeamId: number
  awayTeamId: number
  homeAbbr: string
  awayAbbr: string
  homeScore: number
  awayScore: number
  inning: number | null
  inningHalf: 'top' | 'bottom' | null
}
// ── Minor-league slate fetch — same shape as getGamesForDate, parameterized
// by sportId. UNVERIFIED: these sportId values follow the documented MLB
// Stats API convention (also used, with the identical caveat, in
// scripts/fetch_player_form.py's MILB_AAA_SPORT_ID). Neither has been
// curl-tested against a live response from where this was written — run
// one real date through getMinorLeagueGamesForDate before trusting it in
// the yesterday-stats pipeline. If it returns an empty array on a date you
// know had games, this is the first place to check.
//
// teamAbbr() lookup is MLB-specific (30 franchise codes) — for a MiLB team
// id it won't find a match and falls through to the API's own
// `abbreviation` field, same fallback path getGamesForDate already uses
// below. That's expected, not a bug: MiLB abbreviations just come straight
// from the API instead of the static table.
export const SPORT_ID_MLB = 1
export const SPORT_ID_AAA = 11
export const SPORT_ID_AA = 12

export async function getGamesForDateAndLevel(date: string, sportId: number): Promise<DaySlateGame[]> {
  try {
    const url = `${STATS_API_V1}/schedule?sportId=${sportId}&date=${date}&hydrate=team,linescore`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    const games: DaySlateGame[] = []
    for (const dateEntry of data.dates ?? []) {
      for (const g of dateEntry.games ?? []) {
        const homeTeamId = g.teams?.home?.team?.id
        const awayTeamId = g.teams?.away?.team?.id
        games.push({
          gamePk: g.gamePk,
          gameDate: g.gameDate,
          status: g.status?.abstractGameState ?? 'Preview',
          homeTeamId,
          awayTeamId,
          homeAbbr: teamAbbr(homeTeamId, g.teams?.home?.team?.abbreviation),
          awayAbbr: teamAbbr(awayTeamId, g.teams?.away?.team?.abbreviation),
          homeScore: g.teams?.home?.score ?? g.linescore?.teams?.home?.runs ?? 0,
          awayScore: g.teams?.away?.score ?? g.linescore?.teams?.away?.runs ?? 0,
          inning: g.linescore?.currentInning ?? null,
          inningHalf: g.linescore?.inningHalf ? (g.linescore.inningHalf.toLowerCase() as 'top' | 'bottom') : null,
        })
      }
    }
    return games
  } catch {
    return []
  }
}

/** getGamesForDate(date) is unchanged and still MLB-only (sportId=1) —
 *  it's a thin wrapper over the function above now, purely so existing
 *  callers don't need to change. */
export async function getGamesForDate(date: string): Promise<DaySlateGame[]> {
  return getGamesForDateAndLevel(date, SPORT_ID_MLB)
}


export async function getDoubleheaderGames(
  date: string,
  homeTeamId: number,
  awayTeamId: number,
): Promise<DoubleheaderGame[]> {
  try {
    const url = `${STATS_API_V1}/schedule?sportId=1&date=${date}&teamId=${homeTeamId}`
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return []
    const data = await res.json()
    const games: DoubleheaderGame[] = []
    for (const dateEntry of data.dates ?? []) {
      for (const g of dateEntry.games ?? []) {
        const home = g.teams?.home?.team?.id
        const away = g.teams?.away?.team?.id
        const matches =
          (home === homeTeamId && away === awayTeamId) ||
          (home === awayTeamId && away === homeTeamId)
        if (!matches) continue
        games.push({
          gamePk: g.gamePk,
          gameNumber: g.gameNumber ?? 1,
          status: g.status?.abstractGameState ?? 'Preview',
          gameDate: g.gameDate,
        })
      }
    }
    return games.sort((a, b) => a.gameNumber - b.gameNumber)
  } catch {
    return []
  }
}

