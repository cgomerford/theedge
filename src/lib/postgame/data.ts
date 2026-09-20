// src/lib/postgame/data.ts
//
// One shared, cached fetch for everything the new Postgame report reads about a final
// game: the live feed (box score, plays, pitches, linescore), the per-play win
// probability, and the series status. Every section derives from this one object, so
// the page pulls each endpoint once. Final games never change, so it is cached hard.
// Shapes below list only the fields read; each was confirmed against real responses
// (game 824383 / 824225): winProbability entries carry `homeTeamWinProbability` and
// `homeTeamWinProbabilityAdded` (percentage points), schedule?hydrate=seriesStatus gives
// `seriesStatus.result` ("CLE leads 1-0").

import { cache } from 'react'

const V1 = 'https://statsapi.mlb.com/api/v1'
const V11 = 'https://statsapi.mlb.com/api/v1.1'

export interface PFEvent {
  index?: number
  isPitch?: boolean
  pitchNumber?: number
  details?: { call?: { description?: string; code?: string }; type?: { code?: string; description?: string }; event?: string; hasReview?: boolean }
  pitchData?: { startSpeed?: number; strikeZoneTop?: number; strikeZoneBottom?: number; zone?: number; coordinates?: { pX?: number; pZ?: number; x0?: number; z0?: number } }
  hitData?: { launchSpeed?: number; launchAngle?: number; totalDistance?: number; trajectory?: string; coordinates?: { coordX?: number; coordY?: number } }
  reviewDetails?: { isOverturned?: boolean; reviewType?: string; challengeTeamId?: number; player?: { id: number; fullName: string } }
  count?: { balls?: number; strikes?: number; outs?: number }
}
export interface PFRunner {
  movement: { start?: string | null; end?: string | null; isOut?: boolean | null }
  details: { event?: string; eventType?: string; runner: { id: number; fullName: string }; isScoringEvent?: boolean; teamUnearned?: boolean; playIndex?: number }
  credits?: { player: { id: number }; position?: { abbreviation?: string }; credit?: string }[]
}
export interface PFPlay {
  result: { eventType?: string; event?: string; description?: string; rbi?: number; awayScore?: number; homeScore?: number }
  about: { atBatIndex: number; inning: number; isTopInning: boolean; hasReview?: boolean; isScoringPlay?: boolean }
  count: { balls: number; strikes: number; outs: number }
  matchup: { batter: { id: number; fullName: string }; pitcher: { id: number; fullName: string }; batSide?: { code?: string }; pitchHand?: { code?: string } }
  runners?: PFRunner[]
  playEvents?: PFEvent[]
}
export interface PFPlayer {
  person: { id: number; fullName: string }
  position?: { abbreviation?: string }
  battingOrder?: string
  stats?: { batting?: Record<string, string | number | undefined>; pitching?: Record<string, string | number | undefined> }
}
export interface PFBoxTeam { team: { id: number; name: string }; players: Record<string, PFPlayer>; batters?: number[]; pitchers?: number[] }
export interface PFLineTeam { runs?: number; hits?: number; errors?: number; leftOnBase?: number }
export interface PFAbsSide { usedSuccessful?: number; usedFailed?: number; remaining?: number }
export interface PFFeed {
  gamePk: number
  gameData: {
    datetime?: { officialDate?: string; dateTime?: string }
    teams: { away: { id: number; name: string; abbreviation?: string }; home: { id: number; name: string; abbreviation?: string } }
    venue?: { name?: string }
    weather?: { condition?: string; temp?: string; wind?: string }
    gameInfo?: { attendance?: number; gameDurationMinutes?: number }
    absChallenges?: { hasChallenges?: boolean; away?: PFAbsSide; home?: PFAbsSide }
  }
  liveData: {
    plays: { allPlays: PFPlay[] }
    linescore: { innings?: { num: number; away?: { runs?: number }; home?: { runs?: number } }[]; teams?: { away?: PFLineTeam; home?: PFLineTeam } }
    boxscore: { teams: { away: PFBoxTeam; home: PFBoxTeam }; officials?: { officialType: string; official: { fullName: string } }[] }
    decisions?: { winner?: { id?: number; fullName: string }; loser?: { id?: number; fullName: string }; save?: { id?: number; fullName: string } }
  }
}
export interface WpEntry {
  atBatIndex: number
  homeTeamWinProbability: number       // 0–100, after the play
  awayTeamWinProbability: number
  homeTeamWinProbabilityAdded?: number // percentage points the play moved the home side
  leverageIndex?: number               // MLB's leverage index for the plate appearance (1.0 = average)
  about: { inning: number; halfInning?: string; isTopInning?: boolean; hasReview?: boolean }
  result: { eventType?: string; event?: string; description?: string; awayScore?: number; homeScore?: number }
  matchup?: { batter?: { id: number; fullName: string }; pitcher?: { id: number; fullName: string } }
}
export type SeriesText = { result: string; gameNumber: number | null; totalGames: number | null } | null

export type PostData = { feed: PFFeed; wp: WpEntry[]; series: SeriesText }

async function getJson<T>(url: string, label: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) { console.error(`[getPostData] ${label} HTTP ${res.status}`); return null }
    return (await res.json()) as T
  } catch (err) {
    console.error(`[getPostData] ${label} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

export const getPostData = cache(async (gamePk: number): Promise<PostData | null> => {
  const [feed, wp, sched] = await Promise.all([
    getJson<PFFeed>(`${V11}/game/${gamePk}/feed/live`, 'feed'),
    getJson<WpEntry[]>(`${V1}/game/${gamePk}/winProbability`, 'winProbability'),
    getJson<{ dates?: { games?: { seriesStatus?: { result?: string; gameNumber?: number; totalGames?: number } }[] }[] }>(`${V1}/schedule?gamePk=${gamePk}&hydrate=seriesStatus`, 'series'),
  ])
  if (!feed) return null
  const ss = sched?.dates?.[0]?.games?.[0]?.seriesStatus
  return {
    feed,
    wp: Array.isArray(wp) ? wp.filter((e) => e.atBatIndex != null && e.homeTeamWinProbability != null).sort((a, b) => a.atBatIndex - b.atBatIndex) : [],
    series: ss?.result ? { result: ss.result, gameNumber: ss.gameNumber ?? null, totalGames: ss.totalGames ?? null } : null,
  }
})
