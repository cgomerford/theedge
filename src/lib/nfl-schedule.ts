// src/lib/nfl-schedule.ts
// NFL schedule fetching from ESPN public API
// No auth required

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl'

// ── Types ─────────────────────────────────────────────────────────────────────

export type NFLGame = {
  id: string
  slug: string          // e.g. "kansas-city-chiefs-at-baltimore-ravens-2026-09-09"
  date: string          // ISO
  week: number
  season: number
  homeTeam: NFLGameTeam
  awayTeam: NFLGameTeam
  status: 'scheduled' | 'in_progress' | 'final' | 'postponed'
  statusDisplay: string // e.g. "7:20 PM ET" or "Final"
  homeScore: number | null
  awayScore: number | null
  venue: string
  broadcast: string
  weather?: {
    temp: number | null
    condition: string | null
  } | null
}

export type NFLGameTeam = {
  id: string
  name: string
  shortName: string
  abbreviation: string
  logo: string
  record: string
  rank: number | null
}

export type NFLWeek = {
  week: number
  label: string         // e.g. "Week 1" or "Wild Card"
  startDate: string
  endDate: string
  games: NFLGame[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSlug(awayAbbr: string, homeAbbr: string, date: string): string {
  const teamSlugMap: Record<string, string> = {
    'BUF': 'buffalo-bills', 'MIA': 'miami-dolphins', 'NE': 'new-england-patriots', 'NYJ': 'new-york-jets',
    'BAL': 'baltimore-ravens', 'CIN': 'cincinnati-bengals', 'CLE': 'cleveland-browns', 'PIT': 'pittsburgh-steelers',
    'HOU': 'houston-texans', 'IND': 'indianapolis-colts', 'JAX': 'jacksonville-jaguars', 'TEN': 'tennessee-titans',
    'DEN': 'denver-broncos', 'KC': 'kansas-city-chiefs', 'LV': 'las-vegas-raiders', 'LAC': 'los-angeles-chargers',
    'DAL': 'dallas-cowboys', 'NYG': 'new-york-giants', 'PHI': 'philadelphia-eagles', 'WSH': 'washington-commanders',
    'CHI': 'chicago-bears', 'DET': 'detroit-lions', 'GB': 'green-bay-packers', 'MIN': 'minnesota-vikings',
    'ATL': 'atlanta-falcons', 'CAR': 'carolina-panthers', 'NO': 'new-orleans-saints', 'TB': 'tampa-bay-buccaneers',
    'ARI': 'arizona-cardinals', 'LAR': 'los-angeles-rams', 'SF': 'san-francisco-49ers', 'SEA': 'seattle-seahawks',
  }
  const awaySlug = teamSlugMap[awayAbbr] ?? awayAbbr.toLowerCase()
  const homeSlug = teamSlugMap[homeAbbr] ?? homeAbbr.toLowerCase()
  const dateStr = date.split('T')[0].replace(/-/g, '-')
  return `${awaySlug}-at-${homeSlug}-${dateStr}`
}

function parseGameStatus(event: any): NFLGame['status'] {
  const state = event.status?.type?.state ?? ''
  if (state === 'in') return 'in_progress'
  if (state === 'post') return 'final'
  if (state === 'pre') return 'scheduled'
  return 'scheduled'
}

function parseTeam(competitor: any): NFLGameTeam {
  return {
    id: competitor.team?.id ?? '',
    name: competitor.team?.displayName ?? '',
    shortName: competitor.team?.shortDisplayName ?? competitor.team?.name ?? '',
    abbreviation: competitor.team?.abbreviation ?? '',
    logo: competitor.team?.logos?.[0]?.href ?? `https://a.espncdn.com/i/teamlogos/nfl/500/${competitor.team?.abbreviation?.toLowerCase()}.png`,
    record: competitor.records?.[0]?.summary ?? '0-0',
    rank: competitor.curatedRank?.current ?? null,
  }
}

// ── Current week schedule ─────────────────────────────────────────────────────

export async function getNFLCurrentWeek(): Promise<NFLWeek | null> {
  try {
    const res = await fetch(`${ESPN}/scoreboard`, {
      next: { revalidate: 300 }, // 5 min cache
    })
    if (!res.ok) return null
    const data = await res.json()

    const weekNum = data.week?.number ?? 1
    const seasonYear = data.season?.year ?? new Date().getFullYear()
    const events: any[] = data.events ?? []

    const games: NFLGame[] = events.map(event => {
      const competitors: any[] = event.competitions?.[0]?.competitors ?? []
      const home = competitors.find((c: any) => c.homeAway === 'home')
      const away = competitors.find((c: any) => c.homeAway === 'away')
      if (!home || !away) return null

      const homeTeam = parseTeam(home)
      const awayTeam = parseTeam(away)
      const status = parseGameStatus(event)

      return {
        id: event.id,
        slug: buildSlug(awayTeam.abbreviation, homeTeam.abbreviation, event.date),
        date: event.date,
        week: weekNum,
        season: seasonYear,
        homeTeam,
        awayTeam,
        status,
        statusDisplay: event.status?.type?.shortDetail ?? '',
        homeScore: status !== 'scheduled' ? Number(home.score ?? 0) : null,
        awayScore: status !== 'scheduled' ? Number(away.score ?? 0) : null,
        venue: event.competitions?.[0]?.venue?.fullName ?? '',
        broadcast: event.competitions?.[0]?.broadcasts?.[0]?.names?.[0] ?? '',
        weather: event.competitions?.[0]?.weather
          ? {
              temp: event.competitions[0].weather.temperature ?? null,
              condition: event.competitions[0].weather.displayValue ?? null,
            }
          : null,
      } as NFLGame
    }).filter(Boolean) as NFLGame[]

    return {
      week: weekNum,
      label: `Week ${weekNum}`,
      startDate: data.week?.teaser ?? '',
      endDate: '',
      games,
    }
  } catch (e) {
    console.error('getNFLCurrentWeek error:', e)
    return null
  }
}

// ── Specific week ─────────────────────────────────────────────────────────────

export async function getNFLWeekSchedule(
  season: number,
  week: number,
  seasonType: number = 2 // 1=preseason, 2=regular, 3=postseason
): Promise<NFLWeek | null> {
  try {
    const res = await fetch(
      `${ESPN}/scoreboard?seasontype=${seasonType}&week=${week}&dates=${season}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return null
    const data = await res.json()

    const events: any[] = data.events ?? []
    const games: NFLGame[] = events.map(event => {
      const competitors: any[] = event.competitions?.[0]?.competitors ?? []
      const home = competitors.find((c: any) => c.homeAway === 'home')
      const away = competitors.find((c: any) => c.homeAway === 'away')
      if (!home || !away) return null

      const homeTeam = parseTeam(home)
      const awayTeam = parseTeam(away)
      const status = parseGameStatus(event)

      return {
        id: event.id,
        slug: buildSlug(awayTeam.abbreviation, homeTeam.abbreviation, event.date),
        date: event.date,
        week,
        season,
        homeTeam,
        awayTeam,
        status,
        statusDisplay: event.status?.type?.shortDetail ?? '',
        homeScore: status !== 'scheduled' ? Number(home.score ?? 0) : null,
        awayScore: status !== 'scheduled' ? Number(away.score ?? 0) : null,
        venue: event.competitions?.[0]?.venue?.fullName ?? '',
        broadcast: event.competitions?.[0]?.broadcasts?.[0]?.names?.[0] ?? '',
        weather: null,
      } as NFLGame
    }).filter(Boolean) as NFLGame[]

    return {
      week,
      label: week <= 18 ? `Week ${week}` : week === 19 ? 'Wild Card' : week === 20 ? 'Divisional' : week === 21 ? 'Championship' : 'Super Bowl',
      startDate: '',
      endDate: '',
      games,
    }
  } catch (e) {
    console.error('getNFLWeekSchedule error:', e)
    return null
  }
}

// ── Single game by ESPN event ID ──────────────────────────────────────────────

export async function getNFLGameBySlug(slug: string): Promise<NFLGame | null> {
  // Slug format: away-team-at-home-team-YYYY-MM-DD
  // We need to fetch the scoreboard and find the matching game
  try {
    const res = await fetch(`${ESPN}/scoreboard`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const data = await res.json()
    const events: any[] = data.events ?? []

    for (const event of events) {
      const competitors: any[] = event.competitions?.[0]?.competitors ?? []
      const home = competitors.find((c: any) => c.homeAway === 'home')
      const away = competitors.find((c: any) => c.homeAway === 'away')
      if (!home || !away) continue

      const homeTeam = parseTeam(home)
      const awayTeam = parseTeam(away)
      const gameSlug = buildSlug(awayTeam.abbreviation, homeTeam.abbreviation, event.date)

      if (gameSlug === slug) {
        const status = parseGameStatus(event)
        return {
          id: event.id,
          slug: gameSlug,
          date: event.date,
          week: data.week?.number ?? 1,
          season: data.season?.year ?? new Date().getFullYear(),
          homeTeam,
          awayTeam,
          status,
          statusDisplay: event.status?.type?.shortDetail ?? '',
          homeScore: status !== 'scheduled' ? Number(home.score ?? 0) : null,
          awayScore: status !== 'scheduled' ? Number(away.score ?? 0) : null,
          venue: event.competitions?.[0]?.venue?.fullName ?? '',
          broadcast: event.competitions?.[0]?.broadcasts?.[0]?.names?.[0] ?? '',
          weather: event.competitions?.[0]?.weather
            ? {
                temp: event.competitions[0].weather.temperature ?? null,
                condition: event.competitions[0].weather.displayValue ?? null,
              }
            : null,
        }
      }
    }
    return null
  } catch (e) {
    console.error('getNFLGameBySlug error:', e)
    return null
  }
}

// ── Team schedule ─────────────────────────────────────────────────────────────

export async function getNFLTeamSchedule(
  teamId: string,
  season: number = new Date().getFullYear()
): Promise<NFLGame[]> {
  try {
    const res = await fetch(
      `${ESPN}/teams/${teamId}/schedule?season=${season}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    const events: any[] = data.events ?? []

    return events.map(event => {
      const competitors: any[] = event.competitions?.[0]?.competitors ?? []
      const home = competitors.find((c: any) => c.homeAway === 'home')
      const away = competitors.find((c: any) => c.homeAway === 'away')
      if (!home || !away) return null

      const homeTeam = parseTeam(home)
      const awayTeam = parseTeam(away)
      const status = parseGameStatus(event)

      return {
        id: event.id,
        slug: buildSlug(awayTeam.abbreviation, homeTeam.abbreviation, event.date),
        date: event.date,
        week: event.week?.number ?? 0,
        season,
        homeTeam,
        awayTeam,
        status,
        statusDisplay: event.status?.type?.shortDetail ?? '',
        homeScore: status !== 'scheduled' ? Number(home.score ?? 0) : null,
        awayScore: status !== 'scheduled' ? Number(away.score ?? 0) : null,
        venue: event.competitions?.[0]?.venue?.fullName ?? '',
        broadcast: event.competitions?.[0]?.broadcasts?.[0]?.names?.[0] ?? '',
        weather: null,
      } as NFLGame
    }).filter(Boolean) as NFLGame[]
  } catch (e) {
    console.error('getNFLTeamSchedule error:', e)
    return []
  }
}

// ── Get game by slug — searches current week AND past season ─────────────────
// Replaces the original getNFLGameBySlug which only searched current scoreboard

export async function getNFLGameBySlugEnhanced(slug: string): Promise<NFLGame | null> {
  // 1. Try current week scoreboard first (fast path for live/upcoming games)
  try {
    const res = await fetch(`${ESPN}/scoreboard`, { next: { revalidate: 300 } })
    if (res.ok) {
      const data = await res.json()
      const events: any[] = data.events ?? []
      for (const event of events) {
        const competitors: any[] = event.competitions?.[0]?.competitors ?? []
        const home = competitors.find((c: any) => c.homeAway === 'home')
        const away = competitors.find((c: any) => c.homeAway === 'away')
        if (!home || !away) continue
        const homeTeam = parseTeam(home)
        const awayTeam = parseTeam(away)
        const gameSlug = buildSlug(awayTeam.abbreviation, homeTeam.abbreviation, event.date)
        if (gameSlug === slug) {
          const status = parseGameStatus(event)
          return {
            id: event.id,
            slug: gameSlug,
            date: event.date,
            week: data.week?.number ?? 1,
            season: data.season?.year ?? new Date().getFullYear(),
            homeTeam,
            awayTeam,
            status,
            statusDisplay: event.status?.type?.shortDetail ?? '',
            homeScore: status !== 'scheduled' ? Number(home.score ?? 0) : null,
            awayScore: status !== 'scheduled' ? Number(away.score ?? 0) : null,
            venue: event.competitions?.[0]?.venue?.fullName ?? '',
            broadcast: event.competitions?.[0]?.broadcasts?.[0]?.names?.[0] ?? '',
            weather: event.competitions?.[0]?.weather ? {
              temp: event.competitions[0].weather.temperature ?? null,
              condition: event.competitions[0].weather.displayValue ?? null,
            } : null,
          }
        }
      }
    }
  } catch {}

  // 2. Parse slug to extract teams and date, build a minimal game object
  // Slug format: away-team-name-at-home-team-name-YYYY-MM-DD
  // e.g. kansas-city-chiefs-at-los-angeles-chargers-2025-09-06
  const dateMatch = slug.match(/(\d{4}-\d{2}-\d{2})$/)
  if (!dateMatch) return null

  const date = dateMatch[1]
  const withoutDate = slug.replace(`-${date}`, '')
  const atIndex = withoutDate.lastIndexOf('-at-')
  if (atIndex === -1) return null

  const awaySlug = withoutDate.slice(0, atIndex)
  const homeSlug = withoutDate.slice(atIndex + 4)

  // Reverse slug map
  const SLUG_TO_ABBR: Record<string, string> = {
    'buffalo-bills': 'BUF', 'miami-dolphins': 'MIA', 'new-england-patriots': 'NE', 'new-york-jets': 'NYJ',
    'baltimore-ravens': 'BAL', 'cincinnati-bengals': 'CIN', 'cleveland-browns': 'CLE', 'pittsburgh-steelers': 'PIT',
    'houston-texans': 'HOU', 'indianapolis-colts': 'IND', 'jacksonville-jaguars': 'JAX', 'tennessee-titans': 'TEN',
    'denver-broncos': 'DEN', 'kansas-city-chiefs': 'KC', 'las-vegas-raiders': 'LV', 'los-angeles-chargers': 'LAC',
    'dallas-cowboys': 'DAL', 'new-york-giants': 'NYG', 'philadelphia-eagles': 'PHI', 'washington-commanders': 'WSH',
    'chicago-bears': 'CHI', 'detroit-lions': 'DET', 'green-bay-packers': 'GB', 'minnesota-vikings': 'MIN',
    'atlanta-falcons': 'ATL', 'carolina-panthers': 'CAR', 'new-orleans-saints': 'NO', 'tampa-bay-buccaneers': 'TB',
    'arizona-cardinals': 'ARI', 'los-angeles-rams': 'LAR', 'san-francisco-49ers': 'SF', 'seattle-seahawks': 'SEA',
  }

  const ABBR_TO_ID: Record<string, string> = {
    'BUF': '17', 'MIA': '20', 'NE': '21', 'NYJ': '18',
    'BAL': '33', 'CIN': '4', 'CLE': '5', 'PIT': '23',
    'HOU': '34', 'IND': '11', 'JAX': '30', 'TEN': '10',
    'DEN': '7', 'KC': '12', 'LV': '13', 'LAC': '24',
    'DAL': '6', 'NYG': '19', 'PHI': '22', 'WSH': '28',
    'CHI': '3', 'DET': '16', 'GB': '9', 'MIN': '29',
    'ATL': '1', 'CAR': '2', 'NO': '25', 'TB': '27',
    'ARI': '32', 'LAR': '14', 'SF': '26', 'SEA': '15',
  }

  const awayAbbr = SLUG_TO_ABBR[awaySlug] ?? awaySlug.toUpperCase().slice(0, 3)
  const homeAbbr = SLUG_TO_ABBR[homeSlug] ?? homeSlug.toUpperCase().slice(0, 3)
  const awayId = ABBR_TO_ID[awayAbbr] ?? ''
  const homeId = ABBR_TO_ID[homeAbbr] ?? ''
  const season = parseInt(date.slice(0, 4))

  const makeTeam = (abbr: string, id: string): NFLGameTeam => ({
    id,
    name: abbr,
    shortName: abbr,
    abbreviation: abbr,
    logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`,
    record: '',
    rank: null,
  })

  // Determine if past final
  const isPast = new Date(date) < new Date()

  return {
    id: slug,
    slug,
    date: `${date}T00:00:00Z`,
    week: 0, // unknown from slug alone
    season,
    homeTeam: makeTeam(homeAbbr, homeId),
    awayTeam: makeTeam(awayAbbr, awayId),
    status: isPast ? 'final' : 'scheduled',
    statusDisplay: isPast ? 'Final' : 'Scheduled',
    homeScore: null,
    awayScore: null,
    venue: '',
    broadcast: '',
    weather: null,
  }
}