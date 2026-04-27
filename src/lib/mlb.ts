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