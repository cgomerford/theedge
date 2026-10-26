// src/lib/mlb-homepage.ts

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb'
const SEASON = new Date().getFullYear()

// ─── Types ────────────────────────────────────────────────

export type MLBStandingTeam = {
  id: number
  name: string
  abbreviation: string
  wins: number
  losses: number
  pct: string
  gb: string
  streak: string
  runsScored: number
  runsAllowed: number
  divisionRecord: string
  homeRecord: string
  awayRecord: string
}

export type MLBDivisionStandings = {
  division: string
  league: 'AL' | 'NL'
  teams: MLBStandingTeam[]
}

export type MLBStatLeader = {
  rank: number
  name: string
  teamAbbr: string
  headshot: string
  statValue: string
  personId: number 
}

export type MLBStatCategory = {
  slug: string
  label: string
  group: 'batting' | 'pitching'
}

export type MLBNewsItem = {
  id: string
  headline: string
  description: string
  published: string
  link: string
  image?: string
   source?: string
}

export type MLBTeamRecord = {
  wins: number
  losses: number
  pct: string
  gb: string
  streak: string
  division: string
  divisionRank: number
  homeRecord: string
  awayRecord: string
  runsScored: number
  runsAllowed: number
}

export type MLBNextGame = {
  gamePk: number
  gameDate: string
  gameTime: string
  opponent: string
  opponentId: number
  isHome: boolean
  venue: string
  slug: string
}

export type MLBTeamLeader = {
  category: 'batting' | 'pitching'
  label: string
  name: string
  personId: number
  value: string
}

// ─── Constants ────────────────────────────────────────────

export const MLB_STAT_CATEGORIES: MLBStatCategory[] = [
  { slug: 'battingAverage',              label: 'AVG',  group: 'batting'  },
  { slug: 'homeRuns',                    label: 'HR',   group: 'batting'  },
  { slug: 'rbi',                         label: 'RBI',  group: 'batting'  },
  { slug: 'stolenBases',                 label: 'SB',   group: 'batting'  },
  { slug: 'onBasePlusSlugging',          label: 'OPS',  group: 'batting'  },
  { slug: 'earnedRunAverage',            label: 'ERA',  group: 'pitching' },
  { slug: 'strikeOuts',                  label: 'SO',   group: 'pitching' },
  { slug: 'walksAndHitsPerInningPitched',label: 'WHIP', group: 'pitching' },
  { slug: 'wins',                        label: 'W',    group: 'pitching' },
  { slug: 'saves',                       label: 'SV',   group: 'pitching' },
]

const TEAM_LEADER_CATS: { cat: string; label: string; group: 'batting' | 'pitching' }[] = [
  { cat: 'battingAverage',   label: 'AVG', group: 'batting'  },
  { cat: 'homeRuns',         label: 'HR',  group: 'batting'  },
  { cat: 'rbi',              label: 'RBI', group: 'batting'  },
  { cat: 'stolenBases',      label: 'SB',  group: 'batting'  },
  { cat: 'earnedRunAverage', label: 'ERA', group: 'pitching' },
  { cat: 'strikeOuts',       label: 'SO',  group: 'pitching' },
  { cat: 'wins',             label: 'W',   group: 'pitching' },
  { cat: 'saves',            label: 'SV',  group: 'pitching' },
]

export const ESPN_TEAM_IDS: Record<string, number> = {
  'orioles': 1,      'red-sox': 2,      'angels': 3,       'white-sox': 4,
  'guardians': 5,    'tigers': 6,       'royals': 7,       'brewers': 8,
  'twins': 9,        'yankees': 10,     'athletics': 11,   'mariners': 12,
  'rangers': 13,     'blue-jays': 14,   'braves': 15,      'cubs': 16,
  'reds': 17,        'astros': 18,      'dodgers': 19,     'nationals': 20,
  'mets': 21,        'phillies': 22,    'pirates': 23,     'cardinals': 24,
  'padres': 25,      'giants': 26,      'rockies': 27,     'marlins': 28,
  'diamondbacks': 29,'rays': 30,
}

const DIVISION_NAMES: Record<number, string> = {
  200: 'AL West', 201: 'AL East', 202: 'AL Central',
  203: 'NL West', 204: 'NL East', 205: 'NL Central',
}

// ─── Helpers ──────────────────────────────────────────────

