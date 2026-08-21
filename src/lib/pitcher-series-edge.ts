/**
 * src/lib/pitcher-series-edge.ts
 *
 * Scores a confirmed series starter against the OPPOSING team's full
 * projected lineup — mirror of series-matchup.ts's batter-vs-one-pitcher
 * scoring. Built for Top 3 Key Players (pitcher-series-edge.ts) — see
 * that file's docs for why negation is correct here, not a hack.
 *
 * ASSUMPTION (flagged, not hidden): series_score is an UNWEIGHTED mean
 * across the opposing lineup. No lineup-slot weighting yet — simple and
 * honest beats an unvalidated weighting scheme.
 */

import { getProjectedLineup } from '@/lib/lineups'
import { getPitcherZoneArsenal, type PitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { getBatterHotZones } from '@/lib/hot-zones'
import {
  batterZoneFit,
  pitchTypeFitScore,
  pitchTypeZoneFit,
  getPitcherPitchTypeArsenal,
  getBatterRawPitchLog,
  type ZoneFitCell,
  type PitchTypeFitLine,
  type PitchZoneFit,
} from '@/lib/series-matchup'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

// ─── Types ──────────────────────────────────────────────────────────────

export type PitcherVsBatterLine = {
  batter_id: number
  batter_name: string
  bat_side: string | null
  pitcher_edge_score: number
  zone_fit: ZoneFitCell[]             // batter-positive convention, UI flips sign for display
  pitch_zone_fit: PitchZoneFit[]      // per-pitch-type zone breakdown — powers the drill-down
  pitch_type_fit: PitchTypeFitLine[]
}

export type Top3Pitcher = {
  pitcher_id: number
  pitcher_name: string
  opposing_team_id: number
  gamePk: number
  game_date: string
  series_score: number
  batters_used: number
  toughest_matchup: PitcherVsBatterLine | null
  per_batter: PitcherVsBatterLine[]
}

export type PitcherGameResult = {
  gamePk: number
  ip: string           // e.g. "6.2"
  h: number
  er: number
  k: number
  bb: number
} | null // null = not final yet / no data — never fabricated

// ─── Main scoring entry point ────────────────────────────────────────────

export async function getPitcherSeriesEdge(
  pitcherId: number,
  pitcherName: string,
  opposingTeamId: number,
  gameDate: string,
  gamePk: number,
): Promise<Top3Pitcher | null> {
  const [opposingLineup, pitcherZoneSplits, pitcherPitchTypeArsenal] = await Promise.all([
    getProjectedLineup(opposingTeamId, gameDate, gamePk),
    getPitcherZoneArsenal(pitcherId),
    getPitcherPitchTypeArsenal(pitcherId),
  ])

  if (opposingLineup.batters.length === 0) return null
  const arsenal: PitcherZoneArsenal | undefined = pitcherZoneSplits['all']
  if (!arsenal) return null

  const perBatter = await Promise.all(
    opposingLineup.batters.map(async (batter): Promise<PitcherVsBatterLine> => {
      const [hotZoneSplits, rawLog] = await Promise.all([
        getBatterHotZones(batter.player_id),
        getBatterRawPitchLog(batter.player_id),
      ])
      const batterZones = hotZoneSplits['all']

      const { total: zoneScore, cells } = batterZoneFit(batterZones, arsenal)
      const pitchZoneFit = pitchTypeZoneFit(batterZones, arsenal, pitcherPitchTypeArsenal, rawLog, pitcherId)
            const { score: pitchScore, lines } = pitchTypeFitScore(pitcherPitchTypeArsenal, rawLog)

      const pitcherEdge = -(zoneScore + pitchScore)

      return {
        batter_id: batter.player_id,
        batter_name: (batter as any).player_name ?? 'Unknown',
        bat_side: (batter as any).bat_side ?? null,
        pitcher_edge_score: Math.round(pitcherEdge * 100) / 100,
        zone_fit: cells,
        pitch_zone_fit: pitchZoneFit,
        pitch_type_fit: lines,
      }
    }),
  )

  if (perBatter.length === 0) return null

  const scoreSum = perBatter.reduce((s, b) => s + b.pitcher_edge_score, 0)
  const seriesScore = Math.round((scoreSum / perBatter.length) * 100) / 100
  const toughestMatchup = [...perBatter].sort((a, b) => b.pitcher_edge_score - a.pitcher_edge_score)[0] ?? null

  return {
    pitcher_id: pitcherId,
    pitcher_name: pitcherName,
    opposing_team_id: opposingTeamId,
    gamePk,
    game_date: gameDate,
    series_score: seriesScore,
    batters_used: perBatter.length,
    toughest_matchup: toughestMatchup,
    per_batter: perBatter,
  }
}

// ─── Postgame: actual recorded line ──────────────────────────────────────

/**
 * Mirrors getBatterGameResult's exact pattern (series-matchup.ts) — same
 * gameLog endpoint, same "return null, never a zeroed line" convention —
 * just group=pitching instead of group=hitting, and IP formatted the same
 * way outsToIp() does elsewhere (Baseball's outs-to-innings notation,
 * e.g. 20 outs -> "6.2", not 6.67).
 */
export async function getPitcherGameResult(
  playerId: number,
  gamePk: number,
  gameDate: string,
): Promise<PitcherGameResult> {
  const season = new Date(gameDate).getFullYear()
  const url = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=pitching&season=${season}`

  try {
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) return null
    const data = await res.json()
    const splits = data.stats?.[0]?.splits ?? []
    const match = splits.find((s: any) => s.game?.gamePk === gamePk)
    if (!match) return null

    const stat = match.stat ?? {}
    return {
      gamePk,
      ip: stat.inningsPitched ?? '0.0',   // MLB API already returns this in X.Y outs-notation
      h: parseInt(stat.hits ?? '0'),
      er: parseInt(stat.earnedRuns ?? '0'),
      k: parseInt(stat.strikeOuts ?? '0'),
      bb: parseInt(stat.baseOnBalls ?? '0'),
    }
  } catch (e) {
    console.error('pitcher-series-edge: getPitcherGameResult failed', e)
    return null
  }
}