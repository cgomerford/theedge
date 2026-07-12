// src/lib/team-rankings.ts
//
// A team's league-wide rank across the four team metrics lib/lab.ts
// already tracks (runs_per_game, team_era, errors_per_game, team_ops).
// Reuses getTeamLeaders exactly as-is — fetches all 30 teams sorted, then
// finds this team's position — rather than adding a second, slightly
// different implementation of the same ranking logic.

import { getTeamLeaders, type TeamMetric } from './lab'

export type TeamRankRow = { metric: TeamMetric; label: string; rank: number; value: number }

const RANK_METRICS: { metric: TeamMetric; label: string }[] = [
  { metric: 'runs_per_game', label: 'Runs/G' },
  { metric: 'team_ops', label: 'OPS' },
  { metric: 'team_era', label: 'ERA' },
  { metric: 'errors_per_game', label: 'Errors/G' },
]

export async function getTeamRankings(mlbTeamId: number, season: number): Promise<TeamRankRow[]> {
  const results = await Promise.all(
    RANK_METRICS.map(async ({ metric, label }) => {
      const all = await getTeamLeaders(metric, season, 30)
      const row = all.find(r => r.teamId === mlbTeamId)
      if (!row) return null
      return { metric, label, rank: row.rank, value: row.value }
    })
  )
  return results.filter((r): r is TeamRankRow => r !== null)
}