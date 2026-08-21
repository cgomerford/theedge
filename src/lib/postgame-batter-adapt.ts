// src/lib/postgame-batter-adapt.ts
//
// Adapts postgame-aggregate.ts's BatterGameLine/BattedBallRecord/PitchRecord
// shapes down to single-player slices that PostGameSprayChart and
// BatterZoneHeatmap already know how to render — both components expect
// whole-team arrays today; these functions just filter to one player and
// wrap in the same shape, so neither component needs to change.

import type { BatterGameLine, BattedBallRecord, PitchRecord } from '@/types/postgame'
import type { SprayHit, BatterGameZones } from '@/lib/postgame'

// Simple in-game score to pick the default selected batter — TB-style
// weighting, K penalty. Not a rigorous grading formula, just enough to
// surface the obvious standout as the default view.
const OUTCOME_SCORE: Record<string, number> = {
  single: 1, double: 2, triple: 3, home_run: 4,
  walk: 1, hit_by_pitch: 1,
  strikeout: -1, strikeout_double_play: -1,
  grounded_into_double_play: -1, double_play: -1,
}

export function pickBestBatter(lines: BatterGameLine[]): number | null {
  if (lines.length === 0) return null
  // BatterGameLine doesn't carry per-event outcomes, so score off the
  // counting stats directly rather than re-deriving from battedBalls —
  // same intent, cheaper, and doesn't require a second pass.
  function score(b: BatterGameLine): number {
    return b.hits + b.doubles + b.triples * 2 + b.homeRuns * 3 + b.rbi + b.walks * 0.5 - b.strikeouts * 0.5
  }
  return [...lines].sort((a, b) => score(b) - score(a))[0].batterId
}

export function buildSprayHitsForBatter(
  battedBalls: BattedBallRecord[],
  batterId: number,
  teamAbbr: string,
): SprayHit[] {
  return battedBalls
    .filter(b => b.batterId === batterId && b.coordX != null && b.coordY != null)
    .map(b => ({
      playerId: b.batterId,
      playerName: b.batterName,
      teamAbbr,
      coordX: b.coordX!,
      coordY: b.coordY!,
      outcome: b.resultEvent ?? 'other',
      launchSpeed: b.launchSpeed,
      inning: b.inning,
    }))
}

const HIT_EVENTS_SET = new Set(['single', 'double', 'triple', 'home_run'])

function outcomeFromPitch(
  p: PitchRecord,
  battedBallResult: string | undefined,
): string {
  if (p.isInPlay) {
    if (!battedBallResult) return 'in_play' // fallback if we couldn't match a battedBall record
    if (HIT_EVENTS_SET.has(battedBallResult)) return battedBallResult // 'single' | 'double' | 'triple' | 'home_run' — kept specific for per-hit-type coloring
    return 'in_play_out'
  }
  if (p.callCode === 'C') return 'called_strike'
  if (p.callCode === 'S') return 'swinging_strike'
  if (p.callCode === 'F') return 'foul'
  if (p.isBall) return 'ball'
  return 'other'
}

export function buildZonesForBatter(
  pitchLog: PitchRecord[],
  battedBalls: BattedBallRecord[],
  batterId: number,
  playerName: string,
  teamAbbr: string,
): BatterGameZones {
  // Match each in-play pitch to its battedBall record by atBatIndex alone
  // — BattedBallRecord has no pitchNumber field (confirmed against
  // src/types/postgame.ts), and atBatIndex is sufficient on its own since
  // a batter only puts one pitch in play per plate appearance.
  const battedByAtBat = new Map<number, string>()
  for (const b of battedBalls) {
    if (b.batterId !== batterId || !b.resultEvent) continue
    battedByAtBat.set(b.atBatIndex, b.resultEvent)
  }

  const pitches = pitchLog
    .filter(p => p.batterId === batterId)
    .map(p => ({
      zone: p.zone,
      pX: p.plateX,
      pZ: p.plateZ,
      outcome: outcomeFromPitch(p, battedByAtBat.get(p.atBatIndex)),
    }))
  return { playerId: batterId, playerName, teamAbbr, pitches }
}
export type BatterEVSummary = {
  min: number | null
  max: number | null
  avg: number | null
}

export function batterExitVeloSummary(battedBalls: BattedBallRecord[], batterId: number): BatterEVSummary {
  const velos = battedBalls
    .filter(b => b.batterId === batterId && b.launchSpeed != null)
    .map(b => b.launchSpeed as number)
  if (velos.length === 0) return { min: null, max: null, avg: null }
  return {
    min: Math.min(...velos),
    max: Math.max(...velos),
    avg: velos.reduce((a, b) => a + b, 0) / velos.length,
  }
}

