// src/lib/pitcher-arsenal-card.ts — updated ZoneLocationPoint + buildArsenalCard

import type { PitchRecord, PitcherGameLine } from '@/types/postgame'

export type ArsenalCardPitchType = {
  typeCode: string
  typeName: string
  count: number
  usagePct: number
  avgVelo: number | null
  avgSpin: number | null
  avgHBreak: number | null
  avgVBreak: number | null
  zonePct: number | null
  whiffPct: number | null
  color: string
}

export type MovementPoint = {
  typeCode: string
  hBreak: number
  vBreak: number
}

// Extended — was just { plateX, plateZ }. Now carries everything the
// hover tooltip needs, straight off PitchRecord, no extra lookups.
export type ZoneLocationPoint = {
  plateX: number
  plateZ: number
  inning: number
  halfInning: 'top' | 'bottom'
  countAfter: { balls: number; strikes: number }
  velo: number | null
  outcome: string      // human-readable, from callDescription
  batterName: string
}

const PITCH_COLORS: Record<string, string> = {
  FF: '#dc2626', FA: '#dc2626', SI: '#f59e0b', FC: '#7c2d12',
  SL: '#e11d48', ST: '#9333ea', SV: '#9333ea',
  CU: '#7c3aed', KC: '#7c3aed', CS: '#7c3aed',
  CH: '#16a34a', FS: '#0d9488', FO: '#0d9488', KN: '#6b7280',
}
function colorFor(code: string): string {
  return PITCH_COLORS[code.toUpperCase()] ?? '#57534e'
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

export function buildArsenalCard(pitcherPitches: PitchRecord[]): {
  types: ArsenalCardPitchType[]
  movement: MovementPoint[]
  locationsByType: Record<string, ZoneLocationPoint[]>
} {
  const total = pitcherPitches.length
  const byType = new Map<string, {
    name: string; count: number
    veloSum: number; veloN: number
    spinSum: number; spinN: number
    hBreakSum: number; hBreakN: number
    vBreakSum: number; vBreakN: number
    inZone: number; swings: number; whiffs: number
  }>()

  const movement: MovementPoint[] = []
  const locationsByType: Record<string, ZoneLocationPoint[]> = {}

  const IN_ZONE = new Set([1,2,3,4,5,6,7,8,9])
  const SWING_CALLS = new Set(['S', 'X', 'D', 'E', 'F', 'L'])
  const WHIFF_CALLS = new Set(['S'])

  for (const p of pitcherPitches) {
    if (!p.typeCode) continue
    if (!byType.has(p.typeCode)) {
      byType.set(p.typeCode, {
        name: p.typeDescription ?? p.typeCode, count: 0,
        veloSum: 0, veloN: 0, spinSum: 0, spinN: 0,
        hBreakSum: 0, hBreakN: 0, vBreakSum: 0, vBreakN: 0,
        inZone: 0, swings: 0, whiffs: 0,
      })
    }
    const acc = byType.get(p.typeCode)!
    acc.count += 1
    if (p.startSpeed != null) { acc.veloSum += p.startSpeed; acc.veloN += 1 }
    if (p.spinRate != null) { acc.spinSum += p.spinRate; acc.spinN += 1 }
    if (p.breakHorizontal != null) { acc.hBreakSum += p.breakHorizontal; acc.hBreakN += 1 }
    if (p.breakVerticalInduced != null) { acc.vBreakSum += p.breakVerticalInduced; acc.vBreakN += 1 }
    if (p.zone != null && IN_ZONE.has(p.zone)) acc.inZone += 1
    if (p.callCode && SWING_CALLS.has(p.callCode)) acc.swings += 1
    if (p.callCode && WHIFF_CALLS.has(p.callCode)) acc.whiffs += 1

    if (p.breakHorizontal != null && p.breakVerticalInduced != null) {
      movement.push({ typeCode: p.typeCode, hBreak: p.breakHorizontal, vBreak: p.breakVerticalInduced })
    }
    if (p.plateX != null && p.plateZ != null) {
      if (!locationsByType[p.typeCode]) locationsByType[p.typeCode] = []
      locationsByType[p.typeCode].push({
        plateX: p.plateX,
        plateZ: p.plateZ,
        inning: p.inning,
        halfInning: p.halfInning,
        countAfter: p.countAfter,
        velo: p.startSpeed,
        outcome: p.callDescription ?? p.typeDescription ?? 'Pitch',
        batterName: p.batterName,
      })
    }
  }

  const types: ArsenalCardPitchType[] = Array.from(byType.entries()).map(([typeCode, a]) => ({
    typeCode,
    typeName: a.name,
    count: a.count,
    usagePct: total > 0 ? round1((a.count / total) * 100) : 0,
    avgVelo: a.veloN > 0 ? round1(a.veloSum / a.veloN) : null,
    avgSpin: a.spinN > 0 ? Math.round(a.spinSum / a.spinN) : null,
    avgHBreak: a.hBreakN > 0 ? round1(a.hBreakSum / a.hBreakN) : null,
    avgVBreak: a.vBreakN > 0 ? round1(a.vBreakSum / a.vBreakN) : null,
    zonePct: a.count > 0 ? round1((a.inZone / a.count) * 100) : null,
    whiffPct: a.swings > 0 ? round1((a.whiffs / a.swings) * 100) : null,
    color: colorFor(typeCode),
  })).sort((a, b) => b.count - a.count)

  return { types, movement, locationsByType }
}

export function computeStrikePct(pitches: PitchRecord[]): number | null {
  if (pitches.length === 0) return null
  const strikes = pitches.filter(p => p.isStrike).length
  return round1((strikes / pitches.length) * 100)
}

export function computeOverallWhiffPct(pitches: PitchRecord[]): number | null {
  const SWING_CALLS = new Set(['S', 'X', 'D', 'E', 'F', 'L'])
  const swings = pitches.filter(p => p.callCode && SWING_CALLS.has(p.callCode))
  if (swings.length === 0) return null
  const whiffs = swings.filter(p => p.callCode === 'S').length
  return round1((whiffs / swings.length) * 100)
}