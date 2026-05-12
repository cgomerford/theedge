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
    // Fetch season pitching stats
    const url = `${MLB_API}/people/${pitcherId}/stats?stats=season,seasonAdvanced&group=pitching&season=${SEASON}`
    const r = await fetch(url)
    if (!r.ok) return null
    const data = await r.json()

    let basic: any = {}
    let advanced: any = {}
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
    }

    // If no name found, fetch person record
    if (!playerName) {
      const personRes = await fetch(`${MLB_API}/people/${pitcherId}`)
      if (personRes.ok) {
        const personData = await personRes.json()
        playerName = personData.people?.[0]?.fullName ?? `Pitcher ${pitcherId}`
        teamId = personData.people?.[0]?.currentTeam?.id ?? null
      }
    }

    // Skip if no innings pitched (haven't played)
    const innings = parseFloat(basic.inningsPitched ?? '0')
    if (innings < 1) return null

    return {
      player_id: pitcherId,
      player_name: playerName,
      team_id: teamId,
      season: SEASON,
      
      era: basic.era ? parseFloat(basic.era) : null,
      whip: basic.whip ? parseFloat(basic.whip) : null,
      innings_pitched: innings,
      starts: basic.gamesStarted ? parseInt(basic.gamesStarted) : 0,
      
      // Use FIP as proxy for V1 (xFIP- upgrade post-launch)
      xfip_minus: null,  // computed in Edge Score from FIP + league avg
      fip: advanced.fip ? parseFloat(advanced.fip) : null,
      k_per_9: advanced.strikeoutsPer9Inn ? parseFloat(advanced.strikeoutsPer9Inn) : null,
      bb_per_9: advanced.walksPer9Inn ? parseFloat(advanced.walksPer9Inn) : null,
      
      // L3 stats — V1 leaves null, populated from game logs in v2
      l3_era: null,
      l3_innings: null,
      l3_strikeouts: null,
      l3_walks: null,
      
      // Splits — V1 from advanced if available
      vs_lhb_baa: null,
      vs_rhb_baa: null,
      
      updated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`Failed to fetch pitcher ${pitcherId}:`, err)
    return null
  }
}