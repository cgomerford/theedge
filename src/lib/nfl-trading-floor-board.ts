// src/lib/nfl-trading-floor-board.ts
//
// NFL equivalent of getBoardSlate() (src/lib/trading-floor-board.ts) — but
// NOT a copy-paste, because the underlying model is structurally different:
//
//   MLB: edge_predictions is a STORED table, one row per game, 8 components.
//   NFL: computeEdgeModelV1() is a LIVE 4-component calculation (recordDiff,
//        standing, homeField, starterContinuity) with no stored predictions
//        table (confirmed: no nfl_predictions/nfl_edge table found in repo).
//
// So this fetches the week's schedule, then calls computeEdgeModelV1 per
// game (bounded — an NFL week is ~16 games max, not a problem the way it
// would be for MLB's much larger daily slate). It counts aligned factors
// out of 4 — never out of 8 — and never surfaces the raw signed score,
// matching the MLB board's same rule.
//
// MLB-only columns from TradingFloorBoard (bullpen fatigue dots, park HR
// factor, lineups confirmed) have no NFL equivalent in what's been
// confirmed so far and are NOT fabricated here — the NFL board row simply
// doesn't have those fields; the component must render conditionally per
// sport rather than filling them with fake data.

import { getNFLWeekSchedule, type NFLGame } from './nfl-schedule'
import { computeEdgeModelV1 } from './nfl/edge-model'

export interface NflBoardGame {
  eventId: string
  slug: string
  away_abbr: string
  home_abbr: string
  components: Record<string, number>
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  top_driver: string | null
}

// Same alignment threshold convention as MLB's countAlignedFactors
// (|value| > 5 in TradingFloorBoard.tsx) — kept consistent across sports
// so "aligned factor" means the same thing everywhere it's shown.
const ALIGN_THRESHOLD = 5

const COMPONENT_LABELS: Record<string, string> = {
  recordDiff: 'record',
  standing: 'standing',
  homeField: 'home field',
  starterContinuity: 'starters',
}

function getTopDriver(components: Record<string, number>): string | null {
  let maxKey: string | null = null
  let maxAbs = 0
  for (const [key, value] of Object.entries(components)) {
    const abs = Math.abs(value)
    if (abs > maxAbs) { maxAbs = abs; maxKey = key }
  }
  return maxKey ? COMPONENT_LABELS[maxKey] ?? maxKey : null
}

export async function getNflBoardSlate(season: number, week: number): Promise<NflBoardGame[]> {
  let games: NFLGame[] = []
  try {
    // getNFLWeekSchedule returns NFLWeek | null — NOT NFLGame[] directly.
    // Corrected after a real type error; the games live at .games.
    const nflWeek = await getNFLWeekSchedule(season, week)
    games = nflWeek?.games ?? []
  } catch (e) {
    console.error(`getNflBoardSlate(season ${season}, week ${week}) schedule error:`, e)
    return []
  }

  const results = await Promise.all(
    games.map(async (g): Promise<NflBoardGame | null> => {
      try {
        const model = await computeEdgeModelV1(g.homeTeam.id, g.awayTeam.id)
        return {
          eventId: g.id,
          slug: g.slug,
          away_abbr: g.awayTeam.abbreviation,
          home_abbr: g.homeTeam.abbreviation,
          components: model.components,
          confidence_tier: model.confidenceTier,
          top_driver: getTopDriver(model.components),
        }
      } catch (e) {
        console.error(`computeEdgeModelV1 failed for ${g.slug}:`, e)
        return null
      }
    })
  )

  return results.filter((r): r is NflBoardGame => r !== null)
}

export function countAlignedNflFactors(components: Record<string, number>): number {
  return Object.values(components).filter(v => Math.abs(v) > ALIGN_THRESHOLD).length
}

export const NFL_TOTAL_FACTORS = 4