// MLB Stats API — official, free, no API key needed
import { createAdminClient } from '@/lib/supabase'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type MLBGame = {
  gamePk: number
  gameDate: string
  officialDate?: string  // YYYY-MM-DD format, MLB's "official" date for the game
  doubleHeader?: string  // 'N' | 'Y' (traditional) | 'S' (split)
  gameNumber?: number
  status: { detailedState: string; abstractGameState: string }
  teams: {
    home: {
      team: { id: number; name: string; abbreviation?: string }
      probablePitcher?: { id: number; fullName: string }
      leagueRecord?: { wins: number; losses: number }
    }
    away: {
      team: { id: number; name: string; abbreviation?: string }
      probablePitcher?: { id: number; fullName: string }
      leagueRecord?: { wins: number; losses: number }
    }
  }
  venue: { name: string }
}

export type TickerGame = {
  slug: string
  awayName: string
  awayShort: string
  awayId: number
  homeName: string
  homeShort: string
  homeId: number
  awayScore: number | null
  homeScore: number | null
  status: 'scheduled' | 'live' | 'final' | 'postponed'
  statusText: string
  inning: string | null
  gameTime: string
}

// Get the MLB schedule for a specific date (format: 'YYYY-MM-DD')
export async function getScheduleForDate(date: string): Promise<MLBGame[]> {
  const url = `${MLB_API}/schedule?sportId=1&date=${date}&hydrate=team,probablePitcher,linescore`
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) {
      console.error('MLB schedule fetch failed:', res.status)
      return []
    }
    const data = await res.json()
    return data.dates?.[0]?.games ?? []
  } catch (err) {
    console.error('MLB fetch error:', err)
    return []
  }
}

export async function getTodayTickerGames(): Promise<TickerGame[]> {
  const today = new Date().toISOString().split('T')[0]
  const games = await getScheduleForDate(today)

  return games.map((g) => {
    const slug = slugifyGame(g)
    const awayName = g.teams.away.team.name
    const homeName = g.teams.home.team.name
    const awayShort = shortName(awayName)
    const homeShort = shortName(homeName)

    // Score may not be present in the schedule response — needs hydration
    const awayScore = (g.teams.away as { score?: number }).score ?? null
    const homeScore = (g.teams.home as { score?: number }).score ?? null

    const abstractState = g.status?.abstractGameState ?? ''
    const detailedState = g.status?.detailedState ?? ''

    let status: TickerGame['status'] = 'scheduled'
    if (abstractState === 'Live') status = 'live'
    else if (abstractState === 'Final') status = 'final'
    else if (detailedState.toLowerCase().includes('postpone')) status = 'postponed'

    const gameTime = new Date(g.gameDate).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    })

    return {
      slug,
      awayName,
      awayShort,
      awayId: g.teams.away.team.id,
      homeName,
      homeShort,
      homeId: g.teams.home.team.id,
      awayScore,
      homeScore,
      status,
      statusText: detailedState || gameTime,
      inning: null, // We'll skip live inning detail for now — keeps fetch simple
      gameTime,
    }
  })
}

// Convert "New York Yankees" -> "new-york-yankees"
function teamSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
// Build the URL slug for a game's preview page
export function slugifyGame(game: MLBGame): string {
  // Use officialDate (MLB's "this game belongs to date X") not gameDate (UTC timestamp)
  // Fixes 404s for late-night games whose UTC time crosses midnight (e.g. White Sox 10pm ET = 3am UK = next-day UTC)
  const date = game.officialDate ?? game.gameDate.split('T')[0]
  const away = teamSlug(game.teams.away.team.name)
  const home = teamSlug(game.teams.home.team.name)
  const base = `${away}-vs-${home}-${date}`

  // Doubleheader handling: game 2+ gets a suffix to keep slugs unique.
  // Game 1 keeps the existing format for backwards compatibility (no broken links).
  // doubleHeader values from MLB API: 'N' = none, 'Y' = traditional, 'S' = split
  const isDoubleheader = game.doubleHeader && game.doubleHeader !== 'N'
  const gameNum = game.gameNumber ?? 1

  return (isDoubleheader && gameNum > 1)
    ? `${base}-game${gameNum}`
    : base
}

// "New York Yankees" -> "Yankees"
export function shortName(name: string): string {
  const parts = name.split(' ')
  return parts[parts.length - 1]
}

// =====================================================
// PITCHER STATS — recent starts, season totals
// =====================================================

