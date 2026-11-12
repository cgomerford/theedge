// src/lib/pitch-shape/spot.ts
//
// What the Pitch Shape Lab says about one spot on the movement map, as plain numbers: which pitchers throw that shape, how the shape ranks on ride and sideways movement, how fast and from what arm angle
// those pitchers throw it, how they do on their own swings, and how many sit below, at or above the league rate there. Pure maths on each pitcher's average shape and the sample of up to 60 of his
// pitches (pitch_shape_pitcher), so the same rules drive the hover panel and the pitcher list.
//
// A pitcher "throws this shape" when at least MIN_IN_SPOT of his sampled pitches land inside the window around the spot. It is the PITCHES that count, not his average: pitchers' averages cluster
// near the middle, so a spot out at the edge of the map has almost no pitcher whose average is there, yet real pitches land there. Ranks weight every sampled pitch by how many of the pitch he throws.
import { standing, type Standing } from '@/lib/pitch-shape/filtered-heat'

export const MIN_IN_SPOT = 3

export type SpotDot = { id: number; name: string; team: string; hand: 'R' | 'L'; hb: number; ivb: number; v: number; s: number; sw: number; wh: number; p: number; pts: [number, number][] }
export type SpotInput = {
  probe: { hb: number; ivb: number }
  /** the league whiffs per swing at this spot (null when under the swing minimum, so nobody is rated) */
  leagueRate: number | null
  windowIn: number
  /** speed (mph) and arm-angle (degrees, from up to but not including) ranges that are switched on, else null. They apply to each pitcher's average speed and arm angle. */
  vRange: [number, number] | null
  aRange: [number, number] | null
  minSwings: number
}
export type AtSpot = { dot: SpotDot; /** sampled pitches inside the window */ k: number; /** share of his sampled pitches inside the window */ share: number; /** that share applied to all his pitches of this type (a rough count) */ est: number }
export type Spot = {
  /** pitchers with MIN_IN_SPOT or more sampled pitches inside the window: they throw this shape regularly, whatever their average is */
  pitchers: number
  /** pitchers whose AVERAGE shape is inside the window: this spot is what their pitch is, on average */
  averaging: number
  /** pitchers with enough swings to be rated */
  rated: number
  below: number; at: number; above: number
  /** share (0 to 100) of the pitches thrown, among pitchers inside the filters, that have less ride / less arm-side movement than this spot */
  ridePct: number | null; sidePct: number | null
  velo: number | null; slot: number | null
  swings: number; whiffs: number
}

export const inFilters = (d: SpotDot, q: Pick<SpotInput, 'vRange' | 'aRange'>) => (!q.vRange || (d.v >= q.vRange[0] - 0.5 && d.v < q.vRange[1] + 0.5)) && (!q.aRange || (d.s >= q.aRange[0] && d.s < q.aRange[1]))

/** pitchers with at least MIN_IN_SPOT sampled pitches inside the window, most pitches there first */
export function pitchersAtSpot(dots: SpotDot[], q: SpotInput): AtSpot[] {
  const out: AtSpot[] = []
  for (const d of dots) {
    if (!inFilters(d, q) || d.pts.length === 0) continue
    const k = d.pts.filter(([hb, ivb]) => Math.abs(hb - q.probe.hb) <= q.windowIn && Math.abs(ivb - q.probe.ivb) <= q.windowIn).length
    if (k < MIN_IN_SPOT) continue
    const share = k / d.pts.length
    out.push({ dot: d, k, share, est: Math.round(share * d.p) })
  }
  return out.sort((a, b) => b.est - a.est)
}

export function rate(at: AtSpot, leagueRate: number): { standing: Standing; diff: number; z: number } {
  return standing({ whiffs: at.dot.wh, swings: at.dot.sw }, leagueRate)
}

