// src/lib/nfl/gamelog.ts
//
// NFL PLAYER GAMELOG — fetch + parse layer for the Waiver Wire Gem's
// "did this player actually have a good game" half of the equation.
// (fantasy-ownership.ts covers the "is this player actually low-owned" half.)
//
// Confirmed live (Aug 2026) via a manual curl against:
//   https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/{id}/gamelog?season={year}
//
// Real response shape, confirmed field-by-field (not from docs):
//   {
//     names: ["rushingAttempts", "rushingYards", ...]   // stat keys, POSITION-DEPENDENT
//     labels: ["CAR", "YDS", ...]                        // display abbreviations, same order as names
//     events: { [eventId]: { week, gameDate, opponent, score, gameResult, ... } }  // game CONTEXT only
//     seasonTypes: [{
//       categories: [{
//         events: [{ eventId, stats: ["19","80","4.2",...] }]  // stat VALUES, string-typed, "-" = n/a
//       }]
//     }]
//   }
//
// CRITICAL: names/labels are position-dependent. Gibbs (RB) has
// rushing/receiving/fumbles categories. A QB's response would have a
// passing category instead. This file does NOT hardcode a stat shape —
// it reads names/stats positionally from whatever the response actually
// contains, the same discipline scout.ts uses for MLB's arsenal data.

// ─────────────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────────────

export type GamelogGameContext = {
  eventId: string
  week: number | null
  gameDate: string | null
  opponentAbbr: string | null
  opponentName: string | null
  teamAbbr: string | null
  gameResult: 'W' | 'L' | 'T' | null
  score: string | null
}

export type GamelogGame = {
  context: GamelogGameContext
  // Raw stat name -> value. Value is null when ESPN returned "-" (not
  // applicable for this player/game — e.g. a RB's forced-fumbles stat).
  // Values are parsed to number where the raw string is numeric;
  // non-numeric strings (there shouldn't be any beyond "-") pass through
  // as null rather than being silently coerced to 0 — 0 is a real,
  // different value from "not tracked."
  stats: Record<string, number | null>
}

// ─────────────────────────────────────────────────────────────────────
//  RAW ESPN RESPONSE SHAPE (subset — only what we read, from the confirmed curl)
// ─────────────────────────────────────────────────────────────────────

type EspnGamelogEventContext = {
  week?: number
  gameDate?: string
  gameResult?: string
  score?: string
  opponent?: { abbreviation?: string; displayName?: string }
  team?: { abbreviation?: string }
}

type EspnGamelogStatsEvent = {
  eventId: string
  stats: string[]
}

type EspnGamelogResponse = {
  names?: string[]
  labels?: string[]
  events?: Record<string, EspnGamelogEventContext>
  seasonTypes?: Array<{
    categories?: Array<{
      events?: EspnGamelogStatsEvent[]
    }>
  }>
}

// ─────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────

function parseStatValue(raw: string): number | null {
  if (raw === '-' || raw === '' || raw == null) return null
  const n = Number(raw)
  return Number.isNaN(n) ? null : n
}

// ─────────────────────────────────────────────────────────────────────
//  FETCH + PARSE
// ─────────────────────────────────────────────────────────────────────

/**
 * Fetches and parses one player's per-game stat log for a season.
 * Position-agnostic — works for any player, returning whatever stat
 * categories ESPN actually tracks for them.
 *
 * Empty state beats fabricated data: returns [] on any fetch/parse
 * failure rather than partial or guessed data.
 */
