// src/components/admin/story-v5/trajectory.ts
//
// Pure maths for the catcher-view pitch engine. No React, no I/O.
//
// Statcast gives each pitch a constant-acceleration fit in feet and seconds, defined in the y = 50 ft frame:
//   position(t) = p50 + v0 * t + 1/2 * a * t^2        (vx0, vy0, vz0, ax, ay, az)
// but release_pos_x/y/z is where the ball LEFT the hand (y is about 53 ft, not 50). So the y = 50 ft position is backed out of the
// release point first. Starting at the release point as if it were y = 50 is 0.22 ft off at the plate; this way is 0.07 ft median.
// Verified against Savant csv for gamePk 849805 (263 pitches): median 0.07 ft, p90 0.105 ft, max 0.15 ft vs plate_x / plate_z.

export type StatcastPitch = {
  release_pos_x: number; release_pos_y: number; release_pos_z: number
  vx0: number; vy0: number; vz0: number; ax: number; ay: number; az: number
}
export type P3 = { x: number; y: number; z: number }
/** Front of the plate, in feet: Statcast's plate_x / plate_z are measured here (17 inches). */
export const PLATE_Y = 17 / 12

/** Smallest positive root of 1/2 a t^2 + b t + c = 0, or null. */
function firstRoot(a: number, b: number, c: number): number | null {
  if (a === 0) return b === 0 ? null : (-c / b > 0 ? -c / b : null)
  const d = b * b - 4 * a * c
  if (d < 0) return null
  const s = Math.sqrt(d)
  const ts = [(-b - s) / (2 * a), (-b + s) / (2 * a)].filter(t => t > 0)
  return ts.length ? Math.min(...ts) : null
}

const finite = (...v: number[]) => v.every(Number.isFinite)
export const isPitchRow = (p: Partial<StatcastPitch>): p is StatcastPitch =>
  finite(p.release_pos_x ?? NaN, p.release_pos_y ?? NaN, p.release_pos_z ?? NaN, p.vx0 ?? NaN, p.vy0 ?? NaN, p.vz0 ?? NaN, p.ax ?? NaN, p.ay ?? NaN, p.az ?? NaN)

/** Position at time t (seconds after the y = 50 ft frame), given the backed-out y = 50 position. */
function at(p: StatcastPitch, p50: P3, t: number): P3 {
  return {
    x: p50.x + p.vx0 * t + 0.5 * p.ax * t * t,
    y: 50 + p.vy0 * t + 0.5 * p.ay * t * t,
    z: p50.z + p.vz0 * t + 0.5 * p.az * t * t,
  }
}

/** The y = 50 ft position, backed out from the release point (the ball is released a little before it crosses y = 50). */
function frame50(p: StatcastPitch): P3 {
  // y(t) = 50 + vy0 t + 1/2 ay t^2 = release_pos_y. The root nearest zero is the release time (negative: before the 50 ft frame).
  const a = 0.5 * p.ay, b = p.vy0, c = 50 - p.release_pos_y
  const d = b * b - 4 * a * c
  let tr = 0
  if (a !== 0 && d >= 0) {
    const r = [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)]
    tr = Math.abs(r[0]) < Math.abs(r[1]) ? r[0] : r[1]
  }
  return {
    x: p.release_pos_x - p.vx0 * tr - 0.5 * p.ax * tr * tr,
    y: 50,
    z: p.release_pos_z - p.vz0 * tr - 0.5 * p.az * tr * tr,
  }
}

export type Path = { points: P3[]; tPlate: number; plate: P3; release: P3 }

/** Time from the y = 50 frame to the front of the plate, seconds. Null when the row can't reach the plate. */
export function timeToPlate(p: StatcastPitch): number | null {
  return firstRoot(0.5 * p.ay, p.vy0, 50 - PLATE_Y)
}

/** n + 1 points from the release point to the front of the plate. Null for a row that is missing a field or never reaches the plate. */
export function pathFor(p: StatcastPitch, n = 40): Path | null {
  if (!isPitchRow(p)) return null
  const tp = timeToPlate(p)
  if (tp == null) return null
  const p50 = frame50(p)
  // release time (<= 0) to plate time, sampled evenly
  const a = 0.5 * p.ay, b = p.vy0, c = 50 - p.release_pos_y
  const d = b * b - 4 * a * c
  const r = a !== 0 && d >= 0 ? [(-b - Math.sqrt(d)) / (2 * a), (-b + Math.sqrt(d)) / (2 * a)] : [0]
  const t0 = r.reduce((m, x) => (Math.abs(x) < Math.abs(m) ? x : m), r[0])
  const points: P3[] = []
  for (let i = 0; i <= n; i++) points.push(at(p, p50, t0 + ((tp - t0) * i) / n))
  return { points, tPlate: tp, plate: points[n], release: points[0] }
}

/** Average several paths of the same pitch type point by point (all must be valid, same length). */
export function averagePath(paths: Path[]): Path | null {
  if (!paths.length) return null
  const n = paths[0].points.length
  const points: P3[] = Array.from({ length: n }, (_, i) => {
    const s = paths.reduce((a, p) => ({ x: a.x + p.points[i].x, y: a.y + p.points[i].y, z: a.z + p.points[i].z }), { x: 0, y: 0, z: 0 })
    return { x: s.x / paths.length, y: s.y / paths.length, z: s.z / paths.length }
  })
  return { points, tPlate: paths.reduce((a, p) => a + p.tPlate, 0) / paths.length, plate: points[n - 1], release: points[0] }
}

/** Minimum sample for a pitch type to be shown: fewer than this and the type is left out. */
export const MIN_PITCHES = 20

// ── catcher-view camera ───────────────────────────────────────────────────
export const CAMERA = { y: -5, z: 2.5, focal: 1700, cx: 540, cy: 580 }
export function project(p: P3): { x: number; y: number; scale: number } {
  const depth = p.y - CAMERA.y
  const scale = CAMERA.focal / depth
  return { x: CAMERA.cx + scale * p.x, y: CAMERA.cy - scale * (p.z - CAMERA.z), scale }
}

/** Distance in feet between two paths at the same index (same sampling). */
const gap = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.z - b.z)

/** Tunnel numbers for two average paths: the farthest-from-plate point (feet before the plate) where they are still within 1 inch,
 *  and their separation at the plate in inches. */
export function tunnel(a: Path, b: Path): { withinInchFt: number | null; apartInches: number } {
  const n = Math.min(a.points.length, b.points.length)
  let within: number | null = null
  for (let i = 0; i < n; i++) {
    if (gap(a.points[i], b.points[i]) * 12 <= 1) within = (a.points[i].y + b.points[i].y) / 2 - PLATE_Y
    else break
  }
  return { withinInchFt: within, apartInches: gap(a.plate, b.plate) * 12 }
}
