// src/lib/nfl/fantasy-ownership.ts
//
// NFL FANTASY OWNERSHIP — fetch + parse layer for the Waiver Wire Gem.
//
// Confirmed live (Aug 2026) via a manual curl against:
//   https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leaguedefaults/3?view=kona_player_info
// with header: X-Fantasy-Filter: {"players":{"limit":N,"sortPercOwned":{"sortPriority":1,"sortAsc":bool}}}
//
// IMPORTANT CORRECTION vs. community docs: percentOwned is 0-100
// (e.g. 99.86), NOT a 0-1 fraction (some older blog posts show 0.153 —
// that was either a different API version or simply wrong; our own curl
// is the ground truth here per the project's data-integrity rule).
//
// proTeamId is ESPN's FANTASY team numbering — there is no confirmed
// mapping from this to the site.api.espn.com team IDs used everywhere
// else in this codebase (nfl-team-stats.ts, nfl-scout.ts, nfl_transactions).
// Do NOT assume proTeamId === team_id from those other sources without
// building and verifying a translation table first. This file exposes
// proTeamId as-is and leaves reconciliation to the caller.
//
// The custom X-Fantasy-Filter header is why this can't go through the
// standard web_fetch-verified pattern the other NFL lib files used —
// it was verified via a manual curl run by George, not by Claude directly.

// ─────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────

export type FantasyOwnership = {
  activityLevel: string | null
  auctionValueAverage: number | null
  averageDraftPosition: number | null
  percentOwned: number   // 0-100, confirmed via curl — do not treat as 0-1
  percentStarted: number | null
  percentChange: number | null
}

export type FantasyPlayer = {
  espnFantasyId: string
  firstName: string
  lastName: string
  fullName: string
  defaultPositionId: number
  position: string | null   // resolved via POSITION_ID_MAP below
  proTeamId: number          // ESPN fantasy team id — NOT the site.api team id, see file header
  active: boolean
  injured: boolean
  injuryStatus: string | null  // e.g. "ACTIVE", "QUESTIONABLE" — fantasy-context, separate from nfl_transactions
  ownership: FantasyOwnership
}

// Confirmed against the earlier NFL fantasy stat-column research —
// defaultPositionId 2 = RB was verified directly against Jahmyr Gibbs
// in the curl output. The rest follow ESPN's well-documented convention;
// re-verify individually if a position ever displays wrong.
export const POSITION_ID_MAP: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DST',
}

// ─────────────────────────────────────────────────────────────────────
//  RAW ESPN RESPONSE SHAPE (subset — only what we read, from the confirmed curl)
// ─────────────────────────────────────────────────────────────────────

type EspnFantasyPlayerEntry = {
  id: number
  player: {
    active: boolean
    defaultPositionId: number
    firstName: string
    lastName: string
    fullName: string
    id: number
    injured: boolean
    injuryStatus: string | null
    proTeamId: number
    ownership: {
      activityLevel: string | null
      auctionValueAverage: number | null
      averageDraftPosition: number | null
      percentChange: number | null
      percentOwned: number
      percentStarted: number | null
    }
  }
}

type EspnFantasyResponse = {
  players?: EspnFantasyPlayerEntry[]
}

// ─────────────────────────────────────────────────────────────────────
//  FETCH + PARSE
// ─────────────────────────────────────────────────────────────────────

/**
 * Fetches players sorted by percentOwned. Set sortAsc=true for the
 * Waiver Wire Gem use case (find LOW-owned players); false for "who's
 * universally rostered" type queries.
 *
 * NOTE: this endpoint needs a custom X-Fantasy-Filter header, which is
 * why this fetch is more manual than the other NFL lib files — there's
 * no web_fetch-tool-verified precedent for this exact call chain, only
 * George's manual curl. If this starts failing, the header syntax or
 * the lm-api-reads.fantasy.espn.com host are the first things to
 * re-verify by hand, the same way we found the host itself had moved
 * from fantasy.espn.com in 2024.
 */
export async function fetchNFLFantasyOwnership(
  season: number,
  opts: { limit?: number; sortAsc?: boolean } = {},
): Promise<FantasyPlayer[]> {
  const { limit = 200, sortAsc = true } = opts

  const filter = JSON.stringify({
    players: {
      limit,
      sortPercOwned: { sortPriority: 1, sortAsc },
    },
  })

  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`

  let json: EspnFantasyResponse
  try {
    const res = await fetch(url, {
      headers: { 'X-Fantasy-Filter': filter },
      next: { revalidate: 3600 },
    } as RequestInit)
    if (!res.ok) {
      console.error(`nfl-fantasy-ownership: fetch failed — ${res.status}`)
      return []
    }
    json = await res.json()
  } catch (e) {
    console.error('nfl-fantasy-ownership: fetch threw', e)
    return []
  }

  const entries = json.players
  if (!entries || entries.length === 0) {
    console.error('nfl-fantasy-ownership: empty players array in response')
    return []
  }

  return entries
    .filter(e => e.player != null)
    .map(e => {
      const p = e.player
      return {
        espnFantasyId: String(p.id),
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: p.fullName,
        defaultPositionId: p.defaultPositionId,
        position: POSITION_ID_MAP[p.defaultPositionId] ?? null,
        proTeamId: p.proTeamId,
        active: p.active,
        injured: p.injured,
        injuryStatus: p.injuryStatus,
        ownership: {
          activityLevel: p.ownership?.activityLevel ?? null,
          auctionValueAverage: p.ownership?.auctionValueAverage ?? null,
          averageDraftPosition: p.ownership?.averageDraftPosition ?? null,
          percentOwned: p.ownership?.percentOwned ?? 0,
          percentStarted: p.ownership?.percentStarted ?? null,
          percentChange: p.ownership?.percentChange ?? null,
        },
      }
    })
}

/**
 * Convenience wrapper for the Waiver Wire Gem: low-owned players only,
 * below a configurable threshold. This does NOT rank by performance —
 * that requires cross-referencing against a separate box-score/gamelog
 * source, which is the next piece to build, not this file's job.
 */
export async function fetchLowOwnedNFLPlayers(
  season: number,
  maxPercentOwned: number = 30,
): Promise<FantasyPlayer[]> {
  const players = await fetchNFLFantasyOwnership(season, { limit: 500, sortAsc: true })
  return players.filter(p => p.ownership.percentOwned <= maxPercentOwned && p.active)
}
