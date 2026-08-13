// src/lib/nfl/leaders.ts
//
// NFL STAT LEADERS — fetch + parse layer for the homepage Leaders panel
// and the /stats page.
//
// Confirmed live (Aug 2026) via curl against:
//   sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{yr}/types/{type}/leaders
//
// Real confirmed categories include (not exhaustive — read whatever the
// response actually contains, don't hardcode a category list): passingYards,
// passingTouchdowns, quarterbackRating, rushingYards, rushingTouchdowns,
// receivingYards, receptions, sacks, interceptions, totalTackles, kickoffYards.
//
// SAME PROBLEM AS nfl_transactions: leader entries are $ref-only — no
// player name inline, just a link to the athlete resource. Rather than
// N+1 fetch every athlete name (32 teams x ~10 categories x 25 leaders
// = a lot), this reuses the bulk athlete list (confirmed in fetch_nfl_transactions.py
// via the v3 athletes endpoint) as a one-time-per-request name lookup.
//
// Team and athlete IDs are extracted from the $ref URL string itself
// (e.g. ".../teams/24?lang=en" -> "24") rather than fetched — the ref
// URLs reliably embed the numeric ID as the last path segment before
// the query string, confirmed across every sample in the real response.

// ─────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────

export type NFLStatLeaderEntry = {
  athleteId: string
  playerName: string   // resolved via bulk athlete lookup; 'Unknown' if not found
  teamId: string
  displayValue: string
  value: number
}

export type NFLStatCategory = {
  name: string           // e.g. 'passingYards'
  displayName: string    // e.g. 'Passing Yards'
  shortDisplayName: string
  abbreviation: string
  leaders: NFLStatLeaderEntry[]
}

// ─────────────────────────────────────────────────────────────────────
//  RAW ESPN RESPONSE SHAPE (subset — only what we read, from the confirmed curl)
// ─────────────────────────────────────────────────────────────────────

type EspnLeaderEntry = {
  displayValue: string
  value: number
  athlete: { $ref: string }
  team: { $ref: string }
}

type EspnLeaderCategory = {
  name: string
  displayName: string
  shortDisplayName: string
  abbreviation: string
  leaders: EspnLeaderEntry[]
}

type EspnLeadersResponse = {
  categories?: EspnLeaderCategory[]
}

// ─────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────

// Extracts the trailing numeric ID from a $ref URL, e.g.
// ".../seasons/2021/athletes/2330?lang=en&region=us" -> "2330"
function idFromRef(ref: string): string | null {
  const match = ref.split('?')[0].match(/\/(\d+)$/)
  return match ? match[1] : null
}

let athleteNameCache: Map<string, string> | null = null
let athleteNameCacheExpiry = 0
const ATHLETE_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — this list barely changes day to day

/**
 * Bulk athlete id -> name lookup, cached in-process. Mirrors the
 * pattern in fetch_nfl_transactions.py's build_athlete_name_lookup(),
 * ported to TS. 21 paginated requests, done once per cache window
 * rather than once per leader entry.
 */
async function getAthleteNameLookup(): Promise<Map<string, string>> {
  if (athleteNameCache && Date.now() < athleteNameCacheExpiry) {
    return athleteNameCache
  }

  const lookup = new Map<string, string>()
  let page = 1
  const maxPages = 25 // safety cap — confirmed real pageCount was 21

  while (page <= maxPages) {
    let json: { items?: Array<{ id?: string; fullName?: string }>; pageCount?: number }
    try {
      const res = await fetch(
        `https://sports.core.api.espn.com/v3/sports/football/nfl/athletes?limit=1000&page=${page}`,
        { next: { revalidate: 86400 } } as RequestInit,
      )
      if (!res.ok) break
      json = await res.json()
    } catch (e) {
      console.error('nfl-leaders: athlete lookup fetch failed', e)
      break
    }

    for (const item of json.items ?? []) {
      if (item.id && item.fullName) lookup.set(item.id, item.fullName)
    }

    const pageCount = json.pageCount ?? 1
    if (page >= pageCount) break
    page++
  }

  athleteNameCache = lookup
  athleteNameCacheExpiry = Date.now() + ATHLETE_CACHE_TTL_MS
  return lookup
}

// ─────────────────────────────────────────────────────────────────────
//  FETCH + PARSE
// ─────────────────────────────────────────────────────────────────────

/**
 * Fetches all stat-leader categories for a season. Empty state beats
 * fabricated data — returns [] on any failure, never partial/guessed data.
 */
export async function fetchNFLLeaders(
  season: number,
  seasonType: 1 | 2 | 3 = 2,
): Promise<NFLStatCategory[]> {
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/${season}/types/${seasonType}/leaders`

  let json: EspnLeadersResponse
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } } as RequestInit)
    if (!res.ok) {
      console.error(`nfl-leaders: fetch failed — ${res.status}`)
      return []
    }
    json = await res.json()
  } catch (e) {
    console.error('nfl-leaders: fetch threw', e)
    return []
  }

  const categories = json.categories
  if (!categories || categories.length === 0) {
    console.error('nfl-leaders: no categories in response')
    return []
  }

  const nameLookup = await getAthleteNameLookup()

  return categories.map(cat => ({
    name: cat.name,
    displayName: cat.displayName,
    shortDisplayName: cat.shortDisplayName,
    abbreviation: cat.abbreviation,
    leaders: cat.leaders
      .map(leader => {
        const athleteId = idFromRef(leader.athlete.$ref)
        const teamId = idFromRef(leader.team.$ref)
        if (!athleteId || !teamId) return null
        return {
          athleteId,
          playerName: nameLookup.get(athleteId) ?? 'Unknown',
          teamId,
          displayValue: leader.displayValue,
          value: leader.value,
        }
      })
      .filter((l): l is NFLStatLeaderEntry => l !== null),
  }))
}

/**
 * Convenience: fetch just the categories most relevant to a homepage
 * "leaders" panel (mirrors MLB's batting/pitching tab set). Adjust this
 * list based on what actually renders well — these names are confirmed
 * to exist in the response, but the FULL set of available categories is
 * larger; check a live response if you want to add more.
 */
export const HOMEPAGE_LEADER_CATEGORIES = [
  'passingYards',
  'passingTouchdowns',
  'quarterbackRating',
  'rushingYards',
  'rushingTouchdowns',
  'receivingYards',
  'receptions',
  'sacks',
  'interceptions',
] as const

export async function fetchNFLHomepageLeaders(
  season: number,
  seasonType: 1 | 2 | 3 = 2,
): Promise<Record<string, NFLStatCategory>> {
  const all = await fetchNFLLeaders(season, seasonType)
  const out: Record<string, NFLStatCategory> = {}
  for (const cat of all) {
    if ((HOMEPAGE_LEADER_CATEGORIES as readonly string[]).includes(cat.name)) {
      out[cat.name] = cat
    }
  }
  return out
}
