// src/lib/mlb/venueOutline.ts
//
// Converts venue_dimensions rows (angle_deg, wall_distance_ft) into an SVG
// path string — home plate to the wall, straight segments connecting each
// sourced point (no curve smoothing; a polygon of exactly what's measured,
// not an invented curve between measurements).
//
// Works for any number of points, so this is also ready for the day a
// specific park gets digitized from a real diagram with 10-20 vertices
// instead of 5 — same function, more points in, more accurate polygon out.

export interface VenuePoint {
  angle_deg: number     // -45 = LF Line ... 0 = CF ... +45 = RF Line
  wall_distance_ft: number
}

export interface OutlineOptions {
  scale?: number          // px per foot, default 0.5
  plateX?: number         // svg x of home plate, default 160
  plateY?: number         // svg y of home plate, default 270
}

interface XY { x: number; y: number }

function polarToXY(angleDeg: number, distFt: number, opts: Required<OutlineOptions>): XY {
  const a = (angleDeg * Math.PI) / 180
  const xFt = distFt * Math.sin(a)
  const yFt = distFt * Math.cos(a)
  return {
    x: opts.plateX + xFt * opts.scale,
    y: opts.plateY - yFt * opts.scale,
  }
}

/**
 * Builds an SVG path: home plate → straight foul line → straight segments
 * along the wall through every sourced point, in angle order → straight
 * foul line back to home plate → close.
 *
 * Points do not need to be pre-sorted or include exactly 5 — pass whatever
 * venue_dimensions returns for that venue_id.
 */
export function venueOutlinePath(points: VenuePoint[], options: OutlineOptions = {}): string {
  if (points.length < 2) {
    throw new Error('venueOutlinePath needs at least 2 points to draw a wall')
  }

  const opts: Required<OutlineOptions> = {
    scale: options.scale ?? 0.5,
    plateX: options.plateX ?? 160,
    plateY: options.plateY ?? 270,
  }

  const sorted = [...points].sort((a, b) => a.angle_deg - b.angle_deg)
  const xy = sorted.map(p => polarToXY(p.angle_deg, p.wall_distance_ft, opts))

  const plate = `${opts.plateX},${opts.plateY}`
  const segments = xy.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return `M ${plate} ${segments} L ${plate} Z`
}

/**
 * Convenience wrapper for the common two-venue overlay case (actual park vs
 * tonight's venue). Returns both paths using the same scale/origin so
 * they're directly comparable on one <svg>.
 */
export function venueOverlayPaths(
  actualPoints: VenuePoint[],
  targetPoints: VenuePoint[],
  options: OutlineOptions = {}
): { actual: string; target: string } {
  return {
    actual: venueOutlinePath(actualPoints, options),
    target: venueOutlinePath(targetPoints, options),
  }
}