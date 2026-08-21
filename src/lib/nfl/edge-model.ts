// src/lib/nfl/edge-model.ts
//
// Edge Model V1 — lean 4-component score per the project's rebuild plan.
// Uses only confirmed-working data: standings (nfl.ts) and depth charts
// (depth-charts.ts). Does NOT touch play-by-play, so it works for every
// game regardless of whether an event ID has been resolved.

import { getNFLStandings, type NFLDivision } from '../nfl'
import { getTeamDepthChart } from './depth-charts'

export type EdgeModelResult = {
  score: number
  components: {
    recordDiff: number
    standing: number
    homeField: number
    starterContinuity: number
  }
  confidenceTier: 'strong' | 'moderate' | 'slight' | 'tossup'
}

const HOME_FIELD_CONSTANT = 8

function winPct(wins: number, losses: number): number {
  const total = wins + losses
  return total > 0 ? wins / total : 0.5
}

function findTeamRecord(standings: NFLDivision[], teamId: string) {
  for (const div of standings) {
    const idx = div.teams.findIndex(t => t.id === teamId)
    if (idx !== -1) {
      const t = div.teams[idx]
      return { wins: t.wins, losses: t.losses, divisionRank: idx + 1, divisionSize: div.teams.length }
    }
  }
  return null
}

export async function computeEdgeModelV1(homeTeamId: string, awayTeamId: string): Promise<EdgeModelResult> {
  const [standings, homeChart, awayChart] = await Promise.all([
    getNFLStandings(),
    getTeamDepthChart(homeTeamId),
    getTeamDepthChart(awayTeamId),
  ])

  const homeRecord = findTeamRecord(standings, homeTeamId)
  const awayRecord = findTeamRecord(standings, awayTeamId)

  let recordDiff = 0
  if (homeRecord && awayRecord) {
    const pctGap = winPct(homeRecord.wins, homeRecord.losses) - winPct(awayRecord.wins, awayRecord.losses)
    recordDiff = Math.max(-15, Math.min(15, Math.round(pctGap * 30)))
  }

  let standing = 0
  if (homeRecord && awayRecord) {
    const homeRankPct = 1 - (homeRecord.divisionRank - 1) / Math.max(homeRecord.divisionSize - 1, 1)
    const awayRankPct = 1 - (awayRecord.divisionRank - 1) / Math.max(awayRecord.divisionSize - 1, 1)
    standing = Math.round((homeRankPct - awayRankPct) * 5)
  }

  const homeField = HOME_FIELD_CONSTANT

  let starterContinuity = 0
  const homeHasQB = homeChart?.offense.some(p => p.positionAbbr === 'QB') ?? false
  const awayHasQB = awayChart?.offense.some(p => p.positionAbbr === 'QB') ?? false
  if (homeHasQB && !awayHasQB) starterContinuity = 3
  if (awayHasQB && !homeHasQB) starterContinuity = -3

  const score = recordDiff + standing + homeField + starterContinuity
  const absScore = Math.abs(score)
  const confidenceTier: EdgeModelResult['confidenceTier'] =
    absScore >= 20 ? 'strong' : absScore >= 10 ? 'moderate' : absScore >= 4 ? 'slight' : 'tossup'

  return { score, components: { recordDiff, standing, homeField, starterContinuity }, confidenceTier }
}