export type PitcherGameLog = {
  date: string
  opponent: string
  ip: string
  h: number
  er: number
  bb: number
  so: number
  era: string
  result: string
}

export type PitcherSeasonStats = {
  era: string
  whip: string
  innings: string
  strikeouts: number
  walks: number
  k_per_9: string
  bb_per_9: string
  hr_per_9: string
  wins: number
  losses: number
}

export async function getPitcherRecentStarts(
  playerId: number,
  limit: number = 5
): Promise<PitcherGameLog[]> {
  const season = new Date().getFullYear()
  const url = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=pitching&season=${season}`

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    const games = data.stats?.[0]?.splits ?? []

    return games.slice(-limit).reverse().map((g: any) => ({
      date: g.date,
      opponent: g.opponent?.name ?? '—',
      ip: g.stat?.inningsPitched ?? '0',
      h: parseInt(g.stat?.hits ?? '0'),
      er: parseInt(g.stat?.earnedRuns ?? '0'),
      bb: parseInt(g.stat?.baseOnBalls ?? '0'),
      so: parseInt(g.stat?.strikeOuts ?? '0'),
      era: g.stat?.era ?? '—',
      result: g.isWin ? 'W' : g.isLoss ? 'L' : 'ND',
    }))
  } catch (err) {
    console.error('Pitcher game log fetch failed:', err)
    return []
  }
}

export async function getPitcherSeasonStats(
  playerId: number
): Promise<PitcherSeasonStats | null> {
  const season = new Date().getFullYear()
  const url = `${MLB_API}/people/${playerId}/stats?stats=season&group=pitching&season=${season}`

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const data = await res.json()
    const stats = data.stats?.[0]?.splits?.[0]?.stat
    if (!stats) return null

    return {
      era: stats.era ?? '—',
      whip: stats.whip ?? '—',
      innings: stats.inningsPitched ?? '0',
      strikeouts: stats.strikeOuts ?? 0,
      walks: stats.baseOnBalls ?? 0,
      k_per_9: stats.strikeoutsPer9Inn ?? '—',
      bb_per_9: stats.walksPer9Inn ?? '—',
      hr_per_9: stats.homeRunsPer9 ?? '—',
      wins: stats.wins ?? 0,
      losses: stats.losses ?? 0,
    }
  } catch (err) {
    console.error('Pitcher season stats fetch failed:', err)
    return null
  }
}

// =====================================================
// WEATHER — Open-Meteo (free, no API key needed)
// =====================================================

export type GameWeather = {
  temp_f: number
  feels_like_f: number
  wind_mph: number
  wind_direction: number
  wind_direction_text: string
  precipitation_chance: number
  cloud_cover: number
  conditions: string
}

function describeWindDirection(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

function describeConditions(weatherCode: number): string {
  if (weatherCode === 0) return 'Clear'
  if (weatherCode <= 3) return 'Partly cloudy'
  if (weatherCode <= 48) return 'Foggy'
  if (weatherCode <= 57) return 'Drizzle'
  if (weatherCode <= 67) return 'Rain'
  if (weatherCode <= 77) return 'Snow'
  if (weatherCode <= 82) return 'Rain showers'
  if (weatherCode <= 86) return 'Snow showers'
  if (weatherCode <= 99) return 'Thunderstorm'
  return 'Unknown'
}

export async function getGameWeather(
  lat: number,
  lon: number,
  gameTimeUTC: string
): Promise<GameWeather | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=3&timezone=auto`

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) {
      console.error('Open-Meteo fetch failed:', res.status)
      return null
    }
    const data = await res.json()

    const hourly = data.hourly
    if (!hourly || !hourly.time) return null

    const gameTime = new Date(gameTimeUTC).getTime()
    let closestIndex = 0
    let smallestDiff = Infinity
    for (let i = 0; i < hourly.time.length; i++) {
      const hourTime = new Date(hourly.time[i]).getTime()
      const diff = Math.abs(hourTime - gameTime)
      if (diff < smallestDiff) {
        smallestDiff = diff
        closestIndex = i
      }
    }

    const windDir = hourly.wind_direction_10m[closestIndex] ?? 0

    return {
      temp_f: Math.round(hourly.temperature_2m[closestIndex] ?? 0),
      feels_like_f: Math.round(hourly.apparent_temperature[closestIndex] ?? 0),
      wind_mph: Math.round(hourly.wind_speed_10m[closestIndex] ?? 0),
      wind_direction: windDir,
      wind_direction_text: describeWindDirection(windDir),
      precipitation_chance: Math.round(hourly.precipitation_probability[closestIndex] ?? 0),
      cloud_cover: Math.round(hourly.cloud_cover[closestIndex] ?? 0),
      conditions: describeConditions(hourly.weather_code[closestIndex] ?? 0),
    }
  } catch (err) {
    console.error('Weather fetch error:', err)
    return null
  }
}

