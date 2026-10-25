// src/lib/canvas-font.ts
//
// Canvas `ctx.font` needs the LITERAL family name, and next/font hashes it
// (e.g. '__Red_Hat_Display_a1b2c3'), so a hard-coded 'Red Hat Display' silently
// falls back. Read the real name from the --font-redhat variable set in layout.tsx.

export const BRAND_FAMILY_FALLBACK = 'Red Hat Display'

export function brandFamily(): string {
  if (typeof document === 'undefined') return BRAND_FAMILY_FALLBACK
  const v = getComputedStyle(document.documentElement).getPropertyValue('--font-redhat')
  const first = v.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '')
  return first || BRAND_FAMILY_FALLBACK
}

/** One family site-wide: every slot (display/big/mono/body) is Red Hat Display. */
export const CANVAS_FONTS = {
  get display() { return brandFamily() },
  get big() { return brandFamily() },
  get mono() { return brandFamily() },
  get body() { return brandFamily() },
}
