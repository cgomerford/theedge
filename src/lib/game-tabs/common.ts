// Shared loaders for the game tabs: the series' games (from the schedule), and one game's boxscore / feed.
import { mlb, mlb11 } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { cache } from 'react'

export type SeriesGame = {
  gamePk: number; date: string; gameDateUtc: string; state: string; final: boolean; gameNumber: number | null
  venue: string; awayId: number; homeId: number; awayAbbr: string; homeAbbr: string; awayScore: number | null; homeScore: number | null
  ifNecessary: boolean; seriesDescription: string | null; gamesInSeries: number | null
}
type SchedGame = {
  gamePk: number; gameDate: string; officialDate?: string; seriesGameNumber?: number; seriesDescription?: string; gamesInSeries?: number; gameType?: string; ifNecessary?: string
  status?: { abstractGameState?: string }
  venue?: { name?: string }
  teams: { away: { team: { id: number; abbreviation?: string }; score?: number }; home: { team: { id: number; abbreviation?: string }; score?: number } }
}
const shift = (d: string, by: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + by); return x.toISOString().slice(0, 10) }

/** Every game of this series (same two clubs, same round) within 12 days either side of the game date, oldest first. */
export const getSeriesList = cache(async (awayId: number, homeId: number, gameDate: string, gamePk: number): Promise<SeriesGame[]> => {
  const r = await mlb<{ dates?: { games: SchedGame[] }[] }>(`/schedule?sportId=1&teamId=${homeId}&startDate=${shift(gameDate, -12)}&endDate=${shift(gameDate, 12)}&hydrate=team,venue`)
  const all = (r?.dates ?? []).flatMap(d => d.games)
  const me = all.find(g => g.gamePk === gamePk)
  const pair = (g: SchedGame) => [g.teams.away.team.id, g.teams.home.team.id].sort().join('-') === [awayId, homeId].sort().join('-')
  return all.filter(g => pair(g) && (!me?.seriesDescription || g.seriesDescription === me.seriesDescription)).map(g => ({
    gamePk: g.gamePk, date: g.officialDate ?? g.gameDate.slice(0, 10), gameDateUtc: g.gameDate, state: g.status?.abstractGameState ?? '', final: g.status?.abstractGameState === 'Final',
    gameNumber: g.seriesGameNumber ?? null, venue: g.venue?.name ?? '', awayId: g.teams.away.team.id, homeId: g.teams.home.team.id,
    awayAbbr: g.teams.away.team.abbreviation ?? '', homeAbbr: g.teams.home.team.abbreviation ?? '',
    awayScore: g.teams.away.score ?? null, homeScore: g.teams.home.score ?? null, ifNecessary: g.ifNecessary === 'Y', seriesDescription: g.seriesDescription ?? null, gamesInSeries: g.gamesInSeries ?? null,
  })).sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc))
})

export type BoxPlayer = { person?: { id?: number; fullName?: string }; position?: { abbreviation?: string }; battingOrder?: string; stats?: { batting?: Record<string, number | string>; pitching?: Record<string, number | string> } }
export type BoxTeam = { team?: { id: number; abbreviation?: string }; pitchers?: number[]; battingOrder?: number[]; players?: Record<string, BoxPlayer>; teamStats?: { batting?: Record<string, number | string>; pitching?: Record<string, number | string> } }
export type Box = { teams?: { away?: BoxTeam; home?: BoxTeam } }
export const getBox = cache(async (pk: number) => mlb<Box>(`/game/${pk}/boxscore`))

export type Feed = {
  gameData?: { weather?: { condition?: string; temp?: string; wind?: string }; venue?: { name?: string; fieldInfo?: { roofType?: string } } }
  liveData?: {
    linescore?: { innings?: { num: number; away?: { runs?: number }; home?: { runs?: number } }[]; teams?: { away?: { runs?: number; hits?: number; errors?: number }; home?: { runs?: number; hits?: number; errors?: number } } }
    decisions?: { winner?: { id: number; fullName: string }; loser?: { id: number; fullName: string }; save?: { id: number; fullName: string } }
    boxscore?: { officials?: { officialType?: string; official?: { fullName?: string } }[]; teams?: { away?: BoxTeam; home?: BoxTeam } }
  }
}
export const getFeed = cache(async (pk: number) => mlb11<Feed>(`/game/${pk}/feed/live`))
