// src/lib/nfl-team-directory.ts
//
// Static directory for the homepage's "Teams by conference" module.
// This data does not exist anywhere else in the codebase (checked
// src/lib/nfl.ts, src/lib/nfl/queries.ts, src/components/SiteHeader.tsx —
// none carry head coach or a primary+secondary color pair), so it's a
// fresh, hand-curated table rather than a repurposed existing source.
//
// Sourcing, so this can be verified/corrected later:
//   - headCoach: web-verified against en.wikipedia.org/wiki/List_of_current_NFL_head_coaches
//     and cross-checked vs the 10 head-coaching changes reported for the
//     2026 offseason (Cardinals, Falcons, Ravens, Bills, Browns, Raiders,
//     Dolphins, Giants, Steelers, Titans). Accurate as of Aug 28, 2026 —
//     re-verify before reusing this file next offseason.
//   - lastSeasonRecord / lastSeasonYear: 2025 regular-season final
//     standings, web-verified against pro-football-reference.com/years/2025.
//     "Last season" is hardcoded to 2025 on purpose — this whole module
//     exists to bridge the gap until the 2026 season has real in-season
//     records to show instead (Sep 9, 2026 kickoff).
//   - primaryColor / secondaryColor: standard published team brand colors.
//     Independent of (and in a couple of cases different from) the single
//     `color` field already in src/lib/nfl.ts — that file only carries one
//     color per team and a few of its choices (e.g. Steelers, Saints,
//     Jaguars) use the secondary as if it were primary. This file defines
//     its own consistent primary/secondary pairing rather than inheriting
//     that ambiguity.
//   - logoUrl: same espncdn pattern already used in SiteHeader.tsx's mega
//     panels, so team pages this links to already trust this exact URL shape.

export type NFLTeamDirectoryEntry = {
  slug: string // matches SiteHeader.tsx's NFL_DIVISIONS slugs and /nfl/teams/[slug]
  name: string
  abbr: string
  conference: 'AFC' | 'NFC'
  division: 'East' | 'North' | 'South' | 'West'
  primaryColor: string
  secondaryColor: string
  logoUrl: string
  headCoach: string
  headCoachIsNewFor2026: boolean
  lastSeasonRecord: string // "W-L" or "W-L-T"
  lastSeasonYear: number
}

