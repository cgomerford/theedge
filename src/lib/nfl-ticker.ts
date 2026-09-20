// src/lib/nfl-ticker.ts
//
// Ticker-shaped NFL games for the homepage sport-switchable ticker —
// mirrors getTodayTickerGames()'s TickerGame shape (src/lib/mlb.ts) so
// SportLiveTicker can render either sport through one shared component.
//
// Built on the CONFIRMED signature getNFLWeekSchedule(season, week) →
// NFLGame[] (per the comment in src/lib/nfl/leaders.ts: "function returns
// parsed NFLGame objects without the raw leaders data").
//
// NOT VERIFIED: how "the current NFL week" is determined elsewhere in the
// app. Rather than guess a week-of-season formula that could be silently
// wrong, this function takes season/week as explicit params — wire it to
// whatever real current-week source NFLSubHeader.tsx (or similar) already
// uses, in the page that calls this.

import { getNFLWeekSchedule, type NFLGame } from './nfl-schedule'

export type NflTickerGame = {
  slug: string
  awayAbbr: string
  homeAbbr: string
  awayLogo: string
  homeLogo: string
  awayScore: number | null
  homeScore: number | null
  status: 'scheduled' | 'live' | 'final'
  statusDisplay: string
}

function mapStatus(s: NFLGame['status']): NflTickerGame['status'] {
  if (s === 'in_progress') return 'live'
  if (s === 'final') return 'final'
  return 'scheduled'
}

export async function getNflTickerGames(season: number, week: number): Promise<NflTickerGame[]> {
  try {
    // getNFLWeekSchedule returns NFLWeek | null — NOT NFLGame[] directly.
    // Corrected after a real type error; the games live at .games.
    const nflWeek = await getNFLWeekSchedule(season, week)
    const games: NFLGame[] = nflWeek?.games ?? []
    return games.map((g: NFLGame): NflTickerGame => ({
      slug: g.slug,
      awayAbbr: g.awayTeam.abbreviation,
      homeAbbr: g.homeTeam.abbreviation,
      awayLogo: g.awayTeam.logo,
      homeLogo: g.homeTeam.logo,
      awayScore: g.awayScore,
      homeScore: g.homeScore,
      status: mapStatus(g.status),
      statusDisplay: g.statusDisplay,
    }))
  } catch (e) {
    console.error(`getNflTickerGames(season ${season}, week ${week}) error:`, e)
    return []
  }
}