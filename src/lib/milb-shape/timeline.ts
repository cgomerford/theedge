// src/lib/milb-shape/timeline.ts
//
// A pitcher's shape month by month across the levels he threw at: for one pitch type, the average ride, run and speed of his pitches in each (level, month), in date order, so a move
// from Triple-A to MLB (or a change within a level) shows as a path. Pure maths on his pitch logs. Run is arm-side positive in inches, ride is induced vertical break in inches.
// A point under MIN_POINT pitches is not drawn; one under SOLID is drawn hollow ("thin").

import type { Level } from './levels'
import type { RawPitch } from '@/lib/pitcher-pitch-log'

export const MIN_POINT = 15
export const SOLID = 50

export type TimePoint = { level: Level; month: string; n: number; ride: number; run: number; velo: number | null; thin: boolean }

export function shapeTimeline(logs: { level: Level; throws: 'L' | 'R' | null; pitches: RawPitch[] }[], type: string): TimePoint[] {
  const out: (TimePoint & { sort: string })[] = []
  for (const l of logs) {
    const by = new Map<string, { n: number; ride: number; run: number; v: number; vn: number }>()
    for (const p of l.pitches) {
      if (p.pitchType !== type || !p.pfx || !p.date) continue
      const m = p.date.slice(0, 7), e = by.get(m) ?? { n: 0, ride: 0, run: 0, v: 0, vn: 0 }
      e.n++; e.ride += p.pfx[1] * 12; e.run += (l.throws === 'L' ? p.pfx[0] : -p.pfx[0]) * 12
      if (p.velo != null) { e.v += p.velo; e.vn++ }
      by.set(m, e)
    }
    for (const [m, e] of by) if (e.n >= MIN_POINT) out.push({ level: l.level, month: m, n: e.n, ride: e.ride / e.n, run: e.run / e.n, velo: e.vn > 0 ? e.v / e.vn : null, thin: e.n < SOLID, sort: m })
  }
  // date order; within a month the lower level first, so a mid-month promotion reads as a step up
  const rank: Record<string, number> = { fsl: 0, aaa: 1, mlb: 2 }
  return out.sort((a, b) => a.sort.localeCompare(b.sort) || (rank[a.level] ?? 0) - (rank[b.level] ?? 0)).map(({ sort: _s, ...r }) => r)
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (m: string) => MONTH[Number(m.slice(5, 7)) - 1] ?? m