function logo(slug: string) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${slug}.png`
}

export const NFL_TEAM_DIRECTORY: NFLTeamDirectoryEntry[] = [
  // ── AFC East ──
  { slug: 'buf', name: 'Buffalo Bills', abbr: 'BUF', conference: 'AFC', division: 'East', primaryColor: '#00338D', secondaryColor: '#C60C30', logoUrl: logo('buf'), headCoach: 'Joe Brady', headCoachIsNewFor2026: true, lastSeasonRecord: '12-5', lastSeasonYear: 2025 },
  { slug: 'mia', name: 'Miami Dolphins', abbr: 'MIA', conference: 'AFC', division: 'East', primaryColor: '#008E97', secondaryColor: '#FC4C02', logoUrl: logo('mia'), headCoach: 'Jeff Hafley', headCoachIsNewFor2026: true, lastSeasonRecord: '7-10', lastSeasonYear: 2025 },
  { slug: 'ne', name: 'New England Patriots', abbr: 'NE', conference: 'AFC', division: 'East', primaryColor: '#002244', secondaryColor: '#C60C30', logoUrl: logo('ne'), headCoach: 'Mike Vrabel', headCoachIsNewFor2026: false, lastSeasonRecord: '14-3', lastSeasonYear: 2025 },
  { slug: 'nyj', name: 'New York Jets', abbr: 'NYJ', conference: 'AFC', division: 'East', primaryColor: '#125740', secondaryColor: '#000000', logoUrl: logo('nyj'), headCoach: 'Aaron Glenn', headCoachIsNewFor2026: false, lastSeasonRecord: '3-14', lastSeasonYear: 2025 },

  // ── AFC North ──
  { slug: 'bal', name: 'Baltimore Ravens', abbr: 'BAL', conference: 'AFC', division: 'North', primaryColor: '#241773', secondaryColor: '#000000', logoUrl: logo('bal'), headCoach: 'Jesse Minter', headCoachIsNewFor2026: true, lastSeasonRecord: '8-9', lastSeasonYear: 2025 },
  { slug: 'cin', name: 'Cincinnati Bengals', abbr: 'CIN', conference: 'AFC', division: 'North', primaryColor: '#FB4F14', secondaryColor: '#000000', logoUrl: logo('cin'), headCoach: 'Zac Taylor', headCoachIsNewFor2026: false, lastSeasonRecord: '6-11', lastSeasonYear: 2025 },
  { slug: 'cle', name: 'Cleveland Browns', abbr: 'CLE', conference: 'AFC', division: 'North', primaryColor: '#311D00', secondaryColor: '#FF3C00', logoUrl: logo('cle'), headCoach: 'Todd Monken', headCoachIsNewFor2026: true, lastSeasonRecord: '5-12', lastSeasonYear: 2025 },
  { slug: 'pit', name: 'Pittsburgh Steelers', abbr: 'PIT', conference: 'AFC', division: 'North', primaryColor: '#101820', secondaryColor: '#FFB612', logoUrl: logo('pit'), headCoach: 'Mike McCarthy', headCoachIsNewFor2026: true, lastSeasonRecord: '10-7', lastSeasonYear: 2025 },

  // ── AFC South ──
  { slug: 'hou', name: 'Houston Texans', abbr: 'HOU', conference: 'AFC', division: 'South', primaryColor: '#03202F', secondaryColor: '#A71930', logoUrl: logo('hou'), headCoach: 'DeMeco Ryans', headCoachIsNewFor2026: false, lastSeasonRecord: '12-5', lastSeasonYear: 2025 },
  { slug: 'ind', name: 'Indianapolis Colts', abbr: 'IND', conference: 'AFC', division: 'South', primaryColor: '#002C5F', secondaryColor: '#A2AAAD', logoUrl: logo('ind'), headCoach: 'Shane Steichen', headCoachIsNewFor2026: false, lastSeasonRecord: '8-9', lastSeasonYear: 2025 },
  { slug: 'jax', name: 'Jacksonville Jaguars', abbr: 'JAX', conference: 'AFC', division: 'South', primaryColor: '#006778', secondaryColor: '#D7A22A', logoUrl: logo('jax'), headCoach: 'Liam Coen', headCoachIsNewFor2026: false, lastSeasonRecord: '13-4', lastSeasonYear: 2025 },
  { slug: 'ten', name: 'Tennessee Titans', abbr: 'TEN', conference: 'AFC', division: 'South', primaryColor: '#0C2340', secondaryColor: '#4B92DB', logoUrl: logo('ten'), headCoach: 'Robert Saleh', headCoachIsNewFor2026: true, lastSeasonRecord: '3-14', lastSeasonYear: 2025 },

  // ── AFC West ──
  { slug: 'den', name: 'Denver Broncos', abbr: 'DEN', conference: 'AFC', division: 'West', primaryColor: '#FB4F14', secondaryColor: '#002244', logoUrl: logo('den'), headCoach: 'Sean Payton', headCoachIsNewFor2026: false, lastSeasonRecord: '14-3', lastSeasonYear: 2025 },
  { slug: 'kc', name: 'Kansas City Chiefs', abbr: 'KC', conference: 'AFC', division: 'West', primaryColor: '#E31837', secondaryColor: '#FFB81C', logoUrl: logo('kc'), headCoach: 'Andy Reid', headCoachIsNewFor2026: false, lastSeasonRecord: '6-11', lastSeasonYear: 2025 },
  { slug: 'lv', name: 'Las Vegas Raiders', abbr: 'LV', conference: 'AFC', division: 'West', primaryColor: '#000000', secondaryColor: '#A5ACAF', logoUrl: logo('lv'), headCoach: 'Klint Kubiak', headCoachIsNewFor2026: true, lastSeasonRecord: '3-14', lastSeasonYear: 2025 },
  { slug: 'lac', name: 'Los Angeles Chargers', abbr: 'LAC', conference: 'AFC', division: 'West', primaryColor: '#0080C6', secondaryColor: '#FFC20E', logoUrl: logo('lac'), headCoach: 'Jim Harbaugh', headCoachIsNewFor2026: false, lastSeasonRecord: '11-6', lastSeasonYear: 2025 },

  // ── NFC East ──
  { slug: 'dal', name: 'Dallas Cowboys', abbr: 'DAL', conference: 'NFC', division: 'East', primaryColor: '#041E42', secondaryColor: '#869397', logoUrl: logo('dal'), headCoach: 'Brian Schottenheimer', headCoachIsNewFor2026: false, lastSeasonRecord: '7-9-1', lastSeasonYear: 2025 },
  { slug: 'nyg', name: 'New York Giants', abbr: 'NYG', conference: 'NFC', division: 'East', primaryColor: '#0B2265', secondaryColor: '#A71930', logoUrl: logo('nyg'), headCoach: 'John Harbaugh', headCoachIsNewFor2026: true, lastSeasonRecord: '4-13', lastSeasonYear: 2025 },
  { slug: 'phi', name: 'Philadelphia Eagles', abbr: 'PHI', conference: 'NFC', division: 'East', primaryColor: '#004C54', secondaryColor: '#A5ACAF', logoUrl: logo('phi'), headCoach: 'Nick Sirianni', headCoachIsNewFor2026: false, lastSeasonRecord: '11-6', lastSeasonYear: 2025 },
  { slug: 'wsh', name: 'Washington Commanders', abbr: 'WSH', conference: 'NFC', division: 'East', primaryColor: '#5A1414', secondaryColor: '#FFB612', logoUrl: logo('wsh'), headCoach: 'Dan Quinn', headCoachIsNewFor2026: false, lastSeasonRecord: '5-12', lastSeasonYear: 2025 },

  // ── NFC North ──
  { slug: 'chi', name: 'Chicago Bears', abbr: 'CHI', conference: 'NFC', division: 'North', primaryColor: '#0B162A', secondaryColor: '#C83803', logoUrl: logo('chi'), headCoach: 'Ben Johnson', headCoachIsNewFor2026: false, lastSeasonRecord: '11-6', lastSeasonYear: 2025 },
  { slug: 'det', name: 'Detroit Lions', abbr: 'DET', conference: 'NFC', division: 'North', primaryColor: '#0076B6', secondaryColor: '#B0B7BC', logoUrl: logo('det'), headCoach: 'Dan Campbell', headCoachIsNewFor2026: false, lastSeasonRecord: '9-8', lastSeasonYear: 2025 },
  { slug: 'gb', name: 'Green Bay Packers', abbr: 'GB', conference: 'NFC', division: 'North', primaryColor: '#203731', secondaryColor: '#FFB612', logoUrl: logo('gb'), headCoach: 'Matt LaFleur', headCoachIsNewFor2026: false, lastSeasonRecord: '9-7-1', lastSeasonYear: 2025 },
  { slug: 'min', name: 'Minnesota Vikings', abbr: 'MIN', conference: 'NFC', division: 'North', primaryColor: '#4F2683', secondaryColor: '#FFC62F', logoUrl: logo('min'), headCoach: "Kevin O'Connell", headCoachIsNewFor2026: false, lastSeasonRecord: '9-8', lastSeasonYear: 2025 },

  // ── NFC South ──
  { slug: 'atl', name: 'Atlanta Falcons', abbr: 'ATL', conference: 'NFC', division: 'South', primaryColor: '#A71930', secondaryColor: '#000000', logoUrl: logo('atl'), headCoach: 'Kevin Stefanski', headCoachIsNewFor2026: true, lastSeasonRecord: '8-9', lastSeasonYear: 2025 },
  { slug: 'car', name: 'Carolina Panthers', abbr: 'CAR', conference: 'NFC', division: 'South', primaryColor: '#0085CA', secondaryColor: '#101820', logoUrl: logo('car'), headCoach: 'Dave Canales', headCoachIsNewFor2026: false, lastSeasonRecord: '8-9', lastSeasonYear: 2025 },
  { slug: 'no', name: 'New Orleans Saints', abbr: 'NO', conference: 'NFC', division: 'South', primaryColor: '#101820', secondaryColor: '#D3BC8D', logoUrl: logo('no'), headCoach: 'Kellen Moore', headCoachIsNewFor2026: false, lastSeasonRecord: '6-11', lastSeasonYear: 2025 },
  { slug: 'tb', name: 'Tampa Bay Buccaneers', abbr: 'TB', conference: 'NFC', division: 'South', primaryColor: '#D50A0A', secondaryColor: '#34302B', logoUrl: logo('tb'), headCoach: 'Todd Bowles', headCoachIsNewFor2026: false, lastSeasonRecord: '8-9', lastSeasonYear: 2025 },

  // ── NFC West ──
  { slug: 'ari', name: 'Arizona Cardinals', abbr: 'ARI', conference: 'NFC', division: 'West', primaryColor: '#97233F', secondaryColor: '#000000', logoUrl: logo('ari'), headCoach: 'Mike LaFleur', headCoachIsNewFor2026: true, lastSeasonRecord: '3-14', lastSeasonYear: 2025 },
  { slug: 'lar', name: 'Los Angeles Rams', abbr: 'LAR', conference: 'NFC', division: 'West', primaryColor: '#003594', secondaryColor: '#FFA300', logoUrl: logo('lar'), headCoach: 'Sean McVay', headCoachIsNewFor2026: false, lastSeasonRecord: '12-5', lastSeasonYear: 2025 },
  { slug: 'sf', name: 'San Francisco 49ers', abbr: 'SF', conference: 'NFC', division: 'West', primaryColor: '#AA0000', secondaryColor: '#B3995D', logoUrl: logo('sf'), headCoach: 'Kyle Shanahan', headCoachIsNewFor2026: false, lastSeasonRecord: '12-5', lastSeasonYear: 2025 },
  { slug: 'sea', name: 'Seattle Seahawks', abbr: 'SEA', conference: 'NFC', division: 'West', primaryColor: '#002244', secondaryColor: '#69BE28', logoUrl: logo('sea'), headCoach: 'Mike Macdonald', headCoachIsNewFor2026: false, lastSeasonRecord: '14-3', lastSeasonYear: 2025 },
]

export function teamsByConferenceAndDivision() {
  const conferences: { conference: 'AFC' | 'NFC'; divisions: { division: string; teams: NFLTeamDirectoryEntry[] }[] }[] = []
  for (const conf of ['AFC', 'NFC'] as const) {
    const divisions: { division: string; teams: NFLTeamDirectoryEntry[] }[] = []
    for (const div of ['East', 'North', 'South', 'West'] as const) {
      const teams = NFL_TEAM_DIRECTORY.filter((t) => t.conference === conf && t.division === div)
      divisions.push({ division: div, teams })
    }
    conferences.push({ conference: conf, divisions })
  }
  return conferences
}