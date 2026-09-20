// src/lib/game-plan.ts
//
// "Catcher's wristband" — for each count situation, rank every real
// (pitch type, zone) combo this pitcher has thrown enough in that
// situation to trust, by a documented, transparent formula (not a black
// box, not fetched from anywhere):
//
//   - No batter selected: pitcherOnlyScore = whiff% + (1-BA)*20 - RV/100*10
//     (all three real, from pitcher-situational-zones.ts's live aggregation)
//   - Batter selected: reuses netTilt() (already built in pitcher-arsenal.ts
//     for the Scout Report matchup card) — the batter's real xwOBA vs the
//     pitcher's real BA-against/usage/whiff in that zone. The batter-side
//     number now prefers batter_zone_arsenal (src/lib/batter-zone-arsenal.ts,
//     real BA/SLG/xwOBA/whiff PER PITCH TYPE per zone — same table the
//     Batting Lab's "Vs Pitch Types" tab already reads) over the older
//     zone-only batter_hot_zones lookup, so the batter side is matched to
//     the EXACT pitch type being scored, same as the pitcher side already
//     is — apples-to-apples, not "batter's overall zone weakness ignoring
//     what's actually being thrown." Falls back to the zone-only lookup
//     when the batter has no (or a flagged low_sample) arsenal cell for
//     that specific pitch type — real pitcher-side candidates never get
//     silently dropped for lack of batter-side pitch-type detail.
//     Batter zones aren't split by count (only by batter side), so the
//     SAME real vs_lhp/vs_rhp split is used across every situation — not
//     fabricated per-situation, just the one real split that exists,
//     applied consistently.
//
// 2026-09-14: deepened from "just the #1 pick" to a ranked read per
// situation — a primary call, a real alternate (2nd-best, so the catcher
// has a change-up if the primary's been seen too much), and an "avoid"
// (the worst-scoring qualifying combo — the one spot NOT to miss into).
// All three come from the same ranked candidate pool, same score, same
// sample-size floor — nothing here is a different, looser bar for the
// alternate/avoid picks.
//
// A situation with no (pitchType, zone) cell clearing MIN_SAMPLE is left
// out of the plan entirely rather than guessing from a tiny sample.

import type { Cell } from '@/components/pitching-lab/ZoneGrid'
import { ZONE_LABELS } from './hot-zones'
import type { BatterHotZones } from './hot-zones'
import type { BatterZoneArsenal, BatterArsenalZoneCell } from './batter-zone-arsenal'
import { netTilt } from './pitcher-arsenal'
import type { PitcherSituationalZones, Situation } from './pitcher-situational-zones'
import { SITUATIONS, SITUATION_LABELS } from './pitcher-situational-zones'

const MIN_SAMPLE = 8 // pitches in this exact (pitchType, zone, situation) cell

export type GamePlanCandidate = {
  pitchType: string
  pitchName: string
  zone: string
  zoneLabel: string
  sampleSize: number
  score: number
  cell: Cell
  batterXwoba: number | null
  batterArsenalCell: BatterArsenalZoneCell | null // real batter BA/SLG/whiff vs this EXACT pitch type in this zone, when trustworthy
  rationale: string
}

export type GamePlanEntry = {
  situation: Situation
  situationLabel: string
  primary: GamePlanCandidate
  alternate: GamePlanCandidate | null
  avoid: GamePlanCandidate | null
  candidateCount: number // how many real (pitch,zone) combos cleared the sample floor — the plan's own confidence signal
}

function pitcherOnlyScore(cell: Cell): number {
  let score = 0
  if (cell.whiff_pct != null) score += cell.whiff_pct
  if (cell.run_value_per_100 != null) score += -cell.run_value_per_100 * 10
  if (cell.ba_against != null) score += (1 - cell.ba_against) * 20
  return score
}

function describe(pitchName: string, zoneLabel: string, cell: Cell, batterXwoba: number | null, batterArsenalCell: BatterArsenalZoneCell | null): string {
  const parts: string[] = []
  if (cell.whiff_pct != null) parts.push(`${cell.whiff_pct.toFixed(0)}% whiff`)
  if (cell.ba_against != null) parts.push(`${cell.ba_against.toFixed(3).replace(/^0/, '')} BA against`)
  if (cell.run_value_per_100 != null) parts.push(`${cell.run_value_per_100 > 0 ? '+' : ''}${cell.run_value_per_100.toFixed(1)} RV/100`)
  // Prefer the batter's real numbers vs this EXACT pitch type when the
  // cell is real and not flagged low-sample — otherwise fall back to the
  // coarser zone-only xwOBA rather than citing an unreliable tiny sample.
  if (batterArsenalCell && !batterArsenalCell.low_sample) {
    if (batterArsenalCell.ba != null) parts.push(`batter hits ${batterArsenalCell.ba.toFixed(3).replace(/^0/, '')} vs this exact pitch here (n=${batterArsenalCell.pitches})`)
    if (batterArsenalCell.whiff_pct != null) parts.push(`${batterArsenalCell.whiff_pct.toFixed(0)}% whiff for him on it`)
  } else if (batterXwoba != null) {
    parts.push(`batter's xwOBA there: ${batterXwoba.toFixed(3).replace(/^0/, '')}`)
  }
  return `${pitchName}, ${zoneLabel} — ${parts.join(', ')} in this count (n=${cell.pitches}).`
}