function buildSlug(awayName: string, homeName: string, officialDate: string): string {
  const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${toSlug(awayName)}-vs-${toSlug(homeName)}-${officialDate}`
}

// ─── Standings ────────────────────────────────────────────

export async function getMLBStandings(): Promise<MLBDivisionStandings[]> {
  try {
    const url = `${MLB_API}/standings?leagueId=103,104&season=${SEASON}&hydrate=team,division,record`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()

    const divisions: MLBDivisionStandings[] = []

    for (const record of data.records ?? []) {
      const divId: number = record.division?.id
      const divName = DIVISION_NAMES[divId] ?? record.division?.name ?? 'Unknown'
      const league: 'AL' | 'NL' = divName.startsWith('AL') ? 'AL' : 'NL'

      const teams: MLBStandingTeam[] = (record.teamRecords ?? []).map((tr: any) => {
        const splitRecords: any[] = tr.records?.splitRecords ?? []
        const homeRec = splitRecords.find((r: any) => r.type === 'home')
        const awayRec = splitRecords.find((r: any) => r.type === 'away')
        const divRec  = splitRecords.find((r: any) => r.type === 'division')
        const fmt = (r: any) => r ? `${r.wins}-${r.losses}` : '—'

        return {
          id: tr.team?.id,
          name: tr.team?.name ?? '—',
          abbreviation: tr.team?.abbreviation ?? '—',
          wins: tr.wins ?? 0,
          losses: tr.losses ?? 0,
          pct: tr.leagueRecord?.pct ?? '.000',
          gb: tr.gamesBack === '0' ? '—' : (tr.gamesBack ?? '—'),
          streak: tr.streak?.streakCode ?? '—',
          runsScored: tr.runsScored ?? 0,
          runsAllowed: tr.runsAllowed ?? 0,
          divisionRecord: fmt(divRec),
          homeRecord: fmt(homeRec),
          awayRecord: fmt(awayRec),
        }
      })

      divisions.push({ division: divName, league, teams })
    }

    const ORDER = ['AL East', 'AL Central', 'AL West', 'NL East', 'NL Central', 'NL West']
    divisions.sort((a, b) => ORDER.indexOf(a.division) - ORDER.indexOf(b.division))
    return divisions
  } catch (e) {
    console.error('MLB standings error:', e)
    return []
  }
}

// ─── League stat leaders ──────────────────────────────────
export async function getMLBStatLeaders(
  category: string,
  limit = 10,
  group?: 'batting' | 'pitching'
): Promise<MLBStatLeader[]> {
  try {
    const statGroup = group === 'batting' ? 'hitting' : group === 'pitching' ? 'pitching' : ''
    const groupParam = statGroup ? `&statGroup=${statGroup}` : ''
    const url = `${MLB_API}/stats/leaders?leaderCategories=${category}&season=${SEASON}&limit=${limit}&sportId=1${groupParam}`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) {
      console.error(`MLB leaders ${category}: HTTP ${res.status}`)
      return []
    }
    const data = await res.json()
    const leaders = data.leagueLeaders?.[0]?.leaders ?? []

    if (leaders.length === 0) {
      console.error(`MLB leaders ${category}: empty response`)
      return []
    }

    return leaders.map((l: any, i: number) => {
      const personId = l.person?.id ?? 0
      return {
        rank: l.rank ?? i + 1,
        name: l.person?.fullName ?? '—',
        teamAbbr: l.team?.abbreviation ?? l.team?.name?.split(' ').slice(-1)[0] ?? '—',
        personId,
        headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`,
        statValue: String(l.value ?? '—'),
      }
    })
  } catch (e) {
    console.error(`MLB stat leaders error (${category}):`, e)
    return []
  }
}
// ─── Team stat leaders ────────────────────────────────────

export async function getMLBTeamLeaders(mlbTeamId: number): Promise<MLBTeamLeader[]> {
  try {
    const results = await Promise.all(
      TEAM_LEADER_CATS.map(async ({ cat, label, group }) => {
        // statGroup separates hitters from pitchers — prevents pitchers showing as AVG leader
        const statGroup = group === 'batting' ? 'hitting' : 'pitching'
        const url = `${MLB_API}/stats/leaders?leaderCategories=${cat}&teamId=${mlbTeamId}&season=${SEASON}&limit=1&hydrate=person&sportId=1&statGroup=${statGroup}`
        const res = await fetch(url, { next: { revalidate: 3600 } })
        if (!res.ok) return null
        const data = await res.json()
        const leader = data.leagueLeaders?.[0]?.leaders?.[0]
        if (!leader) return null
        return {
          category: group,
          label,
          name: leader.person?.fullName ?? '—',
          personId: leader.person?.id ?? 0,
          value: String(leader.value ?? '—'),
        }
      })
    )
    return results.filter((r): r is MLBTeamLeader => r !== null)
  } catch {
    return []
  }
}

// ─── League news ──────────────────────────────────────────

