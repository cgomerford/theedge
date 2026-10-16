// src/components/admin/story/fonts.ts
//
// An export must never use fallback fonts. next/font hashes its family names,
// so we read the real family from the CSS variable on the canvas, then assert
// it is actually loaded before capturing.

/** First family in a font-family list: `'__Outfit_abc123', '__Outfit_Fallback_abc123'` → `__Outfit_abc123` */
export function firstFamily(value: string): string | null {
  const first = value.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '')
  return first ? first : null
}

export type FontFamilies = { sans: string; mono: string }

export function readFamilies(node: Element): FontFamilies {
  const cs = getComputedStyle(node)
  const sans = firstFamily(cs.getPropertyValue('--font-outfit'))
  const mono = firstFamily(cs.getPropertyValue('--font-jetbrains'))
  if (!sans || !mono) throw new Error('Story fonts not loaded (Outfit/JetBrains Mono) — export aborted')
  return { sans, mono }
}

export async function assertFontsLoaded(node: Element): Promise<FontFamilies> {
  await document.fonts.ready
  const fam = readFamilies(node)
  const loaded = new Set<string>()
  document.fonts.forEach(f => { if (f.status === 'loaded') loaded.add(firstFamily(f.family) ?? '') })
  const ok = loaded.has(fam.sans) && loaded.has(fam.mono)
    && document.fonts.check(`800 84px "${fam.sans}"`) && document.fonts.check(`400 34px "${fam.mono}"`)
  if (!ok) throw new Error('Story fonts not loaded (Outfit/JetBrains Mono) — export aborted')
  return fam
}
