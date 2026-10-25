import { describe, expect, it } from 'vitest'
import { CAMERA, PLATE_Y, averagePath, pathFor, project, timeToPlate, tunnel, type StatcastPitch } from './trajectory'

// Real Statcast rows, gamePk 849805 (WS Game 1). plate_x / plate_z are the Savant values the maths must reproduce.
const ROWS = [
  { release_pos_x: -2.02, release_pos_y: 53.07, release_pos_z: 5.32, vx0: 6.3852, vy0: -150.5395, vz0: -1.5538, ax: -14.488, ay: 39.0691, az: -12.6409, plate_x: -0.549, plate_z: 4.0148 },
  { release_pos_x: -1.8, release_pos_y: 53.0, release_pos_z: 5.22, vx0: 9.5892, vy0: -149.9039, vz0: -4.2428, ax: -19.5317, ay: 38.7411, az: -11.4501, plate_x: 0.5419, plate_z: 3.0 },
  { release_pos_x: -0.09, release_pos_y: 53.93, release_pos_z: 6.58, vx0: 2.0405, vy0: -143.6487, vz0: -7.5775, ax: 0.195, ay: 35.7955, az: -8.9678, plate_x: 0.7122, plate_z: 3.0712 },
  { release_pos_x: -1.42, release_pos_y: 54.2, release_pos_z: 6.08, vx0: 6.4624, vy0: -110.9924, vz0: -2.2954, ax: -10.7265, ay: 21.7579, az: -30.2904, plate_x: 0.6798, plate_z: 1.668 },
]

describe('trajectory maths', () => {
  it('time to the front of the plate is about 0.34 s from the 50 ft frame for a 103 mph fastball', () => {
    const t = timeToPlate(ROWS[0] as StatcastPitch)!
    expect(t).toBeGreaterThan(0.31); expect(t).toBeLessThan(0.37)
  })
  it('lands within 0.15 ft of Statcast plate_x and plate_z', () => {
    for (const r of ROWS) {
      const p = pathFor(r as StatcastPitch)!
      expect(Math.abs(p.plate.x - r.plate_x)).toBeLessThan(0.15)
      expect(Math.abs(p.plate.z - r.plate_z)).toBeLessThan(0.15)
      expect(p.plate.y).toBeCloseTo(PLATE_Y, 3)
    }
  })
  it('starts at the release point and has 41 points', () => {
    const r = ROWS[0], p = pathFor(r as StatcastPitch, 40)!
    expect(p.points).toHaveLength(41)
    expect(p.release.x).toBeCloseTo(r.release_pos_x, 1); expect(p.release.z).toBeCloseTo(r.release_pos_z, 1)
    expect(p.release.y).toBeCloseTo(r.release_pos_y, 1)
  })
  it('returns null for a row with a missing field', () => {
    expect(pathFor({ ...ROWS[0], vy0: NaN } as StatcastPitch)).toBeNull()
  })
  it('projection: the plate is bigger than the release point and the zone centre sits near the image centre', () => {
    const rel = project({ x: 0, y: 53, z: 6 }), pl = project({ x: 0, y: PLATE_Y, z: 2.5 })
    expect(pl.scale).toBeGreaterThan(rel.scale)
    expect(pl.x).toBeCloseTo(CAMERA.cx, 5); expect(pl.y).toBeCloseTo(CAMERA.cy, 5)
  })
  it('averagePath and tunnel: identical paths are 0 inches apart; different paths are apart at the plate', () => {
    const a = pathFor(ROWS[0] as StatcastPitch)!, b = pathFor(ROWS[3] as StatcastPitch)!
    const avg = averagePath([a, a])!
    expect(tunnel(avg, a).apartInches).toBeCloseTo(0, 6)
    expect(tunnel(a, a).withinInchFt).not.toBeNull()
    expect(tunnel(a, b).apartInches).toBeGreaterThan(5)
  })
})