export async function getMLBNews(): Promise<MLBNewsItem[]> {
  try {
    const res = await fetch(`${ESPN}/news?limit=12`, { next: { revalidate: 1800 } })
    if (!res.ok) return []
    const data = await res.json()
    const raw = data.articles ?? data.items ?? []
    return (raw as any[]).slice(0, 12).map((a: any) => ({
      id: String(a.id ?? Math.random()),
      headline: a.headline ?? a.title ?? '',
      description: a.description ?? a.summary ?? '',
      published: a.published ?? a.lastModified ?? '',
      link: a.links?.web?.href ?? a.webUrl ?? '#',
      image: a.images?.[0]?.url ?? undefined,
    }))
  } catch (e) {
    console.error('MLB news error:', e)
    return []
  }
}

// ─── RSS parser (no dependency needed) ───────────────────

function stripHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '') // Moved to the end!
    .trim()
}

function parseRSSItems(xml: string): MLBNewsItem[] {
  const items: MLBNewsItem[] = []
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) ?? []

  for (const block of itemBlocks) {
    const getCdata = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))
      return m ? m[1].trim() : null
    }
    const getText = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`))
      return m ? m[1].trim() : null
    }
    const getAttr = (tag: string, attr: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"[^>]*>`))
      return m ? m[1] : null
    }

    const title = getCdata('title') ?? getText('title') ?? ''
    const rawLink = getCdata('link') ?? getText('link') ?? getAttr('link', 'href') ?? ''
    // Google News wraps real URL in redirect — extract it
    const link = rawLink.replace(/^https:\/\/news\.google\.com\/rss\/articles\/.*url=([^&]+).*$/, '$1') || rawLink
    const rawDesc = getCdata('description') ?? getText('description') ?? ''
    const description = stripHtml(rawDesc).slice(0, 200)
    const pubDate = getCdata('pubDate') ?? getText('pubDate') ?? ''
    const image = getAttr('media:content', 'url') ?? getAttr('enclosure', 'url') ?? null

    if (title && link) {
      items.push({
        id: link,
        headline: title,
        description,
        published: pubDate ? new Date(pubDate).toISOString() : '',
        link,
        image: image ?? undefined,
      })
    }
  }
  return items
}

async function fetchRSS(url: string): Promise<MLBNewsItem[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)' },
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSSItems(xml)
  } catch {
    return []
  }
}

