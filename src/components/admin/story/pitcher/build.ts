// src/components/admin/story/pitcher/build.ts
//
// Pure: PitcherReelData + the picked slides → the segments the shared timeline plays.
// A slide is "available" only when its data exists; nothing is padded or invented.

import type { Segment } from '../types'
import { arsenalRows } from './segments/Arsenal'
import type { PitcherReelData, ReelSegmentId } from './types'

export const REEL_ORDER: ReelSegmentId[] = ['pr-game', 'pr-arsenal', 'pr-counts', 'pr-arm', 'pr-hits', 'pr-tto', 'pr-season', 'pr-next', 'pr-close']

export function availableSlides(d: PitcherReelData): ReelSegmentId[] {
  const has: Record<ReelSegmentId, boolean> = {
    'pr-game': true,
    'pr-arsenal': arsenalRows(d).length > 0,
    'pr-counts': d.pitchDots.length >= 10,
    'pr-arm': !!d.arm && d.arm.overall != null,
    'pr-hits': d.hits.length > 0,
    'pr-tto': d.tto.length >= 2,
    'pr-season': d.season.length > 0,
    'pr-next': !!d.next,
    'pr-close': true,
  }
  return REEL_ORDER.filter(id => has[id])
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** [seconds, buildFrac]; the build must finish every animation, the rest is a still hold. */
function spec(id: ReelSegmentId, d: PitcherReelData): [number, number] {
  switch (id) {
    case 'pr-game': return [4, 0.4]
    case 'pr-arsenal': return [Math.min(6, 4 + Math.max(0, arsenalRows(d).length - 4) * 0.5), 0.5]
    case 'pr-counts': return [5.5, 0.6]
    case 'pr-arm': return [4, 0.5]
    case 'pr-hits': return [Math.min(7, 3.5 + d.hits.length * 0.25), 0.6]
    case 'pr-tto': return [3.5, 0.4]
    case 'pr-season': return [Math.min(5, 3.5 + d.season.length * 0.25), 0.4]
    case 'pr-next': return [3.5, 0.4]
    case 'pr-close': return [3, 0.4]
  }
}

export function buildReelSegments(d: PitcherReelData, on: ReelSegmentId[]): Segment[] {
  return availableSlides(d)
    .filter(id => id === 'pr-game' || id === 'pr-close' || on.includes(id))
    .map(id => { const [duration, buildFrac] = spec(id, d); return { id, duration: r2(duration), buildFrac } })
}
