// src/lib/postgame/tip.ts — the hover card behind a dot on the spray chart / umpire zone plot.
// Built from the live feed plus the base simulation in pitchlog.ts (pitchContexts).

import type { Bases } from './pitchlog'

export type Tip = {
  pitcher: string
  batter: string
  when: string                 // "Top 3rd"
  outs: number
  count: string                // balls-strikes when the pitch was thrown
  bases: Bases                 // runners on 1B / 2B / 3B
  pitch: string                // "4-seam"
  velo: number | null          // mph
  result: string               // what the pitch or ball in play was: "Called Strike", "Home Run"
  detail?: string              // e.g. "102.3 mph off the bat · 25° · 394 ft"
  flag?: string                // e.g. a missed call, spelled out
}

export const ordinalOf = (i: number) => { const v = i % 100; return `${i}${v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[i % 10] ?? 'th'}` }
export const whenOf = (inning: number, top: boolean) => `${top ? 'Top' : 'Bot'} ${ordinalOf(inning)}`
