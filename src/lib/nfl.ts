// src/lib/nfl.ts
// ESPN public API — no auth required

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'

// ─── Types ────────────────────────────────────────────────

export type NFLTeam = {
  id: string
  name: string
  abbreviation: string
  logo: string
  wins: number
  losses: number
  ties: number
  pct: string
  divisionRecord: string
  streak: string
  pointsFor: number
  pointsAgainst: number
}

export type NFLDivision = {
  name: string
  conference: 'AFC' | 'NFC'
  teams: NFLTeam[]
}

export type NFLStatLeader = {
  rank: number
  name: string
  team: string
  teamAbbr: string
  headshot: string
  statValue: string
  statLabel: string
}

export type NFLNewsItem = {
  id: string
  headline: string
  description: string
  published: string
  link: string
  image?: string
}

export type NFLTeamCard = {
  id: string
  name: string
  shortName: string
  abbreviation: string
  logo: string
  color: string
  conference: 'AFC' | 'NFC'
  division: string
  wins: number
  losses: number
  ties: number
}

export type NFLKeyDate = {
  label: string
  date: string
  description: string
}

export type StatCategory = {
  slug: string
  label: string
  statKey: string
}

// ─── Constants ────────────────────────────────────────────

export const STAT_CATEGORIES: StatCategory[] = [
  { slug: 'passingyards',   label: 'Passing Yds',   statKey: 'passingYards'   },
  { slug: 'rushingyards',   label: 'Rushing Yds',   statKey: 'rushingYards'   },
  { slug: 'receivingyards', label: 'Receiving Yds', statKey: 'receivingYards' },
  { slug: 'touchdowns',     label: 'Touchdowns',    statKey: 'touchdowns'     },
  { slug: 'interceptions',  label: 'Interceptions', statKey: 'interceptions'  },
  { slug: 'sacks',          label: 'Sacks',         statKey: 'sacks'          },
]

// ─── Standings ────────────────────────────────────────────

