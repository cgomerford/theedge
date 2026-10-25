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
// ─── Homepage: featured scout report + today's games strip ───────────────────
//
// Server-only helpers for src/app/page.tsx. Numbers come from the same tables the scout report page reads:
//   pitch mix and pitch count  -> pitcher_zone_arsenal (split "all"), via getPitcherZoneArsenal
//   ERA, K%, xwOBA allowed      -> pitcher_stats
//   batters faced (the n)       -> MLB Stats API season line (pitcher_stats stores no BF)
//   "Through" date              -> the newest updated_at on the starter's pitcher_zone_arsenal rows
// Every function returns null / [] on failure and logs with its name; nothing is invented.

import { createAdminClient } from '@/lib/supabase'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getPitcherHandedness, slugifyGame, type MLBGame } from '@/lib/mlb'
import { findTeamByName } from '@/lib/teams'

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
  teams: { away: RawTeamSide; home: RawTeamSide }
}

async function fetchSchedule(date: string): Promise<RawGame[]> {
  try {
    const res = await fetch(`${MLB_API}/schedule?sportId=1&date=${date}&hydrate=team,probablePitcher,linescore,venue`, { next: { revalidate: 600 } })
    if (!res.ok) {
      console.error('[fetchSchedule] MLB API status', res.status)
      return []
    }
    const json = await res.json()
    return (json.dates?.[0]?.games ?? []) as RawGame[]
  } catch (e) {
    console.error('[fetchSchedule] failed:', e instanceof Error ? e.message : e)
    return []
  }
}

const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const winPct = (s: RawTeamSide) => {
  const w = s.leagueRecord?.wins ?? 0
  const l = s.leagueRecord?.losses ?? 0
  return w + l > 0 ? w / (w + l) : 0
}

/** Most notable game of a slate: postseason first, then the best combined record among games with both starters named. */
function pickNotable(games: RawGame[]): RawGame | null {
  if (games.length === 0) return null
  const post = games.filter(g => g.gameType && !['R', 'S', 'E', 'A'].includes(g.gameType))
  const pool = post.length ? post : games
  const named = pool.filter(g => g.teams.away.probablePitcher && g.teams.home.probablePitcher)
  const ranked = (named.length ? named : pool).slice().sort((a, b) => winPct(b.teams.away) + winPct(b.teams.home) - (winPct(a.teams.away) + winPct(a.teams.home)))
  return ranked[0] ?? null
}

export type HomeGame = {
  gamePk: number
  slug: string
  startIso: string
  status: 'scheduled' | 'live' | 'final'
  away: { id: number; abbr: string; record: string | null; starter: string | null; score: number | null }
  home: { id: number; abbr: string; record: string | null; starter: string | null; score: number | null }
}

const lastName = (full?: string) => (full ? full.trim().split(/\s+/).slice(-1)[0] : null)
const abbrOf = (s: RawTeamSide) => findTeamByName(s.team.name)?.abbrev ?? s.team.abbreviation ?? s.team.name.slice(0, 3).toUpperCase()
const recordOf = (s: RawTeamSide) => (s.leagueRecord ? `${s.leagueRecord.wins}-${s.leagueRecord.losses}` : null)

function toHomeGame(g: RawGame): HomeGame {
  const state = g.status?.abstractGameState
  return {
    gamePk: g.gamePk,
    slug: slugifyGame(g),
    startIso: g.gameDate,
    status: state === 'Final' ? 'final' : state === 'Live' ? 'live' : 'scheduled',
    away: { id: g.teams.away.team.id, abbr: abbrOf(g.teams.away), record: recordOf(g.teams.away), starter: lastName(g.teams.away.probablePitcher?.fullName) ?? null, score: g.teams.away.score ?? null },
    home: { id: g.teams.home.team.id, abbr: abbrOf(g.teams.home), record: recordOf(g.teams.home), starter: lastName(g.teams.home.probablePitcher?.fullName) ?? null, score: g.teams.home.score ?? null },
  }
}

export type HomeSlate = {
  /** the date the slate belongs to (YYYY-MM-DD); not today when the season is over */
  date: string
  isToday: boolean
  games: RawGame[]
}

/** Today's slate, or (off-season) the most recent day with games, found by looking back up to 60 days. */
export async function getHomeSlate(): Promise<HomeSlate | null> {
  const now = new Date()
  const today = isoDay(now)
  const todays = await fetchSchedule(today)
  if (todays.length) return { date: today, isToday: true, games: todays }
  for (let back = 1; back <= 60; back++) {
    const day = isoDay(new Date(now.getTime() - back * 86_400_000))
    const games = await fetchSchedule(day)
    const finals = games.filter(g => g.status?.abstractGameState === 'Final')
    if (finals.length) return { date: day, isToday: false, games: finals }
  }
  return null
}

