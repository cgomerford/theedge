// src/lib/sequencing-lab/flight.ts
//
// Pure maths (no database, no browser): draws one pitch from the numbers the league finder returns (release point, extension, speed, where it crossed the plate, measured break).
// The two ends are measured. The curve between them is the constant-force path that joins them: the ball leaves aimed against its break and the break bends it back,
// so the bow in the middle is the measured break (feet, as Statcast stores it) with gravity's share taken off the height. Time is the distance over the average speed.
// Coordinates match PitchFlight.tsx: x across the plate from the catcher's side, y from the plate (0) out to the mound, z is height, all in feet.

import type { PitchPath } from '@/components/pitching-lab/PitchFlight'

const PLATE_Y = 17 / 12
const FPS = 1.46667            // feet per second in one mph
const AVG_OF_RELEASE = 0.93    // a pitch loses about 7% of its speed on the way to the plate
const G = 32.174

export type FinderStats = {
  plateX: number; plateZ: number; relX: number; relZ: number; ext: number
  speed: number; spin: number | null; hb: number; ivb: number
  /** Arm-side break flips Statcast's catcher-view pfx_x for a right-hander, so the hand is needed to turn it back. */
  hand: 'R' | 'L'
}

export function buildFlight(type: string, name: string, s: FinderStats, n: number): PitchPath | null {
  const vals = [s.plateX, s.plateZ, s.relX, s.relZ, s.ext, s.speed, s.hb, s.ivb]
  if (vals.some(v => !Number.isFinite(v)) || s.speed <= 0) return null
  const y0 = 60.5 - s.ext
  const dist = y0 - PLATE_Y
  const T = dist / (s.speed * FPS * AVG_OF_RELEASE)
  const pfxX = ((s.hand === 'R' ? -1 : 1) * s.hb) / 12
  const pfxZ = s.ivb / 12
  const gDrop = 0.5 * G * T * T
  const pts = Array.from({ length: 61 }, (_, i) => {
    const u = i / 60
    const bow = u * (1 - u)
    return {
      x: s.relX + (s.plateX - s.relX) * u - pfxX * bow,
      y: y0 + (PLATE_Y - y0) * u,
      z: s.relZ + (s.plateZ - s.relZ) * u - (pfxZ - gDrop) * bow,
    }
  })
  return { type, name, n, share: 1, pts, T, release: pts[0], plate: pts[60], velo: s.speed, spin: s.spin, ext: s.ext, hb: s.hb, ivb: s.ivb }
}