// ─── Multi-source MLB news ────────────────────────────────
export async function getMLBNewsMultiSource(): Promise<MLBNewsItem[]> {
  const [espn, mlbCom, cbs] = await Promise.all([
    getMLBNews(),
    fetchRSS('https://www.mlb.com/feeds/news/rss.xml'),
    fetchRSS('https://www.cbssports.com/rss/headlines/mlb/'),
  ])

  const all = [...espn, ...mlbCom, ...cbs]

  // Deduplicate by headline similarity
  const seen = new Set<string>()
  const unique = all.filter(item => {
    if (!item.headline) return false
    const key = item.headline.toLowerCase().slice(0, 50).replace(/\s+/g, ' ').trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort newest first
  unique.sort((a, b) => {
    const da = a.published ? new Date(a.published).getTime() : 0
    const db = b.published ? new Date(b.published).getTime() : 0
    return db - da
  })

  return unique.slice(0, 24)
}

// ─── Team news ────────────────────────────────────────────

// ─── Local outlet name lookup ─────────────────────────────

const LOCAL_OUTLET_NAMES: Record<string, string> = {
  'nbcsportsphiladelphia': 'NBC Sports Philly',
  'nbcsportsboston': 'NBC Sports Boston',
  'nbcchicago': 'NBC Sports Chicago',
  'nbcsportsbayarea': 'NBC Sports Bay Area',
  'sny': 'SNY',
  'nesn': 'NESN',
  'masnsports': 'MASN',
  'theathletic': 'The Athletic',
  'espn': 'ESPN',
  'mlb': 'MLB.com',
  'cbssports': 'CBS Sports',
  'foxsports': 'Fox Sports',
  'nypost': 'NY Post',
  'bostonglobe': 'Boston Globe',
  'inquirer': 'Philly Inquirer',
  'chicagotribune': 'Chicago Tribune',
  'latimes': 'LA Times',
  'nytimes': 'NY Times',
  'chron': 'Houston Chronicle',
  'seattletimes': 'Seattle Times',
  'azcentral': 'AZ Central',
  'startribune': 'Star Tribune',
  'yahoo': 'Yahoo Sports',
  'si': 'Sports Illustrated',
  'bleacherreport': 'Bleacher Report',
  'fansided': 'FanSided',
}

function identifySource(url: string): string {
  try {
    const host = new URL(url).hostname.replace('www.', '').toLowerCase()
    for (const [key, label] of Object.entries(LOCAL_OUTLET_NAMES)) {
      if (host.includes(key)) return label
    }
    const parts = host.split('.')
    const domain = parts[parts.length - 2] ?? host
    return domain.charAt(0).toUpperCase() + domain.slice(1)
  } catch {
    return 'News'
  }
}

async function fetchGoogleNewsForTeam(teamName: string): Promise<MLBNewsItem[]> {
  try {
    const query = encodeURIComponent(`"${teamName}" baseball`)
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)' },
    })
    if (!res.ok) return []
    const xml = await res.text()
    const items: MLBNewsItem[] = []
    const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) ?? []

    for (const block of itemBlocks) {
      const getCdata = (tag: string) => {
        const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))
        return m ? m[1].trim() : null
      }
      const getText = (tag: string) => {
        const m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`))
        return m ? m[1].trim() : null
      }

      const rawTitle = stripHtml(getCdata('title') ?? getText('title') ?? '')
      const rawLink = getText('link') ?? ''
      const rawDesc = getCdata('description') ?? getText('description') ?? ''
      const pubDate = getText('pubDate') ?? ''

      // Google News title format: "Headline - Source Name"
      let headline = rawTitle
      let sourceName = ''
      const dashIdx = rawTitle.lastIndexOf(' - ')
      if (dashIdx > 0) {
        headline = rawTitle.slice(0, dashIdx).trim()
        sourceName = rawTitle.slice(dashIdx + 3).trim()
      }

      if (!headline || headline.length < 15) continue

      items.push({
        id: rawLink + headline.slice(0, 20),
        headline,
        description: stripHtml(rawDesc).slice(0, 200),
        published: pubDate ? new Date(pubDate).toISOString() : '',
        link: rawLink,
        image: undefined,
        source: sourceName || identifySource(rawLink),
      })
    }

    return items
  } catch {
    return []
  }
}

export async function getMLBTeamNews(teamSlug: string, teamName: string): Promise<MLBNewsItem[]> {
  const shortTeamName = teamName.split(' ').slice(-1)[0].toLowerCase()

  const [googleNews, espnGeneral] = await Promise.all([
    fetchGoogleNewsForTeam(teamName),
    getMLBNews(),
  ])

  const espnFiltered = espnGeneral.filter(a => {
    const text = (a.headline + ' ' + a.description).toLowerCase()
    return text.includes(shortTeamName) || text.includes(teamName.toLowerCase())
  })

  const all = [...googleNews, ...espnFiltered]

  const seen = new Set<string>()
  const unique = all.filter(item => {
    if (!item.headline) return false
    const key = item.headline.toLowerCase().slice(0, 50).replace(/\s+/g, ' ').trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  unique.sort((a, b) => {
    const da = a.published ? new Date(a.published).getTime() : 0
    const db = b.published ? new Date(b.published).getTime() : 0
    return db - da
  })

  return unique.slice(0, 15)
}
// ─── Team record ──────────────────────────────────────────

export async function getMLBTeamRecord(mlbTeamId: number): Promise<MLBTeamRecord | null> {
  try {
    const standings = await getMLBStandings()
    for (const div of standings) {
      const idx = div.teams.findIndex(t => t.id === mlbTeamId)
      if (idx >= 0) {
        const t = div.teams[idx]
        return {
          wins: t.wins, losses: t.losses, pct: t.pct,
          gb: t.gb, streak: t.streak, division: div.division,
          divisionRank: idx + 1, homeRecord: t.homeRecord,
          awayRecord: t.awayRecord, runsScored: t.runsScored,
          runsAllowed: t.runsAllowed,
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── Team next game ───────────────────────────────────────

export async function getMLBTeamNextGame(mlbTeamId: number): Promise<MLBNextGame | null> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const url = `${MLB_API}/schedule?sportId=1&teamId=${mlbTeamId}&startDate=${today}&endDate=${end}&hydrate=team&limit=5`
    const res = await fetch(url, { next: { revalidate: 1800 } })
    if (!res.ok) return null
    const data = await res.json()
    const game = data.dates?.[0]?.games?.[0]
    if (!game) return null

    const isHome = game.teams.home.team.id === mlbTeamId
    const opp = isHome ? game.teams.away.team : game.teams.home.team
    const officialDate = game.officialDate ?? game.gameDate.split('T')[0]

    return {
      gamePk: game.gamePk,
      gameDate: officialDate,
      gameTime: game.gameDate,
      opponent: opp.name,
      opponentId: opp.id,
      isHome,
      venue: game.venue?.name ?? '',
      slug: buildSlug(game.teams.away.team.name, game.teams.home.team.name, officialDate),
    }
  } catch {
    return null
  }
}
// ─── Homepage: featured scout report + games strip ───────────────────────────
//
// Server-only helpers for src/app/page.tsx. The hero is ONE starter (the home team's if named, else the away team's) in
// the day's most notable game. Numbers come from the same tables the scout report page reads:
//   pitch mix, velocity, miss rate, pitch counts  -> pitcher_zone_arsenal (split "all"), via getPitcherZoneArsenal
//   record, ERA, innings, xwOBA allowed           -> pitcher_stats
//   batters faced (the n for xwOBA)               -> MLB Stats API season line (pitcher_stats stores no BF)
//   head-to-head                                  -> MLB Stats API vsPlayer, one call per opposing hitter (cached a day)
//   "Through" date                                -> the newest updated_at on the starter's pitcher_zone_arsenal rows
// Every function returns null / [] on failure and logs with its name; nothing is invented.

import { createAdminClient } from '@/lib/supabase'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getPitcherHandedness, slugifyGame, type MLBGame } from '@/lib/mlb'
import { findTeamByName } from '@/lib/teams'
import { MIN_SAMPLE } from '@/lib/min-sample'

type RawTeamSide = {
  team: { id: number; name: string; abbreviation?: string }
  probablePitcher?: { id: number; fullName: string }
  leagueRecord?: { wins: number; losses: number }
  score?: number
}
export type RawGame = MLBGame & {
  gameType?: string
  seriesDescription?: string
  seriesGameNumber?: number
  gamesInSeries?: number
  ifNecessary?: string
  status: { detailedState: string; abstractGameState: string; startTimeTBD?: boolean }
  teams: { away: RawTeamSide; home: RawTeamSide }
}

const HYDRATE = 'team,probablePitcher,linescore,venue'

async function fetchRange(start: string, end: string): Promise<{ date: string; games: RawGame[] }[]> {
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&startDate=${start}&endDate=${end}&hydrate=${HYDRATE}`, { next: { revalidate: 600 } })
    if (!res.ok) {
      console.error('[fetchRange] MLB API status', res.status)
      return []
    }
    const json = await res.json()
    return (json.dates ?? []).map((d: { date: string; games: RawGame[] }) => ({ date: d.date, games: d.games }))
  } catch (e) {
    console.error('[fetchRange] failed:', e instanceof Error ? e.message : e)
    return []
  }
}

