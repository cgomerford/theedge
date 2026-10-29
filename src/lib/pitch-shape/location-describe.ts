// src/lib/pitch-shape/location-describe.ts
//
// Turns a window of plate locations (the cells LocationPanel draws) into one plain sentence: where pitches that move like the chosen spot
// usually cross the plate. Pure and tested. The grid is defined in location.ts (batter's view, inside on the left; the zone is columns 7..16 and
// rows 9..18). Vertical: below the zone, lower third (rows 9-11), middle (12-15), upper third (16-18), above the zone. Horizontal: off the inside edge,
// inside third (columns 7-9), middle (10-13), away third (14-16), off the away edge.

import { ZONE_COL0, ZONE_COL1, ZONE_ROW0, ZONE_ROW1 } from './location'

const VERT = ['below the zone', 'the lower third of the zone', 'the middle of the zone', 'the upper third of the zone', 'above the zone'] as const
const HORIZ = ['off the inside edge', 'the inside third', 'the middle', 'the away third', 'off the away edge'] as const

const vBucket = (z: number) => (z < ZONE_ROW0 ? 0 : z <= ZONE_ROW0 + 2 ? 1 : z <= ZONE_ROW0 + 6 ? 2 : z <= ZONE_ROW1 ? 3 : 4)
const hBucket = (x: number) => (x < ZONE_COL0 ? 0 : x <= ZONE_COL0 + 2 ? 1 : x <= ZONE_COL0 + 6 ? 2 : x <= ZONE_COL1 ? 3 : 4)

export type LocationDescription = {
  /** share of these pitches (0..1) in each vertical and horizontal bucket, in the order of VERT / HORIZ */
  vertical: number[]
  horizontal: number[]
  inZone: number
  /** the plain sentence, or null when there are no pitches */
  sentence: string | null
}

/** cells: flat [lx, lz, pitches, ...] as in LocationWindow. */
export function describeLocation(cells: number[], pitchName: string): LocationDescription {
  const v = [0, 0, 0, 0, 0], h = [0, 0, 0, 0, 0]
  let n = 0, inZone = 0
  for (let k = 0; k < cells.length; k += 3) {
    const x = cells[k], z = cells[k + 1], c = cells[k + 2]
    v[vBucket(z)] += c; h[hBucket(x)] += c; n += c
    if (x >= ZONE_COL0 && x <= ZONE_COL1 && z >= ZONE_ROW0 && z <= ZONE_ROW1) inZone += c
  }
  if (n <= 0) return { vertical: v, horizontal: h, inZone: 0, sentence: null }
  const vs = v.map(x => x / n), hs = h.map(x => x / n)
  const vi = vs.indexOf(Math.max(...vs)), hi = hs.indexOf(Math.max(...hs))
  const pc = (x: number) => `${Math.round(x * 100)}%`
  const sentence = `A ${pitchName.toLowerCase()} that moves like this most often crosses the plate in ${VERT[vi]} (${pc(vs[vi])} of them), ${hi === 2 ? 'over the middle' : `in ${HORIZ[hi]}`} (${pc(hs[hi])}). ${pc(inZone / n)} finish inside the strike zone.`
  return { vertical: vs, horizontal: hs, inZone: inZone / n, sentence }
}