export async function fetchNFLPlayerGamelog(
  athleteId: string,
  season: number,
): Promise<GamelogGame[]> {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${athleteId}/gamelog?season=${season}`

  let json: EspnGamelogResponse
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } } as RequestInit)
    if (!res.ok) {
      console.error(`nfl-gamelog: ${athleteId} fetch failed — ${res.status}`)
      return []
    }
    json = await res.json()
  } catch (e) {
    console.error(`nfl-gamelog: ${athleteId} fetch threw`, e)
    return []
  }

  const names = json.names
  const events = json.events
  const statsEvents = json.seasonTypes?.[0]?.categories?.flatMap(c => c.events ?? []) ?? []

  if (!names || !events || statsEvents.length === 0) {
    console.error(`nfl-gamelog: ${athleteId} — unexpected/empty response shape`)
    return []
  }

  const games: GamelogGame[] = []

  for (const statsEvent of statsEvents) {
    const ctx = events[statsEvent.eventId]
    if (!ctx) {
      console.error(`nfl-gamelog: ${athleteId} — event ${statsEvent.eventId} in stats but not in events, skipping`)
      continue
    }

    if (statsEvent.stats.length !== names.length) {
      console.error(
        `nfl-gamelog: ${athleteId} — stats/names length mismatch for event ${statsEvent.eventId} ` +
        `(${statsEvent.stats.length} vs ${names.length}), skipping this game rather than misaligning values`
      )
      continue
    }

    const statMap: Record<string, number | null> = {}
    names.forEach((name, i) => {
      statMap[name] = parseStatValue(statsEvent.stats[i])
    })

    const gameResult = ctx.gameResult
    const validResult: 'W' | 'L' | 'T' | null =
      gameResult === 'W' || gameResult === 'L' || gameResult === 'T' ? gameResult : null

    games.push({
      context: {
        eventId: statsEvent.eventId,
        week: ctx.week ?? null,
        gameDate: ctx.gameDate ?? null,
        opponentAbbr: ctx.opponent?.abbreviation ?? null,
        opponentName: ctx.opponent?.displayName ?? null,
        teamAbbr: ctx.team?.abbreviation ?? null,
        gameResult: validResult,
        score: ctx.score ?? null,
      },
      stats: statMap,
    })
  }

  return games
}

// ─────────────────────────────────────────────────────────────────────
//  "GOOD GAME" SCORING
// ─────────────────────────────────────────────────────────────────────
//
// Standard PPR-ish fantasy scoring, applied to whatever stat keys are
// actually present in a game's stat map. A player's most recent game
// is scored; the Waiver Wire Gem selection logic (separate file, not
// built yet) cross-references this against fantasy-ownership.ts.
//
// This is intentionally a simple, transparent formula — not a proprietary
// model — because "good game" here just needs to roughly match what a
// fantasy manager would recognize, not be analytically perfect.

const FANTASY_POINT_WEIGHTS: Record<string, number> = {
  rushingYards: 0.1,
  rushingTouchdowns: 6,
  receivingYards: 0.1,
  receivingTouchdowns: 6,
  receptions: 1,          // PPR
  passingYards: 0.04,
  passingTouchdowns: 4,
  interceptions: -2,      // passing INTs thrown
  fumblesLost: -2,
}

export function computeFantasyPoints(stats: Record<string, number | null>): number {
  let total = 0
  for (const [key, weight] of Object.entries(FANTASY_POINT_WEIGHTS)) {
    const val = stats[key]
    if (val != null) total += val * weight
  }
  return Math.round(total * 10) / 10
}

/**
 * A "good game" threshold varies meaningfully by position (10 fantasy
 * points is a great game for a TE, mediocre for a WR1). Position isn't
 * present in the gamelog response itself — the caller needs to supply
 * it (from fantasy-ownership.ts's POSITION_ID_MAP, or nfl-team-stats.ts
 * roster data) rather than this file guessing at it.
 */
export function isGoodGameForPosition(fantasyPoints: number, position: string | null): boolean {
  const thresholds: Record<string, number> = {
    QB: 18,
    RB: 14,
    WR: 14,
    TE: 10,
    K: 8,
    DST: 8,
  }
  const threshold = position ? thresholds[position] : undefined
  // Unknown position: fall back to a conservative generic threshold
  // rather than silently treating everything as a "good game."
  return fantasyPoints >= (threshold ?? 15)
}