const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
const isPostseason = (g: RawGame) => !!g.gameType && !['R', 'S', 'E', 'A'].includes(g.gameType)
const winPct = (s: RawTeamSide) => {
  const w = s.leagueRecord?.wins ?? 0
  const l = s.leagueRecord?.losses ?? 0
  return w + l > 0 ? w / (w + l) : 0
}

/** Most notable game of a slate: postseason first, then the best combined record among games with both starters named. */
function pickNotable(games: RawGame[]): RawGame | null {
  if (games.length === 0) return null
  const post = games.filter(isPostseason)
  const pool = post.length ? post : games
  const named = pool.filter(g => g.teams.away.probablePitcher && g.teams.home.probablePitcher)
  const ranked = (named.length ? named : pool).slice().sort((a, b) => winPct(b.teams.away) + winPct(b.teams.home) - (winPct(a.teams.away) + winPct(a.teams.home)))
  return ranked[0] ?? null
}

export type HomeSlate = {
  /** the featured game */
  game: RawGame
  /** the date the game belongs to (YYYY-MM-DD) */
  date: string
  isToday: boolean
  /** 'today' = on today's slate; 'next' = the next day with games; 'last' = off-season, the last final */
  mode: 'today' | 'next' | 'last'
  /** every game of that day (used for the regular-season strip) */
  dayGames: RawGame[]
}

/** Today's most notable game; else the next game within 14 days; else (off-season) the last final within 60 days. */
export async function getHomeSlate(): Promise<HomeSlate | null> {
  const now = new Date()
  const today = isoDay(now)
  const ahead = await fetchRange(today, isoDay(addDays(now, 14)))
  const todays = ahead.find(d => d.date === today)?.games ?? []
  if (todays.length) {
    const game = pickNotable(todays)
    if (game) return { game, date: today, isToday: true, mode: 'today', dayGames: todays }
  }
  const next = ahead.find(d => d.date > today && d.games.length)
  if (next) {
    const game = pickNotable(next.games)
    if (game) return { game, date: next.date, isToday: false, mode: 'next', dayGames: next.games }
  }
  const back = await fetchRange(isoDay(addDays(now, -60)), isoDay(addDays(now, -1)))
  for (const d of back.slice().reverse()) {
    const finals = d.games.filter(g => g.status?.abstractGameState === 'Final')
    const game = pickNotable(finals)
    if (game) return { game, date: d.date, isToday: false, mode: 'last', dayGames: finals }
  }
  return null
}

// ─── Games strip ────────────────────────────────────────────────────────────

