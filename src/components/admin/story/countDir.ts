// src/components/admin/story/countDir.ts
//
// Number motion that reads the right way: a cooling hitter's number falls from
// his peak, a heating one rises from his low, plain counts rise from 0, and
// "lower is better" values and timings never count at all.

import { easeOutCubic } from './motion'

export type CountKind = 'count' | 'heating' | 'cooling' | 'static'

export const tween = (from: number, to: number, p: number) => from + (to - from) * easeOutCubic(p)

export type CountSpec = { animate: boolean; from: (target: number, extreme?: number) => number }

export function countSpec(kind: CountKind): CountSpec {
  switch (kind) {
    case 'count': return { animate: true, from: () => 0 }
    case 'heating':
    case 'cooling': return { animate: true, from: (_t, extreme) => (extreme ?? 0) }
    default: return { animate: false, from: t => t }
  }
}

/** The value to draw at progress p. */
export function countValue(kind: CountKind, target: number, p: number, extreme?: number): number {
  const spec = countSpec(kind)
  return spec.animate ? tween(spec.from(target, extreme), target, p) : target
}
