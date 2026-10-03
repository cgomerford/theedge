// src/lib/pitcher-game-arm-angle.ts
//
// Arm angle for one pitcher's one game. There is no live-feed field for
// this — arm_angle only exists on Baseball Savant's per-pitcher season CSV
// (getPitcherPitchLog, pitcher-pitch-log.ts), which can lag a live game by
// hours. So this filters that season log down to gamePk first, and only
// falls back to a season-wide average — clearly labeled via `source` — if
// today's pitches haven't shown up in Savant yet. Never silently presents
// a season number as if it were this game's.

import { getPitcherPitchLog } from './pitcher-pitch-log'

export type PitcherGameArmAngle = {
  overallAvgArmAngle: number | null
  byPitchType: { typeCode: string; typeName: string; avgArmAngle: number; count: number }[]
  source: 'this-game' | 'season' | 'none'
}

function summarize(pitches: { pitchType: string; armAngle: number | null }[], pitchNames: Record<string, string>): { overallAvgArmAngle: number | null; byPitchType: PitcherGameArmAngle['byPitchType'] } {
  const withAngle = pitches.filter((p): p is { pitchType: string; armAngle: number } => p.armAngle != null)
  if (withAngle.length === 0) return { overallAvgArmAngle: null, byPitchType: [] }

  const byType = new Map<string, { sum: number; count: number }>()
  for (const p of withAngle) {
    const acc = byType.get(p.pitchType) ?? { sum: 0, count: 0 }
    acc.sum += p.armAngle
    acc.count += 1
    byType.set(p.pitchType, acc)
  }

  const byPitchType = Array.from(byType.entries())
    .map(([typeCode, { sum, count }]) => ({
      typeCode,
      typeName: pitchNames[typeCode] ?? typeCode,
      avgArmAngle: Math.round((sum / count) * 10) / 10,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  const overallSum = withAngle.reduce((s, p) => s + p.armAngle, 0)
  return { overallAvgArmAngle: Math.round((overallSum / withAngle.length) * 10) / 10, byPitchType }
}

export async function getPitcherGameArmAngle(pitcherId: number, gamePk: number, season: number): Promise<PitcherGameArmAngle | null> {
  const log = await getPitcherPitchLog(pitcherId, season)
  if (!log) return null

  const thisGame = log.pitches.filter(p => p.gamePk === gamePk)
  const thisGameSummary = summarize(thisGame, log.pitchNames)
  if (thisGameSummary.overallAvgArmAngle != null) {
    return { ...thisGameSummary, source: 'this-game' }
  }

  const seasonSummary = summarize(log.pitches, log.pitchNames)
  if (seasonSummary.overallAvgArmAngle != null) {
    return { ...seasonSummary, source: 'season' }
  }

  return { overallAvgArmAngle: null, byPitchType: [], source: 'none' }
}
