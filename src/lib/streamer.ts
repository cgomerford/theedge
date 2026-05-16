/**
 * src/lib/streamer.ts
 *
 * STREAMER SCORE FORMULA (0–100):
 *   40% — Pitcher quality   (FIP / K9 normalised)
 *   30% — Opponent offence  (inverse of wRC+ / runs per game)
 *   15% — Park factor       (from edge_predictions.components.park)
 *   15% — Stuff rating      (whiff% from pitch_arsenals)
 *
 * 70+  = strong stream
 * 55–69 = viable
 * <55  = avoid
 */

import type { PitchType } from '@/lib/mlb'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PitcherSeasonStats = {
  era: string | null
  fip?: number | null
  k_per_9: string | null
  whip: string | null
  innings: string | null
}

export type TeamSeasonStats = {
  runs_per_game_l30?: number | null
  wrc_plus?: number | null
  ops_l30?: number | null
}

export type StreamerInput = {
  pitcherName: string
  pitcherId: number | null
  teamName: string
  opponentName: string
  opponentStats: TeamSeasonStats | null
  pitcherStats: PitcherSeasonStats | null
  pitchMix: PitchType[]
  parkComponent: number
  isPitcherHome: boolean
  gameSlug: string
  gameTime: string
}

export type StreamerResult = {
  pitcherName: string
  pitcherId: number | null
  teamName: string
  opponentName: string
  gameSlug: string
  gameTime: string
  streamerScore: number
  tier: 'strong' | 'viable' | 'avoid'
  qualityScore: number
  opponentScore: number
  parkScore: number
  stuffScore: number
  topPitch: string | null
  kPer9: string | null
  era: string | null
  rationale: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAGUE_AVG_FIP = 4.20
const LEAGUE_AVG_K9  = 8.8
const LEAGUE_AVG_WRC = 100
const LEAGUE_AVG_RPG = 4.5

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scorePitcherQuality(stats: PitcherSeasonStats | null): number {
  // No stats = unknown pitcher, default to league average (50) not below average (40)
  if (!stats) return 50

  const fip = stats.fip ?? null
  const era = stats.era ? parseFloat(stats.era) : null
  const k9  = stats.k_per_9 ? parseFloat(stats.k_per_9) : null

  const anchor = fip ?? era ?? LEAGUE_AVG_FIP
  const eraScore = Math.max(0, Math.min(100,
    50 + ((LEAGUE_AVG_FIP - anchor) / LEAGUE_AVG_FIP) * 120
  ))
  const k9Score = k9
    ? Math.max(0, Math.min(100, 50 + ((k9 - LEAGUE_AVG_K9) / LEAGUE_AVG_K9) * 80))
    : 50

  return Math.round(eraScore * 0.65 + k9Score * 0.35)
}

function scoreOpponent(stats: TeamSeasonStats | null): number {
  if (!stats) return 50

  if (stats.wrc_plus != null) {
    return Math.max(0, Math.min(100,
      50 + ((LEAGUE_AVG_WRC - stats.wrc_plus) / LEAGUE_AVG_WRC) * 100
    ))
  }
  if (stats.runs_per_game_l30 != null) {
    return Math.max(0, Math.min(100,
      50 + ((LEAGUE_AVG_RPG - stats.runs_per_game_l30) / LEAGUE_AVG_RPG) * 80
    ))
  }
  return 50
}

function scorePark(parkComponent: number): number {
  const abs = Math.abs(parkComponent)
  if (abs > 15) return 45
  if (abs < 5)  return 65
  return 55
}

function scoreStuff(pitchMix: PitchType[]): { score: number; topPitch: string | null } {
  if (!pitchMix.length) return { score: 50, topPitch: null }

  let weightedWhiff = 0
  let totalUsage = 0
  let topPitch: string | null = null
  let topWhiff = 0

  for (const p of pitchMix) {
    const whiff = p.whiff_percent ?? 0
    const usage = p.percentage ?? 0
    weightedWhiff += whiff * usage
    totalUsage += usage
    if (whiff > topWhiff) {
      topWhiff = whiff
      topPitch = `${p.pitch_name} (${whiff.toFixed(0)}% whiff)`
    }
  }

  const avgWhiff = totalUsage > 0 ? weightedWhiff / totalUsage : 24
  const score = Math.max(0, Math.min(100,
    50 + ((avgWhiff - 24) / 24) * 120
  ))
  return { score: Math.round(score), topPitch }
}

/**
 * Build a one-sentence rationale that ALWAYS matches the tier.
 * Never says "viable" when the tier is "avoid", and vice versa.
 */
function buildRationale(
  input: StreamerInput,
  result: Omit<StreamerResult, 'rationale'>,
): string {
  const name = input.pitcherName.split(' ').at(-1) ?? input.pitcherName

  // ── AVOID ─────────────────────────────────────────────────────────────────
  if (result.tier === 'avoid') {
    if (result.opponentScore < 40) {
      return `${input.opponentName} have one of the stronger offences tonight — tough spot for ${name}.`
    }
    if (result.qualityScore < 40) {
      const era = input.pitcherStats?.era ? ` (${parseFloat(input.pitcherStats.era).toFixed(2)} ERA)` : ''
      return `${name}${era} hasn't been consistent enough to trust in a streamer spot.`
    }
    return `The matchup and metrics don't line up for ${name} tonight — better options available.`
  }

  // ── STRONG ────────────────────────────────────────────────────────────────
  if (result.tier === 'strong') {
    const k9  = input.pitcherStats?.k_per_9 ? `${parseFloat(input.pitcherStats.k_per_9).toFixed(1)} K/9` : null
    const fip = input.pitcherStats?.fip     ? `${input.pitcherStats.fip.toFixed(2)} FIP`                 : null
    const stat = fip ?? k9

    if (stat && result.opponentScore >= 60) {
      return `${name} brings ${stat} this season — matchup against ${input.opponentName} makes this a strong stream.`
    }
    if (stat) {
      return `${name} brings ${stat} — the stuff is there to go deep tonight.`
    }
    if (result.stuffScore >= 68 && result.topPitch) {
      return `${name}'s ${result.topPitch} gives him a genuine whiff weapon — stream with confidence.`
    }
    return `Everything lines up for ${name} tonight — quality start upside is real.`
  }

  // ── VIABLE ────────────────────────────────────────────────────────────────
  const k9 = input.pitcherStats?.k_per_9 ? `${parseFloat(input.pitcherStats.k_per_9).toFixed(1)} K/9` : null

  if (result.opponentScore >= 65) {
    return `${input.opponentName} are beatable tonight — ${name} is a reasonable streaming option if you're thin.`
  }
  if (k9 && result.qualityScore >= 55) {
    return `${name} has the strikeout upside (${k9}) to make this work — viable if needed.`
  }
  if (result.stuffScore >= 65 && result.topPitch) {
    return `${name}'s ${result.topPitch} keeps this viable — worth a spot start if your roster needs it.`
  }
  return `${name} is a reasonable streaming option tonight — not a must-start, but the matchup is workable.`
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function scoreStreamer(input: StreamerInput): StreamerResult {
  const qualityScore  = scorePitcherQuality(input.pitcherStats)
  const opponentScore = scoreOpponent(input.opponentStats)
  const parkScore     = scorePark(input.parkComponent)
  const { score: stuffScore, topPitch } = scoreStuff(input.pitchMix)

  const streamerScore = Math.round(
    qualityScore  * 0.40 +
    opponentScore * 0.30 +
    parkScore     * 0.15 +
    stuffScore    * 0.15
  )

  const tier: StreamerResult['tier'] =
    streamerScore >= 70 ? 'strong' :
    streamerScore >= 55 ? 'viable' :
    'avoid'

  const partial: Omit<StreamerResult, 'rationale'> = {
    pitcherName: input.pitcherName,
    pitcherId:   input.pitcherId,
    teamName:    input.teamName,
    opponentName: input.opponentName,
    gameSlug:    input.gameSlug,
    gameTime:    input.gameTime,
    streamerScore,
    tier,
    qualityScore,
    opponentScore,
    parkScore,
    stuffScore,
    topPitch,
    kPer9: input.pitcherStats?.k_per_9 ?? null,
    era:   input.pitcherStats?.era ?? null,
  }

  return { ...partial, rationale: buildRationale(input, partial) }
}

export function rankStreamers(inputs: StreamerInput[]): StreamerResult[] {
  return inputs
    .map(scoreStreamer)
    .sort((a, b) => b.streamerScore - a.streamerScore)
}