const lastName = (full?: string) => (full ? full.trim().split(/\s+/).slice(-1)[0] : null)
const abbrOf = (s: RawTeamSide) => findTeamByName(s.team.name)?.abbrev ?? s.team.abbreviation ?? s.team.name.slice(0, 3).toUpperCase()
const SERIES_ABBR: Record<string, string> = { 'World Series': 'WS', 'League Championship Series': 'LCS', 'Division Series': 'DS', 'Wild Card Series': 'WC' }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Mon 26 Oct" from a YYYY-MM-DD date */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export type StripGame = {
  gamePk: number
  slug: string
  /** "WS G3" for a series game, otherwise the matchup time is the label */
  label: string | null
  state: 'final' | 'live' | 'next' | 'scheduled' | 'if-needed'
  startIso: string
  timeTbc: boolean
  dateLabel: string
  away: { id: number; abbr: string; score: number | null }
  home: { id: number; abbr: string; score: number | null }
  /** third line: the final score ("MIL 3-2"), "Gasser vs Peralta", or "Starters TBA" */
  detail: string
}

function toStripGame(g: RawGame, date: string, nextPk: number | null): StripGame {
  const abstract = g.status?.abstractGameState
  const ifNeeded = g.ifNecessary === 'Y'
  const away = g.teams.away, home = g.teams.home
  const state: StripGame['state'] = abstract === 'Final' ? 'final' : abstract === 'Live' ? 'live' : g.gamePk === nextPk ? 'next' : ifNeeded ? 'if-needed' : 'scheduled'
  const series = g.seriesDescription ? SERIES_ABBR[g.seriesDescription] ?? g.seriesDescription : null
  let detail: string
  if (state === 'final' && away.score != null && home.score != null) {
    const awayWon = away.score > home.score
    detail = `${abbrOf(awayWon ? away : home)} ${Math.max(away.score, home.score)}-${Math.min(away.score, home.score)}`
  } else {
    const a = lastName(away.probablePitcher?.fullName), h = lastName(home.probablePitcher?.fullName)
    detail = a && h ? `${a} vs ${h}` : 'Starters TBA'
  }
  return {
    gamePk: g.gamePk,
    slug: slugifyGame(g),
    label: series && g.seriesGameNumber ? `${series} G${g.seriesGameNumber}${ifNeeded ? '*' : ''}` : null,
    state,
    startIso: g.gameDate,
    timeTbc: !!g.status?.startTimeTBD || abstract === 'Preview' && ifNeeded,
    dateLabel: dayLabel(date),
    away: { id: away.team.id, abbr: abbrOf(away), score: away.score ?? null },
    home: { id: home.team.id, abbr: abbrOf(home), score: home.score ?? null },
    detail,
  }
}

export type HomeStrip = {
  games: StripGame[]
  /** "No games today (Sun 25 Oct) · next: WS G3, Mon 26 Oct", or null on a game day */
  note: string | null
  /** true when the series spans more games than are shown (starred = only if needed) */
  hasIfNeeded: boolean
}

/** Postseason: the whole series (up to 7 games). Regular season: the day's slate, up to 7 games. */
export async function getHomeStrip(slate: HomeSlate | null): Promise<HomeStrip> {
  if (!slate) return { games: [], note: null, hasIfNeeded: false }
  const now = new Date()
  const today = isoDay(now)
  const g = slate.game

  let rows: { game: RawGame; date: string }[]
  if (isPostseason(g)) {
    const days = await fetchRange(isoDay(addDays(new Date(`${slate.date}T12:00:00Z`), -10)), isoDay(addDays(new Date(`${slate.date}T12:00:00Z`), 10)))
    const ids = new Set([g.teams.away.team.id, g.teams.home.team.id])
    rows = days.flatMap(d => d.games.filter(x => isPostseason(x) && x.seriesDescription === g.seriesDescription && ids.has(x.teams.away.team.id) && ids.has(x.teams.home.team.id)).map(game => ({ game, date: d.date })))
    rows.sort((a, b) => (a.game.seriesGameNumber ?? 0) - (b.game.seriesGameNumber ?? 0))
  } else {
    rows = slate.dayGames.slice().sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime()).map(game => ({ game, date: slate.date }))
  }
  rows = rows.slice(0, 7)

  const nextPk = rows.find(r => r.game.status?.abstractGameState === 'Preview')?.game.gamePk ?? null
  const games = rows.map(r => toStripGame(r.game, r.date, nextPk))
  const nextGame = games.find(x => x.state === 'next')
  const note = slate.mode === 'today' ? null : nextGame
    ? `No games today (${dayLabel(today)}) · next: ${nextGame.label ?? `${nextGame.away.abbr} at ${nextGame.home.abbr}`}, ${nextGame.dateLabel}`
    : `No games today (${dayLabel(today)})`
  return { games, note, hasIfNeeded: games.some(x => x.state === 'if-needed') }
}

