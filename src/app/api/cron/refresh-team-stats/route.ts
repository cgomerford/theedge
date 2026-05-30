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

// ============================================================
// Convert "5.1" IP string to decimal (5.1 → 5.333)
// ============================================================
function parseInnings(ip: string | number | null | undefined): number {
  if (ip === null || ip === undefined) return 0
  const str = String(ip)
  const parts = str.split('.')
  const full = parseInt(parts[0] ?? '0')
  const outs = parseInt(parts[1] ?? '0')
  return full + outs / 3
}

// Convert decimal innings (3.333) back to baseball notation (3.1)
// In baseball: .1 = 1 out, .2 = 2 outs, never .3/.4/.5 etc
function toBaseballIP(decimalIP: number): number {
  const full = Math.floor(decimalIP)
  const outs = Math.round((decimalIP - full) * 3)
  return parseFloat(`${full}.${outs}`)
}

// ============================================================
// VENUE COORDINATES for travel distance calculation
// Haversine distance between two lat/lng points
// ============================================================
const VENUE_COORDS: Record<number, { lat: number; lng: number; tz: number }> = {
  108: { lat: 33.4453, lng: -112.0667, tz: -2 }, // ARI - Chase Field
  109: { lat: 33.8903, lng: -84.4681, tz: 0 },   // ATL - Truist Park
  110: { lat: 39.2838, lng: -76.6216, tz: 0 },   // BAL - Camden Yards
  111: { lat: 42.3467, lng: -71.0972, tz: 0 },   // BOS - Fenway Park
  112: { lat: 41.9484, lng: -87.6553, tz: -1 },  // CHC - Wrigley Field
  113: { lat: 41.8300, lng: -87.6339, tz: -1 },  // CWS - Guaranteed Rate
  114: { lat: 39.0974, lng: -84.5082, tz: 0 },   // CIN - Great American
  115: { lat: 41.4959, lng: -81.6852, tz: 0 },   // CLE - Progressive Field
  116: { lat: 39.7559, lng: -104.9942, tz: -2 }, // COL - Coors Field
  117: { lat: 42.3390, lng: -83.0485, tz: 0 },   // DET - Comerica Park
  118: { lat: 29.7572, lng: -95.3555, tz: -1 },  // HOU - Minute Maid
  119: { lat: 39.0513, lng: -94.4803, tz: -1 },  // KC - Kauffman Stadium
  120: { lat: 33.8003, lng: -117.8827, tz: -3 }, // LAA - Angel Stadium
  121: { lat: 34.0739, lng: -118.2400, tz: -3 }, // LAD - Dodger Stadium
  133: { lat: 37.7516, lng: -122.2005, tz: -3 }, // OAK - Oakland Coliseum
  134: { lat: 40.4468, lng: -79.9581, tz: 0 },   // PIT - PNC Park
  135: { lat: 32.7073, lng: -117.1566, tz: -3 }, // SD - Petco Park
  136: { lat: 47.5914, lng: -122.3326, tz: -3 }, // SEA - T-Mobile Park
  137: { lat: 37.7786, lng: -122.3893, tz: -3 }, // SF - Oracle Park
  138: { lat: 38.6226, lng: -90.1928, tz: -1 },  // STL - Busch Stadium
  139: { lat: 27.7682, lng: -82.6534, tz: 0 },   // TB - Tropicana Field
  140: { lat: 32.7513, lng: -97.0825, tz: -1 },  // TEX - Globe Life
  141: { lat: 44.9818, lng: -93.2775, tz: -1 },  // MIN - Target Field
  142: { lat: 25.7781, lng: -80.2196, tz: 0 },   // MIA - loanDepot Park
  143: { lat: 39.9061, lng: -75.1665, tz: 0 },   // PHI - Citizens Bank
  144: { lat: 40.7570, lng: -73.8458, tz: 0 },   // NYM - Citi Field
  145: { lat: 41.8300, lng: -87.6339, tz: -1 },  // CWS (alt ID)
  146: { lat: 25.7781, lng: -80.2196, tz: 0 },   // MIA (alt ID)
  147: { lat: 40.8296, lng: -73.9262, tz: 0 },   // NYY - Yankee Stadium
  158: { lat: 43.0280, lng: -87.9712, tz: -1 },  // MIL - Am Fam Field
  159: { lat: 36.0867, lng: -115.1761, tz: -3 }, // OAK (Vegas) - if relocated
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

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
// MAIN TEAM FETCH — V3: expanded with sub-factors
// ============================================================
async function fetchTeamStats(teamId: number, teamName: string) {
  try {
    const today_str = new Date().toISOString().split('T')[0]
  const thirty_days_ago = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().split('T')[0]
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // ── 1. L30 Hitting stats ─────────────────────────────────
    const hittingUrl = `${MLB_API}/teams/${teamId}/stats?stats=byDateRange&group=hitting&season=${SEASON}&startDate=${thirty_days_ago}&endDate=${today_str}`
    const hittingRes = await fetch(hittingUrl)
    const hittingData = hittingRes.ok ? await hittingRes.json() : null

    let runs_per_game_l30: number | null = null
    let ops_l30: number | null = null
    let k_pct: number | null = null
    let bb_pct: number | null = null
    let iso: number | null = null
    let stolen_base_pct: number | null = null

    for (const block of hittingData?.stats ?? []) {
      const split = block.splits?.[0]
      if (!split) continue
      const stat = split.stat ?? {}
      const gamesPlayed = parseInt(stat.gamesPlayed ?? '0')
      const runs = parseInt(stat.runs ?? '0')
      runs_per_game_l30 = gamesPlayed > 0 ? Math.round((runs / gamesPlayed) * 100) / 100 : null
      ops_l30 = stat.ops ? parseFloat(stat.ops) : null

      // V3: New offensive sub-factors
      const atBats = parseInt(stat.atBats ?? '0')
      const plateAppearances = parseInt(stat.plateAppearances ?? '0')
      const strikeOuts = parseInt(stat.strikeOuts ?? '0')
      const baseOnBalls = parseInt(stat.baseOnBalls ?? '0')
      const slg = stat.slg ? parseFloat(stat.slg) : null
      const avg = stat.avg ? parseFloat(stat.avg) : null
      const stolenBases = parseInt(stat.stolenBases ?? '0')
      const caughtStealing = parseInt(stat.caughtStealing ?? '0')

      k_pct = plateAppearances > 0 ? Math.round((strikeOuts / plateAppearances) * 1000) / 1000 : null
      bb_pct = plateAppearances > 0 ? Math.round((baseOnBalls / plateAppearances) * 1000) / 1000 : null
      iso = (slg !== null && avg !== null) ? Math.round((slg - avg) * 1000) / 1000 : null
      stolen_base_pct = (stolenBases + caughtStealing) > 0
        ? Math.round((stolenBases / (stolenBases + caughtStealing)) * 1000) / 1000
        : null
    }

    // ── 2. Season pitching stats (bullpen proxy) ─────────────
    const pitchingUrl = `${MLB_API}/teams/${teamId}/stats?stats=season&group=pitching&season=${SEASON}`
    const pitchingRes = await fetch(pitchingUrl)
    const pitchingData = pitchingRes.ok ? await pitchingRes.json() : null

    let bullpen_era: number | null = null
    let bullpen_k_per_9: number | null = null
    let bullpen_hr_per_9: number | null = null

    for (const block of pitchingData?.stats ?? []) {
      const split = block.splits?.[0]
      if (!split) continue
      const stat = split.stat ?? {}
      bullpen_era = stat.era ? parseFloat(stat.era) : null
      // These are team-wide pitching stats (includes starters) — imperfect but directionally right
      bullpen_k_per_9 = stat.strikeoutsPer9Inn ? parseFloat(stat.strikeoutsPer9Inn) : null
      bullpen_hr_per_9 = stat.homeRunsPer9 ? parseFloat(stat.homeRunsPer9) : null
    }

    // ── 3. Season fielding stats → OAA, DRS, errors ─────────
    const fieldingUrl = `${MLB_API}/teams/${teamId}/stats?stats=season&group=fielding&season=${SEASON}`
    const fieldingRes = await fetch(fieldingUrl)
    const fieldingData = fieldingRes.ok ? await fieldingRes.json() : null

    let oaa: number | null = null
    let errors_per_game_l30: number | null = null

    for (const block of fieldingData?.stats ?? []) {
      const split = block.splits?.[0]
      if (!split) continue
      const stat = split.stat ?? {}
      const gp = parseInt(stat.gamesPlayed ?? '0')
      const errors = parseInt(stat.errors ?? '0')
      errors_per_game_l30 = gp > 0 ? Math.round((errors / gp) * 100) / 100 : null
      // MLB API doesn't expose OAA directly — we estimate from fielding pct
      // OAA needs Baseball Savant; this is a proxy
      const fpct = stat.fielding ? parseFloat(stat.fielding) : null
      if (fpct !== null) {
        // Convert fielding pct to OAA-like scale: .985 avg → 0, .990 → +5, .975 → -10
        oaa = Math.round((fpct - 0.985) * 1000)
      }
    }

    // ── 4. Yesterday's bullpen usage (existing logic) ────────
    const yesterdayUrl = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${twoDaysAgo}&endDate=${yesterday}&hydrate=team`
    const yesterdayRes = await fetch(yesterdayUrl)
    const yesterdayData = yesterdayRes.ok ? await yesterdayRes.json() : null

    let bullpen_innings_yesterday = 0
    let closer_available = true
    let setup1_available = true
    let setup2_available = true
    let last_game_date: string | null = null
    let day_after_night = false

    for (const block of yesterdayData?.dates ?? []) {
      for (const g of block.games ?? []) {
        if (g.status?.abstractGameState !== 'Final') continue
        last_game_date = g.officialDate ?? g.gameDate?.split('T')[0] ?? null

        // Check if last game was a night game and today is a day game
        const gameTime = g.gameDate ? new Date(g.gameDate) : null
        if (gameTime) {
          const hourUTC = gameTime.getUTCHours()
          // Night game = started after 22:00 UTC (6pm ET) 
          // This is approximate but catches most cases
          if (hourUTC >= 22 || hourUTC < 2) {
            day_after_night = true // flag it, page logic can check if today's game is a day game
          }
        }

        // Fetch boxscore for bullpen usage
        const bullpenData = await fetchBullpenInnings(teamId, g.gamePk)
        bullpen_innings_yesterday = bullpenData.bullpen_ip
        closer_available = bullpenData.closer_available
        setup1_available = bullpenData.setup1_available
        setup2_available = bullpenData.setup2_available
      }
    }

    // ── 5. Schedule-based rest/travel (V3 new) ───────────────
    // Count games in last 10 days
    const schedUrl = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${tenDaysAgo}&endDate=${today_str}`
    const schedRes = await fetch(schedUrl)
    const schedData = schedRes.ok ? await schedRes.json() : null

    let games_last_10_days = 0
    let consecutive_road_games = 0
    let previous_venue_team_id: number | null = null

    const recentGames: Array<{ date: string; homeTeamId: number; awayTeamId: number }> = []

    for (const block of schedData?.dates ?? []) {
      for (const g of block.games ?? []) {
        if (g.status?.abstractGameState !== 'Final') continue
        games_last_10_days++
        const homeId = g.teams?.home?.team?.id
        const awayId = g.teams?.away?.team?.id
        recentGames.push({
          date: g.officialDate ?? g.gameDate?.split('T')[0] ?? '',
          homeTeamId: homeId,
          awayTeamId: awayId,
        })
      }
    }

    // Count consecutive road games (most recent backwards)
    const sortedRecent = recentGames.sort((a, b) => b.date.localeCompare(a.date))
    for (const g of sortedRecent) {
      if (g.homeTeamId === teamId) break // was at home, streak ends
      consecutive_road_games++
    }

    // Travel distance from last game's venue to today's venue
    let travel_miles_last: number | null = null
    if (sortedRecent.length > 0) {
      const lastGame = sortedRecent[0]
      const lastVenueTeamId = lastGame.homeTeamId // games are played at home team's venue
      const lastCoords = VENUE_COORDS[lastVenueTeamId]
      const homeCoords = VENUE_COORDS[teamId]
      if (lastCoords && homeCoords && lastVenueTeamId !== teamId) {
        travel_miles_last = Math.round(haversineDistance(
          lastCoords.lat, lastCoords.lng,
          homeCoords.lat, homeCoords.lng
        ))
      }
    }

    // ── 6. Bullpen L3 days IP (V3 new) ───────────────────────
    // Sum bullpen innings over last 3 days from schedule
    let bullpen_ip_last_3 = 0
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const sched3Url = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${threeDaysAgo}&endDate=${yesterday}&hydrate=team`
    const sched3Res = await fetch(sched3Url)
    const sched3Data = sched3Res.ok ? await sched3Res.json() : null

    for (const block of sched3Data?.dates ?? []) {
      for (const g of block.games ?? []) {
        if (g.status?.abstractGameState !== 'Final') continue
        const bp = await fetchBullpenInnings(teamId, g.gamePk)
        bullpen_ip_last_3 += bp.bullpen_ip
      }
    }

    return {
      team_id: teamId,
      team_name: teamName,
      season: SEASON,

      // Offense (V2 + V3 expanded)
      runs_per_game_l30,
      ops_l30,
      wrc_plus_l30: null, // needs FanGraphs — keep null for now
      woba_l30: null,     // needs FanGraphs — keep null for now
      wrc_plus_vs_lhp: null,
      wrc_plus_vs_rhp: null,
      k_pct,              // V3 new
      bb_pct,             // V3 new
      iso,                // V3 new
      stolen_base_pct,    // V3 new

      // Defense (V3 — was placeholder)
      oaa,                // V3: now populated (proxy from fielding pct)
      drs: null,          // needs FanGraphs
      defensive_efficiency: null,
      infield_oaa: null,  // needs Baseball Savant positional breakdown
      outfield_oaa: null, // needs Baseball Savant positional breakdown
      errors_per_game_l30, // V3 new

      // Bullpen (V2 + V3 expanded)
      bullpen_era,
      bullpen_wpa_li: null,
      bullpen_innings_yesterday: Math.round(bullpen_innings_yesterday * 10) / 10,
      bullpen_ip_last_3: Math.round(bullpen_ip_last_3 * 10) / 10, // V3 new
      bullpen_k_per_9,    // V3 new
      bullpen_hr_per_9,   // V3 new
      closer_available,
      setup1_available,
      setup2_available,

      // Rest / Travel (V2 + V3 expanded)
      last_game_date,
      consecutive_road_games,
      games_last_10_days,    // V3 new
      travel_miles_last,     // V3 new
      day_after_night,       // V3 new

      updated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`Team stats fetch failed for ${teamName}:`, err)
    return null
  }
}

// ============================================================
// Fetch real bullpen innings from boxscore (unchanged from V2)
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
    const homeId = box.teams?.home?.team?.id
    const teamSide = homeId === teamId ? 'home' : 'away'
    const teamBox = box.teams?.[teamSide]

    if (!teamBox) return { bullpen_ip: 0, closer_available: true, setup1_available: true, setup2_available: true }

    const pitchers: any[] = teamBox.pitchers ?? []
    const allPitcherIds: number[] = pitchers

    let bullpen_ip = 0
    let relievers: { id: number; ip: number; pitches: number }[] = []

    allPitcherIds.forEach((pitcherId, index) => {
      const playerKey = `ID${pitcherId}`
      const player = (teamBox.players ?? {})[playerKey]
      const pitchingStats = player?.stats?.pitching ?? {}
      const ip = parseInnings(pitchingStats.inningsPitched)
      const pitches = parseInt(pitchingStats.numberOfPitches ?? '0')

      if (index === 0) return // starter

      bullpen_ip += ip
      relievers.push({ id: pitcherId, ip, pitches })
    })

    const sortedRelievers = [...relievers].sort((a, b) => b.id - a.id)
    const closerUsage = sortedRelievers[0]
    const setup1Usage = sortedRelievers[1]
    const setup2Usage = sortedRelievers[2]

    return {
      bullpen_ip: Math.round(bullpen_ip * 10) / 10,
      closer_available: !closerUsage || (closerUsage.pitches <= 25 && closerUsage.ip < 2),
      setup1_available: !setup1Usage || (setup1Usage.pitches <= 20 && setup1Usage.ip < 2),
      setup2_available: !setup2Usage || (setup2Usage.pitches <= 20 && setup2Usage.ip < 2),
    }
  } catch (err) {
    console.error(`Bullpen fetch failed for game ${gamePk}:`, err)
    return { bullpen_ip: 0, closer_available: true, setup1_available: true, setup2_available: true }
  }
}