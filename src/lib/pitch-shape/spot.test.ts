import { describe, it, expect } from 'vitest'
import { describeSpot, outliersOf, pitchersAtSpot, type SpotDot } from './spot'

// a pitcher's sample is 60 pitches: here a few at the spot (8, 16) and the rest elsewhere
const sample = (atSpot: number, other: [number, number] = [2, 12]): [number, number][] => [...Array.from({ length: atSpot }, () => [8, 16] as [number, number]), ...Array.from({ length: 60 - atSpot }, () => other)]
const dot = (id: number, hb: number, ivb: number, v: number, s: number, sw: number, wh: number, pts: [number, number][], p = 1000): SpotDot => ({ id, name: `P${id}`, team: 'XXX', hand: 'R', hb, ivb, v, s, sw, wh, p, pts })
const dots = [
  dot(1, 8, 16, 95, 40, 500, 90, sample(40)),       // 18%: at the league rate
  dot(2, 8.5, 16.5, 97, 45, 500, 150, sample(30)),  // 30%: well above
  dot(3, 7.6, 15.6, 93, 35, 500, 50, sample(20)),   // 10%: well below
  dot(4, 8, 16, 94, 38, 10, 5, sample(10)),         // too few swings to rate
  dot(5, 2, 12, 90, 30, 500, 80, sample(2)),        // average far away; only 2 of 60 pitches reach the spot: not counted
  dot(6, 14, 24, 99, 50, 500, 120, sample(0, [14, 24])), // never throws it there
]

describe('pitchers at a spot are found by where their PITCHES land, not by their average', () => {
  const q = { probe: { hb: 8, ivb: 16 }, leagueRate: 0.18, windowIn: 1, vRange: null, aRange: null, minSwings: 50 }
  it('counts a pitcher whose average is far away if enough of his sampled pitches land in the window', () => {
    const far = dot(7, 3, 12, 91, 31, 500, 80, sample(6), 1000)   // average (3, 12) is nowhere near, but 6 of 60 land at the spot
    const got = pitchersAtSpot([...dots, far], q).map(m => m.dot.id)
    expect(got).toContain(7)
    expect(got).not.toContain(5)   // only 2 of 60
    expect(got).not.toContain(6)   // none
  })
  it('lists the pitchers with the most of their pitches there first, with the share and a rough count', () => {
    const m = pitchersAtSpot(dots, q)
    expect(m.map(x => x.dot.id)).toEqual([1, 2, 3, 4])
    expect(m[0].share).toBeCloseTo(40 / 60, 6)
    expect(m[0].est).toBe(Math.round((40 / 60) * 1000))
  })
})

describe('describeSpot', () => {
  const q = { probe: { hb: 8, ivb: 16 }, leagueRate: 0.18, windowIn: 1, vRange: null, aRange: null, minSwings: 50 }
  it('counts and rates the pitchers', () => {
    const s = describeSpot(dots, q)
    expect(s.pitchers).toBe(4); expect(s.rated).toBe(3)
    expect([s.below, s.at, s.above]).toEqual([1, 1, 1])
    expect(s.swings).toBe(1510)
  })
  it('ranks the spot on ride and arm-side movement among all pitches thrown, and describes how they throw it', () => {
    const s = describeSpot(dots, q)
    expect(s.ridePct).toBeGreaterThan(0); expect(s.ridePct).toBeLessThan(100)
    expect(s.velo).toBeGreaterThan(93); expect(s.velo).toBeLessThan(98)
  })
  it('narrows to the speed and arm-angle ranges that are on', () => {
    expect(describeSpot(dots, { ...q, vRange: [88, 94] }).pitchers).toBe(2)   // the 93 and 94 mph pitchers
    expect(describeSpot(dots, { ...q, aRange: [0, 36] }).pitchers).toBe(1)    // the 35 degree pitcher
  })
  it('rates nobody when the league has too few swings, and finds nobody where nobody throws it', () => {
    expect(describeSpot(dots, { ...q, leagueRate: null }).rated).toBe(0)
    expect(describeSpot(dots, { ...q, probe: { hb: -10, ivb: 5 } }).pitchers).toBe(0)
  })
})

describe('outliersOf', () => {
  // twelve ordinary pitchers around (8, 16) and two far away
  const crowd = Array.from({ length: 12 }, (_, i) => dot(100 + i, 8 + (i % 3 - 1) * 0.3, 16 + (i % 4 - 1.5) * 0.3, 95, 40, 400, 80, sample(30)))
  const far = [dot(200, 14, 22, 98, 55, 400, 100, sample(0, [14, 22])), dot(201, 1, 9, 90, 20, 400, 60, sample(0, [1, 9]))]
  const q = { vRange: null, aRange: null }
  it('gives the average shape and the pitchers furthest from it, furthest first', () => {
    const o = outliersOf([...crowd, ...far], q)!
    expect(o.mean.hb).toBeGreaterThan(7); expect(o.mean.hb).toBeLessThan(9)
    expect(o.outliers.map(x => x.id).sort()).toEqual([200, 201])
    expect(o.outliers[0].dist).toBeGreaterThanOrEqual(o.outliers[1].dist)
  })
  it('names nobody when there are too few pitchers, or nobody is unusual', () => {
    expect(outliersOf(far, q)).toBeNull()
    expect(outliersOf(crowd, q)!.outliers.length).toBe(0)
  })
  it('only looks at pitchers inside the speed range that is on', () => {
    const o = outliersOf([...crowd, ...far], { vRange: [94, 96], aRange: null })!
    expect(o.mean.pitchers).toBe(12)
  })
})