// =====================================================
// PITCH MIX — read from Supabase (populated daily by Python cron)
// =====================================================

export type PitchType = {
  pitch_name: string
  pitch_code: string
  count: number
  percentage: number
  avg_velocity: number
  whiff_percent: number | null
  k_percent: number | null
  ba_against: number | null
  est_woba: number | null
}

export async function getPitchMix(playerId: number): Promise<PitchType[]> {
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('pitch_arsenals')
    .select('*')
    .eq('player_id', playerId)
    .eq('season', season)
    .order('percentage', { ascending: false })

  if (error || !data) {
    console.error('getPitchMix DB error:', error)
    return []
  }

  return data.map(r => ({
    pitch_name: r.pitch_name,
    pitch_code: r.pitch_type,
    count: r.count,
    percentage: Number(r.percentage),
    avg_velocity: Number(r.avg_velocity ?? 0),
    whiff_percent: r.whiff_percent !== null ? Number(r.whiff_percent) : null,
    k_percent: r.k_percent !== null ? Number(r.k_percent) : null,
    ba_against: r.ba_against !== null ? Number(r.ba_against) : null,
    est_woba: r.est_woba !== null ? Number(r.est_woba) : null,
  }))
}

export function pitchColor(pitchCode: string): string {
  const colors: Record<string, string> = {
    'FF': '#dc2626', 'SI': '#ea580c', 'FC': '#d97706',
    'SL': '#7c3aed', 'ST': '#9333ea', 'SV': '#1d4ed8',
    'CU': '#2563eb', 'KC': '#0891b2',
    'CH': '#059669', 'FS': '#65a30d', 'FO': '#65a30d', 'SC': '#16a34a',
    'KN': '#a16207', 'EP': '#92400e',
  }
  return colors[pitchCode] ?? '#525252'
}

// =====================================================
// TEAM FORM — last 10 games, streak, run differential
// =====================================================

export type TeamForm = {
  last_10_wins: number
  last_10_losses: number
  streak: string              // e.g., "W4", "L2"
  streak_type: 'W' | 'L' | null
  streak_count: number
  runs_per_game_l10: number
  runs_allowed_per_game_l10: number
  run_diff_l10: number
  // For narrative
  trend: 'hot' | 'cold' | 'mixed'
}

