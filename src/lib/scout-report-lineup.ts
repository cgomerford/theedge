// src/lib/scout-report-lineup.ts
//
// Bridges lib/lineups.ts's getProjectedLineup() (source: 'confirmed' |
// 'projected_from_previous_game' | 'unavailable', field names player_id/
// player_name/season_avg) to the shape ScoutReportGraphicCard.tsx expects
// (LineupBatterSnapshot: playerId/playerName/avg, plus a separate
// isFallback boolean prop).
//
// Nothing in the project currently wires these two together — this is
// that glue. Call it once per team when building props for
// <ScoutReportGraphicCard />.

import { getProjectedLineup, type ProjectedLineup } from '@/lib/lineups'

export type LineupBatterSnapshot = {
  playerId: number
  playerName: string
  avg: number | null
}

export type ScoutReportLineup = {
  batters: LineupBatterSnapshot[]
  isFallback: boolean
}

// Pure mapper — no fetching, easy to unit test on its own.
export function toScoutReportLineup(lineup: ProjectedLineup): ScoutReportLineup {
  return {
    batters: lineup.batters.map(b => ({
      playerId: b.player_id,
      playerName: b.player_name,
      avg: b.season_avg,
    })),
    // 'unavailable' also resolves isFallback: true, but batters will be []
    // in that case, and ScoutReportGraphicCard's LineupColumn already
    // renders its own "not confirmed yet" CTA when lineup.length === 0 —
    // isFallback only matters when there ARE batters to show.
    isFallback: lineup.source !== 'confirmed',
  }
}

// Convenience: fetch + map in one call for a single team.
export async function getScoutReportLineup(
  teamId: number,
  gameDate: string,
  currentGamePk?: number,
): Promise<ScoutReportLineup> {
  const lineup = await getProjectedLineup(teamId, gameDate, currentGamePk)
  return toScoutReportLineup(lineup)
}