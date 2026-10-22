// src/lib/pitch-shape/compare.ts
//
// Who a pitch is compared with, and the numbers shown for each. Pure (no I/O) so the server picks the field and
// the page can swap a pitcher without another round trip.
//
// "Similar" = same pitch type, same hand, season average shape closest on velocity, induced vertical break,
// horizontal break and arm angle. Each gap is divided by a typical spread so no one measure dominates
// (SCALE below), then combined as a straight-line distance. Smaller = more alike. It describes shape only.
import type { PitchViewMonth } from './model'

export const SCALE = { velo: 1.5, ivb: 2, hb: 2, slot: 5 } as const   // one "step" in mph / in / in / degrees
export const MIN_COMPARE_PITCHES = 300   // a season of this pitch below this is too thin to compare
export const MIN_TAKEN = 100             // taken pitches before call rates are shown
export const MIN_SETUP = 20              // pitches after a given previous pitch before its whiff rate is shown
export const FIELD = 12                  // candidates sent to the page: 4 shown, the rest are swap options

export type SetupRow = { prev: string; n: number; swings: number; whiffs: number; called: number; dv: number | null }

export type ComparePitcher = {
  pitcherId: number
  name: string
  teamAbbr: string
  isSelf: boolean
  isTeammate: boolean
  /** shape distance from the subject pitch (0 for the subject) */
  distance: number
  nPitches: number
  velo: number; ivb: number; hb: number; slot: number
  nSwings: number; nWhiffs: number
  /** call counts (null until the shape-pitcher cron has re-run on this row) */
  nTaken: number | null; nGift: number | null; nMiss: number | null
  /** ABS challenges against this pitch this season and how many were overturned (0/0 = none, not unknown) */
  absN: number; absOverturned: number
  setup: SetupRow[] | null
  /** whole-season row built from his monthly rows, for the animation; null if we hold none */
  flight: PitchViewMonth | null
}

type Shape = { velo: number; ivb: number; hb: number; slot: number }

export function shapeDistance(a: Shape, b: Shape): number {
  return Math.hypot((a.velo - b.velo) / SCALE.velo, (a.ivb - b.ivb) / SCALE.ivb, (a.hb - b.hb) / SCALE.hb, (a.slot - b.slot) / SCALE.slot)
}

/**
 * Subject first, then the closest teammate (if there is one), then the closest from the rest of the league, up to
 * `FIELD` pitchers. The page shows the first four and offers the rest as swaps.
 */
export function pickField(subject: ComparePitcher, others: ComparePitcher[]): ComparePitcher[] {
  const ranked = others.filter(o => o.pitcherId !== subject.pitcherId).sort((x, y) => x.distance - y.distance)
  const mate = ranked.find(o => o.isTeammate)
  const rest = ranked.filter(o => o !== mate)
  return [subject, ...(mate ? [mate] : []), ...rest].slice(0, FIELD)
}

export const swingPct = (p: ComparePitcher) => (p.nPitches > 0 ? (p.nSwings / p.nPitches) * 100 : null)
export const whiffPct = (p: ComparePitcher) => (p.nSwings >= 100 ? (p.nWhiffs / p.nSwings) * 100 : null)
export const giftPct = (p: ComparePitcher) => (p.nTaken != null && p.nGift != null && p.nTaken >= MIN_TAKEN ? (p.nGift / p.nTaken) * 100 : null)
export const missPct = (p: ComparePitcher) => (p.nTaken != null && p.nMiss != null && p.nTaken >= MIN_TAKEN ? (p.nMiss / p.nTaken) * 100 : null)
