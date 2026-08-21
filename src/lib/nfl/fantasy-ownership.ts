// src/lib/nfl/fantasy-ownership.ts
//
// ESPN Fantasy Football ownership + fantasy-points data. Distinct API
// host from everything else in this codebase (lm-api-reads.fantasy.espn.com,
// not site.api.espn.com) — no auth needed, confirmed via curl 2026-08-16.
//
// Deliberately does NOT decode the numeric stat-ID dictionary inside
// each player's stats{} object (keys like "23", "24"...) — ESPN doesn't
// document what those IDs map to, and guessing would mean showing a
// fabricated number labeled as a real stat. Only two things are used
// from this endpoint, both unambiguous:
//   - ownership.percentOwned / percentStarted / averageDraftPosition
//   - stats[].appliedTotal (clearly-labeled fantasy points for that
//     scoring period — NOT a coded ID)
// Real yardage/TD/reception stat lines come from the sports API leaders
// work (src/lib/nfl/leaders.ts), not from here.
//
// Position ID mapping confirmed via curl against real top-60-owned
// players (2026-08-16): 1=QB, 2=RB, 3=WR, 4=TE, 5=K, 16=D/ST.

const FANTASY_API = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026'

export const FANTASY_POSITION_MAP: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'D/ST',
}

export type FantasyProTeam = {
  id: number
  abbrev: string
  location: string
  name: string
  color: string | null
}

export type FantasyOwnershipEntry = {
  playerId: number
  athleteId: string        // NEW — string form for building the headshot URL
  fullName: string
  positionId: number
  position: string
  proTeamId: number
  percentOwned: number
  percentStarted: number
  averageDraftPosition: number
  latestFantasyPoints: number | null
  headshotUrl: string | null   // NEW
  injured: boolean
  injuryStatus: string | null
}

let proTeamCache: FantasyProTeam[] | null = null
let proTeamCacheAt = 0
const PRO_TEAM_CACHE_MS = 6 * 60 * 60 * 1000 // 6h — team metadata barely changes

// Fetches the pro-team list dynamically rather than hardcoding all 32
// team ids/colors from a single partial curl sample — safer than
// transcribing 32 rows by hand from one truncated response.
export async function getFantasyProTeams(): Promise<FantasyProTeam[]> {
  const now = Date.now()
  if (proTeamCache && now - proTeamCacheAt < PRO_TEAM_CACHE_MS) return proTeamCache

  try {
    const res = await fetch(`${FANTASY_API}?view=proTeamSchedules`, { next: { revalidate: 21600 } })
    if (!res.ok) return proTeamCache ?? []
    const data = await res.json()
    const raw: any[] = data.settings?.proTeams ?? data.proTeams ?? []
    const teams = raw
      .filter(t => t.id && t.abbrev) // drops the "no team" placeholder entry
      .map(t => ({
        id: t.id,
        abbrev: t.abbrev,
        location: t.location ?? '',
        name: t.name ?? '',
        color: t.color ? `#${t.color}` : null,
      }))
    proTeamCache = teams
    proTeamCacheAt = now
    return teams
  } catch (e) {
    console.error('getFantasyProTeams error:', e)
    return proTeamCache ?? []
  }
}

export async function getFantasyOwnershipLeaders(limit: number = 20): Promise<FantasyOwnershipEntry[]> {
  try {
    const res = await fetch(
      `${FANTASY_API}/segments/0/leaguedefaults/1?view=kona_player_info`,
      {
        headers: {
          'X-Fantasy-Filter': JSON.stringify({
            players: { limit, sortPercOwned: { sortAsc: false, sortPriority: 1 } },
          }),
        },
        next: { revalidate: 1800 },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const raw: any[] = data.players ?? []

    return raw.map((p): FantasyOwnershipEntry => {
      const pp = p.player ?? {}
      const own = pp.ownership ?? {}
      // stats[] is an array of scoring-period entries; take the most
      // recent one's appliedTotal if present. Not summed/aggregated —
      // that would need deciding which periods count as "current," out
      // of scope for this preview.
      const latestStat = Array.isArray(pp.stats) && pp.stats.length > 0 ? pp.stats[0] : null

  return {
  playerId: pp.id,
  athleteId: String(pp.id ?? ''),
  fullName: pp.fullName ?? 'Unknown',
  positionId: pp.defaultPositionId,
  position: FANTASY_POSITION_MAP[pp.defaultPositionId] ?? '—',
  proTeamId: pp.proTeamId ?? 0,
  percentOwned: own.percentOwned ?? 0,
  percentStarted: own.percentStarted ?? 0,
  averageDraftPosition: own.averageDraftPosition ?? 0,
  latestFantasyPoints: latestStat?.appliedTotal ?? null,
  // Same CDN pattern already confirmed working elsewhere in this codebase
  // (NFLHomepage.tsx's headshotUrl() helper, transactions headshots) —
  // not a field ESPN's fantasy payload returns directly, built from the
  // athlete id using the pattern verified against a real player profile.
  headshotUrl: pp.id ? `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${pp.id}.png&w=100&h=100` : null,
  injured: pp.injured ?? false,
  injuryStatus: pp.injuryStatus ?? null,
}
    })
  } catch (e) {
    console.error('getFantasyOwnershipLeaders error:', e)
    return []
  }
}