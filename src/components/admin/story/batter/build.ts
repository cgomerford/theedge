// src/components/admin/story/batter/build.ts
//
// Pure: BatterReelData + the picked slides → the segments the shared timeline plays.

import type { Segment } from '../types'
import type { BatterReelData, BatterSegmentId } from './types'

export const BATTER_ORDER: BatterSegmentId[] = ['br-game', 'br-pas', 'br-spray', 'br-contact', 'br-zone', 'br-close']

export function availableBatterSlides(d: BatterReelData): BatterSegmentId[] {
  const has: Record<BatterSegmentId, boolean> = {
    'br-game': true,
    'br-pas': d.pas.length > 0,
    'br-spray': d.balls.length > 0,
    'br-contact': d.contact != null,
    'br-zone': d.pitchesSeen.length >= 5,
    'br-close': true,
  }
  return BATTER_ORDER.filter(id => has[id])
}

/** [seconds, buildFrac]; the build must finish every animation, the rest is a still hold. */
function spec(id: BatterSegmentId, d: BatterReelData): [number, number] {
  switch (id) {
    case 'br-game': return [4, 0.4]
    case 'br-pas': return [Math.min(7, 3.5 + d.pas.length * 0.5), 0.6]
    case 'br-spray': return [Math.min(6, 3.5 + d.balls.length * 0.4), 0.6]
    case 'br-contact': return [4.5, 0.5]
    case 'br-zone': return [Math.min(6, 3.5 + d.pitchesSeen.length * 0.1), 0.6]
    case 'br-close': return [3, 0.4]
  }
}

export function buildBatterSegments(d: BatterReelData, on: BatterSegmentId[]): Segment[] {
  return availableBatterSlides(d)
    .filter(id => id === 'br-game' || id === 'br-close' || on.includes(id))
    .map(id => { const [duration, buildFrac] = spec(id, d); return { id, duration: Math.round(duration * 100) / 100, buildFrac } })
}
