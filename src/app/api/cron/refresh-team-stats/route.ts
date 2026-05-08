import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const SEASON = 2026

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all 30 MLB teams
    const teamsRes = await fetch(`${MLB_API}/teams?sportId=1&season=${SEASON}`)
    const teamsData = await teamsRes.json()
    const teams = (teamsData.teams ?? []).filter((t: any) => t.active && t.sport?.id === 1)

    console.log(`Refreshing stats for ${teams.length} teams`)

    const rows = []
    for (const team of teams) {
      const stats = await fetchTeamStats(team.id, team.name)
      if (stats) rows.push(stats)
    }

    if (rows.length > 0) {
      const { error } = await supa
        .from('team_stats')
        .upsert(rows, { onConflict: 'team_id' })
      
      if (error) throw error
    }

    return NextResponse.json({
      success: true,
      teams_processed: teams.length,
      teams_stored: rows.length,
    })
  } catch (err) {
    console.error('Team stats refresh failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function fetchTeamStats(teamId: number, teamName: string) {
  try {
    const today = new Date()
    const today_str = today.toISOString().split('T')[0]
    const thirty_days_ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Fetch L30 hitting stats
    const hittingUrl = `${MLB_API}/teams/${teamId}/stats?stats=byDateRange&group=hitting&season=${SEASON}&startDate=${thirty_days_ago}&endDate=${today_str}`
    const hittingRes = await fetch(hittingUrl)
    const hittingData = hittingRes.ok ? await hittingRes.json() : null

    // Fetch season pitching stats (for bullpen ERA proxy)
    const pitchingUrl = `${MLB_API}/teams/${teamId}/stats?stats=season&group=pitching&season=${SEASON}`
    const pitchingRes = await fetch(pitchingUrl)
    const pitchingData = pitchingRes.ok ? await pitchingRes.json() : null

    // Fetch yesterday's game (for bullpen rest)
    const yesterdayGameUrl = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&date=${yesterday}&hydrate=team,linescore`
    const yesterdayGameRes = await fetch(yesterdayGameUrl)
    const yesterdayGameData = yesterdayGameRes.ok ? await yesterdayGameRes.json() : null

    // Parse hitting stats (L30)
    let runs_per_game_l30 = null
    let ops_l30 = null
    let games_played_l30 = 0

    for (const block of hittingData?.stats ?? []) {
      const split = block.splits?.[0]
      if (!split) continue
      const stat = split.stat ?? {}
      games_played_l30 = parseInt(stat.gamesPlayed ?? '0')
      const runs = parseInt(stat.runs ?? '0')
      runs_per_game_l30 = games_played_l30 > 0 ? runs / games_played_l30 : null
      ops_l30 = stat.ops ? parseFloat(stat.ops) : null
    }

    // Parse season pitching stats
    let bullpen_era = null
    
    for (const block of pitchingData?.stats ?? []) {
      const split = block.splits?.[0]
      if (!split) continue
      const stat = split.stat ?? {}
      // Use season ERA as bullpen proxy until we get split data
      bullpen_era = stat.era ? parseFloat(stat.era) : null
    }

    // Parse yesterday's game for bullpen rest
    let bullpen_innings_yesterday = 0
    let last_game_date = null

    for (const block of yesterdayGameData?.dates ?? []) {
      for (const g of block.games ?? []) {
        if (g.status?.abstractGameState !== 'Final') continue
        last_game_date = g.officialDate ?? g.gameDate?.split('T')[0]
        // Approximate bullpen innings: 9 - starter's IP (we'd need pitcher logs to be accurate)
        // For V1, conservative estimate of 3 bullpen innings used
        bullpen_innings_yesterday = 3
      }
    }

    return {
      team_id: teamId,
      team_name: teamName,
      season: SEASON,
      
      // Offense (L30)
      wrc_plus_l30: null,  // not available from MLB Stats API
      runs_per_game_l30,
      ops_l30,
      woba_l30: null,
      
      // Splits — V1 leaves null
      wrc_plus_vs_lhp: null,
      wrc_plus_vs_rhp: null,
      
      // Defense — V1 weak proxies, lowered weight handles this
      oaa: null,
      drs: null,
      defensive_efficiency: null,
      
      // Bullpen
      bullpen_wpa_li: null,
      bullpen_era,
      bullpen_innings_yesterday,
      closer_available: bullpen_innings_yesterday < 5,  // crude
      setup1_available: bullpen_innings_yesterday < 5,
      setup2_available: true,  // assume available unless heavy use
      
      // Schedule
      last_game_date,
      consecutive_road_games: 0,  // V1 placeholder
      
      updated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`Failed to fetch team ${teamId}:`, err)
    return null
  }
}