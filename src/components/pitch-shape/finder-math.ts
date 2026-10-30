// src/components/pitch-shape/finder-math.ts
//
// Pure rules behind the redesigned Pitch Shape Lab map (PitchFinderV2): how a box is coloured, how a spot is named and described, how a chosen
// place is read, and how each pitcher who throws there is tagged. No React, no fetching, so every rule is tested. Descriptions of what pitches
// shaped like this have produced; never a forecast.

import type { Diag } from '@/lib/pitch-shape/diagnostics'

/** a map box shows a rate only when its window holds at least this many swings (below it the box is blank) */
export const MIN_WINDOW_SWINGS = 40
/** boxes between MIN_WINDOW_SWINGS and this are drawn faded: a thinner sample */
export const STRONG_SWINGS = 100
/** a gold "most effective spot" needs a real sample, well above the blank-or-not gate */
export const SPOT_MIN_SWINGS = 200
/** a pitcher's own whiff rate needs this many swings before it is compared with anything */
export const MIN_OWN_SWINGS = 100
/** "about level" = within this many percentage points of the spot's rate */
export const ABOUT_LEVEL_PTS = 2
/** a spot is "high" or "low" on ride or run when it sits at least this many standard deviations from the league mean for the pitch */
export const SPOT_Z = 0.75
/** the chosen place reads as "red" (a high-miss shape) or "blue" (a low-miss shape) at this many points from the league rate */
export const TONE_PTS = 3

const hex = (h: string): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const mix = (a: number[], b: number[], t: number): [number, number, number] => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)) as [number, number, number]
export const MAP_BG = hex('#EDE8DC')
const BLUE = hex('#5E7A99'), CREAM = hex('#F4EEE3'), ORANGE1 = hex('#FF8A50'), ORANGE2 = hex('#A8300E')

/** Diverging colour centred on the league rate: blue-grey below, cream at the league rate, orange then deep orange above. */
export function divergingColour(rate: number, leagueRate: number): [number, number, number] {
  const d = rate - leagueRate
  if (d <= 0) return mix(CREAM, BLUE, Math.min(1, -d / (leagueRate * 0.55)))
  const t = Math.min(1, d / (leagueRate * 0.5))
  return t < 0.5 ? mix(CREAM, ORANGE1, t * 2) : mix(ORANGE1, ORANGE2, (t - 0.5) * 2)
}

/** The colour of one map box, or null when its window is under the gate (left blank, never estimated). Thin windows are faded toward the background. */
export function boxColour(swings: number, whiffs: number, leagueRate: number): [number, number, number] | null {
  if (swings < MIN_WINDOW_SWINGS) return null
  const c = divergingColour(whiffs / swings, leagueRate)
  return swings < STRONG_SWINGS ? mix(MAP_BG, c, 0.45) : c
}

export type MovementStats = { meanHb: number; meanIvb: number; sdHb: number; sdIvb: number }

/** Pitch-weighted mean and spread of movement over a league cell list (flat: hb10, ivb10, pitches, swings, whiffs per cell). */
export function movementStats(cells: number[]): MovementStats | null {
  let n = 0, sh = 0, si = 0
  for (let k = 0; k < cells.length; k += 5) { const c = cells[k + 2]; n += c; sh += (c * cells[k]) / 10; si += (c * cells[k + 1]) / 10 }
  if (n <= 0) return null
  const meanHb = sh / n, meanIvb = si / n
  let vh = 0, vi = 0
  for (let k = 0; k < cells.length; k += 5) { const c = cells[k + 2]; vh += c * (cells[k] / 10 - meanHb) ** 2; vi += c * (cells[k + 1] / 10 - meanIvb) ** 2 }
  return { meanHb, meanIvb, sdHb: Math.sqrt(vh / n) || 1, sdIvb: Math.sqrt(vi / n) || 1 }
}

export type SpotName = { name: string; why: string }