export async function getHomeGamesStrip(slate: HomeSlate | null): Promise<{ games: HomeGame[]; offSeason: boolean; lastFinal: HomeGame | null; lastFinalDate: string | null }> {
  if (!slate) return { games: [], offSeason: true, lastFinal: null, lastFinalDate: null }
  if (!slate.isToday) {
    const last = pickNotable(slate.games)
    return { games: [], offSeason: true, lastFinal: last ? toHomeGame(last) : null, lastFinalDate: slate.date }
  }
  const sorted = slate.games.slice().sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())
  return { games: sorted.slice(0, 7).map(toHomeGame), offSeason: false, lastFinal: null, lastFinalDate: null }
}

// ─── Featured starter readout ───────────────────────────────────────────────

export const MIN_BF = 50

export type StarterReadout = {
  id: number
  name: string
  hand: 'LHP' | 'RHP' | null
  mix: { code: string; pct: number; n: number }[]
  pitches: number
  era: number | null
  kPct: number | null
  xwoba: number | null
  bf: number | null
  throughDate: string | null
}

const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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

export async function getStarterReadout(pitcherId: number, name: string): Promise<StarterReadout> {
  const supa = createAdminClient()
  const [arsenalBySplit, hand, bf, statsRes, throughRes] = await Promise.all([
    getPitcherZoneArsenal(pitcherId),
    getPitcherHandedness(pitcherId),
    getBattersFaced(pitcherId),
    supa.from('pitcher_stats').select('era, k_pct, xwoba_allowed').eq('player_id', pitcherId).eq('season', SEASON).limit(1),
    supa.from('pitcher_zone_arsenal').select('updated_at').eq('player_id', pitcherId).eq('season', SEASON).order('updated_at', { ascending: false }).limit(1),
  ])
  if (statsRes.error) console.error('[getStarterReadout] pitcher_stats error:', statsRes.error.message)
  if (throughRes.error) console.error('[getStarterReadout] arsenal date error:', throughRes.error.message)

  const all = arsenalBySplit['all']
  const pitches = num(all?.total_pitches) ?? 0
  // Pitch types under the arsenal minimum (25 pitches) are left out of the mix line.
  const mix = Object.entries(all?.arsenal ?? {})
    .map(([code, p]) => ({ code, pct: num(p.usage_pct) ?? 0, n: num(p.total_pitches) ?? 0 }))
    .filter(p => p.n >= 25 && p.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4)

  const row = (statsRes.data?.[0] ?? null) as { era: unknown; k_pct: unknown; xwoba_allowed: unknown } | null
  const through = (throughRes.data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null

  return {
    id: pitcherId,
    name,
    hand: hand === 'L' ? 'LHP' : hand === 'R' ? 'RHP' : null,
    mix,
    pitches,
    era: num(row?.era),
    kPct: num(row?.k_pct),
    xwoba: num(row?.xwoba_allowed),
    bf,
    throughDate: through ? through.slice(0, 10) : null,
  }
}

export type FeaturedScout = {
  slug: string
  kicker: string
  heading: string
  /** set when the slate is not today's: "Oct 24" */
  dateLabel: string | null
  /** a finished game links to its postgame report instead of the scout report */
  isFinal: boolean
  away: { id: number; abbr: string; name: string; score: number | null; starter: StarterReadout | null }
  home: { id: number; abbr: string; name: string; score: number | null; starter: StarterReadout | null }
  throughDate: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`

export async function getFeaturedScout(slate: HomeSlate | null): Promise<FeaturedScout | null> {
  if (!slate) return null
  const game = pickNotable(slate.games)
  if (!game) return null

  const post = game.gameType && !['R', 'S', 'E', 'A'].includes(game.gameType)
  const kicker = post && game.seriesDescription
    ? `${game.seriesDescription.toUpperCase()}${game.seriesGameNumber ? ` · GAME ${game.seriesGameNumber}` : ''}`
    : `MLB · ${shortDate(slate.date).toUpperCase()}`

  const [away, home] = await Promise.all([
    game.teams.away.probablePitcher ? getStarterReadout(game.teams.away.probablePitcher.id, game.teams.away.probablePitcher.fullName) : Promise.resolve(null),
    game.teams.home.probablePitcher ? getStarterReadout(game.teams.home.probablePitcher.id, game.teams.home.probablePitcher.fullName) : Promise.resolve(null),
  ])
  const dates = [away?.throughDate, home?.throughDate].filter((d): d is string => !!d).sort()

  return {
    slug: slugifyGame(game),
    kicker,
    heading: `${game.teams.away.team.name} at ${game.teams.home.team.name}`,
    dateLabel: slate.isToday ? null : shortDate(slate.date),
    isFinal: game.status?.abstractGameState === 'Final',
    away: { id: game.teams.away.team.id, abbr: abbrOf(game.teams.away), name: game.teams.away.team.name, score: game.teams.away.score ?? null, starter: away },
    home: { id: game.teams.home.team.id, abbr: abbrOf(game.teams.home), name: game.teams.home.team.name, score: game.teams.home.score ?? null, starter: home },
    throughDate: dates.length ? dates[dates.length - 1] : null,
  }
}