// vs LHP/RHP split — needs pitcher throwing hand per plate appearance,
// which isn't in PitchRecord/BattedBallRecord. Caller passes a
// pitcherId -> hand map (built once per team via batch lookup, see
// fetchPitcherHands in the page) rather than fetching per-batter here.
export type PlatoonSplit = {
  vsLHP: { ab: number; hits: number }
  vsRHP: { ab: number; hits: number }
}

const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const AT_BAT_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'strikeout',
  'field_out', 'force_out', 'grounded_into_double_play',
  'double_play', 'triple_play', 'fielders_choice', 'fielders_choice_out',
])

export function batterPlatoonSplit(
  battedBalls: BattedBallRecord[],
  pitchLog: PitchRecord[],
  batterId: number,
  pitcherHands: Map<number, 'L' | 'R'>,
): PlatoonSplit {
  const split: PlatoonSplit = { vsLHP: { ab: 0, hits: 0 }, vsRHP: { ab: 0, hits: 0 } }

  // AB/hit outcomes live per-at-bat, derivable from the final pitch of
  // each at-bat this batter saw — pitchLog carries every pitch, so group
  // by atBatIndex and read the outcome off whichever pitch was in-play or
  // ended the at-bat (isInPlay, or the last pitch if not in play).
  const byAtBat = new Map<number, PitchRecord[]>()
  for (const p of pitchLog) {
    if (p.batterId !== batterId) continue
    if (!byAtBat.has(p.atBatIndex)) byAtBat.set(p.atBatIndex, [])
    byAtBat.get(p.atBatIndex)!.push(p)
  }

  for (const [, pitches] of byAtBat) {
    const sorted = [...pitches].sort((a, b) => a.pitchNumber - b.pitchNumber)
    const last = sorted[sorted.length - 1]
    const hand = pitcherHands.get(last.pitcherId)
    if (!hand) continue // unknown hand — skip rather than guess

    const battedBall = battedBalls.find(b => b.atBatIndex === last.atBatIndex && b.batterId === batterId)
    const outcome = battedBall?.resultEvent
    if (!outcome || !AT_BAT_EVENTS.has(outcome)) continue // walk/HBP/sac — not an AB

    const bucket = hand === 'L' ? split.vsLHP : split.vsRHP
    bucket.ab += 1
    if (HIT_EVENTS.has(outcome)) bucket.hits += 1
  }

  return split
}

export type BatterPitchCountRow = { inning: number; pitches: number }

export function batterPitchCountByInning(pitchLog: PitchRecord[], batterId: number): BatterPitchCountRow[] {
  const map = new Map<number, number>()
  for (const p of pitchLog) {
    if (p.batterId !== batterId) continue
    map.set(p.inning, (map.get(p.inning) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([inning, pitches]) => ({ inning, pitches }))
}

export type BatterPitchTypeRow = {
  typeCode: string
  typeName: string
  count: number
  usagePct: number
  avgVelo: number | null
}

export function batterPitchTypeBreakdown(pitchLog: PitchRecord[], batterId: number): BatterPitchTypeRow[] {
  const pitches = pitchLog.filter(p => p.batterId === batterId)
  const total = pitches.length
  const map = new Map<string, { name: string; count: number; veloSum: number; veloN: number }>()
  for (const p of pitches) {
    if (!p.typeCode) continue
    if (!map.has(p.typeCode)) map.set(p.typeCode, { name: p.typeDescription ?? p.typeCode, count: 0, veloSum: 0, veloN: 0 })
    const acc = map.get(p.typeCode)!
    acc.count += 1
    if (p.startSpeed != null) { acc.veloSum += p.startSpeed; acc.veloN += 1 }
  }
  return Array.from(map.entries())
    .map(([typeCode, a]) => ({
      typeCode,
      typeName: a.name,
      count: a.count,
      usagePct: total > 0 ? Math.round((a.count / total) * 1000) / 10 : 0,
      avgVelo: a.veloN > 0 ? Math.round((a.veloSum / a.veloN) * 10) / 10 : null,
    }))
    .sort((a, b) => b.count - a.count)
}

export function batterExitVeloAvg(battedBalls: BattedBallRecord[], batterId: number): number | null {
  const velos = battedBalls
    .filter(b => b.batterId === batterId && b.launchSpeed != null)
    .map(b => b.launchSpeed as number)
  if (velos.length === 0) return null
  return velos.reduce((a, b) => a + b, 0) / velos.length
}