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

export async function GET(request: Request) {
  // Auth check
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
    // Step 1: Get all probable pitchers from upcoming games (next 7 days)
    const today = new Date().toISOString().split('T')[0]
    const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const scheduleUrl = `${MLB_API}/schedule?sportId=1&startDate=${today}&endDate=${weekAhead}&hydrate=probablePitcher`
    const schedRes = await fetch(scheduleUrl)
    const schedData = await schedRes.json()

    const pitcherIds = new Set<number>()
    for (const block of schedData.dates ?? []) {
      for (const g of block.games ?? []) {
        const home = g.teams?.home?.probablePitcher?.id
        const away = g.teams?.away?.probablePitcher?.id
        if (home) pitcherIds.add(home)
        if (away) pitcherIds.add(away)
      }
    }

    console.log(`Found ${pitcherIds.size} pitchers to refresh`)

    // Step 2: Fetch all stats for each pitcher
    const rows = []
    let fetchedCount = 0
    for (const pitcherId of pitcherIds) {
      const stats = await fetchPitcherStats(pitcherId)
      if (stats) rows.push(stats)
      fetchedCount++
      if (fetchedCount % 20 === 0) {
        console.log(`  Processed ${fetchedCount}/${pitcherIds.size} pitchers...`)
      }
    }

    console.log(`Fetched stats for ${rows.length} pitchers`)

    // Step 3: Upsert into Supabase
    if (rows.length > 0) {
      // Batch upsert in groups of 25 to avoid payload limits
      const BATCH = 25
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const { error } = await supa
          .from('pitcher_stats')
          .upsert(batch, { onConflict: 'player_id' })
        if (error) {
          console.error(`Upsert batch ${i}-${i + BATCH} failed:`, error)
        }
      }
    }

    return NextResponse.json({
      success: true,
      pitchers_processed: pitcherIds.size,
      pitchers_stored: rows.length,
    })
  } catch (err) {
    console.error('Pitcher stats refresh failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// ============================================================
// MAIN PITCHER FETCH — V3: season + advanced + game logs + splits
// ============================================================
async function fetchPitcherStats(pitcherId: number) {
  try {
    // ── 1. Season + Advanced stats (same as V2) ──────────────
    const seasonUrl = `${MLB_API}/people/${pitcherId}/stats?stats=season,seasonAdvanced&group=pitching&season=${SEASON}`
    const seasonRes = await fetch(seasonUrl)
    if (!seasonRes.ok) return null
    const seasonData = await seasonRes.json()

    let basic: any = {}
    let advanced: any = {}
    let playerName = ''
    let teamId: number | null = null

    for (const block of seasonData.stats ?? []) {
      if (block.type?.displayName === 'season' && block.splits?.[0]) {
        basic = block.splits[0].stat ?? {}
        playerName = block.splits[0].player?.fullName ?? ''
        teamId = block.splits[0].team?.id ?? null
      }
      if (block.type?.displayName === 'seasonAdvanced' && block.splits?.[0]) {
        advanced = block.splits[0].stat ?? {}
      }
    }

    // If no name found, fetch person record
    if (!playerName) {
      try {
        const personRes = await fetch(`${MLB_API}/people/${pitcherId}`)
        if (personRes.ok) {
          const personData = await personRes.json()
          playerName = personData.people?.[0]?.fullName ?? `Pitcher ${pitcherId}`
          teamId = personData.people?.[0]?.currentTeam?.id ?? null
        }
      } catch { /* proceed without name */ }
    }

    // Skip if no innings pitched (haven't played)
    const innings = parseInnings(basic.inningsPitched)
    if (innings < 1) return null

    // ── 2. Game logs → L3 stats + pitch count + days rest ────
    const { l3, pitchCountLast, daysRest } = await fetchGameLogs(pitcherId)

    // ── 3. Splits → vs LHB/RHB + home/away ERA ──────────────
    const splits = await fetchSplits(pitcherId)

    // ── 4. Compute derived fields ────────────────────────────
    // Season IP pace: project full-season innings from current rate
    const gamesPlayed = parseInt(basic.gamesPlayed ?? '0')
    const todayDate = new Date()
    const seasonStartApprox = new Date(SEASON, 2, 28) // ~March 28
    const daysSoFar = Math.max(1, Math.floor((todayDate.getTime() - seasonStartApprox.getTime()) / 86400000))
    const seasonIpPace = daysSoFar > 0 ? Math.round((innings / daysSoFar) * 183 * 10) / 10 : null // ~183 days in season

    // GB% from advanced stats
    const gbPercent = advanced.groundOutsToAirouts
      ? parseFloat(advanced.groundOutsToAirouts) / (1 + parseFloat(advanced.groundOutsToAirouts))
      : null

    return {
      player_id: pitcherId,
      player_name: playerName,
      team_id: teamId,
      season: SEASON,

      // Core stats (V2 — unchanged)
      era: basic.era ? parseFloat(basic.era) : null,
      whip: basic.whip ? parseFloat(basic.whip) : null,
      innings_pitched: Math.round(innings * 10) / 10,
      starts: basic.gamesStarted ? parseInt(basic.gamesStarted) : 0,
      fip: advanced.fip ? parseFloat(advanced.fip) : null,
      xfip_minus: null, // still needs Baseball Savant — P2 enhancement
      k_per_9: advanced.strikeoutsPer9Inn ? parseFloat(advanced.strikeoutsPer9Inn) : null,
      bb_per_9: advanced.walksPer9Inn ? parseFloat(advanced.walksPer9Inn) : null,

      // V3: Last 3 starts
      l3_era: l3.era,
      l3_innings: l3.innings,
      l3_strikeouts: l3.strikeouts,
      l3_walks: l3.walks,
      l3_k_per_9: l3.innings > 0 ? Math.round((l3.strikeouts / l3.innings) * 9 * 100) / 100 : null,

      // V3: Splits
      vs_lhb_baa: splits.vsLhbBaa,
      vs_rhb_baa: splits.vsRhbBaa,
      home_era: splits.homeEra,
      away_era: splits.awayEra,

      // V3: Fatigue / workload
      pitch_count_last: pitchCountLast,
      days_rest: daysRest,
      season_ip_pace: seasonIpPace,

      // V3: Contact quality
      gb_percent: gbPercent,
      fb_percent: gbPercent !== null ? Math.round((1 - gbPercent) * 1000) / 1000 : null,
      hard_hit_pct: null, // needs Statcast — P2 enhancement

      // V3: Record
      wins: basic.wins ? parseInt(basic.wins) : null,
      losses: basic.losses ? parseInt(basic.losses) : null,
      games_played: gamesPlayed,

      updated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`Failed to fetch pitcher ${pitcherId}:`, err)
    return null
  }
}

// ============================================================
// GAME LOGS → Last 3 starts + pitch count + days rest
// ============================================================
async function fetchGameLogs(pitcherId: number): Promise<{
  l3: { era: number | null; innings: number; strikeouts: number; walks: number }
  pitchCountLast: number | null
  daysRest: number | null
}> {
  const empty = {
    l3: { era: null, innings: 0, strikeouts: 0, walks: 0 },
    pitchCountLast: null,
    daysRest: null,
  }

  try {
    const url = `${MLB_API}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${SEASON}`
    const res = await fetch(url)
    if (!res.ok) return empty
    const data = await res.json()

    const allGames = data.stats?.[0]?.splits ?? []
    if (allGames.length === 0) return empty

    // Filter to starts only (gamesStarted > 0 for that game)
    const starts = allGames.filter((g: any) => {
      const gs = parseInt(g.stat?.gamesStarted ?? '0')
      return gs > 0
    })

    // Last 3 starts
    const last3 = starts.slice(-3)

    let totalIP = 0
    let totalER = 0
    let totalK = 0
    let totalBB = 0

    for (const g of last3) {
      const stat = g.stat ?? {}
      totalIP += parseInnings(stat.inningsPitched)
      totalER += parseInt(stat.earnedRuns ?? '0')
      totalK += parseInt(stat.strikeOuts ?? '0')
      totalBB += parseInt(stat.baseOnBalls ?? '0')
    }

    const l3Era = totalIP > 0 ? Math.round((totalER / totalIP) * 9 * 100) / 100 : null

    // Last game (any appearance, not just starts) for pitch count + days rest
    const lastGame = allGames[allGames.length - 1]
    const lastStat = lastGame?.stat ?? {}
    const pitchCountLast = lastStat.numberOfPitches
      ? parseInt(lastStat.numberOfPitches)
      : lastStat.pitchesThrown
        ? parseInt(lastStat.pitchesThrown)
        : null

    // Days rest: difference between today and last game date
    let daysRest: number | null = null
    const lastDate = lastGame?.date
    if (lastDate) {
      const lastMs = new Date(lastDate + 'T00:00:00Z').getTime()
      const todayMs = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z').getTime()
      daysRest = Math.floor((todayMs - lastMs) / 86400000)
    }

    return {
      l3: {
        era: l3Era,
        innings: Math.round(totalIP * 10) / 10,
        strikeouts: totalK,
        walks: totalBB,
      },
      pitchCountLast,
      daysRest,
    }
  } catch (err) {
    console.error(`Game log fetch failed for pitcher ${pitcherId}:`, err)
    return empty
  }
}

// ============================================================
// SPLITS → vs LHB/RHB batting average + home/away ERA
// ============================================================
async function fetchSplits(pitcherId: number): Promise<{
  vsLhbBaa: number | null
  vsRhbBaa: number | null
  homeEra: number | null
  awayEra: number | null
}> {
  const empty = { vsLhbBaa: null, vsRhbBaa: null, homeEra: null, awayEra: null }

  try {
    // MLB Stats API: statSplits with sitCodes
    // vl = vs Left-handed batters, vr = vs Right-handed batters
    // h = Home games, a = Away games
    const url = `${MLB_API}/people/${pitcherId}/stats?stats=statSplits&group=pitching&season=${SEASON}&sitCodes=vl,vr,h,a`
    const res = await fetch(url)
    if (!res.ok) return empty
    const data = await res.json()

    let vsLhbBaa: number | null = null
    let vsRhbBaa: number | null = null
    let homeEra: number | null = null
    let awayEra: number | null = null

    for (const block of data.stats ?? []) {
      for (const split of block.splits ?? []) {
        const sitCode = split.split?.code ?? ''
        const stat = split.stat ?? {}

        switch (sitCode) {
          case 'vl': // vs Left-handed batters
            vsLhbBaa = stat.avg ? parseFloat(stat.avg) : null
            break
          case 'vr': // vs Right-handed batters
            vsRhbBaa = stat.avg ? parseFloat(stat.avg) : null
            break
          case 'h': // Home games
            homeEra = stat.era ? parseFloat(stat.era) : null
            break
          case 'a': // Away games
            awayEra = stat.era ? parseFloat(stat.era) : null
            break
        }
      }
    }

    return { vsLhbBaa, vsRhbBaa, homeEra, awayEra }
  } catch (err) {
    console.error(`Splits fetch failed for pitcher ${pitcherId}:`, err)
    return empty
  }
}