export function describeSpot(dots: SpotDot[], q: SpotInput): Spot {
  const mine = pitchersAtSpot(dots, q)
  const pool = dots.filter(d => inFilters(d, q) && d.pts.length > 0)
  let wAll = 0, wRide = 0, wSide = 0
  for (const d of pool) {
    const w = d.p / d.pts.length
    for (const [hb, ivb] of d.pts) { wAll += w; if (ivb < q.probe.ivb) wRide += w; if (hb < q.probe.hb) wSide += w }
  }
  const est = mine.reduce((a, m) => a + m.est, 0)
  const wavg = (f: (d: SpotDot) => number) => (est > 0 ? mine.reduce((a, m) => a + f(m.dot) * m.est, 0) / est : null)
  const rated = q.leagueRate == null ? [] : mine.filter(m => m.dot.sw >= q.minSwings).map(m => rate(m, q.leagueRate!).standing)
  const averaging = pool.filter(d => Math.abs(d.hb - q.probe.hb) <= q.windowIn && Math.abs(d.ivb - q.probe.ivb) <= q.windowIn).length
  return {
    pitchers: mine.length, averaging, rated: rated.length,
    below: rated.filter(x => x === 'below').length, at: rated.filter(x => x === 'at').length, above: rated.filter(x => x === 'above').length,
    ridePct: wAll > 0 ? Math.round((100 * wRide) / wAll) : null, sidePct: wAll > 0 ? Math.round((100 * wSide) / wAll) : null,
    velo: wavg(d => d.v), slot: wavg(d => d.s),
    swings: mine.reduce((a, m) => a + m.dot.sw, 0), whiffs: mine.reduce((a, m) => a + m.dot.wh, 0),
  }
}

export type Outlier = { id: number; name: string; team: string; hand: 'R' | 'L'; hb: number; ivb: number; v: number; s: number; sw: number; rate: number | null; dist: number }
export type Outliers = {
  /** the average shape: every pitcher's average, weighted by how many of the pitch he throws */
  mean: { hb: number; ivb: number; velo: number; slot: number; pitchers: number }
  sd: { hb: number; ivb: number }
  /** the pitchers whose average shape is furthest from the mean, furthest first */
  outliers: Outlier[]
}

/**
 * The average shape and the pitchers furthest from it. Distance is in standard deviations of pitchers' average shapes (run and ride together, so a pitcher unusual in either counts); a pitcher is an
 * outlier from 2 standard deviations out, and at most `limit` are listed. Pitchers are the ones inside the speed and arm-angle ranges that are on. null with fewer than 10 pitchers: too few to call anyone unusual.
 */
export function outliersOf(dots: SpotDot[], q: Pick<SpotInput, 'vRange' | 'aRange'>, limit = 8, minDist = 2): Outliers | null {
  const pool = dots.filter(d => inFilters(d, q))
  const W = pool.reduce((a, d) => a + d.p, 0)
  if (pool.length < 10 || W <= 0) return null
  const m = (f: (d: SpotDot) => number) => pool.reduce((a, d) => a + f(d) * d.p, 0) / W
  const mean = { hb: m(d => d.hb), ivb: m(d => d.ivb), velo: m(d => d.v), slot: m(d => d.s), pitchers: pool.length }
  const sd = { hb: Math.sqrt(m(d => (d.hb - mean.hb) ** 2)) || 1, ivb: Math.sqrt(m(d => (d.ivb - mean.ivb) ** 2)) || 1 }
  const out = pool.map(d => ({ id: d.id, name: d.name, team: d.team, hand: d.hand, hb: d.hb, ivb: d.ivb, v: d.v, s: d.s, sw: d.sw, rate: d.sw > 0 ? d.wh / d.sw : null, dist: Math.hypot((d.hb - mean.hb) / sd.hb, (d.ivb - mean.ivb) / sd.ivb) }))
    .filter(o => o.dist >= minDist).sort((a, b) => b.dist - a.dist).slice(0, limit)
  return { mean, sd, outliers: out }
}
