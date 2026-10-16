// src/components/admin/story/fit.ts
//
// Deterministic shrink-to-fit. We cannot measure DOM text during an export
// (frames are rendered from a pure function of t), so widths are estimated
// from character count × an em factor, then the font shrinks down to a floor
// and finally wraps to extra lines. Never truncates with an ellipsis.

export type Fit = { size: number; lines: number }

/** widthEm: avg glyph width in em (Outfit 800 caps ≈ .62, mixed case ≈ .56, JetBrains Mono = .6). */
export function fitText(text: string, o: { maxWidth: number; maxSize: number; minSize: number; widthEm?: number }): Fit {
  const em = o.widthEm ?? 0.58
  const natural = text.length * em
  const size = Math.floor(Math.min(o.maxSize, o.maxWidth / Math.max(natural, 0.01)))
  if (size >= o.minSize) return { size, lines: 1 }
  return { size: o.minSize, lines: Math.max(2, Math.ceil((natural * o.minSize) / o.maxWidth)) }
}
