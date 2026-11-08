import { describe, it, expect } from 'vitest'
import { closestShapes, shapeDistance, type MlbShape } from './closest'

const m = (id: number, velo: number, ivb: number, hb: number, slot: number, nPitches = 1000): MlbShape => ({ pitcherId: id, name: `P${id}`, teamAbbr: 'XXX', nPitches, velo, ivb, hb, slot })

describe('Closest MLB shape: physical shape only', () => {
  it('ranks by distance in the sandbox\'s standard-deviation units, nearest first', () => {
    const target = { velo: 95, ivb: 16, hb: 9, slot: 40 }
    const out = closestShapes(target, [m(1, 95, 16, 9, 40), m(2, 93, 16, 9, 40), m(3, 95, 12, 9, 40), m(4, 88, 8, 14, 60)], 3)
    expect(out.map(o => o.pitcherId)).toEqual([1, 2, 3])
    expect(out[0].distance).toBe(0)
    expect(out[1].distance).toBeCloseTo(2 / 1.6, 6)
  })
  it('does not depend on input order, and breaks ties by pitch count then id', () => {
    const t = { velo: 94, ivb: 15, hb: 8, slot: 35 }
    const a = [m(5, 94, 15, 8, 35, 500), m(2, 94, 15, 8, 35, 900), m(9, 94, 15, 8, 35, 900)]
    expect(closestShapes(t, a, 3).map(x => x.pitcherId)).toEqual([2, 9, 5])
    expect(closestShapes(t, [...a].reverse(), 3).map(x => x.pitcherId)).toEqual([2, 9, 5])
  })
  it('carries no outcome: the result has shape, name, team and pitch count only', () => {
    const out = closestShapes({ velo: 94, ivb: 15, hb: 8, slot: 35 }, [m(1, 94, 15, 8, 35)], 1)[0] as unknown as Record<string, unknown>
    expect(Object.keys(out).sort()).toEqual(['distance', 'hb', 'ivb', 'nPitches', 'name', 'pitcherId', 'slot', 'teamAbbr', 'velo'])
  })
  it('distance is symmetric and zero for the same shape', () => {
    const a = { velo: 91, ivb: 10, hb: 12, slot: 50 }, b = { velo: 93, ivb: 14, hb: 9, slot: 38 }
    expect(shapeDistance(a, b)).toBeCloseTo(shapeDistance(b, a), 10); expect(shapeDistance(a, a)).toBe(0)
  })
})
