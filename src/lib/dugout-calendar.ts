import { createAdminClient } from '@/lib/supabase'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type CalendarGame = {
  game_date: string         // YYYY-MM-DD (officialDate)
  game_pk: number
  slug: string
  is_home: boolean
  opponent_short: string
  team_score: number | null
  opponent_score: number | null
  team_won: boolean | null      // null = not played yet or postponed
  edge_score: number | null
  predicted_winner: 'home' | 'away' | null
  confidence_tier: string | null
  // Was the model's call right (about the actual winner, not necessarily this team)
  was_correct: boolean | null
  // Did the model favor THIS team?
  model_favored_team: boolean | null
}

function teamSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function shortName(name: string): string {
  const parts = name.split(' ')
  return parts[parts.length - 1]
}

/**
 * Get a team's full month of games + edge predictions.
 *
 * @param teamId    MLB team id (e.g. 143 for Phillies)
 * @param yearMonth 'YYYY-MM' (e.g. '2026-05')
 */
export async function getCalendarMonth(
  teamId: number,
  yearMonth: string,
): Promise<CalendarGame[]> {
  // Compute first and last day of month in UTC
  const [year, month] = yearMonth.split('-').map(n => parseInt(n, 10))
  const firstDay = `${yearMonth}-01`
  const lastDayDate = new Date(Date.UTC(year, month, 0))  // day 0 of next month = last day of this
  const lastDay = lastDayDate.toISOString().split('T')[0]

  // Fetch schedule from MLB API
  const url = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${firstDay}&endDate=${lastDay}&hydrate=team,linescore`
  let games: any[] = []
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) {
      console.error('Calendar: schedule fetch failed', res.status)
      return []
    }
    const data = await res.json()
    for (const dateBlock of data.dates ?? []) {
      for (const g of dateBlock.games ?? []) {
        games.push(g)
      }
    }
  } catch (err) {
    console.error('Calendar: schedule fetch error', err)
    return []
  }

  if (games.length === 0) return []

  // Fetch predictions for all gamePks in one query
  const gamePks = games.map(g => g.gamePk)
  const supa = createAdminClient()
  const { data: predictions } = await supa
    .from('edge_predictions')
    .select('game_pk, edge_score, predicted_winner, confidence_tier, was_correct')
    .in('game_pk', gamePks)

  const predMap = new Map<number, any>()
  for (const p of predictions ?? []) {
    predMap.set(p.game_pk, p)
  }

  // Transform each game into a CalendarGame
  const results: CalendarGame[] = []
  for (const g of games) {
    const isHome = g.teams?.home?.team?.id === teamId
    const homeTeamName = g.teams?.home?.team?.name ?? ''
    const awayTeamName = g.teams?.away?.team?.name ?? ''

    const opponentName = isHome ? awayTeamName : homeTeamName
    const teamScore = isHome ? g.teams?.home?.score : g.teams?.away?.score
    const opponentScore = isHome ? g.teams?.away?.score : g.teams?.home?.score

    const detailedState: string = g.status?.detailedState ?? ''
    const isFinal = g.status?.abstractGameState === 'Final'
    const isPostponed = ['Postponed', 'Cancelled', 'Suspended'].some(s => detailedState.includes(s))

    let teamWon: boolean | null = null
    if (isFinal && !isPostponed && teamScore != null && opponentScore != null) {
      teamWon = teamScore > opponentScore
    }

    const officialDate = g.officialDate ?? g.gameDate?.split('T')[0] ?? ''
    const slug = `${teamSlug(awayTeamName)}-vs-${teamSlug(homeTeamName)}-${officialDate}`

    const pred = predMap.get(g.gamePk)
    const modelFavoredTeam = pred
      ? (pred.predicted_winner === 'home' ? isHome : !isHome)
      : null

    results.push({
      game_date: officialDate,
      game_pk: g.gamePk,
      slug,
      is_home: isHome,
      opponent_short: shortName(opponentName),
      team_score: teamScore ?? null,
      opponent_score: opponentScore ?? null,
      team_won: teamWon,
      edge_score: pred?.edge_score ?? null,
      predicted_winner: pred?.predicted_winner ?? null,
      confidence_tier: pred?.confidence_tier ?? null,
      was_correct: pred?.was_correct ?? null,
      model_favored_team: modelFavoredTeam,
    })
  }

  return results
}