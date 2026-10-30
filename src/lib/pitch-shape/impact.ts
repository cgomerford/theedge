// src/lib/pitch-shape/impact.ts
//
// What a change in a pitch's shape is worth, as ARITHMETIC: take the difference in whiffs per swing and in contact quality (xwOBA on contact) between league pitches
// shaped like his current pitch and league pitches shaped like the dialled one, apply it to his own workload on that pitch, and convert to strikeouts, FIP and runs.
// It is not a forecast: it assumes his pitch would get what league pitches of that shape get, and leaves out his location, deception, sequencing and defense. The page
// says so beside every figure. Method and sources: docs/pitch-change-impact.md. Pure functions, tested.

/** Measured on 2026 data (docs/pitch-change-impact.md). Refresh once a season. */
export const IMPACT_CONSTANTS = {
  asOf: '2026-10-31',
  /** strikeouts per swinging strike across 429 pitchers with 150+ batters faced (35,933 K / 67,561 whiffs) */
  kPerWhiff: 0.53,
  /** FanGraphs FIP constant; 2026 league ERA minus the FIP terms comes to 3.10 */
  fipConstant: 3.10,
  /** FanGraphs wOBA scale (1.251 in their 2015 table): runs = wOBA points x PA / scale */
  wobaScale: 1.25,
  /** FIP's strikeout weight: each strikeout takes 2 / IP off FIP */
  fipKWeight: 2,
} as const

/** A figure needs this many of his own swings / balls in play to be converted at all. */
export const MIN_SWINGS_FOR_IMPACT = 100
export const MIN_BBE_FOR_IMPACT = 40
/** a combined effect this big (runs per nine) moves the pitch a long way from where it is; the page adds a caution */
export const LARGE_EFFECT = 1.0

export type ImpactInput = {
  /** league whiffs per swing at the dialled shape minus at his current shape (a share, e.g. 0.025) */
  whiffDelta: number | null
  /** league xwOBA on contact at the dialled shape minus at his current shape (e.g. -0.021) */
  xwobaDelta: number | null
  /** his own swings and balls in play on this pitch this season */
  swings: number; bbe: number
  /** his season workload, from the MLB Stats API; null when unavailable */
  ip: number | null; bf: number | null
}

export type Impact = {
  extraWhiffs: number | null
  extraK: number | null
  kPctPts: number | null          // change in his K%, in points
  fipDelta: number | null         // strikeout part of FIP, per nine (negative is better for the pitcher)
  contactRuns: number | null      // runs over the workload from contact quality (negative = fewer runs)
  contactPerNine: number | null
  totalPerNine: number | null     // strikeout part + contact part, runs per nine
  thin: string[]                  // reasons something was left out
}

export function translateChange(i: ImpactInput): Impact {
  const thin: string[] = []
  const C = IMPACT_CONSTANTS
  const okSwings = i.swings >= MIN_SWINGS_FOR_IMPACT
  const okBbe = i.bbe >= MIN_BBE_FOR_IMPACT
  if (!okSwings) thin.push(`under ${MIN_SWINGS_FOR_IMPACT} swings of his own on this pitch, so the strikeout part is left out`)
  if (!okBbe) thin.push(`under ${MIN_BBE_FOR_IMPACT} balls in play of his own on this pitch, so the contact part is left out`)
  if (i.ip == null || i.ip <= 0) thin.push('his innings are not available, so nothing is converted to a per-nine figure')

  const extraWhiffs = i.whiffDelta != null && okSwings ? i.whiffDelta * i.swings : null
  const extraK = extraWhiffs != null ? extraWhiffs * C.kPerWhiff : null
  const kPctPts = extraK != null && i.bf != null && i.bf > 0 ? (extraK / i.bf) * 100 : null
  const hasIp = i.ip != null && i.ip > 0
  const fipDelta = extraK != null && hasIp ? (-C.fipKWeight * extraK) / (i.ip as number) : null
  const contactRuns = i.xwobaDelta != null && okBbe ? (i.xwobaDelta * i.bbe) / C.wobaScale : null
  const contactPerNine = contactRuns != null && hasIp ? (contactRuns * 9) / (i.ip as number) : null
  const parts = [fipDelta, contactPerNine].filter((x): x is number => x != null)
  const totalPerNine = parts.length ? parts.reduce((a, b) => a + b, 0) : null
  return { extraWhiffs, extraK, kPctPts, fipDelta, contactRuns, contactPerNine, totalPerNine, thin }
}
