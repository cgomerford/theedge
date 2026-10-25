// src/components/admin/story-v5/remotion/anim.tsx
//
// Motion helpers. sp: spring (stiffness 150, damping 12). ease: 0 to 1, ease-out cubic, clamped. Flip: text that flips up from
// rotateX(90deg), hinged at the bottom. Count: a number that counts up and then holds.

import type { CSSProperties, ReactNode } from 'react'
import { spring, useCurrentFrame } from 'remotion'
import { FPS } from './config'

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const sp = (frame: number, delay = 0): number => spring({ frame: frame - delay, fps: FPS, config: { stiffness: 150, damping: 12 } })
export const ease = (frame: number, a: number, b: number): number => { const t = clamp01((frame - a) / Math.max(1, b - a)); return 1 - Math.pow(1 - t, 3) }

export function Flip({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: CSSProperties }) {
  const frame = useCurrentFrame()
  const s = sp(frame, delay)
  const rot = 90 * (1 - Math.min(1, Math.max(0, s)))
  return (
    <div style={{ perspective: 800, ...style }}>
      <div style={{ transformOrigin: 'bottom', transform: `rotateX(${rot}deg)`, opacity: clamp01(s * 1.4) }}>{children}</div>
    </div>
  )
}

/** The number at this frame: 0 at `from`, `value` at `from + frames`, then held. */
export function useCount(value: number, from = 0, frames = 30): number {
  const frame = useCurrentFrame()
  return value * ease(frame, from, from + frames)
}
export function Count({ value, from = 0, frames = 30, fmt = (n: number) => String(Math.round(n)) }: { value: number; from?: number; frames?: number; fmt?: (n: number) => string }) {
  return <>{fmt(useCount(value, from, frames))}</>
}

/** ".253" style: three decimals, no leading zero. */
export const fmt3 = (n: number) => n.toFixed(3).replace(/^0/, '')
export const signed = (n: number) => (n > 0 ? `+${Math.round(n)}` : String(Math.round(n)))
