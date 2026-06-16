const MLB_API = 'https://statsapi.mlb.com/api/v1'

// ============================================================
// TYPES
// ============================================================
export type LineupBatter = {
  player_id: number
  player_name: string
  position: string
  batting_order: number  // 1-9
  season_avg: number | null
  season_obp: number | null
  season_ops: number | null
  bat_side?: 'L' | 'R' | null
}
export type ProjectedLineup = {
  source: 'confirmed' | 'projected_from_previous_game' | 'unavailable'
  game_date_used: string | null  // when the lineup was last seen (null if unavailable)
  game_pk_used: number | null
  batters: LineupBatter[]
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function getProjectedLineup(
  teamId: number,
  gameDate: string,  // YYYY-MM-DD
  currentGamePk?: number  // optional — pass current game's gamePk to check for confirmed lineup first
): Promise<ProjectedLineup> {
  try {
    // Try 1: Check if today's lineup is confirmed
    if (currentGamePk) {
      const confirmed = await getLineupFromGame(currentGamePk, teamId)
      if (confirmed && confirmed.length === 9) {
        const batters = await enrichBattersWithStats(confirmed)
        return {
          source: 'confirmed',
          game_date_used: gameDate,
          game_pk_used: currentGamePk,
          batters,
        }
      }
    }

    // Try 2: Get yesterday's lineup as fallback
    const previousGame = await findLastCompletedGame(teamId, gameDate)
    if (!previousGame) {
      return {
        source: 'unavailable',
        game_date_used: null,
        game_pk_used: null,
        batters: [],
      }
    }

    const previousLineup = await getLineupFromGame(previousGame.gamePk, teamId)
    if (!previousLineup || previousLineup.length === 0) {
      return {
        source: 'unavailable',
        game_date_used: null,
        game_pk_used: null,
        batters: [],
      }
    }

    const batters = await enrichBattersWithStats(previousLineup)
    return {
      source: 'projected_from_previous_game',
      game_date_used: previousGame.gameDate,
      game_pk_used: previousGame.gamePk,
      batters,
    }
  } catch (err) {
    console.error(`Lineup fetch failed for team ${teamId}:`, err)
    return {
      source: 'unavailable',
      game_date_used: null,
      game_pk_used: null,
      batters: [],
    }
  }
}

// ============================================================
// HELPERS
// ============================================================

// Find the most recent completed game for a team before a given date
async function findLastCompletedGame(
  teamId: number,
  beforeDate: string
): Promise<{ gamePk: number; gameDate: string } | null> {
  // Look back up to 14 days for last game (covers off-days, all-star break, etc.)
  const before = new Date(beforeDate + 'T00:00:00Z')
  const startDate = new Date(before)
  startDate.setDate(startDate.getDate() - 14)
  
  const startStr = startDate.toISOString().split('T')[0]
  const endStr = new Date(before.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]  // yesterday

  const url = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${startStr}&endDate=${endStr}&hydrate=team`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const data = await res.json()

  // Flatten all games from all dates
  const allGames: any[] = []
  for (const dateBlock of data.dates ?? []) {
    for (const game of dateBlock.games ?? []) {
      allGames.push(game)
    }
  }

  // Filter to completed games (Final status, no postponements)
  const completedGames = allGames.filter(g => {
    const state = g.status?.abstractGameState
    const detailed = g.status?.detailedState ?? ''
    if (state !== 'Final') return false
    if (['Postponed', 'Cancelled', 'Suspended'].some(s => detailed.includes(s))) return false
    return true
  })

  if (completedGames.length === 0) return null

  // Sort descending by date, return most recent
  completedGames.sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))
  
  return {
    gamePk: completedGames[0].gamePk,
    gameDate: completedGames[0].officialDate ?? completedGames[0].gameDate?.split('T')[0] ?? '',
  }
}

// Get the lineup (starting 9 batters in order) for a specific team in a specific game
async function getLineupFromGame(
  gamePk: number,
  teamId: number
): Promise<LineupBatter[] | null> {
  const url = `${MLB_API}/game/${gamePk}/boxscore`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const data = await res.json()

  // Determine if team is home or away
  const homeId = data.teams?.home?.team?.id
  const awayId = data.teams?.away?.team?.id
  
  let teamData: any = null
  if (homeId === teamId) teamData = data.teams.home
  else if (awayId === teamId) teamData = data.teams.away
  else return null

  // Get batting order — array of player IDs in batting order
  const battingOrder: number[] = teamData.battingOrder ?? []
  if (battingOrder.length === 0) return null

  // Get player details from the players object
  const players = teamData.players ?? {}
  
  const batters: LineupBatter[] = []
  for (let i = 0; i < battingOrder.length && batters.length < 9; i++) {
    const playerId = battingOrder[i]
    const playerKey = `ID${playerId}`
    const player = players[playerKey]
    if (!player) continue

    batters.push({
      player_id: playerId,
      player_name: player.person?.fullName ?? 'Unknown',
      position: player.position?.abbreviation ?? '',
      batting_order: i + 1,
      season_avg: null,  // populated by enrichBattersWithStats
      season_obp: null,
      season_ops: null,
    })
  }

  return batters.length > 0 ? batters : null
}

async function enrichBattersWithStats(batters: LineupBatter[]): Promise<LineupBatter[]> {
  const year = new Date().getFullYear()
  
  const enriched = await Promise.all(
    batters.map(async (batter) => {
      try {
        const url = `${MLB_API}/people/${batter.player_id}/stats?stats=season&group=hitting&season=${year}`
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (!res.ok) return batter
        const data = await res.json()
        
        const stat = data.stats?.[0]?.splits?.[0]?.stat
        if (!stat) return batter

        return {
          ...batter,
          season_avg: stat.avg ? parseFloat(stat.avg) : null,
          season_obp: stat.obp ? parseFloat(stat.obp) : null,
          season_ops: stat.ops ? parseFloat(stat.ops) : null,
        }
      } catch {
        return batter
      }
    })
  )

  return enriched
}