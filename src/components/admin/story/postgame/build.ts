// src/components/admin/story/postgame/build.ts
//
// Pure: PostgameReelData + the picked slides → the segments the shared timeline plays.

import type { Segment } from '../types'
import type { PostgameReelData, PostgameSegmentId } from './types'

export const POSTGAME_ORDER: PostgameSegmentId[] = ['pg-final', 'pg-flow', 'pg-plays', 'pg-hitters', 'pg-pitching', 'pg-spray', 'pg-close']

export function availablePostgameSlides(d: PostgameReelData): PostgameSegmentId[] {
  const has: Record<PostgameSegmentId, boolean> = {
    'pg-final': true,
    'pg-flow': d.flow.length >= 4,
    'pg-plays': d.plays.length > 0,
    'pg-hitters': d.hitters.length > 0,
    'pg-pitching': d.pitching.length > 0,
    'pg-spray': d.hits.length > 0,
    'pg-close': true,
  }
  return POSTGAME_ORDER.filter(id => has[id])
}

/** [seconds, buildFrac]; the build must finish every animation, the rest is a still hold. */
function spec(id: PostgameSegmentId, d: PostgameReelData): [number, number] {
  switch (id) {
    case 'pg-final': return [5, 0.45]
    case 'pg-flow': return [5.5, 0.6]
    case 'pg-plays': return [Math.min(7, 3.5 + d.plays.length * 0.6), 0.6]
    case 'pg-hitters': return [Math.min(7, 3.5 + d.hitters.length * 0.4), 0.6]
    case 'pg-pitching': return [Math.min(7, 3.5 + d.pitching.length * 0.5), 0.6]
    case 'pg-spray': return [Math.min(7, 3.5 + d.hits.length * 0.2), 0.65]
    case 'pg-close': return [3, 0.4]
  }
}

export function buildPostgameSegments(d: PostgameReelData, on: PostgameSegmentId[]): Segment[] {
  return availablePostgameSlides(d)
    .filter(id => id === 'pg-final' || id === 'pg-close' || on.includes(id))
    .map(id => { const [duration, buildFrac] = spec(id, d); return { id, duration: Math.round(duration * 100) / 100, buildFrac } })
}