export async function getNFLStandings(): Promise<NFLDivision[]> {
  try {
    const res = await fetch(`${ESPN}/standings`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()

    const divisions: NFLDivision[] = []

    for (const conference of data.children ?? []) {
      const confName: 'AFC' | 'NFC' = conference.name?.includes('AFC') ? 'AFC' : 'NFC'

      for (const division of conference.children ?? []) {
        const divName: string = division.name ?? ''
        const teams: NFLTeam[] = []

        for (const entry of division.standings?.entries ?? []) {
          const team = entry.team
          const stats: Record<string, any> = {}
          for (const s of entry.stats ?? []) {
            stats[s.name] = s
          }

          teams.push({
            id: team.id,
            name: team.displayName ?? team.name,
            abbreviation: team.abbreviation,
            logo: team.logos?.[0]?.href ?? '',
            wins: stats['wins']?.value ?? 0,
            losses: stats['losses']?.value ?? 0,
            ties: stats['ties']?.value ?? 0,
            pct: stats['winPercent']?.displayValue ?? '.000',
            divisionRecord: stats['divisionRecord']?.displayValue ?? '0-0',
            streak: stats['streak']?.displayValue ?? '',
            pointsFor: stats['pointsFor']?.value ?? 0,
            pointsAgainst: stats['pointsAgainst']?.value ?? 0,
          })
        }

        divisions.push({ name: divName, conference: confName, teams })
      }
    }

    return divisions
  } catch (e) {
    console.error('NFL standings error:', e)
    return []
  }
}

// ─── 2025 season leaders (static fallback for off-season) ─

const NFL_2025_LEADERS: Record<string, NFLStatLeader[]> = {
  passingyards: [
    { rank: 1, name: 'Joe Burrow',        team: 'Cincinnati Bengals',    teamAbbr: 'CIN', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3915511.png', statValue: '4,918', statLabel: 'Passing Yds' },
    { rank: 2, name: 'Jared Goff',        team: 'Detroit Lions',         teamAbbr: 'DET', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3046779.png', statValue: '4,629', statLabel: 'Passing Yds' },
    { rank: 3, name: 'Lamar Jackson',     team: 'Baltimore Ravens',      teamAbbr: 'BAL', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png', statValue: '4,172', statLabel: 'Passing Yds' },
    { rank: 4, name: 'Josh Allen',        team: 'Buffalo Bills',         teamAbbr: 'BUF', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3918298.png', statValue: '3,731', statLabel: 'Passing Yds' },
    { rank: 5, name: 'Patrick Mahomes',   team: 'Kansas City Chiefs',    teamAbbr: 'KC',  headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png', statValue: '3,928', statLabel: 'Passing Yds' },
  ],
  rushingyards: [
    { rank: 1, name: 'Saquon Barkley',    team: 'Philadelphia Eagles',   teamAbbr: 'PHI', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3929630.png', statValue: '2,005', statLabel: 'Rushing Yds' },
    { rank: 2, name: 'Derrick Henry',     team: 'Baltimore Ravens',      teamAbbr: 'BAL', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3043078.png', statValue: '1,921', statLabel: 'Rushing Yds' },
    { rank: 3, name: 'Josh Jacobs',       team: 'Green Bay Packers',     teamAbbr: 'GB',  headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3912547.png', statValue: '1,329', statLabel: 'Rushing Yds' },
    { rank: 4, name: 'Jahmyr Gibbs',      team: 'Detroit Lions',         teamAbbr: 'DET', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4429795.png', statValue: '1,412', statLabel: 'Rushing Yds' },
    { rank: 5, name: 'Bijan Robinson',    team: 'Atlanta Falcons',       teamAbbr: 'ATL', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4430807.png', statValue: '1,456', statLabel: 'Rushing Yds' },
  ],
  receivingyards: [
    { rank: 1, name: "Ja'Marr Chase",     team: 'Cincinnati Bengals',    teamAbbr: 'CIN', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4362628.png', statValue: '1,708', statLabel: 'Receiving Yds' },
    { rank: 2, name: 'Amon-Ra St. Brown', team: 'Detroit Lions',         teamAbbr: 'DET', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4374302.png', statValue: '1,263', statLabel: 'Receiving Yds' },
    { rank: 3, name: 'Terry McLaurin',    team: 'Washington Commanders', teamAbbr: 'WSH', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3116406.png', statValue: '1,096', statLabel: 'Receiving Yds' },
    { rank: 4, name: 'CeeDee Lamb',       team: 'Dallas Cowboys',        teamAbbr: 'DAL', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4241389.png', statValue: '1,057', statLabel: 'Receiving Yds' },
    { rank: 5, name: 'Brian Thomas Jr.',   team: 'Jacksonville Jaguars',  teamAbbr: 'JAX', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4710854.png', statValue: '1,179', statLabel: 'Receiving Yds' },
  ],
  touchdowns: [
    { rank: 1, name: 'Saquon Barkley',    team: 'Philadelphia Eagles',   teamAbbr: 'PHI', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3929630.png', statValue: '16',    statLabel: 'Touchdowns' },
    { rank: 2, name: "Ja'Marr Chase",     team: 'Cincinnati Bengals',    teamAbbr: 'CIN', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4362628.png', statValue: '18',    statLabel: 'Touchdowns' },
    { rank: 3, name: 'Derrick Henry',     team: 'Baltimore Ravens',      teamAbbr: 'BAL', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3043078.png', statValue: '16',    statLabel: 'Touchdowns' },
    { rank: 4, name: 'Lamar Jackson',     team: 'Baltimore Ravens',      teamAbbr: 'BAL', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3916387.png', statValue: '43',    statLabel: 'Touchdowns' },
    { rank: 5, name: 'Josh Allen',        team: 'Buffalo Bills',         teamAbbr: 'BUF', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3918298.png', statValue: '40',    statLabel: 'Touchdowns' },
  ],
  interceptions: [
    { rank: 1, name: 'Kerby Joseph',      team: 'Detroit Lions',         teamAbbr: 'DET', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4373676.png', statValue: '9',     statLabel: 'Interceptions' },
    { rank: 2, name: 'Beanie Bishop Jr.', team: 'Pittsburgh Steelers',   teamAbbr: 'PIT', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4711588.png', statValue: '6',     statLabel: 'Interceptions' },
    { rank: 3, name: 'Xavier McKinney',   team: 'Green Bay Packers',     teamAbbr: 'GB',  headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4240703.png', statValue: '8',     statLabel: 'Interceptions' },
    { rank: 4, name: 'Quandre Diggs',     team: 'Seattle Seahawks',      teamAbbr: 'SEA', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/2577327.png', statValue: '5',     statLabel: 'Interceptions' },
    { rank: 5, name: 'Patrick Surtain',   team: 'Denver Broncos',        teamAbbr: 'DEN', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4372016.png', statValue: '4',     statLabel: 'Interceptions' },
  ],
  sacks: [
    { rank: 1, name: 'Trey Hendrickson', team: 'Cincinnati Bengals',    teamAbbr: 'CIN', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3116387.png', statValue: '17.5',  statLabel: 'Sacks' },
    { rank: 2, name: 'Myles Garrett',    team: 'Cleveland Browns',      teamAbbr: 'CLE', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3122132.png', statValue: '14',    statLabel: 'Sacks' },
    { rank: 3, name: 'Nik Bonitto',      team: 'Denver Broncos',        teamAbbr: 'DEN', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/4426348.png', statValue: '12.5',  statLabel: 'Sacks' },
    { rank: 4, name: 'Danielle Hunter',  team: 'Houston Texans',        teamAbbr: 'HOU', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/2976560.png', statValue: '12',    statLabel: 'Sacks' },
    { rank: 5, name: 'Josh Hines-Allen', team: 'Jacksonville Jaguars',  teamAbbr: 'JAX', headshot: 'https://a.espncdn.com/i/headshots/nfl/players/full/3895856.png', statValue: '11.5',  statLabel: 'Sacks' },
  ],
}

// ─── Stat leaders with season fallback ───────────────────

export async function getNFLStatLeadersWithFallback(
  category: string
): Promise<{ leaders: NFLStatLeader[]; season: number }> {
  const currentYear = new Date().getFullYear()

  async function fetchLeaders(seasonParam?: number): Promise<NFLStatLeader[]> {
    const url = seasonParam
      ? `${ESPN}/leaders?category=${category}&limit=10&season=${seasonParam}`
      : `${ESPN}/leaders?category=${category}&limit=10`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    const entries: any[] = data.categories?.[0]?.leaders ?? []
    return entries.map((e: any, i: number) => ({
      rank: i + 1,
      name: e.athlete?.displayName ?? '—',
      team: e.athlete?.team?.displayName ?? '—',
      teamAbbr: e.athlete?.team?.abbreviation ?? '',
      headshot: e.athlete?.headshot?.href ?? `https://a.espncdn.com/i/headshots/nfl/players/full/${e.athlete?.id}.png`,
      statValue: e.displayValue ?? String(e.value ?? '—'),
      statLabel: data.categories?.[0]?.displayName ?? category,
    }))
  }

// Try ESPN API (works during regular season)
  try {
    const leaders = await fetchLeaders()
    if (leaders.length > 0) return { leaders, season: currentYear }
  } catch { /* fall through */ }

  try {
    const leaders = await fetchLeaders(2025)
    if (leaders.length > 0) return { leaders, season: 2025 }
  } catch { /* fall through */ }

  try {
    const leaders = await fetchLeaders(2024)
    if (leaders.length > 0) return { leaders, season: 2024 }
  } catch { /* fall through */ }

  // ← THIS LINE WAS MISSING — always return static data in off-season
  const staticLeaders = NFL_2025_LEADERS[category] ?? []
  return { leaders: staticLeaders, season: 2025 }
}
// ─── Legacy single-season leaders (used by NFLHomepage) ──

export async function getNFLStatLeaders(category: string): Promise<NFLStatLeader[]> {
  const { leaders } = await getNFLStatLeadersWithFallback(category)
  return leaders
}

const NFL_2025_TEAMS_STATIC: NFLTeamCard[] = [
  // AFC East
  { id: '17', name: 'Buffalo Bills',           shortName: 'Bills',       abbreviation: 'BUF', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png', color: '#00338D', conference: 'AFC', division: 'East',  wins: 13, losses: 4, ties: 0 },
  { id: '20', name: 'Miami Dolphins',          shortName: 'Dolphins',    abbreviation: 'MIA', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/mia.png', color: '#008E97', conference: 'AFC', division: 'East',  wins: 8,  losses: 9, ties: 0 },
  { id: '21', name: 'New England Patriots',    shortName: 'Patriots',    abbreviation: 'NE',  logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png',  color: '#002244', conference: 'AFC', division: 'East',  wins: 4,  losses: 13, ties: 0 },
  { id: '18', name: 'New York Jets',           shortName: 'Jets',        abbreviation: 'NYJ', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png', color: '#125740', conference: 'AFC', division: 'East',  wins: 5,  losses: 12, ties: 0 },
  // AFC North
  { id: '33', name: 'Baltimore Ravens',        shortName: 'Ravens',      abbreviation: 'BAL', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png', color: '#241773', conference: 'AFC', division: 'North', wins: 12, losses: 5, ties: 0 },
  { id: '4',  name: 'Cincinnati Bengals',      shortName: 'Bengals',     abbreviation: 'CIN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/cin.png', color: '#FB4F14', conference: 'AFC', division: 'North', wins: 9,  losses: 8, ties: 0 },
  { id: '5',  name: 'Cleveland Browns',        shortName: 'Browns',      abbreviation: 'CLE', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png', color: '#311D00', conference: 'AFC', division: 'North', wins: 3,  losses: 14, ties: 0 },
  { id: '23', name: 'Pittsburgh Steelers',     shortName: 'Steelers',    abbreviation: 'PIT', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png', color: '#FFB612', conference: 'AFC', division: 'North', wins: 10, losses: 7, ties: 0 },
  // AFC South
  { id: '34', name: 'Houston Texans',          shortName: 'Texans',      abbreviation: 'HOU', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png', color: '#03202F', conference: 'AFC', division: 'South', wins: 10, losses: 7, ties: 0 },
  { id: '11', name: 'Indianapolis Colts',      shortName: 'Colts',       abbreviation: 'IND', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ind.png', color: '#002C5F', conference: 'AFC', division: 'South', wins: 8,  losses: 9, ties: 0 },
  { id: '30', name: 'Jacksonville Jaguars',    shortName: 'Jaguars',     abbreviation: 'JAX', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/jax.png', color: '#006778', conference: 'AFC', division: 'South', wins: 4,  losses: 13, ties: 0 },
  { id: '10', name: 'Tennessee Titans',        shortName: 'Titans',      abbreviation: 'TEN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ten.png', color: '#0C2340', conference: 'AFC', division: 'South', wins: 3,  losses: 14, ties: 0 },
  // AFC West
  { id: '7',  name: 'Denver Broncos',          shortName: 'Broncos',     abbreviation: 'DEN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/den.png', color: '#FB4F14', conference: 'AFC', division: 'West',  wins: 10, losses: 7, ties: 0 },
  { id: '12', name: 'Kansas City Chiefs',      shortName: 'Chiefs',      abbreviation: 'KC',  logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png',  color: '#E31837', conference: 'AFC', division: 'West',  wins: 15, losses: 2, ties: 0 },
  { id: '13', name: 'Las Vegas Raiders',       shortName: 'Raiders',     abbreviation: 'LV',  logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png',  color: '#000000', conference: 'AFC', division: 'West',  wins: 4,  losses: 13, ties: 0 },
  { id: '24', name: 'Los Angeles Chargers',    shortName: 'Chargers',    abbreviation: 'LAC', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png', color: '#0080C6', conference: 'AFC', division: 'West',  wins: 11, losses: 6, ties: 0 },
  // NFC East
  { id: '6',  name: 'Dallas Cowboys',          shortName: 'Cowboys',     abbreviation: 'DAL', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png', color: '#003594', conference: 'NFC', division: 'East',  wins: 7,  losses: 10, ties: 0 },
  { id: '19', name: 'New York Giants',         shortName: 'Giants',      abbreviation: 'NYG', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png', color: '#0B2265', conference: 'NFC', division: 'East',  wins: 3,  losses: 14, ties: 0 },
  { id: '22', name: 'Philadelphia Eagles',     shortName: 'Eagles',      abbreviation: 'PHI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png', color: '#004C54', conference: 'NFC', division: 'East',  wins: 14, losses: 3, ties: 0 },
  { id: '28', name: 'Washington Commanders',   shortName: 'Commanders',  abbreviation: 'WSH', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png', color: '#5A1414', conference: 'NFC', division: 'East',  wins: 12, losses: 5, ties: 0 },
  // NFC North
  { id: '3',  name: 'Chicago Bears',           shortName: 'Bears',       abbreviation: 'CHI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png', color: '#0B162A', conference: 'NFC', division: 'North', wins: 5,  losses: 12, ties: 0 },
  { id: '9',  name: 'Green Bay Packers',       shortName: 'Packers',     abbreviation: 'GB',  logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png',  color: '#203731', conference: 'NFC', division: 'North', wins: 11, losses: 6, ties: 0 },
  { id: '16', name: 'Detroit Lions',           shortName: 'Lions',       abbreviation: 'DET', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png', color: '#0076B6', conference: 'NFC', division: 'North', wins: 15, losses: 2, ties: 0 },
  { id: '29', name: 'Minnesota Vikings',       shortName: 'Vikings',     abbreviation: 'MIN', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/min.png', color: '#4F2683', conference: 'NFC', division: 'North', wins: 14, losses: 3, ties: 0 },
  // NFC South
  { id: '1',  name: 'Atlanta Falcons',         shortName: 'Falcons',     abbreviation: 'ATL', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png', color: '#A71930', conference: 'NFC', division: 'South', wins: 8,  losses: 9, ties: 0 },
  { id: '2',  name: 'Carolina Panthers',       shortName: 'Panthers',    abbreviation: 'CAR', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/car.png', color: '#0085CA', conference: 'NFC', division: 'South', wins: 5,  losses: 12, ties: 0 },
  { id: '25', name: 'New Orleans Saints',      shortName: 'Saints',      abbreviation: 'NO',  logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/no.png',  color: '#D3BC8D', conference: 'NFC', division: 'South', wins: 5,  losses: 12, ties: 0 },
  { id: '27', name: 'Tampa Bay Buccaneers',    shortName: 'Buccaneers',  abbreviation: 'TB',  logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/tb.png',  color: '#D50A0A', conference: 'NFC', division: 'South', wins: 10, losses: 7, ties: 0 },
  // NFC West
  { id: '32', name: 'Arizona Cardinals',       shortName: 'Cardinals',   abbreviation: 'ARI', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png', color: '#97233F', conference: 'NFC', division: 'West',  wins: 8,  losses: 9, ties: 0 },
  { id: '14', name: 'Los Angeles Rams',        shortName: 'Rams',        abbreviation: 'LAR', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png', color: '#003594', conference: 'NFC', division: 'West',  wins: 10, losses: 7, ties: 0 },
  { id: '26', name: 'San Francisco 49ers',     shortName: '49ers',       abbreviation: 'SF',  logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png',  color: '#AA0000', conference: 'NFC', division: 'West',  wins: 6,  losses: 11, ties: 0 },
  { id: '15', name: 'Seattle Seahawks',        shortName: 'Seahawks',    abbreviation: 'SEA', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png', color: '#002244', conference: 'NFC', division: 'West',  wins: 10, losses: 7, ties: 0 },
]
// ─── All 32 teams with last season record ─────────────────


export async function getNFLTeams(): Promise<NFLTeamCard[]> {
  return NFL_2025_TEAMS_STATIC
}
// ─── Key NFL dates ────────────────────────────────────────

export function getNFLKeyDates(): NFLKeyDate[] {
  const year = new Date().getFullYear()
  return [
    { label: 'Training Camp',     date: `${year}-07-22`, description: 'Teams report · vets July 25'      },
    { label: 'Hall of Fame Game', date: `${year}-08-07`, description: 'Preseason opens in Canton'         },
    { label: 'Preseason Wk 1',    date: `${year}-08-08`, description: 'Full preseason slate begins'       },
    { label: 'Roster Cut Day',    date: `${year}-08-26`, description: 'Rosters trimmed to 53 men'         },
    { label: 'Week 1',            date: `${year}-09-10`, description: 'Regular season kicks off'          },
  ]
}

// ─── News ─────────────────────────────────────────────────

export async function getNFLNews(): Promise<NFLNewsItem[]> {
  try {
    const res = await fetch(`${ESPN}/news?limit=12`, {
      next: { revalidate: 1800 },
    })
    if (!res.ok) return []
    const data = await res.json()
    const raw: any[] = data.articles ?? data.items ?? []
    return raw.slice(0, 12).map((a: any) => ({
      id: String(a.id ?? Math.random()),
      headline: a.headline ?? '',
      description: a.description ?? a.story ?? '',
      published: a.published ?? '',
      link: a.links?.web?.href ?? a.links?.api?.news?.href ?? '#',
      image: a.images?.[0]?.url ?? undefined,
    }))
  } catch (e) {
    console.error('NFL news error:', e)
    return []
  }
}