/**
 * A plain name and one-line reason for a place on the map, from where it sits against the league's pitches of the same type and hand.
 * High ride + not high run = rising; high run (not high ride) = heavy run; both high = ride with some run; neither = near the middle.
 * Four-seams get the fastball names; any other pitch type gets neutral wording.
 */
export function nameSpot(pitchType: string, pitchName: string, hb: number, ivb: number, ms: MovementStats): SpotName {
  const zH = (hb - ms.meanHb) / ms.sdHb, zI = (ivb - ms.meanIvb) / ms.sdIvb
  const hiRide = zI >= SPOT_Z, hiRun = zH >= SPOT_Z, loRun = zH <= -SPOT_Z
  const noun = pitchType === 'FF' ? 'fastball' : pitchName.toLowerCase()
  if (hiRide && hiRun) return { name: 'Ride with some run', why: `Plenty of ride and plenty of arm-side run. It stays up and moves toward the pitcher's arm side, so hitters are off on two counts.` }
  if (hiRide) return { name: pitchType === 'FF' ? 'The rising fastball' : `High-ride ${noun}`, why: `Lots of ride, ${loRun ? 'little' : 'ordinary'} run. It drops less than hitters expect, so they swing under it.` }
  if (hiRun) return { name: pitchType === 'FF' ? 'The heavy-run fastball' : `Heavy-run ${noun}`, why: `A lot of arm-side run with ordinary ride. It moves further toward the pitcher's arm side than hitters expect.` }
  return { name: `A ${noun} near the middle of the map`, why: `Ride and run close to the league average for this pitch. Whatever it gets comes from more than its shape.` }
}

export type Tone = 'red' | 'level' | 'blue'
/** Is the chosen place a high-miss shape (red), an ordinary one, or a low-miss one (blue)? diff is points from the league rate. */
export function toneOf(diffPts: number): Tone {
  return diffPts >= TONE_PTS ? 'red' : diffPts <= -TONE_PTS ? 'blue' : 'level'
}

/** The sentence that explains the chosen place, in plain English. */
export function toneLine(tone: Tone, pitchName: string): string {
  const lc = pitchName.toLowerCase()
  if (tone === 'red') return `This is one of the movement shapes hitters miss most. ${pitchName}s that move like this are the most effective at getting misses.`
  if (tone === 'blue') return `Hitters rarely miss ${lc}s that move like this. It is one of the least effective shapes for getting misses.`
  return `Close to the league rate. ${pitchName}s that move like this get about the misses you would expect.`
}

export type Thrower = { pitcherId: number; name: string; teamAbbr: string; nPitches: number; nSwings: number; nWhiffs: number; estPitches: number; share: number }
export type Verdict = 'ahead' | 'level' | 'behind'
export type Rated = Thrower & { own: number | null; gapPts: number | null; verdict: Verdict | null }

/** A pitcher's own rate against the spot's rate: ahead, about level (within ABOUT_LEVEL_PTS), behind, or null when he has too few swings. */
export function verdictOf(own: number | null, spotRate: number | null): { gapPts: number | null; verdict: Verdict | null } {
  if (own == null || spotRate == null) return { gapPts: null, verdict: null }
  const gap = Math.round((own - spotRate) * 1000) / 10   // points to one decimal, so 2.0000000001 is not read as over the band
  return { gapPts: gap, verdict: gap > ABOUT_LEVEL_PTS ? 'ahead' : gap < -ABOUT_LEVEL_PTS ? 'behind' : 'level' }
}

export function rateThrowers(list: Thrower[], spotRate: number | null): Rated[] {
  return list.map(t => {
    const own = t.nSwings >= MIN_OWN_SWINGS ? t.nWhiffs / t.nSwings : null
    return { ...t, own, ...verdictOf(own, spotRate) }
  })
}

