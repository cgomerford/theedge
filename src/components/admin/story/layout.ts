// src/components/admin/story/layout.ts
//
// The single source of geometry and type for the 9:16 story. Everything is a
// fixed px token; nothing is stretched to fill. Leftover space stays at the
// bottom of SAFE as breathing room.

export const FRAME = { w: 1080, h: 1920 }
/** Instagram safe area: all text lives inside it (width 950, height 1267). */
export const SAFE = { top: 269, bottom: 1536, left: 65, right: 1015 }
export const TYPE = { hook: 120, headline: 84, sub: 44, body: 40, label: 34, foot: 30, statNum: 72, heroNum: 120 }
// foot is the MINIMUM size; heroNum is the cap for any number
export const SPACE = { xs: 8, s: 12, m: 16, l: 24, xl: 32, xxl: 48 }
export const ROW = { stat: 96, bar: 56, grid: 60, lineup: 96, list: 52 }
export const PROGRESS = { y: 230, h: 8 }

export const SAFE_W = SAFE.right - SAFE.left                   // 950
export const SAFE_H = SAFE.bottom - SAFE.top                   // 1267
/** two equal columns, explicit px */
export const COL2 = (SAFE_W - SPACE.l) / 2                     // 463

export const KICKER_H = Math.ceil(TYPE.label * 1.1)
export const HEADLINE_H = Math.ceil(TYPE.headline * 1.02)
/** glyph boxes extend a few px above the line box; this keeps every text rect inside SAFE.top */
export const HEADER_INSET = 4
export const HEADER_H = HEADER_INSET + KICKER_H + SPACE.s + HEADLINE_H
export const BODY_TOP = SAFE.top + HEADER_H + SPACE.l
export const BODY_MAX_H = SAFE.bottom - BODY_TOP

/** Deterministic stack height (no DOM): sum of parts plus gaps between them. */
export function stackHeight(parts: number[], gap: number): number {
  if (parts.length === 0) return 0
  return parts.reduce((s, p) => s + p, 0) + gap * (parts.length - 1)
}

/** Top y for a block of height h centred vertically inside SAFE. */
export function centreInSafe(h: number): number {
  return SAFE.top + Math.max(0, Math.round((SAFE_H - h) / 2))
}

/** Foot sits directly under content, clamped so its last line ends ≤ SAFE.bottom. */
export function footTop(contentBottom: number, lines = 1): number {
  const h = Math.ceil(TYPE.foot * 1.25) * lines
  return Math.min(contentBottom + SPACE.m, SAFE.bottom - h)
}
