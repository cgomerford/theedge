// src/components/admin/story/arsenalAnim.ts
//
// Pure plan for the animated strike zone (Statcast-arsenal style). Every ball is a
// real share of the pitcher's pitch mix: the number of balls per pitch follows its
// usage, and each ball lands in a zone cell drawn from that pitch's own per-zone
// usage (pitcher_zone_arsenal, in-zone cells 1–9, catcher's view, 1 = top-left).
// A function of t only: nothing here keeps state, so the hold is a still frame.

import { easeOutCubic } from './motion'

export const ZONE_W_IN = 17          // rule-book zone width
export const BALL_R_IN = 1.45        // ball radius, to scale
export const MAX_BALLS = 20
export const RELEASE = { x: 0, y: -1.5 }      // inches in zone space (y down): above the top of the zone

export type PlanPitch = { code: string; color: string; usagePct: number | null; velo: number | null; zones: number[] | null }
export type Ball = { code: string; color: string; zone: number; x: number; y: number; launch: number; flight: number }

/** Stable 0..1 hash (no Math.random: a frame at time t must always look the same). */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Largest-remainder split of `n` balls over weights. */
export function allocate(weights: number[], n: number): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0)
  if (total <= 0 || n <= 0) return weights.map(() => 0)
  const raw = weights.map(w => (Math.max(0, w) / total) * n)
  const out = raw.map(Math.floor)
  let left = n - out.reduce((s, v) => s + v, 0)
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f)
  for (const o of order) { if (left <= 0) break; out[o.i] += 1; left -= 1 }
  return out
}

/** Cell → centre-relative inch bounds. zh = rule-book zone height in inches. */
export function cellBounds(zone: number, zh: number) {
  const col = (zone - 1) % 3, row = Math.floor((zone - 1) / 3)
  const cw = ZONE_W_IN / 3, ch = zh / 3
  return { x0: -ZONE_W_IN / 2 + col * cw, y0: row * ch, cw, ch }
}

export function flightFor(velo: number | null): number {
  const v = velo && velo > 60 ? velo : 90
  return Math.min(0.42, Math.max(0.26, 0.3 * (95 / v)))       // slower pitches take longer to arrive
}

/**
 * pitches → balls with deterministic landing spots and launch times such that the LAST ball has
 * landed by `buildEnd` (so the hold afterwards is perfectly still).
 */
export function planBalls(pitches: PlanPitch[], zh: number, buildEnd: number, total = MAX_BALLS): Ball[] {
  const usable = pitches.filter(p => p.zones && p.zones.some(z => z > 0) && (p.usagePct ?? 0) > 0)
  if (usable.length === 0) return []
  const counts = allocate(usable.map(p => p.usagePct as number), total).map((c, i) => (c === 0 && (usable[i].usagePct ?? 0) >= 3 ? 1 : c))
  const perType: Ball[][] = usable.map((p, ti) => {
    const zoneCounts = allocate(p.zones as number[], counts[ti])
    const balls: Ball[] = []
    zoneCounts.forEach((c, zi) => {
      for (let k = 0; k < c; k++) {
        const seed = ti * 1000 + zi * 50 + k
        const b = cellBounds(zi + 1, zh)
        balls.push({
          code: p.code, color: p.color, zone: zi + 1,
          x: b.x0 + b.cw * (0.2 + 0.6 * hash(seed)), y: b.y0 + b.ch * (0.2 + 0.6 * hash(seed + 0.5)),
          launch: 0, flight: flightFor(p.velo),
        })
      }
    })
    return balls.sort((a, c) => hash(a.x * 7 + a.y) - hash(c.x * 7 + c.y))
  })
  // round-robin across pitch types so the mix reads like a real at-bat sequence
  const seq: Ball[] = []
  for (let i = 0; perType.some(t => i < t.length); i++) for (const t of perType) if (i < t.length) seq.push(t[i])
  const first = 0.1
  const maxFlight = Math.max(...seq.map(b => b.flight))
  const step = seq.length > 1 ? Math.max(0.02, (buildEnd - first - maxFlight) / (seq.length - 1)) : 0
  return seq.map((b, i) => ({ ...b, launch: first + i * step }))
}

export type BallState = { visible: boolean; landed: boolean; cx: number; cy: number; r: number; opacity: number }

export function ballAt(b: Ball, t: number): BallState {
  if (t < b.launch) return { visible: false, landed: false, cx: RELEASE.x, cy: RELEASE.y, r: 0.3, opacity: 0 }
  const p = Math.min(1, (t - b.launch) / b.flight)
  if (p >= 1) return { visible: true, landed: true, cx: b.x, cy: b.y, r: BALL_R_IN, opacity: 0.9 }
  const e = p * p                                               // accelerates toward the plate
  return {
    visible: true, landed: false,
    cx: RELEASE.x + (b.x - RELEASE.x) * e, cy: RELEASE.y + (b.y - RELEASE.y) * e,
    r: 0.35 + (BALL_R_IN - 0.35) * easeOutCubic(p), opacity: 0.55 + 0.4 * p,
  }
}