export async function getTeamForm(teamId: number): Promise<TeamForm | null> {
  const today = new Date().toISOString().split('T')[0]
  // 21-day window guarantees ~18 scheduled games — enough buffer for postponements + off-days
  const windowStart = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const season = new Date().getFullYear()

  const scheduleUrl = `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${windowStart}&endDate=${today}&hydrate=team,linescore`
  const standingsUrl = `${MLB_API}/standings?leagueId=103,104&season=${season}&date=${today}`

  try {
    const [schedRes, standRes] = await Promise.all([
      fetch(scheduleUrl, { next: { revalidate: 1800 } }),
      fetch(standingsUrl, { next: { revalidate: 1800 } }),
    ])

    if (!schedRes.ok) return null
    const schedData = await schedRes.json()

    // Flatten and filter — score-based check is more robust than status field alone
    const finishedGames: any[] = []
    for (const dateBlock of schedData.dates ?? []) {
      for (const g of dateBlock.games ?? []) {
        const homeScore = g.teams?.home?.score ?? g.teams?.home?.linescore?.runs
        const awayScore = g.teams?.away?.score ?? g.teams?.away?.linescore?.runs
        const detailedState: string = g.status?.detailedState ?? ''

        // Both teams must have scores recorded AND game must not be a postponement/cancellation/suspension
        const bothScored =
          homeScore !== null && homeScore !== undefined &&
          awayScore !== null && awayScore !== undefined

        const notPostponed = !['Postponed', 'Cancelled', 'Suspended'].some(
          s => detailedState.includes(s)
        )

        if (bothScored && notPostponed) {
          finishedGames.push(g)
        }
      }
    }

    // Take the last 10 actually-finished games
    const last10 = finishedGames.slice(-10)
    if (last10.length === 0) return null

    let wins = 0
    let losses = 0
    let runsScored = 0
    let runsAllowed = 0

    for (const g of last10) {
      const isHome = g.teams.home.team.id === teamId
      const us = isHome ? g.teams.home : g.teams.away
      const them = isHome ? g.teams.away : g.teams.home
      const ourScore = us.score ?? us.linescore?.runs
      const theirScore = them.score ?? them.linescore?.runs

      // Skip games with missing scores rather than silently counting as a tie
      if (ourScore == null || theirScore == null) continue

      runsScored += ourScore
      runsAllowed += theirScore
      if (ourScore > theirScore) wins++
      else if (ourScore < theirScore) losses++
    }

    // Get streak from standings
    let streak = ''
    let streakType: 'W' | 'L' | null = null
    let streakCount = 0
    if (standRes.ok) {
      const standData = await standRes.json()
      for (const record of standData.records ?? []) {
        for (const t of record.teamRecords ?? []) {
          if (t.team?.id === teamId) {
            streak = t.streak?.streakCode ?? ''
            const m = streak.match(/^([WL])(\d+)$/)
            if (m) {
              streakType = m[1] as 'W' | 'L'
              streakCount = parseInt(m[2])
            }
            break
          }
        }
      }
    }

    const gameCount = last10.length
    const rpg = gameCount > 0 ? runsScored / gameCount : 0
    const ragp = gameCount > 0 ? runsAllowed / gameCount : 0
    const diff = rpg - ragp

    let trend: 'hot' | 'cold' | 'mixed' = 'mixed'
    if (wins >= 7 || (streakType === 'W' && streakCount >= 4)) trend = 'hot'
    else if (losses >= 7 || (streakType === 'L' && streakCount >= 4)) trend = 'cold'

    return {
      last_10_wins: wins,
      last_10_losses: losses,
      streak,
      streak_type: streakType,
      streak_count: streakCount,
      runs_per_game_l10: Math.round(rpg * 10) / 10,
      runs_allowed_per_game_l10: Math.round(ragp * 10) / 10,
      run_diff_l10: Math.round(diff * 10) / 10,
      trend,
    }
  } catch (err) {
    console.error('Team form fetch error:', err)
    return null
  }
}

// Generate a one-sentence narrative about a team's form
export function describeTeamForm(form: TeamForm, shortName: string): string {
  const { last_10_wins, last_10_losses, streak_type, streak_count, run_diff_l10, trend } = form

  const record = `${last_10_wins}-${last_10_losses} L10`

  if (trend === 'hot' && streak_type === 'W' && streak_count >= 4) {
    return `${shortName} are ${record}, winners of ${streak_count} straight, outscoring opponents by ${Math.abs(run_diff_l10)} runs per game.`
  }
  if (trend === 'cold' && streak_type === 'L' && streak_count >= 4) {
    return `${shortName} are scuffling — ${record} with ${streak_count} straight losses, getting outscored by ${Math.abs(run_diff_l10)} runs per game.`
  }
  if (run_diff_l10 >= 2) {
    return `${shortName} are playing well, ${record}, outscoring opponents by ${run_diff_l10} per game.`
  }
  if (run_diff_l10 <= -2) {
    return `${shortName} have struggled, ${record}, getting outscored by ${Math.abs(run_diff_l10)} per game.`
  }
  return `${shortName} are ${record}, run differential ${run_diff_l10 >= 0 ? '+' : ''}${run_diff_l10} per game over the last ten.`
}

// =====================================================
// IMAGES — official MLB CDN URLs (free, no key required)
// =====================================================

// Get team logo URL by team ID (the same MLB team IDs we already use everywhere)
// Returns SVG when possible — crisp at any size
export function teamLogoUrl(teamId: number): string {
  // Use the standard team logo PNG at consistent size
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

// Alternative PNG version for emails (better cross-client compat)
export function teamLogoUrlPng(teamId: number, size: number = 240): string {
  return `https://midfield.mlbstatic.com/v1/team/${teamId}/spots/${size}`
}

// Get player headshot URL by MLB player ID
// Sizes: 60, 120, 240 most common
export function playerHeadshotUrl(playerId: number, size: number = 240): string {
  // Use Cloudinary's c_fill,g_face — face-detect crop guarantees a square image with the face centered
  return `https://img.mlbstatic.com/mlb-photos/image/upload/c_fill,g_face,w_${size},h_${size},q_auto:best/v1/people/${playerId}/headshot/67/current`
}