// Master list of MLB teams. Slug is the URL-safe key we store in subscribers.teams[]
export type Team = {
  slug: string
  id: number // real MLB team id (statsapi.mlb.com) — verified against /api/v1/teams?sportId=1&activeStatus=Yes; single source of truth, don't re-hardcode this map elsewhere
  name: string
  short: string
  abbrev: string
  league: 'AL' | 'NL'
  division: 'East' | 'Central' | 'West'
  primary_color: string
  secondary_color: string
  text_on_primary: string  // contrast color for primary background
}
export const MLB_TEAMS: Team[] = [
  // AL East
  { slug: 'yankees', id: 147, name: 'New York Yankees', short: 'Yankees', abbrev: 'NYY', league: 'AL', division: 'East', primary_color: '#0C2340', secondary_color: '#C4CED4', text_on_primary: '#FFFFFF' },
  { slug: 'red-sox', id: 111, name: 'Boston Red Sox', short: 'Red Sox', abbrev: 'BOS', league: 'AL', division: 'East', primary_color: '#BD3039', secondary_color: '#0C2340', text_on_primary: '#FFFFFF' },
  { slug: 'blue-jays', id: 141, name: 'Toronto Blue Jays', short: 'Blue Jays', abbrev: 'TOR', league: 'AL', division: 'East', primary_color: '#134A8E', secondary_color: '#1D2D5C', text_on_primary: '#FFFFFF' },
  { slug: 'orioles', id: 110, name: 'Baltimore Orioles', short: 'Orioles', abbrev: 'BAL', league: 'AL', division: 'East', primary_color: '#DF4601', secondary_color: '#000000', text_on_primary: '#FFFFFF' },
  { slug: 'rays', id: 139, name: 'Tampa Bay Rays', short: 'Rays', abbrev: 'TB', league: 'AL', division: 'East', primary_color: '#092C5C', secondary_color: '#8FBCE6', text_on_primary: '#FFFFFF' },

  // AL Central
  { slug: 'guardians', id: 114, name: 'Cleveland Guardians', short: 'Guardians', abbrev: 'CLE', league: 'AL', division: 'Central', primary_color: '#00385D', secondary_color: '#E50022', text_on_primary: '#FFFFFF' },
  { slug: 'tigers', id: 116, name: 'Detroit Tigers', short: 'Tigers', abbrev: 'DET', league: 'AL', division: 'Central', primary_color: '#0C2340', secondary_color: '#FA4616', text_on_primary: '#FFFFFF' },
  { slug: 'royals', id: 118, name: 'Kansas City Royals', short: 'Royals', abbrev: 'KC', league: 'AL', division: 'Central', primary_color: '#004687', secondary_color: '#BD9B60', text_on_primary: '#FFFFFF' },
  { slug: 'twins', id: 142, name: 'Minnesota Twins', short: 'Twins', abbrev: 'MIN', league: 'AL', division: 'Central', primary_color: '#002B5C', secondary_color: '#D31145', text_on_primary: '#FFFFFF' },
  { slug: 'white-sox', id: 145, name: 'Chicago White Sox', short: 'White Sox', abbrev: 'CWS', league: 'AL', division: 'Central', primary_color: '#27251F', secondary_color: '#C4CED4', text_on_primary: '#FFFFFF' },

  // AL West
  { slug: 'astros', id: 117, name: 'Houston Astros', short: 'Astros', abbrev: 'HOU', league: 'AL', division: 'West', primary_color: '#002D62', secondary_color: '#EB6E1F', text_on_primary: '#FFFFFF' },
  { slug: 'angels', id: 108, name: 'Los Angeles Angels', short: 'Angels', abbrev: 'LAA', league: 'AL', division: 'West', primary_color: '#BA0021', secondary_color: '#003263', text_on_primary: '#FFFFFF' },
  { slug: 'athletics', id: 133, name: 'Athletics', short: 'Athletics', abbrev: 'ATH', league: 'AL', division: 'West', primary_color: '#003831', secondary_color: '#EFB21E', text_on_primary: '#FFFFFF' },
  { slug: 'mariners', id: 136, name: 'Seattle Mariners', short: 'Mariners', abbrev: 'SEA', league: 'AL', division: 'West', primary_color: '#0C2C56', secondary_color: '#005C5C', text_on_primary: '#FFFFFF' },
  { slug: 'rangers', id: 140, name: 'Texas Rangers', short: 'Rangers', abbrev: 'TEX', league: 'AL', division: 'West', primary_color: '#003278', secondary_color: '#C0111F', text_on_primary: '#FFFFFF' },

  // NL East
  { slug: 'braves', id: 144, name: 'Atlanta Braves', short: 'Braves', abbrev: 'ATL', league: 'NL', division: 'East', primary_color: '#CE1141', secondary_color: '#13274F', text_on_primary: '#FFFFFF' },
  { slug: 'marlins', id: 146, name: 'Miami Marlins', short: 'Marlins', abbrev: 'MIA', league: 'NL', division: 'East', primary_color: '#00A3E0', secondary_color: '#EF3340', text_on_primary: '#FFFFFF' },
  { slug: 'mets', id: 121, name: 'New York Mets', short: 'Mets', abbrev: 'NYM', league: 'NL', division: 'East', primary_color: '#002D72', secondary_color: '#FF5910', text_on_primary: '#FFFFFF' },
  { slug: 'phillies', id: 143, name: 'Philadelphia Phillies', short: 'Phillies', abbrev: 'PHI', league: 'NL', division: 'East', primary_color: '#E81828', secondary_color: '#002D72', text_on_primary: '#FFFFFF' },
  { slug: 'nationals', id: 120, name: 'Washington Nationals', short: 'Nationals', abbrev: 'WSH', league: 'NL', division: 'East', primary_color: '#AB0003', secondary_color: '#14225A', text_on_primary: '#FFFFFF' },

  // NL Central
  { slug: 'cubs', id: 112, name: 'Chicago Cubs', short: 'Cubs', abbrev: 'CHC', league: 'NL', division: 'Central', primary_color: '#0E3386', secondary_color: '#CC3433', text_on_primary: '#FFFFFF' },
  { slug: 'reds', id: 113, name: 'Cincinnati Reds', short: 'Reds', abbrev: 'CIN', league: 'NL', division: 'Central', primary_color: '#C6011F', secondary_color: '#000000', text_on_primary: '#FFFFFF' },
  { slug: 'brewers', id: 158, name: 'Milwaukee Brewers', short: 'Brewers', abbrev: 'MIL', league: 'NL', division: 'Central', primary_color: '#12284B', secondary_color: '#FFC52F', text_on_primary: '#FFFFFF' },
  { slug: 'pirates', id: 134, name: 'Pittsburgh Pirates', short: 'Pirates', abbrev: 'PIT', league: 'NL', division: 'Central', primary_color: '#27251F', secondary_color: '#FDB827', text_on_primary: '#FFFFFF' },
  { slug: 'cardinals', id: 138, name: 'St. Louis Cardinals', short: 'Cardinals', abbrev: 'STL', league: 'NL', division: 'Central', primary_color: '#C41E3A', secondary_color: '#0C2340', text_on_primary: '#FFFFFF' },

  // NL West
  { slug: 'diamondbacks', id: 109, name: 'Arizona Diamondbacks', short: 'D-Backs', abbrev: 'ARI', league: 'NL', division: 'West', primary_color: '#A71930', secondary_color: '#E3D4AD', text_on_primary: '#FFFFFF' },
  { slug: 'rockies', id: 115, name: 'Colorado Rockies', short: 'Rockies', abbrev: 'COL', league: 'NL', division: 'West', primary_color: '#33006F', secondary_color: '#C4CED4', text_on_primary: '#FFFFFF' },
  { slug: 'dodgers', id: 119, name: 'Los Angeles Dodgers', short: 'Dodgers', abbrev: 'LAD', league: 'NL', division: 'West', primary_color: '#005A9C', secondary_color: '#EF3E42', text_on_primary: '#FFFFFF' },
  { slug: 'padres', id: 135, name: 'San Diego Padres', short: 'Padres', abbrev: 'SD', league: 'NL', division: 'West', primary_color: '#2F241D', secondary_color: '#FFC425', text_on_primary: '#FFFFFF' },
  { slug: 'giants', id: 137, name: 'San Francisco Giants', short: 'Giants', abbrev: 'SF', league: 'NL', division: 'West', primary_color: '#FD5A1E', secondary_color: '#27251F', text_on_primary: '#FFFFFF' },
]
// Find a team by its full name (used when matching MLB API responses)
export function findTeamByName(name: string): Team | undefined {
  return MLB_TEAMS.find(t => t.name === name || t.short === name)
}

