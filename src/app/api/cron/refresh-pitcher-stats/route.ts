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
  // Auth check
  const authHeader = request.headers.get('authorization')
  const validSecrets = [
    process.env.CRON_SECRET,         // Vercel-injected for scheduled runs
    process.env.EDGE_CRON_AUTH,      // Our manual auth for curl/testing
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

    // Step 2: Fetch advanced stats for each
    const rows = []
    for (const pitcherId of pitcherIds) {
      const stats = await fetchPitcherStats(pitcherId)
      if (stats) rows.push(stats)
    }

    console.log(`Fetched stats for ${rows.length} pitchers`)

    // Step 3: Upsert into Supabase
    if (rows.length > 0) {
      const { error } = await supa
        .from('pitcher_stats')
        .upsert(rows, { onConflict: 'player_id' })
      
      if (error) throw error
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

async function fetchPitcherStats(pitcherId: number) {
  try {
    const url = `${MLB_API}/people/${pitcherId}/stats?stats=season,seasonAdvanced,gameLog,statSplits&sitCodes=vl,vr&group=pitching&season=${SEASON}`
    const r = await fetch(url)
    if (!r.ok) return null
    const data = await r.json()

    let basic: any = {}
    let advanced: any = {}
    let gameLogs: any[] = []
    let vsLHB: string | null = null
    let vsRHB: string | null = null
    
    let playerName = ''
    let teamId: number | null = null

    for (const block of data.stats ?? []) {
      if (block.type?.displayName === 'season' && block.splits?.[0]) {
        basic = block.splits[0].stat ?? {}
        playerName = block.splits[0].player?.fullName ?? ''
        teamId = block.splits[0].team?.id ?? null
      }
      if (block.type?.displayName === 'seasonAdvanced' && block.splits?.[0]) {
        advanced = block.splits[0].stat ?? {}
      }
      if (block.type?.displayName === 'gameLog') {
        gameLogs = block.splits ?? []
      }
      if (block.type?.displayName === 'statSplits') {
        for (const split of block.splits ?? []) {
          if (split.split?.code === 'vl' || split.split?.description === 'vs Left') {
            vsLHB = split.stat?.avg ?? null
          }
          if (split.split?.code === 'vr' || split.split?.description === 'vs Right') {
            vsRHB = split.stat?.avg ?? null
          }
        }
      }
    }

    if (!playerName) {
      const personRes = await fetch(`${MLB_API}/people/${pitcherId}`)
      if (personRes.ok) {
        const personData = await personRes.json()
        playerName = personData.people?.[0]?.fullName ?? `Pitcher ${pitcherId}`
        teamId = personData.people?.[0]?.currentTeam?.id ?? null
      }
    }

    // Relaxed this constraint to catch relievers/openers with < 1 IP
    const innings = parseFloat(basic.inningsPitched ?? '0')
    if (innings <= 0) return null

    // --- NEW: BASIC STATS ---
    const wins = basic.wins ? parseInt(basic.wins) : null
    const losses = basic.losses ? parseInt(basic.losses) : null
    const games_played = basic.gamesPlayed ? parseInt(basic.gamesPlayed) : null
    const starts = basic.gamesStarted ? parseInt(basic.gamesStarted) : 0

    // --- CALCULATE GB% ---
    const groundOuts = basic.groundOuts ? parseInt(basic.groundOuts) : 0
    const airOuts = basic.airOuts ? parseInt(basic.airOuts) : 0
    const totalBattedOuts = groundOuts + airOuts
    const gbRate = totalBattedOuts > 0 ? (groundOuts / totalBattedOuts) * 100 : null

    // --- CALCULATE HOME / AWAY ERA FROM GAME LOGS ---
    let homeER = 0, homeOuts = 0
    let awayER = 0, awayOuts = 0

    for (const g of gameLogs) {
      if (!g.stat) continue
      const er = parseInt(g.stat.earnedRuns ?? '0')
      const ipStr = g.stat.inningsPitched ?? '0'
      const parts = ipStr.split('.')
      const outs = (parseInt(parts[0] || '0') * 3) + parseInt(parts[1] || '0')
      
      if (g.isHome) {
        homeER += er
        homeOuts += outs
      } else {
        awayER += er
        awayOuts += outs
      }
    }

    const home_era = homeOuts > 0 ? parseFloat(((homeER / (homeOuts / 3)) * 9).toFixed(2)) : null
    const away_era = awayOuts > 0 ? parseFloat(((awayER / (awayOuts / 3)) * 9).toFixed(2)) : null

    // --- CALCULATE DAYS REST ---
    let days_rest = null
    if (gameLogs.length > 0) {
      const sortedLogs = [...gameLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const lastGameDate = new Date(sortedLogs[0].date)
      const diffTime = Math.abs(Date.now() - lastGameDate.getTime())
      days_rest = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    }

    // --- CALCULATE IP PACE ---
    let season_ip_pace = null
    if (starts > 0 && innings > 0) {
      season_ip_pace = parseFloat(((innings / starts) * 32).toFixed(1)) // Assume 32 starts
    } else if (games_played && games_played > 0 && innings > 0) {
      season_ip_pace = parseFloat(((innings / games_played) * 65).toFixed(1)) // Assume 65 apps for relievers
    }

    // --- CALCULATE LAST 3 STARTS (L3) ---
    let l3_era = null
    let l3_innings = null
    let l3_strikeouts = null
    let l3_walks = null
    let l3_k_per_9 = null

    const recentGames = gameLogs
      .filter(g => g.stat && parseFloat(g.stat.inningsPitched ?? '0') > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)

    if (recentGames.length > 0) {
      let earnedRuns = 0
      let outs = 0
      let ks = 0
      let bbs = 0

      for (const g of recentGames) {
        earnedRuns += parseInt(g.stat.earnedRuns ?? '0')
        ks += parseInt(g.stat.strikeOuts ?? '0')
        bbs += parseInt(g.stat.baseOnBalls ?? '0')
        
        const ipStr = g.stat.inningsPitched ?? '0'
        const parts = ipStr.split('.')
        const fullInnings = parseInt(parts[0])
        const partialOuts = parts.length > 1 ? parseInt(parts[1]) : 0
        outs += (fullInnings * 3) + partialOuts
      }

      const totalIp = outs / 3
      l3_innings = totalIp
      l3_strikeouts = ks
      l3_walks = bbs
      
      if (totalIp > 0) {
        l3_era = parseFloat(((earnedRuns / totalIp) * 9).toFixed(2))
        l3_k_per_9 = parseFloat(((ks / totalIp) * 9).toFixed(2))
      }
    }

    return {
      player_id: pitcherId,
      player_name: playerName,
      team_id: teamId,
      season: SEASON,
      
      era: basic.era ? parseFloat(basic.era) : null,
      whip: basic.whip ? parseFloat(basic.whip) : null,
      innings_pitched: innings,
      starts: starts,
      
      fip: advanced.fip ? parseFloat(advanced.fip) : null,
      k_per_9: advanced.strikeoutsPer9Inn ? parseFloat(advanced.strikeoutsPer9Inn) : null,
      bb_per_9: advanced.walksPer9Inn ? parseFloat(advanced.walksPer9Inn) : null,
      
      // --- ALL NEW FIELDS ---
      wins: wins,
      losses: losses,
      games_played: games_played,
      days_rest: days_rest,
      home_era: home_era,
      away_era: away_era,
      season_ip_pace: season_ip_pace,
      gb_rate: gbRate ? parseFloat(gbRate.toFixed(1)) : null,
      vs_lhb_baa: vsLHB ? parseFloat(vsLHB) : null,
      vs_rhb_baa: vsRHB ? parseFloat(vsRHB) : null,
      
      // --- L3 RECENT FORM ---
      l3_era: l3_era,
      l3_innings: l3_innings,
      l3_strikeouts: l3_strikeouts,
      l3_walks: l3_walks,
      l3_k_per_9: l3_k_per_9,
      
      xfip_minus: null, 
      updated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`Failed to fetch pitcher ${pitcherId}:`, err)
    return null
  }
}