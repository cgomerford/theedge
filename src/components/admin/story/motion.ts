// src/components/admin/story/motion.ts
//
// Pure easing helpers. Everything on screen is a function of time t (seconds);
// there are no CSS transitions or keyframes anywhere in story/.

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
export const easeOutCubic = (p: number) => 1 - Math.pow(1 - clamp(p), 3)
export const easeInOut = (p: number) => { const x = clamp(p); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2 }

/** 0..1 progress of an animation that starts at `start` and lasts `dur` seconds. */
export const prog = (t: number, start: number, dur: number) => (dur <= 0 ? (t >= start ? 1 : 0) : clamp((t - start) / dur))

/** Start time of the i-th item in a staggered sequence. */
export const stagger = (i: number, step: number, base = 0) => base + i * step

/** Count-up eased out (cubic); p is raw 0..1 progress. */
export const countUp = (v: number, p: number) => v * easeOutCubic(p)

/** Horizontal push eased in/out; p raw 0..1 → eased 0..1. */
export const push = (p: number) => easeInOut(p)

/** Seconds a segment spends building (buildFrac of its duration; 0.4 for every picker slide). */
export const buildEndOf = (dur: number, buildFrac = 0.4) => dur * buildFrac

/**
 * Start time of the i-th of n staggered reveals so that the LAST one has finished fading in by
 * `buildEnd` — nothing may still be moving once the hold begins.
 */
export function revealAt(i: number, n: number, buildEnd: number, fade = 0.25, first = 0.1): number {
  const span = Math.max(0, buildEnd - first - fade)
  return first + (n <= 1 ? 0 : (i * span) / (n - 1))
}