/** Ahead (biggest gap first), about level, behind (biggest shortfall first), and the pitchers with too few swings to compare. */
export function splitThrowers(rated: Rated[]) {
  const by = (v: Verdict) => rated.filter(r => r.verdict === v)
  return {
    ahead: by('ahead').sort((a, b) => (b.gapPts ?? 0) - (a.gapPts ?? 0)),
    level: by('level').sort((a, b) => b.estPitches - a.estPitches),
    behind: by('behind').sort((a, b) => (a.gapPts ?? 0) - (b.gapPts ?? 0)),
    unknown: rated.filter(r => r.verdict == null),
  }
}

// ---- reading the numbers behind a pitcher who is ahead of or behind the shape -----------------------------------------------------------------------


/** zone%, down-the-middle% and chase% differ from the league by at least this many points to be worth a mention */
export const LOCATION_GAP_PTS = 3
/** his movement varies this many times more (or less) from pitch to pitch than the league's */
export const SPREAD_RATIO = 1.25
/** wOBA on contact minus xwOBA on contact: how far results sit from the quality of contact (defense and luck) */
export const CONTACT_GAP = 0.03
/** samples a figure needs before it can be called out */
export const MIN_LOC_FOR_CLUE = 200, MIN_OOZ_FOR_CLUE = 100, MIN_BBE_FOR_CLUE = 60

export type Clue = { id: 'zone' | 'heart' | 'chase' | 'spread' | 'contact'; kind: 'location' | 'contact' | 'movement'; text: string }

const p1 = (x: number) => `${(x * 100).toFixed(0)}%`
const w3 = (x: number) => x.toFixed(3).replace(/^0/, '')

/**
 * What in a pitcher's numbers could explain why he is behind (or ahead of) the shape. Only rates with a real sample and a real gap are named; nothing is
 * inferred from a missing figure. These are clues, not causes: the wording says "may" and "suggests".
 */
