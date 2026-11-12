// src/lib/pitch-shape/cells-for.ts
//
// Server loaders the Pitch Shape Lab page and its actions share: the 0.1-inch league cells and the 2-inch league bins for one pitch type, level and hand, where "hand" can also be Both.
// Both is sound because every table stores run arm-side positive with left-handers flipped (see bothHands.ts), so the two hands add cell by cell. The left-handed cells are read around the
// right-handed centre so the two hands fill the same window. A minor-league level reads its own season; MLB reads the league rows.
import { getLeagueBins, getMovementCells, type MovementCellsPayload } from '@/lib/pitch-shape/data'
import { HEAT_HALF } from '@/components/pitch-shape/heatGrid'
import { handsOf, mergeCells, type ViewHand } from '@/components/pitch-shape/bothHands'
import type { Hand, ShapeBin } from '@/lib/pitch-shape/model'
import { isMilb, type Level } from '@/lib/milb-shape/levels'
import { resolveSeason } from '@/lib/milb-shape/server'

/** arm angle is carried by MLB, Triple-A and the Florida State League; the Fall League and Spring Training have none, so those levels are read on speed and shape only */
export const levelHasArm = (level: Level) => level !== 'afl' && level !== 'st'

export const seasonFor = async (level: Level) => (isMilb(level) ? resolveSeason(level, null) : new Date().getFullYear())

/** the league cells for one hand, around a given centre (inches) or, with none, around that hand's own league average */
async function oneHand(type: string, hand: Hand, level: Level, centre?: { hb: number; ivb: number }): Promise<MovementCellsPayload | null> {
  const hb = centre?.hb ?? null, ivb = centre?.ivb ?? null
  return isMilb(level) ? getMovementCells(type, hand, hb, ivb, HEAT_HALF, 2.5, level, await resolveSeason(level, null)) : getMovementCells(type, hand, hb, ivb, HEAT_HALF)
}

export async function getCellsFor(type: string, hand: ViewHand, level: Level, centre?: { hb: number; ivb: number }): Promise<MovementCellsPayload | null> {
  const hands = handsOf(hand)
  const a = await oneHand(type, hands[0], level, centre)
  if (hands.length === 1 || !a) return hands.length === 1 ? a : oneHand(type, hands[1], level, centre)
  const b = await oneHand(type, hands[1], level, { hb: a.hb0, ivb: a.ivb0 })
  return b ? mergeCells(a, b) : a
}

/** every league bin of this type and level for the chosen hand(s) */
export async function getBinsFor(type: string, hand: ViewHand, level: Level): Promise<ShapeBin[]> {
  const season = await seasonFor(level)
  const per = await Promise.all(handsOf(hand).map(h => getLeagueBins(type, h, level, season, { arm: levelHasArm(level) })))
  return per.flat()
}
