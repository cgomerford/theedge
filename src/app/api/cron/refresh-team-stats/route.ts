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
export const maxDuration = 300 // this route does per-reliever fetches per team — test actual runtime, adjust per your Vercel plan's ceiling

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
// Reliever classification — matches scripts/fetch_bullpen_availability.py
// so "who counts as a reliever" is the same definition everywhere in the app
// ============================================================
const RELIEVER_START_RATIO = 0.3
const MIN_APPEARANCES = 3

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
// MAIN TEAM FETCH — V5: adds fielding_pct (was fetched but never
// saved — see Defense audit) and defensive_efficiency (computable
// from MLB API team pitching totals, doesn't actually need FanGraphs
// the way the old comment assumed)
// ============================================================
async function fetchTeamStats(teamId: number, teamName: string) {
  try {
    const today_str = new Date().toISOString().split('T')[0]
    const thirty_days_ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
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

    // ── 2. Real bullpen-only quality ──────────────────────────
    const bullpenQuality = await fetchBullpenQuality(teamId)

    // ── 2b. Team-wide season pitching totals — V5 new, used ONLY
    // for defensive_efficiency below. Separate from bullpenQuality's
    // per-reliever roster sweep since DER needs whole-staff totals
    // (starters included), not reliever-only numbers.
    const defensiveEfficiency = await fetchDefensiveEfficiency(teamId)

    // ── 3. Fielding stats: errors AND fielding_pct (V5: fielding_pct
    // was fetched here since V3 but never saved to the return row —
    // see Defense audit)
    const fieldingUrl = `${MLB_API}/teams/${teamId}/stats?stats=season&group=fielding&season=${SEASON}`
    const fieldingRes = await fetch(fieldingUrl)
    const fieldingData = fieldingRes.ok ? await fieldingRes.json() : null

    let errors_per_game_l30: number | null = null
    let fielding_pct: number | null = null
    for (const block of fieldingData?.stats ?? []) {
      const split = block.splits?.[0]
      if (!split) continue
      const stat = split.stat ?? {}
      const gp = parseInt(stat.gamesPlayed ?? '0')
      const errors = parseInt(stat.errors ?? '0')
      errors_per_game_l30 = gp > 0 ? Math.round((errors / gp) * 100) / 100 : null
      fielding_pct = stat.fielding ? parseFloat(stat.fielding) : null
    }

    // ── 3b. Real Statcast OAA ──────────────────────────────────
    const defense = await fetchDefenseData(teamId)

    // ── 4. Yesterday's bullpen usage (fatigue tracking) ──────
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

        const gameTime = g.gameDate ? new Date(g.gameDate) : null
        if (gameTime) {
          const hourUTC = gameTime.getUTCHours()
          if (hourUTC >= 22 || hourUTC < 2) {
            day_after_night = true
          }
        }

        const bullpenData = await fetchBullpenInnings(teamId, g.gamePk)
        bullpen_innings_yesterday = bullpenData.bullpen_ip
        closer_available = bullpenData.closer_available
        setup1_available = bullpenData.setup1_available
        setup2_available = bullpenData.setup2_available
      }
    }

    // ── 5. Schedule-based rest/travel ────────────────────────
    const schedUrl = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${tenDaysAgo}&endDate=${today_str}`
    const schedRes = await fetch(schedUrl)
    const schedData = schedRes.ok ? await schedRes.json() : null

    let games_last_10_days = 0
    let consecutive_road_games = 0

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

    const sortedRecent = recentGames.sort((a, b) => b.date.localeCompare(a.date))
    for (const g of sortedRecent) {
      if (g.homeTeamId === teamId) break
      consecutive_road_games++
    }

    let travel_miles_last: number | null = null
    if (sortedRecent.length > 0) {
      const lastGame = sortedRecent[0]
      const lastVenueTeamId = lastGame.homeTeamId
      const lastCoords = VENUE_COORDS[lastVenueTeamId]
      const homeCoords = VENUE_COORDS[teamId]
      if (lastCoords && homeCoords && lastVenueTeamId !== teamId) {
        travel_miles_last = Math.round(haversineDistance(
          lastCoords.lat, lastCoords.lng,
          homeCoords.lat, homeCoords.lng
        ))
      }
    }

    // ── 6. Bullpen L3 days IP ────────────────────────────────
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

      // Offense
      runs_per_game_l30,
      ops_l30,
      wrc_plus_l30: null, // still needs FanGraphs
      woba_l30: null,     // still needs FanGraphs
      wrc_plus_vs_lhp: null,
      wrc_plus_vs_rhp: null,
      k_pct,
      bb_pct,
      iso,
      stolen_base_pct,

      // Defense — V5: fielding_pct now actually saved, defensive_efficiency
      // now computed from MLB API rather than left as a permanent
      // "needs FanGraphs" null
      oaa: defense.oaa,
      drs: null, // still genuinely needs FanGraphs — no free equivalent
      defensive_efficiency: defensiveEfficiency,
      infield_oaa: defense.infield_oaa,
      outfield_oaa: defense.outfield_oaa,
      oaa_lf: defense.oaa_lf,
      oaa_cf: defense.oaa_cf,
      oaa_rf: defense.oaa_rf,
      errors_per_game_l30,
      fielding_pct,

      // Bullpen
      bullpen_era: bullpenQuality.bullpen_era,
      bullpen_wpa_li: null,
      bullpen_innings_yesterday: Math.round(bullpen_innings_yesterday * 10) / 10,
      bullpen_ip_last_3: Math.round(bullpen_ip_last_3 * 10) / 10,
      bullpen_k_per_9: bullpenQuality.bullpen_k_per_9,
      bullpen_hr_per_9: bullpenQuality.bullpen_hr_per_9,
      closer_available,
      setup1_available,
      setup2_available,

      // Rest / Travel
      last_game_date,
      consecutive_road_games,
      games_last_10_days,
      travel_miles_last,
      day_after_night,

      updated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`Team stats fetch failed for ${teamName}:`, err)
    return null
  }
}

// ============================================================
// V5 NEW: Defensive Efficiency Ratio — % of batted balls in play
// converted to outs. Standard formula: 1 - (H - HR) / (BF - BB - HBP - K - HR).
// Uses team-wide season pitching totals (starters + relievers, unlike
// fetchBullpenQuality which is reliever-only) — needs the WHOLE staff's
// balls-in-play to represent team defense, not just bullpen innings.
// Doesn't require FanGraphs — computable from MLB Stats API alone;
// the old "needs FanGraphs" comment on this field was wrong, not just
// outdated.
// ============================================================
async function fetchDefensiveEfficiency(teamId: number): Promise<number | null> {
  try {
    const url = `${MLB_API}/teams/${teamId}/stats?stats=season&group=pitching&season=${SEASON}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const stat = data?.stats?.[0]?.splits?.[0]?.stat
    if (!stat) return null

    const battersFaced = parseInt(stat.battersFaced ?? '0')
    const baseOnBalls = parseInt(stat.baseOnBalls ?? '0')
    const hitBatsmen = parseInt(stat.hitBatsmen ?? '0')
    const strikeOuts = parseInt(stat.strikeOuts ?? '0')
    const homeRuns = parseInt(stat.homeRuns ?? '0')
    const hits = parseInt(stat.hits ?? '0')

    const ballsInPlay = battersFaced - baseOnBalls - hitBatsmen - strikeOuts - homeRuns
    if (ballsInPlay <= 0) return null

    const der = 1 - (hits - homeRuns) / ballsInPlay
    return Math.round(der * 1000) / 1000
  } catch (err) {
    console.error(`Defensive efficiency fetch failed for team ${teamId}:`, err)
    return null
  }
}

