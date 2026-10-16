// src/components/admin/story/split.ts
//
// Instagram stories cap a clip at 60s. When the picked slides run longer we
// offer a 2-part export, split only at segment boundaries.

import type { Segment } from './types'
import { durationFor, buildFracFor } from './durations'

export const MAX_PART_S = 59.5
const sum = (s: Segment[]) => s.reduce((t, x) => t + x.duration, 0)

export const total = sum

/** [part1, part2] or null when no valid split exists. */
export function splitStory(segments: Segment[]): [Segment[], Segment[]] | null {
  const hook = segments.find(s => s.id === 'hook')
  const close = segments.find(s => s.id === 'close')
  if (!hook || !close) return null
  const middle = segments.filter(s => s.id !== 'hook' && s.id !== 'close' && s.id !== 'part-hook')
  const partHook: Segment = { id: 'part-hook', duration: durationFor('part-hook', 0), buildFrac: buildFracFor('part-hook') }

  let best: { score: number; parts: [Segment[], Segment[]] } | null = null
  for (let k = 0; k <= middle.length; k++) {
    const p1 = [hook, ...middle.slice(0, k)]
    const p2 = [partHook, ...middle.slice(k), close]
    const a = sum(p1), b = sum(p2)
    if (a > MAX_PART_S || b > MAX_PART_S) continue
    if (k === 0 || k === middle.length) continue          // both parts must carry real slides
    const score = Math.abs(a - b)
    if (!best || score < best.score) best = { score, parts: [p1, p2] }
  }
  return best ? best.parts : null
}
