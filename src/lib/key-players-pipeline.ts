/**
 * src/lib/key-players-pipeline.ts
 *
 * One shared path from "a game + a team" to "that team's ranked Top 3 Key
 * Players, each with their five matchup factors" — used by the game page
 * (KeyPlayersSlotAsync) AND the snapshot cron, so what a user sees pregame
 * and what gets frozen for the postgame report card can never drift.
 *
 * Ranking: the base series score (zone fit + pitch-type fit) plus a small,
 * capped nudge from the signals that score can't see (spray vs OAA, platoon,
 * day/night, form, GB% + defense, whiff/control, park…). See contextScore.
 * Only the top five batters + the starter are enriched — factor fetches are
 * per-player MLB API calls, so we never run them for the whole lineup.
 */

import { getSeriesTop3 } from '@/lib/series-matchup'
import { getPitcherSeriesEdge } from '@/lib/pitcher-series-edge'
import { getProjectedLineup, getPlayerHands } from '@/lib/lineups'
import { getLineupSpray, type BatterSpray } from '@/lib/batter-spray'
import { getLeagueOaa } from '@/lib/batter-fielding'
import {
  buildBatterFactors, buildPitcherFactors, contextScore, getPitcherProfiles,
  type FactorContext, type MatchupFactor,
} from '@/lib/key-player-factors'
import type { KeyPlayerCandidate } from '@/lib/key-players'
import type { RecentFormContext } from '@/lib/key-players-narrative'
import type { ParkFactor } from '@/lib/parks'
import type { MLBGame } from '@/lib/mlb'

export type RankedKeyPlayer = KeyPlayerCandidate & { factors: MatchupFactor[] }

export async function computeTeamKeyPlayers(args: {
  game: MLBGame
  teamId: number
  opposingTeamId: number
  gameDate: string
  pitcher: { id: number; name: string } | null
  isHome: boolean
  formByPlayerId: Record<string, RecentFormContext>
  park: ParkFactor | null
}): Promise<RankedKeyPlayer[]> {
  const { game, teamId, opposingTeamId, gameDate, pitcher, isHome, formByPlayerId, park } = args
  const season = Number(gameDate.slice(0, 4)) || new Date().getFullYear()

  const [top3, pitcherEdge, teamLineup, opposingLineup] = await Promise.all([
    getSeriesTop3(teamId, opposingTeamId, gameDate, game.gamePk),
    pitcher ? getPitcherSeriesEdge(pitcher.id, pitcher.name, opposingTeamId, gameDate, game.gamePk) : Promise.resolve(null),
    getProjectedLineup(teamId, gameDate, game.gamePk),
    getProjectedLineup(opposingTeamId, gameDate, game.gamePk),
  ])

  const pool = top3.pool ?? top3.batters
  if (pool.length === 0 && !pitcherEdge) return []

  // Every starter this team's batters face in the series, plus our own SP.
  const seriesPitcherIds = Array.from(new Set(pool.flatMap((b) => b.per_pitcher.map((p) => p.pitcher_id))))
  const handIds = [
    ...teamLineup.batters.map((b) => b.player_id),
    ...opposingLineup.batters.map((b) => b.player_id),
    ...seriesPitcherIds,
    ...(pitcher ? [pitcher.id] : []),
  ]

  const [oaa, hands, sprayRows, pitcherProfiles] = await Promise.all([
    getLeagueOaa(season),
    getPlayerHands(handIds),
    getLineupSpray(pool.map((b) => b.player_id)),
    getPitcherProfiles([...seriesPitcherIds, ...(pitcher ? [pitcher.id] : [])], season),
  ])

  const ctx: FactorContext = {
    season,
    dayNight: game.dayNight ?? null,
    park,
    formByPlayerId,
    oaa,
    hands,
    spray: new Map<number, BatterSpray>(sprayRows.map((r) => [r.player_id, r])),
    pitcherProfiles,
  }

  const batterCandidates = await Promise.all(
    pool.map(async (batter): Promise<RankedKeyPlayer> => {
      const factors = await buildBatterFactors(batter, ctx, opposingLineup.batters)
      return { kind: 'batter', batter, factors, score: Math.round((batter.series_score + contextScore(factors)) * 100) / 100 }
    }),
  )

  const candidates: RankedKeyPlayer[] = [...batterCandidates]
  if (pitcherEdge) {
    const factors = await buildPitcherFactors(pitcherEdge, ctx, teamLineup.batters, opposingLineup.batters, isHome)
    candidates.push({ kind: 'pitcher', pitcher: pitcherEdge, factors, score: Math.round((pitcherEdge.series_score + contextScore(factors)) * 100) / 100 })
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 3)
}
