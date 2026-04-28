// MLB Stats API — official, free, no API key needed
const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type MLBGame = {
  gamePk: number
  gameDate: string
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

// Convert "New York Yankees" -> "new-york-yankees"
function teamSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Build the URL slug for a game's preview page
// e.g. "new-york-yankees-vs-boston-red-sox-2026-04-28"
export function slugifyGame(game: MLBGame): string {
  const date = game.gameDate.split('T')[0]
  const away = teamSlug(game.teams.away.team.name)
  const home = teamSlug(game.teams.home.team.name)
  return `${away}-vs-${home}-${date}`
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
  ip: string          // innings pitched, e.g. "6.1"
  h: number
  er: number
  bb: number
  so: number
  era: string         // game ERA
  result: string      // "W", "L", or "ND"
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

// Get a pitcher's last N starts
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

// Get a pitcher's season stats
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
// STATCAST — pitch mix from Baseball Savant
// =====================================================

export type PitchType = {
  pitch_name: string       // "4-Seam Fastball", "Slider", "Curveball", etc.
  pitch_code: string       // "FF", "SL", "CU", etc.
  count: number
  percentage: number       // 0-100
  avg_velocity: number     // mph
}


// =====================================================
// WEATHER — Open-Meteo (free, no API key needed)
// =====================================================

export type GameWeather = {
  temp_f: number
  feels_like_f: number
  wind_mph: number
  wind_direction: number  // degrees (0=N, 90=E, 180=S, 270=W)
  wind_direction_text: string
  precipitation_chance: number  // 0-100
  cloud_cover: number  // 0-100
  conditions: string  // "Clear", "Partly cloudy", "Rain", etc.
}

function describeWindDirection(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

function describeConditions(weatherCode: number): string {
  // WMO weather codes — abridged
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
  // Open-Meteo gives hourly forecasts. We pick the hour closest to game time.
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=3&timezone=auto`

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })  // cache 1 hour
    if (!res.ok) {
      console.error('Open-Meteo fetch failed:', res.status)
      return null
    }
    const data = await res.json()

    const hourly = data.hourly
    if (!hourly || !hourly.time) return null

    // Find the hour closest to game time
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

import { createAdminClient } from '@/lib/supabase'

export type PitchType = {
  pitch_name: string
  pitch_code: string
  count: number
  percentage: number
  avg_velocity: number
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
  }))
}

// Color for each pitch type — used in the bar chart
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