// ============================================================
// Real Statcast OAA — reads what fetch_team_defense.py wrote
// ============================================================
async function fetchDefenseData(teamId: number): Promise<{
  oaa: number | null
  infield_oaa: number | null
  outfield_oaa: number | null
  oaa_lf: number | null
  oaa_cf: number | null
  oaa_rf: number | null
}> {
  const { data, error } = await supa
    .from('team_defense')
    .select('oaa, infield_oaa, outfield_oaa, oaa_lf, oaa_cf, oaa_rf')
    .eq('team_id', teamId)
    .eq('season', SEASON)
    .single()

  if (error || !data) {
    return { oaa: null, infield_oaa: null, outfield_oaa: null, oaa_lf: null, oaa_cf: null, oaa_rf: null }
  }
  return {
    oaa: data.oaa ?? null,
    infield_oaa: data.infield_oaa ?? null,
    outfield_oaa: data.outfield_oaa ?? null,
    oaa_lf: data.oaa_lf ?? null,
    oaa_cf: data.oaa_cf ?? null,
    oaa_rf: data.oaa_rf ?? null,
  }
}

// ============================================================
// Real reliever-only bullpen quality — classification matches
// scripts/fetch_bullpen_availability.py
// ============================================================
async function fetchBullpenQuality(teamId: number): Promise<{
  bullpen_era: number | null
  bullpen_k_per_9: number | null
  bullpen_hr_per_9: number | null
}> {
  try {
    const rosterUrl = `${MLB_API}/teams/${teamId}/roster?rosterType=active`
    const rosterRes = await fetch(rosterUrl)
    if (!rosterRes.ok) return { bullpen_era: null, bullpen_k_per_9: null, bullpen_hr_per_9: null }
    const roster = (await rosterRes.json()).roster ?? []
    const pitchers = roster.filter((p: any) => p.position?.abbreviation === 'P')

    const pitcherStats = await Promise.all(
      pitchers.map(async (p: any) => {
        const pid = p.person?.id
        if (!pid) return null
        try {
          const statsUrl = `${MLB_API}/people/${pid}/stats?stats=season&group=pitching&season=${SEASON}`
          const statsRes = await fetch(statsUrl)
          if (!statsRes.ok) return null
          const splits = (await statsRes.json()).stats?.[0]?.splits ?? []
          if (!splits.length) return null
          return splits[0].stat ?? null
        } catch {
          return null
        }
      })
    )

    let totalER = 0
    let totalOuts = 0
    let totalSO = 0
    let totalHR = 0

    for (const stat of pitcherStats) {
      if (!stat) continue
      const games = parseInt(stat.gamesPlayed ?? '0')
      const starts = parseInt(stat.gamesStarted ?? '0')
      if (games < MIN_APPEARANCES) continue
      const ratio = games > 0 ? starts / games : 0
      if (ratio >= RELIEVER_START_RATIO) continue

      totalER += parseInt(stat.earnedRuns ?? '0')
      totalSO += parseInt(stat.strikeOuts ?? '0')
      totalHR += parseInt(stat.homeRuns ?? '0')
      totalOuts += parseInnings(stat.inningsPitched ?? '0') * 3
    }

    if (totalOuts <= 0) {
      return { bullpen_era: null, bullpen_k_per_9: null, bullpen_hr_per_9: null }
    }

    const ip = totalOuts / 3
    return {
      bullpen_era: parseFloat(((totalER * 9) / ip).toFixed(2)),
      bullpen_k_per_9: parseFloat(((totalSO * 9) / ip).toFixed(2)),
      bullpen_hr_per_9: parseFloat(((totalHR * 9) / ip).toFixed(2)),
    }
  } catch (err) {
    console.error(`Bullpen quality fetch failed for team ${teamId}:`, err)
    return { bullpen_era: null, bullpen_k_per_9: null, bullpen_hr_per_9: null }
  }
}

// ============================================================
// Fetch real bullpen innings from boxscore
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