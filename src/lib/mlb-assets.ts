// src/lib/mlb-assets.ts
//
// Two things bundled together since they're both "static MLB reference
// data, not derived from a game":
//
//  1. A hardcoded team id -> {abbr, name} table. The schedule endpoint's
//     unhydrated team objects don't reliably include `abbreviation` — that
//     was the actual cause of the blank logo boxes: awayAbbr/homeAbbr came
//     back as empty strings, so both the <img> src (built from teamId,
//     which WAS present) and the text fallback (built from the empty abbr)
//     failed at once. Team ids are stable and there are only 30 of them,
//     so a static table sidesteps the hydration question entirely rather
//     than trying to get the query params exactly right.
//
//  2. URL builders for MLB's own static image CDN — team logos and player
//     headshots. Both verified against real MLB-data tooling as of this
//     writing:
//       - logos:     https://www.mlbstatic.com/team-logos/{teamId}.svg
//       - headshots: https://img.mlbstatic.com/mlb-photos/image/upload/
//                     d_people:generic:headshot:67:current.png/w_180,q_auto:best/
//                     v1/people/{playerId}/headshot/67/current
//     The headshot URL's `d_...` segment is a Cloudinary "default image"
//     directive — if a specific player has no photo on file, MLB's own CDN
//     serves a generic silhouette automatically. That's more reliable than
//     a client-side onError fallback, so headshotUrl() doesn't need one.

export const MLB_TEAMS: Record<number, { abbr: string; name: string }> = {
  108: { abbr: 'LAA', name: 'Los Angeles Angels' },
  109: { abbr: 'ARI', name: 'Arizona Diamondbacks' },
  110: { abbr: 'BAL', name: 'Baltimore Orioles' },
  111: { abbr: 'BOS', name: 'Boston Red Sox' },
  112: { abbr: 'CHC', name: 'Chicago Cubs' },
  113: { abbr: 'CIN', name: 'Cincinnati Reds' },
  114: { abbr: 'CLE', name: 'Cleveland Guardians' },
  115: { abbr: 'COL', name: 'Colorado Rockies' },
  116: { abbr: 'DET', name: 'Detroit Tigers' },
  117: { abbr: 'HOU', name: 'Houston Astros' },
  118: { abbr: 'KC', name: 'Kansas City Royals' },
  119: { abbr: 'LAD', name: 'Los Angeles Dodgers' },
  120: { abbr: 'WSH', name: 'Washington Nationals' },
  121: { abbr: 'NYM', name: 'New York Mets' },
  133: { abbr: 'ATH', name: 'Athletics' },
  134: { abbr: 'PIT', name: 'Pittsburgh Pirates' },
  135: { abbr: 'SD', name: 'San Diego Padres' },
  136: { abbr: 'SEA', name: 'Seattle Mariners' },
  137: { abbr: 'SF', name: 'San Francisco Giants' },
  138: { abbr: 'STL', name: 'St. Louis Cardinals' },
  139: { abbr: 'TB', name: 'Tampa Bay Rays' },
  140: { abbr: 'TEX', name: 'Texas Rangers' },
  141: { abbr: 'TOR', name: 'Toronto Blue Jays' },
  142: { abbr: 'MIN', name: 'Minnesota Twins' },
  143: { abbr: 'PHI', name: 'Philadelphia Phillies' },
  144: { abbr: 'ATL', name: 'Atlanta Braves' },
  145: { abbr: 'CWS', name: 'Chicago White Sox' },
  146: { abbr: 'MIA', name: 'Miami Marlins' },
  147: { abbr: 'NYY', name: 'New York Yankees' },
  158: { abbr: 'MIL', name: 'Milwaukee Brewers' },
}

export function teamAbbr(teamId: number, fallback?: string): string {
  return MLB_TEAMS[teamId]?.abbr ?? fallback ?? '???'
}

export function teamName(teamId: number, fallback?: string): string {
  return MLB_TEAMS[teamId]?.name ?? fallback ?? `Team ${teamId}`
}

export function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/${teamId}.svg`
}

export function headshotUrl(playerId: number, widthPx = 40): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_${widthPx},q_auto:best/v1/people/${playerId}/headshot/67/current`
}