// ─── Featured starter ───────────────────────────────────────────────────────

export const MIN_BF = MIN_SAMPLE.pitcherPercentileBF

const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const PITCH_WORDS: Record<string, { one: string; many: string; label: string }> = {
  FF: { one: 'four-seamer', many: 'four-seamers', label: '4-Seam' },
  SI: { one: 'sinker', many: 'sinkers', label: 'Sinker' },
  FC: { one: 'cutter', many: 'cutters', label: 'Cutter' },
  SL: { one: 'slider', many: 'sliders', label: 'Slider' },
  ST: { one: 'sweeper', many: 'sweepers', label: 'Sweeper' },
  SV: { one: 'slurve', many: 'slurves', label: 'Slurve' },
  CU: { one: 'curve', many: 'curves', label: 'Curve' },
  KC: { one: 'knuckle-curve', many: 'knuckle-curves', label: 'Knuckle-curve' },
  CH: { one: 'changeup', many: 'changeups', label: 'Changeup' },
  FS: { one: 'splitter', many: 'splitters', label: 'Splitter' },
  FO: { one: 'forkball', many: 'forkballs', label: 'Forkball' },
  KN: { one: 'knuckleball', many: 'knuckleballs', label: 'Knuckleball' },
}
const wordsFor = (code: string, fallback: string) => PITCH_WORDS[code] ?? { one: fallback.toLowerCase(), many: `${fallback.toLowerCase()}s`, label: fallback }

export type MixRow = { code: string; label: string; one: string; many: string; usagePct: number; velo: number | null; n: number; missPct: number | null; swings: number }

export type FeaturedStarter = {
  id: number
  name: string
  teamId: number
  teamAbbr: string
  /** the club's primary colour, for the hero's soft background */
  teamColor: string | null
  hand: 'LHP' | 'RHP' | null
  wins: number | null
  losses: number | null
  era: number | null
  ip: string | null
  bf: number | null
  xwoba: number | null
  /** all pitches thrown (the n under the mix) */
  pitches: number
  mix: MixRow[]
  throughDate: string | null
}

