// src/components/admin/story/timeline.ts

import type { AnySegmentId, Segment } from './types'

export const STORY_FPS = 30
/** Push transition at the start of every segment except the first. */
export const PUSH_S = 0.25

export type TimelineEntry = {
  id: AnySegmentId
  index: number
  start: number
  end: number
  /** absolute time the build finishes and the hold begins */
  buildEnd: number
  duration: number
  buildFrac: number
}
export type Timeline = { entries: TimelineEntry[]; total: number }

export function buildTimeline(segments: Segment[]): Timeline {
  const entries: TimelineEntry[] = []
  let at = 0
  segments.forEach((s, index) => {
    entries.push({
      id: s.id, index, start: at, end: at + s.duration,
      buildEnd: at + s.duration * s.buildFrac, duration: s.duration, buildFrac: s.buildFrac,
    })
    at += s.duration
  })
  return { entries, total: at }
}

export type SegmentAt = {
  entry: TimelineEntry
  localT: number
  /** previous segment + raw 0..1 push progress, only inside the push window */
  pushing: { from: TimelineEntry; p: number } | null
}

export function segmentAt(tl: Timeline, t: number): SegmentAt {
  const tt = Math.min(Math.max(t, 0), tl.total)
  let entry = tl.entries[tl.entries.length - 1]
  for (const e of tl.entries) if (tt < e.end) { entry = e; break }
  const localT = Math.min(tt - entry.start, entry.duration)
  const prev = entry.index > 0 ? tl.entries[entry.index - 1] : null
  const pushing = prev && localT < PUSH_S ? { from: prev, p: localT / PUSH_S } : null
  return { entry, localT, pushing }
}

/** True when nothing on screen moves: in a hold and not inside a push. */
export function isStatic(tl: Timeline, t: number): boolean {
  if (t >= tl.total) return true
  const { entry, localT, pushing } = segmentAt(tl, t)
  if (pushing) return false
  return localT >= entry.duration * entry.buildFrac
}

/** Identity of the hold a time belongs to (for frame de-duplication on export). */
export function holdKey(tl: Timeline, t: number): number | null {
  if (!isStatic(tl, t)) return null
  return segmentAt(tl, Math.min(t, tl.total - 1e-6)).entry.index
}

/**
 * Keep the playhead on the same slide when the picked slides change. Same segment still present →
 * same local position inside it; otherwise the start of the next present segment (by the old order); else 0.
 */
export function rebaseT(prev: Timeline, next: Timeline, t: number): number {
  if (next.entries.length === 0) return 0
  const cur = segmentAt(prev, t)
  const same = next.entries.find(e => e.id === cur.entry.id)
  if (same) return same.start + Math.min(cur.localT, same.duration)
  for (let i = cur.entry.index + 1; i < prev.entries.length; i++) {
    const later = next.entries.find(e => e.id === prev.entries[i].id)
    if (later) return later.start
  }
  return 0
}
