import { createClient } from '@supabase/supabase-js'
import { getGameFeed } from '../src/lib/game-feed'
import { LEAGUE_BY_TEAM_ID } from '../src/lib/lab'

const TEAM_IDS = Object.keys(LEAGUE_BY_TEAM_ID).map(Number)
const SEASON = new Date().getFullYear()
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

// Only need the last ~10 days of games — this table rolls forward nightly,
// no reason to walk the full season like bullpen-usage.ts does.
function recentDates(days: number): string[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

async function recentFinalGamePks(teamId: number): Promise<number[]> {
  const dates = recentDates(11)
  const from = dates[dates.length - 1], to = dates[0]
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${from}&endDate=${to}`)
  if (!res.ok) { console.error(`[compute-pitcher-workload] schedule HTTP ${res.status} for team ${teamId}`); return [] }
  const j = await res.json()
  return (j.dates ?? []).flatMap((d: any) => (d.games ?? []).filter((g: any) => g.status?.abstractGameState === 'Final').map((g: any) => g.gamePk as number))
}

async function main() {
  const lookbackDates = new Set(recentDates(10))

  for (const teamId of TEAM_IDS) {
    // Every finished game of the last ~10 days, whatever its type. This used to read the regular season only (getSeasonGamePks asks for gameType=R),
    // so postseason games never reached the table and a postseason bullpen looked fully rested. The schedule call below has no gameType, so it
    // returns regular-season and postseason games alike.
    const gamePks = await recentFinalGamePks(teamId)

    const feeds = await Promise.all(gamePks.map(gamePk => getGameFeed(gamePk)))

    const pitchMap = new Map<number, Map<string, number>>()
    const nameMap = new Map<number, string>()

    gamePks.forEach((gamePk, idx) => {
      const data: any = feeds[idx]
      if (!data) return
      const isTeamHome = data.gameData.teams.home.id === teamId
      const isTeamAway = data.gameData.teams.away.id === teamId
      if (!isTeamHome && !isTeamAway) return

      const officialDate = data.gameData?.datetime?.officialDate
      if (!officialDate || !lookbackDates.has(officialDate)) return

      for (const play of data.liveData.plays.allPlays) {
        const teamIsPitching = (play.about.halfInning === 'top' && isTeamHome) || (play.about.halfInning === 'bottom' && isTeamAway)
        if (!teamIsPitching) continue

        const pitchCount = play.playEvents.filter((e: any) => e.isPitch).length
        if (pitchCount === 0) continue

        const pid = play.matchup.pitcher.id
        nameMap.set(pid, play.matchup.pitcher.fullName)
        if (!pitchMap.has(pid)) pitchMap.set(pid, new Map())
        const dayMap = pitchMap.get(pid)!
        dayMap.set(officialDate, (dayMap.get(officialDate) ?? 0) + pitchCount)
      }
    })

    const rows = [...pitchMap.entries()].flatMap(([playerId, dayMap]) =>
      [...dayMap.entries()].map(([gameDate, pitches]) => ({
        team_id: teamId, season: SEASON, player_id: playerId,
        player_name: nameMap.get(playerId) ?? `Player ${playerId}`,
        game_date: gameDate, pitches,
      }))
    )

    console.log(`Team ${teamId}: ${rows.length} pitcher-day rows. Sample:`, rows[0])
    console.log(`Upserting ${rows.length} rows for team ${teamId}. Ctrl+C within 5s to abort.`)
    await new Promise(r => setTimeout(r, 5000))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('pitcher_workload_daily')
        .upsert(rows, { onConflict: 'team_id,season,player_id,game_date' })
      if (error) console.error(`Team ${teamId} upsert failed:`, error.message)
    }
  }
  console.log('Done.')
}

main()