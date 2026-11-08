// src/lib/milb-shape/closest.ts
//
// "Closest MLB shape": for a minor-league pitch, the major-league pitchers whose average pitch of the same type is nearest on PHYSICAL shape alone: speed, ride, run and
// arm angle. Distance is in standard-deviation units using the same spreads the sandbox uses for "pitchers who throw something close". No outcome of any kind goes in or
// comes out: it is a comparison of how pitches move, not of how they have done, so it never carries an MLB result onto a minor-league pitcher.

export const SD = { velo: 1.6, ivb: 2.4, hb: 2.4, slot: 9 } as const

export type Shape = { velo: number; ivb: number; hb: number; slot: number }
export type MlbShape = Shape & { pitcherId: number; name: string; teamAbbr: string; nPitches: number }
export type Closest = MlbShape & { distance: number }

export function shapeDistance(a: Shape, b: Shape): number {
  return Math.sqrt(((a.velo - b.velo) / SD.velo) ** 2 + ((a.ivb - b.ivb) / SD.ivb) ** 2 + ((a.hb - b.hb) / SD.hb) ** 2 + ((a.slot - b.slot) / SD.slot) ** 2)
}

/** The k nearest by shape, nearest first. Ties go to the pitcher with more pitches, then the lower id, so the answer never depends on input order. */
export function closestShapes(target: Shape, mlb: MlbShape[], k = 3): Closest[] {
  return mlb
    .map(m => ({ ...m, distance: shapeDistance(target, m) }))
    .sort((x, y) => x.distance - y.distance || y.nPitches - x.nPitches || x.pitcherId - y.pitcherId)
    .slice(0, k)
}
