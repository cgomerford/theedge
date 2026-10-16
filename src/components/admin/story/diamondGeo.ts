// src/components/admin/story/diamondGeo.ts
//
// Pure geometry for the defense diamond. Square viewBox, one coordinate map for
// bases, mound and fielder tags, so nothing can be stretched. 90 ft = 300 units.

export const VIEW = 1000
export const HOME = { x: 500, y: 880 }
export const FIRST = { x: 712, y: 668 }
export const SECOND = { x: 500, y: 456 }
export const THIRD = { x: 288, y: 668 }
/** pitching rubber 60.5 ft from home toward second; mound radius 9 ft = 30 units */
export const MOUND = { x: 500, y: 678, r: 30 }

export type Pt = { x: number; y: number }

export const SPOTS: Record<string, Pt> = {
  CF: { x: 500, y: 190 }, LF: { x: 195, y: 320 }, RF: { x: 805, y: 320 },
  SS: { x: 330, y: 500 }, '2B': { x: 670, y: 500 },
  '3B': { x: 200, y: 640 }, '1B': { x: 800, y: 640 },
  C: { x: 500, y: 905 },
}

export function toPx(p: Pt, boxPx: number): Pt {
  return { x: (p.x * boxPx) / VIEW, y: (p.y * boxPx) / VIEW }
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