export function diagnose(verdict: 'ahead' | 'level' | 'behind' | null, d: Diag, lg: Diag, pitchName: string): Clue[] {
  if (verdict !== 'ahead' && verdict !== 'behind') return []
  const behind = verdict === 'behind'
  const lc = pitchName.toLowerCase()
  const out: Clue[] = []
  const gapPts = (a: number | null, b: number | null) => (a == null || b == null ? null : (a - b) * 100)

  const z = gapPts(d.zonePct, lg.zonePct)
  if (z != null && d.nLoc >= MIN_LOC_FOR_CLUE && (behind ? z <= -LOCATION_GAP_PTS : z >= LOCATION_GAP_PTS))
    out.push({ id: 'zone', kind: 'location', text: behind
      ? `Throws fewer ${lc}s in the strike zone than most (${p1(d.zonePct!)} vs ${p1(lg.zonePct!)}). The movement is there; where it ends up may be the gap.`
      : `Throws more ${lc}s in the strike zone than most (${p1(d.zonePct!)} vs ${p1(lg.zonePct!)}) and still gets the extra misses.` })

  const h = gapPts(d.heartPct, lg.heartPct)
  if (h != null && d.nLoc >= MIN_LOC_FOR_CLUE && (behind ? h >= LOCATION_GAP_PTS : h <= -LOCATION_GAP_PTS))
    out.push({ id: 'heart', kind: 'location', text: behind
      ? `More of them land down the middle (${p1(d.heartPct!)} vs ${p1(lg.heartPct!)}), where hitters can square them up.`
      : `Fewer of them land down the middle (${p1(d.heartPct!)} vs ${p1(lg.heartPct!)}), so the shape is not being wasted over the plate.` })

  const c = gapPts(d.chasePct, lg.chasePct)
  if (c != null && d.nOoz >= MIN_OOZ_FOR_CLUE && (behind ? c <= -LOCATION_GAP_PTS : c >= LOCATION_GAP_PTS))
    out.push({ id: 'chase', kind: 'location', text: behind
      ? `Hitters chase it less when it is outside the zone (${p1(d.chasePct!)} of swings vs ${p1(lg.chasePct!)}). Fewer swings at bad pitches means fewer misses.`
      : `Hitters chase it more when it is outside the zone (${p1(d.chasePct!)} of swings vs ${p1(lg.chasePct!)}), which adds misses.` })

  const spread = (a: number | null, b: number | null) => (a == null || b == null || b <= 0 ? null : a / b)
  const sH = spread(d.sdHb, lg.sdHb), sI = spread(d.sdIvb, lg.sdIvb)
  const wide = (sH != null && sH >= SPREAD_RATIO) || (sI != null && sI >= SPREAD_RATIO)
  const tight = (sH != null && sH <= 1 / SPREAD_RATIO) && (sI != null && sI <= 1 / SPREAD_RATIO)
  if (behind && wide) out.push({ id: 'spread', kind: 'movement', text: `His movement varies more from pitch to pitch than most pitchers' (ride ±${d.sdIvb?.toFixed(1)} in, run ±${d.sdHb?.toFixed(1)} in), so he gets this exact shape less often than his average suggests.` })
  if (!behind && tight) out.push({ id: 'spread', kind: 'movement', text: `His movement is more repeatable than most pitchers' (ride ±${d.sdIvb?.toFixed(1)} in, run ±${d.sdHb?.toFixed(1)} in): he gets this shape pitch after pitch.` })

  if (d.xwobaCon != null && d.wobaCon != null && d.nBbe >= MIN_BBE_FOR_CLUE) {
    const g = d.wobaCon - d.xwobaCon
    if (behind && g >= CONTACT_GAP) out.push({ id: 'contact', kind: 'contact', text: `Contact results (${w3(d.wobaCon)}) are worse than the quality of contact he allowed (${w3(d.xwobaCon)}). That points to defense or luck, not to the pitch.` })
    if (!behind && g <= -CONTACT_GAP) out.push({ id: 'contact', kind: 'contact', text: `Contact results (${w3(d.wobaCon)}) are better than the quality of contact he allowed (${w3(d.xwobaCon)}). Defense or luck may be helping.` })
  }
  return out
}

// ---- every pitcher on the map: ahead of or behind what HIS OWN shape usually gets ------------------------------------------------------------------

export type DotIn = { pitcherId: number; name: string; teamAbbr: string; nPitches: number; nSwings: number; nWhiffs: number; hb: number; ivb: number }
export type DotRated<T extends DotIn> = T & { own: number | null; shapeRate: number | null; gapPts: number | null; verdict: Verdict | null }

/**
 * Each pitcher against the league's rate for pitches that move like HIS average (rateAt gives that rate, or null when the window is thin). Ahead means he gets more
 * misses than his shape usually gets, behind fewer, level within ABOUT_LEVEL_PTS. A pitcher with under MIN_OWN_SWINGS swings of his own has no verdict.
 */
export function rateDots<T extends DotIn>(dots: T[], rateAt: (hb: number, ivb: number) => number | null): DotRated<T>[] {
  return dots.map(d => {
    const own = d.nSwings >= MIN_OWN_SWINGS ? d.nWhiffs / d.nSwings : null
    const shapeRate = rateAt(d.hb, d.ivb)
    return { ...d, own, shapeRate, ...verdictOf(own, shapeRate) }
  })
}

/** The most ahead and most behind across the whole map: the guaranteed "some pitchers either side" list, whatever spot is chosen. */
export function extremes<T extends DotIn>(rated: DotRated<T>[], n = 4) {
  const ahead = rated.filter(r => r.verdict === 'ahead').sort((a, b) => (b.gapPts ?? 0) - (a.gapPts ?? 0)).slice(0, n)
  const behind = rated.filter(r => r.verdict === 'behind').sort((a, b) => (a.gapPts ?? 0) - (b.gapPts ?? 0)).slice(0, n)
  return { ahead, behind }
}
