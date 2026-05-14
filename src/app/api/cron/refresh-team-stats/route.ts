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
  const validSecrets = [
    process.env.CRON_SECRET,
    process.env.EDGE_CRON_AUTH,
  ].filter(Boolean)

  const isValid = validSecrets.some(secret =>
    authHeader === `Bearer ${secret}`
  )

  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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

// ============================================================
// Convert "5.1" IP string to decimal (5.1 → 5.333)
// MLB uses .1 = 1 out, .2 = 2 outs notation
// ============================================================
function parseInnings(ip: string | number | null | undefined): number {
  if (ip === null || ip === undefined) return 0
  const str = String(ip)
  const parts = str.split('.')
  const full = parseInt(parts[0] ?? '0')
  const outs = parseInt(parts[1] ?? '0')
  return full + outs / 3
}

// ============================================================
// Fetch real bullpen innings from yesterday's boxscore
// Hydrates pitchers from the actual game log
// ============================================================
async function fetchBullpenInnings(teamId: number, gamePk: number): Promise<{
  bullpen_ip: number
  closer_available: boolean
  setup1_available: boolean
  setup2_available: boolean
}> {
  try {
    const boxUrl = `${MLB_API}/game/${gamePk}/boxscore`
    const boxRes = await fetch(boxUrl)
    if (!boxRes.ok) return { bullpen_ip: 0, closer_available: true, setup1_available: true, setup2_available: true }

    const box = await boxRes.json()

    // Determine if this team was home or away
    const homeId = box.teams?.home?.team?.id
    const teamSide = homeId === teamId ? 'home' : 'away'
    const teamBox = box.teams?.[teamSide]

    if (!teamBox) return { bullpen_ip: 0, closer_available: true, setup1_available: true, setup2_available: true }

    const pitchers: any[] = teamBox.pitchers ?? []
    const allPitcherIds: number[] = pitchers

    // Get pitcher details from the boxscore
    const playerEntries = Object.entries(teamBox.players ?? {})

    // Find starter — first pitcher listed
    const starterIndex = 0
    let bullpen_ip = 0
    let relievers: { id: number; ip: number; pitches: number }[] = []

    allPitcherIds.forEach((pitcherId, index) => {
      const playerKey = `ID${pitcherId}`
      const player = (teamBox.players ?? {})[playerKey]
      const pitchingStats = player?.stats?.pitching ?? {}
      const ip = parseInnings(pitchingStats.inningsPitched)
      const pitches = parseInt(pitchingStats.numberOfPitches ?? '0')

      if (index === starterIndex) {
        // Starter — don't count toward bullpen
        return
      }

      // This is a reliever
      bullpen_ip += ip
      relievers.push({ id: pitcherId, ip, pitches })
    })

    // Availability heuristic:
    // - Closer (last reliever who pitched): unavailable if threw >25 pitches yesterday
    // - Setup arms: unavailable if threw >20 pitches yesterday
    // - Anyone with 2+ IP yesterday is considered unavailable
    const sortedRelievers = [...relievers].sort((a, b) => b.id - a.id) // rough order

    const closerUsage = sortedRelievers[0]
    const setup1Usage = sortedRelievers[1]
    const setup2Usage = sortedRelievers[2]

    const closer_available = !closerUsage || (closerUsage.pitches <= 25 && closerUsage.ip < 2)
    const setup1_available = !setup1Usage || (setup1Usage.pitches <= 20 && setup1Usage.ip < 2)
    const setup2_available = !setup2Usage || (setup2Usage.pitches <= 20 && setup2Usage.ip < 2)

    console.log(`  Team ${teamId} bullpen: ${bullpen_ip.toFixed(1)} IP, closer=${closer_available}, s1=${setup1_available}, s2=${setup2_available}`)

    return {
      bullpen_ip: Math.round(bullpen_ip * 10) / 10,
      closer_available,
      setup1_available,
      setup2_available,
    }
  } catch (err) {
    console.error(`Bullpen fetch failed for game ${gamePk}:`, err)
    return { bullpen_ip: 0, closer_available: true, setup1_available: true, setup2_available: true }
  }
}

async function fetchTeamStats(teamId: number, teamName: string) {
  try {
    const today_str = new Date().toISOString().split('T')[0]
    const thirty_days_ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  // Check both yesterday and 2 days ago to catch late West Coast finishes
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Fetch L30 hitting stats
    const hittingUrl = `${MLB_API}/teams/${teamId}/stats?stats=byDateRange&group=hitting&season=${SEASON}&startDate=${thirty_days_ago}&endDate=${today_str}`
    const hittingRes = await fetch(hittingUrl)
    const hittingData = hittingRes.ok ? await hittingRes.json() : null

    // Fetch season pitching stats (bullpen ERA proxy)
    const pitchingUrl = `${MLB_API}/teams/${teamId}/stats?stats=season&group=pitching&season=${SEASON}`
    const pitchingRes = await fetch(pitchingUrl)
    const pitchingData = pitchingRes.ok ? await pitchingRes.json() : null

    // Fetch yesterday's game schedule to get gamePk
    const yesterdayUrl = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${twoDaysAgo}&endDate=${yesterday}&hydrate=team`
    const yesterdayRes = await fetch(yesterdayUrl)
    const yesterdayData = yesterdayRes.ok ? await yesterdayRes.json() : null

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
      bullpen_era = stat.era ? parseFloat(stat.era) : null
    }

    // Find yesterday's completed game and fetch real bullpen data
    let bullpen_innings_yesterday = 0
    let closer_available = true
    let setup1_available = true
    let setup2_available = true
    let last_game_date = null

    for (const block of yesterdayData?.dates ?? []) {
      for (const g of block.games ?? []) {
        if (g.status?.abstractGameState !== 'Final') continue
        last_game_date = g.officialDate ?? g.gameDate?.split('T')[0]

        // Fetch real bullpen innings from boxscore
        const bullpenData = await fetchBullpenInnings(teamId, g.gamePk)
        bullpen_innings_yesterday = bullpenData.bullpen_ip
        closer_available = bullpenData.closer_available
        setup1_available = bullpenData.setup1_available
        setup2_available = bullpenData.setup2_available
      }
    }

    return {
      team_id: teamId,
      team_name: teamName,
      season: SEASON,

      // Offense (L30)
      wrc_plus_l30: null,
      runs_per_game_l30,
      ops_l30,
      woba_l30: null,

      // Splits
      wrc_plus_vs_lhp: null,
      wrc_plus_vs_rhp: null,

      // Defense
      oaa: null,
      drs: null,
      defensive_efficiency: null,

      // Bullpen — now using real game log data
      bullpen_wpa_li: null,
      bullpen_era,
      bullpen_innings_yesterday,
      closer_available,
      setup1_available,
      setup2_available,

      // Schedule
      last_game_date,
      consecutive_road_games: 0,

      updated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`Failed to fetch team ${teamId}:`, err)
    return null
  }
}