export function buildGamePlan(
  situational: PitcherSituationalZones,
  batterZonesBySplit: Record<string, BatterHotZones> | null,
  pitcherThrows: 'L' | 'R' | null,
  batterArsenalBySplit: Record<string, BatterZoneArsenal> | null = null,
): GamePlanEntry[] {
  const batterSplit = pitcherThrows === 'L' ? 'vs_lhp' : pitcherThrows === 'R' ? 'vs_rhp' : 'all'
  const batterZones = batterZonesBySplit?.[batterSplit] ?? batterZonesBySplit?.['all'] ?? null
  const batterArsenal = batterArsenalBySplit?.[batterSplit] ?? batterArsenalBySplit?.['all'] ?? null

  const plan: GamePlanEntry[] = []

  for (const situation of SITUATIONS) {
    const byPitch = situational.byPitchSituation[situation]
    const candidates: { pitchType: string; zone: string; cell: Cell; score: number; batterXwoba: number | null; batterArsenalCell: BatterArsenalZoneCell | null }[] = []

    for (const [pitchType, zones] of Object.entries(byPitch)) {
      for (const [zone, cell] of Object.entries(zones)) {
        if ((cell.pitches ?? 0) < MIN_SAMPLE) continue
        const batterCell = batterZones?.zones[zone]
        // Pitch-type-specific real batter data, when trustworthy — falls
        // back to the coarser zone-only xwOBA so a real pitcher-side
        // candidate is never dropped just for lack of batter-side detail.
        const arsenalCell = batterArsenal?.arsenal[pitchType]?.zones[zone] ?? null
        const trustworthyArsenalCell = arsenalCell && !arsenalCell.low_sample ? arsenalCell : null
        const batterXwoba = trustworthyArsenalCell?.xwoba ?? batterCell?.xwoba ?? null
        const hasBatterData = trustworthyArsenalCell != null || batterCell != null
        const score = hasBatterData
          ? netTilt(batterXwoba, cell.ba_against, cell.usage_pct, cell.whiff_pct)
          : pitcherOnlyScore(cell)
        candidates.push({ pitchType, zone, cell, score, batterXwoba, batterArsenalCell: arsenalCell })
      }
    }

    if (candidates.length === 0) continue
    candidates.sort((a, b) => b.score - a.score)

    function toCandidate(c: (typeof candidates)[number]): GamePlanCandidate {
      const pitchName = situational.pitchNames[c.pitchType] ?? c.pitchType
      const zoneLabel = ZONE_LABELS[c.zone] ?? `zone ${c.zone}`
      return {
        pitchType: c.pitchType, pitchName, zone: c.zone, zoneLabel,
        sampleSize: c.cell.pitches ?? 0, score: Math.round(c.score * 100) / 100,
        cell: c.cell, batterXwoba: c.batterXwoba, batterArsenalCell: c.batterArsenalCell,
        rationale: describe(pitchName, zoneLabel, c.cell, c.batterXwoba, c.batterArsenalCell),
      }
    }

    const primary = toCandidate(candidates[0])
    // Alternate: next-best candidate that's a DIFFERENT pitch (a same-pitch
    // different-zone runner-up isn't a real "change-up" option for the
    // catcher — it's the same pitch call twice).
    const altRaw = candidates.slice(1).find(c => c.pitchType !== candidates[0].pitchType)
    const alternate = altRaw ? toCandidate(altRaw) : null
    // Avoid: worst-scoring candidate that still cleared the sample floor —
    // a real, seen-enough-to-trust combo, just the one that grades worst.
    const worstRaw = candidates.length > 1 ? candidates[candidates.length - 1] : null
    const avoid = worstRaw && worstRaw !== candidates[0] ? toCandidate(worstRaw) : null

    plan.push({
      situation,
      situationLabel: SITUATION_LABELS[situation],
      primary,
      alternate,
      avoid,
      candidateCount: candidates.length,
    })
  }

  return plan
}
