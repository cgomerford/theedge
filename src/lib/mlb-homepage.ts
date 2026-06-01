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
  { slug: 'battingAverage',   label: 'AVG',   group: 'batting'  },
  { slug: 'homeRuns',         label: 'HR',    group: 'batting'  },
  { slug: 'rbi',              label: 'RBI',   group: 'batting'  },
  { slug: 'stolenBases',      label: 'SB',    group: 'batting'  },
  { slug: 'earnedRunAverage', label: 'ERA',   group: 'pitching' },
  { slug: 'strikeOuts',       label: 'SO',    group: 'pitching' },
  { slug: 'wins',             label: 'Wins',  group: 'pitching' },
  { slug: 'saves',            label: 'Saves', group: 'pitching' },
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
  limit = 10
): Promise<MLBStatLeader[]> {
  try {
    const url = `${MLB_API}/stats/leaders?leaderCategories=${category}&season=${SEASON}&limit=${limit}&sportId=1`
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