async function getBattersFaced(pitcherId: number): Promise<number | null> {
  try {
    const res = await fetch(`${MLB_API}/people/${pitcherId}/stats?stats=season&group=pitching&season=${SEASON}`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = await res.json()
    return num(json.stats?.[0]?.splits?.[0]?.stat?.battersFaced)
  } catch (e) {
    console.error('[getBattersFaced] failed:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function getFeaturedStarter(pitcherId: number, name: string, teamId: number, teamAbbr: string, teamName: string): Promise<FeaturedStarter> {
  const supa = createAdminClient()
  const [arsenalBySplit, hand, bf, statsRes, throughRes] = await Promise.all([
    getPitcherZoneArsenal(pitcherId),
    getPitcherHandedness(pitcherId),
    getBattersFaced(pitcherId),
    supa.from('pitcher_stats').select('era, wins, losses, innings_pitched, xwoba_allowed').eq('player_id', pitcherId).eq('season', SEASON).limit(1),
    supa.from('pitcher_zone_arsenal').select('updated_at').eq('player_id', pitcherId).eq('season', SEASON).order('updated_at', { ascending: false }).limit(1),
  ])
  if (statsRes.error) console.error('[getFeaturedStarter] pitcher_stats error:', statsRes.error.message)
  if (throughRes.error) console.error('[getFeaturedStarter] arsenal date error:', throughRes.error.message)

  const all = arsenalBySplit['all']
  const mix: MixRow[] = Object.entries(all?.arsenal ?? {})
    .map(([code, p]) => {
      let swings = 0, whiffs = 0
      for (const z of Object.values(p.zones ?? {})) { swings += num(z.swings) ?? 0; whiffs += num(z.whiffs) ?? 0 }
      const w = wordsFor(code, p.pitch_name)
      return { code, label: w.label, one: w.one, many: w.many, usagePct: num(p.usage_pct) ?? 0, velo: num(p.avg_velo), n: num(p.total_pitches) ?? 0, missPct: swings >= MIN_SAMPLE.whiffSwings ? (whiffs / swings) * 100 : null, swings }
    })
    .filter(m => m.usagePct > 0)
    .sort((a, b) => b.usagePct - a.usagePct)

  const row = (statsRes.data?.[0] ?? null) as { era: unknown; wins: unknown; losses: unknown; innings_pitched: unknown; xwoba_allowed: unknown } | null
  const ip = num(row?.innings_pitched)
  const through = (throughRes.data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null

  return {
    id: pitcherId, name, teamId, teamAbbr,
    teamColor: findTeamByName(teamName)?.primary_color ?? null,
    hand: hand === 'L' ? 'LHP' : hand === 'R' ? 'RHP' : null,
    wins: num(row?.wins), losses: num(row?.losses), era: num(row?.era),
    ip: ip != null ? ip.toFixed(1) : null,
    bf, xwoba: num(row?.xwoba_allowed),
    pitches: num(all?.total_pitches) ?? 0,
    mix: mix.slice(0, 5),
    throughDate: through ? through.slice(0, 10) : null,
  }
}

// ─── Head-to-head: the opposing hitter with the most PA against him ──────────

export type H2H = { teamShort: string; name: string; pa: number; avg: string | null; ops: string | null } | null

export async function getMostPaAgainst(pitcherId: number, opposingTeamId: number, teamShort: string): Promise<H2H> {
  try {
    const rosterRes = await fetch(`${MLB_API}/teams/${opposingTeamId}/roster?rosterType=active`, { next: { revalidate: 86400 } })
    if (!rosterRes.ok) return null
    const roster = ((await rosterRes.json()).roster ?? []) as { person: { id: number; fullName: string }; position?: { type?: string } }[]
    const hitters = roster.filter(r => r.position?.type !== 'Pitcher')

    let best: H2H = null
    // MLB Stats API rejects big bursts from one process (CLAUDE.md): small batches of 6.
    for (let i = 0; i < hitters.length; i += 6) {
      const batch = hitters.slice(i, i + 6)
      const results = await Promise.all(batch.map(async h => {
        try {
          const r = await fetch(`${MLB_API}/people/${pitcherId}/stats?stats=vsPlayer&group=pitching&opposingPlayerId=${h.person.id}`, { next: { revalidate: 86400 } })
          if (!r.ok) return null
          const split = (await r.json()).stats?.find((s: { type?: { displayName?: string } }) => s.type?.displayName === 'vsPlayerTotal')?.splits?.[0]?.stat
          const pa = num(split?.plateAppearances) ?? num(split?.battersFaced)
          return pa ? { name: h.person.fullName, pa, avg: (split?.avg as string) ?? null, ops: (split?.ops as string) ?? null } : null
        } catch {
          return null
        }
      }))
      for (const r of results) if (r && (!best || r.pa > best.pa)) best = { teamShort, ...r }
    }
    return best
  } catch (e) {
    console.error('[getMostPaAgainst] failed:', e instanceof Error ? e.message : e)
    return null
  }
}

// ─── The featured scout report ──────────────────────────────────────────────

export type FeaturedScout = {
  slug: string
  isFinal: boolean
  kicker: string
  /** "Mon 26 Oct · Tropicana Field" */
  meta: string
  starter: FeaturedStarter
  opp: { id: number; abbr: string; name: string; short: string; city: string; starterLast: string | null }
  h2h: H2H
  throughDate: string | null
}

const cityOf = (fullName: string, short: string) => fullName.replace(short, '').trim() || fullName

export async function getFeaturedScout(slate: HomeSlate | null): Promise<FeaturedScout | null> {
  if (!slate) return null
  const g = slate.game
  // Home team's named starter, else the away team's.
  const homeFirst = !!g.teams.home.probablePitcher
  const mine = homeFirst ? g.teams.home : g.teams.away
  const other = homeFirst ? g.teams.away : g.teams.home
  if (!mine.probablePitcher) return null

  const oppTeam = findTeamByName(other.team.name)
  const oppShort = oppTeam?.short ?? other.team.name
  const starter = await getFeaturedStarter(mine.probablePitcher.id, mine.probablePitcher.fullName, mine.team.id, abbrOf(mine), mine.team.name)
  const h2h = await getMostPaAgainst(starter.id, other.team.id, oppShort)

  const post = isPostseason(g)
  const kicker = post && g.seriesDescription
    ? `FEATURED SCOUT REPORT · ${(SERIES_ABBR[g.seriesDescription] ?? g.seriesDescription).toUpperCase()} G${g.seriesGameNumber ?? ''}`.trim()
    : 'FEATURED SCOUT REPORT'
  const meta = `${dayLabel(slate.date)}${g.venue?.name ? ` · ${g.venue.name}` : ''}${slate.mode === 'last' ? ' · last game of the season' : ''}`

  return {
    slug: slugifyGame(g),
    isFinal: g.status?.abstractGameState === 'Final',
    kicker,
    meta,
    starter,
    opp: { id: other.team.id, abbr: abbrOf(other), name: other.team.name, short: oppShort, city: cityOf(other.team.name, oppShort), starterLast: lastName(other.probablePitcher?.fullName) ?? null },
    h2h,
    throughDate: starter.throughDate,
  }
}