// Find a team by slug (used when reading subscriber preferences)
export function findTeamBySlug(slug: string): Team | undefined {
  return MLB_TEAMS.find(t => t.slug === slug)
}

// MLB team ID lookup — for fetching team logos and stats. Reads off
// MLB_TEAMS.id (see Team type above) rather than its own hardcoded map —
// this file used to carry that same 30-team slug→id table THREE times
// (here, plus two more inline copies in MLBHomepage.tsx) with no way to
// tell if a future edit landed in all three.
export function teamIdBySlug(slug: string): number | null {
  return findTeamBySlug(slug)?.id ?? null
}



// Get team theme colors by slug
export function getTeamTheme(slug: string): { primary: string; secondary: string; text: string } {
  const team = findTeamBySlug(slug)
  if (!team) {
    // Fallback to brand colors
    return { primary: '#1A1A1A', secondary: '#FF5722', text: '#FFFFFF' }
  }
  return {
    primary: team.primary_color,
    secondary: team.secondary_color,
    text: team.text_on_primary,
  }
}

// Names that are ambiguous when shortened (e.g. "Sox" = either Red Sox or White Sox)
// For these, prefer the 3-letter abbreviation in social-share contexts.
const AMBIGUOUS_SHORT_NAMES = new Set([
  'Sox',   // Red Sox + White Sox both → "Sox"
  'Jays',  // Blue Jays → "Jays" (sometimes confused with non-MLB)
])

/**
 * Best display name for social-share contexts (cards, tweets).
 * - "Boston Red Sox"  → "BOS" (would have been ambiguous "Sox")
 * - "Chicago White Sox" → "CWS"
 * - "Philadelphia Phillies" → "Phillies" (no ambiguity, fuller word)
 */
export function shareDisplayName(fullName: string): string {
  const team = findTeamByName(fullName)
  if (!team) {
    // Fallback to last word
    const parts = fullName.split(' ')
    return parts[parts.length - 1]
  }

  // Last word of `short` — handles "Red Sox" → "Sox", "Blue Jays" → "Jays"
  const lastWord = team.short.split(' ').pop() ?? team.short

  if (AMBIGUOUS_SHORT_NAMES.has(lastWord)) {
    return team.abbrev
  }

  // For multi-word shorts like "Red Sox", "Blue Jays", "D-Backs" — keep them whole
  // (they're already team-specific even if ending word is ambiguous)
  return team.short
}