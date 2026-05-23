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

// ============================================================
// MONTH SUMMARY — for the dashboard strip above the calendar
// ============================================================

export type MonthSummary = {
  wins: number
  losses: number
  current_streak: { type: 'W' | 'L' | null; count: number }
  best_win: CalendarGame | null   // biggest run-diff win this month
  worst_loss: CalendarGame | null // biggest run-diff loss this month
  model_correct: number
  model_total: number
  model_accuracy_pct: number | null
}

export function summarizeMonth(games: CalendarGame[]): MonthSummary {
  // Sort by date ascending for streak calc
  const sortedByDate = [...games].sort((a, b) =>
    a.game_date.localeCompare(b.game_date)
  )

  let wins = 0
  let losses = 0
  let modelCorrect = 0
  let modelTotal = 0

  let bestWin: CalendarGame | null = null
  let worstLoss: CalendarGame | null = null

  for (const g of sortedByDate) {
    if (g.team_won === true) {
      wins++
      const diff = (g.team_score ?? 0) - (g.opponent_score ?? 0)
      const bestDiff = bestWin ? (bestWin.team_score ?? 0) - (bestWin.opponent_score ?? 0) : -Infinity
      if (diff > bestDiff) bestWin = g
    } else if (g.team_won === false) {
      losses++
      const diff = (g.opponent_score ?? 0) - (g.team_score ?? 0)
      const worstDiff = worstLoss
        ? (worstLoss.opponent_score ?? 0) - (worstLoss.team_score ?? 0)
        : -Infinity
      if (diff > worstDiff) worstLoss = g
    }

    if (g.was_correct === true) {
      modelCorrect++
      modelTotal++
    } else if (g.was_correct === false) {
      modelTotal++
    }
  }

  // Current streak — walk backward from most recent played game
  const playedDescending = [...sortedByDate]
    .filter(g => g.team_won !== null)
    .reverse()

  let streakType: 'W' | 'L' | null = null
  let streakCount = 0
  for (const g of playedDescending) {
    if (g.team_won === null) continue
    const thisResult: 'W' | 'L' = g.team_won ? 'W' : 'L'
    if (streakType === null) {
      streakType = thisResult
      streakCount = 1
    } else if (streakType === thisResult) {
      streakCount++
    } else {
      break
    }
  }

  return {
    wins,
    losses,
    current_streak: { type: streakType, count: streakCount },
    best_win: bestWin,
    worst_loss: worstLoss,
    model_correct: modelCorrect,
    model_total: modelTotal,
    model_accuracy_pct: modelTotal > 0
      ? Math.round((modelCorrect / modelTotal) * 100)
      : null,
  }
}

// ============================================================
// CELL INTENSITY — how dominant was the result?
// Used to drive gradient strength in cell backgrounds.
// Returns a number 0..1 (0 = barely, 1 = dominant blowout)
// ============================================================

export function cellIntensity(game: CalendarGame): number {
  if (game.team_score === null || game.opponent_score === null) return 0
  const diff = Math.abs(game.team_score - game.opponent_score)
  // 1-run game = 0.2, 5-run = 0.7, 9+ run = 1.0
  // Curve plateaus so 8-run and 10-run blowouts look similar
  return Math.min(1, 0.15 + (diff / 10))
}

// Get team ID from cached game data (we need this for logo display)
// Note: gamePk uniquely identifies the game; this is a quick lookup
export function getTeamId(_game: CalendarGame): number | null {
  // The calendar caller passes in the primary team's ID separately
  // This is a placeholder for if we extend CalendarGame to include it later
  return null
}