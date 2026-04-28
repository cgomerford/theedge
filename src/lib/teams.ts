// Master list of MLB teams. Slug is the URL-safe key we store in subscribers.teams[]

export type Team = {
  slug: string
  name: string         // "New York Yankees"
  short: string        // "Yankees"
  abbrev: string       // "NYY"
  league: 'AL' | 'NL'
  division: 'East' | 'Central' | 'West'
}

export const MLB_TEAMS: Team[] = [
  // AL East
  { slug: 'yankees', name: 'New York Yankees', short: 'Yankees', abbrev: 'NYY', league: 'AL', division: 'East' },
  { slug: 'red-sox', name: 'Boston Red Sox', short: 'Red Sox', abbrev: 'BOS', league: 'AL', division: 'East' },
  { slug: 'blue-jays', name: 'Toronto Blue Jays', short: 'Blue Jays', abbrev: 'TOR', league: 'AL', division: 'East' },
  { slug: 'orioles', name: 'Baltimore Orioles', short: 'Orioles', abbrev: 'BAL', league: 'AL', division: 'East' },
  { slug: 'rays', name: 'Tampa Bay Rays', short: 'Rays', abbrev: 'TB', league: 'AL', division: 'East' },

  // AL Central
  { slug: 'guardians', name: 'Cleveland Guardians', short: 'Guardians', abbrev: 'CLE', league: 'AL', division: 'Central' },
  { slug: 'tigers', name: 'Detroit Tigers', short: 'Tigers', abbrev: 'DET', league: 'AL', division: 'Central' },
  { slug: 'royals', name: 'Kansas City Royals', short: 'Royals', abbrev: 'KC', league: 'AL', division: 'Central' },
  { slug: 'twins', name: 'Minnesota Twins', short: 'Twins', abbrev: 'MIN', league: 'AL', division: 'Central' },
  { slug: 'white-sox', name: 'Chicago White Sox', short: 'White Sox', abbrev: 'CWS', league: 'AL', division: 'Central' },

  // AL West
  { slug: 'astros', name: 'Houston Astros', short: 'Astros', abbrev: 'HOU', league: 'AL', division: 'West' },
  { slug: 'angels', name: 'Los Angeles Angels', short: 'Angels', abbrev: 'LAA', league: 'AL', division: 'West' },
  { slug: 'athletics', name: 'Athletics', short: 'Athletics', abbrev: 'ATH', league: 'AL', division: 'West' },
  { slug: 'mariners', name: 'Seattle Mariners', short: 'Mariners', abbrev: 'SEA', league: 'AL', division: 'West' },
  { slug: 'rangers', name: 'Texas Rangers', short: 'Rangers', abbrev: 'TEX', league: 'AL', division: 'West' },

  // NL East
  { slug: 'braves', name: 'Atlanta Braves', short: 'Braves', abbrev: 'ATL', league: 'NL', division: 'East' },
  { slug: 'marlins', name: 'Miami Marlins', short: 'Marlins', abbrev: 'MIA', league: 'NL', division: 'East' },
  { slug: 'mets', name: 'New York Mets', short: 'Mets', abbrev: 'NYM', league: 'NL', division: 'East' },
  { slug: 'phillies', name: 'Philadelphia Phillies', short: 'Phillies', abbrev: 'PHI', league: 'NL', division: 'East' },
  { slug: 'nationals', name: 'Washington Nationals', short: 'Nationals', abbrev: 'WSH', league: 'NL', division: 'East' },

  // NL Central
  { slug: 'cubs', name: 'Chicago Cubs', short: 'Cubs', abbrev: 'CHC', league: 'NL', division: 'Central' },
  { slug: 'reds', name: 'Cincinnati Reds', short: 'Reds', abbrev: 'CIN', league: 'NL', division: 'Central' },
  { slug: 'brewers', name: 'Milwaukee Brewers', short: 'Brewers', abbrev: 'MIL', league: 'NL', division: 'Central' },
  { slug: 'pirates', name: 'Pittsburgh Pirates', short: 'Pirates', abbrev: 'PIT', league: 'NL', division: 'Central' },
  { slug: 'cardinals', name: 'St. Louis Cardinals', short: 'Cardinals', abbrev: 'STL', league: 'NL', division: 'Central' },

  // NL West
  { slug: 'diamondbacks', name: 'Arizona Diamondbacks', short: 'D-Backs', abbrev: 'ARI', league: 'NL', division: 'West' },
  { slug: 'rockies', name: 'Colorado Rockies', short: 'Rockies', abbrev: 'COL', league: 'NL', division: 'West' },
  { slug: 'dodgers', name: 'Los Angeles Dodgers', short: 'Dodgers', abbrev: 'LAD', league: 'NL', division: 'West' },
  { slug: 'padres', name: 'San Diego Padres', short: 'Padres', abbrev: 'SD', league: 'NL', division: 'West' },
  { slug: 'giants', name: 'San Francisco Giants', short: 'Giants', abbrev: 'SF', league: 'NL', division: 'West' },
]

// Find a team by its full name (used when matching MLB API responses)
export function findTeamByName(name: string): Team | undefined {
  return MLB_TEAMS.find(t => t.name === name || t.short === name)
}

// Find a team by slug (used when reading subscriber preferences)
export function findTeamBySlug(slug: string): Team | undefined {
  return MLB_TEAMS.find(t => t.slug === slug)
}