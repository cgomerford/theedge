// src/lib/graphics/otd-export.ts
//
// PNG export for the "On this day" and "Stat of the day" cards. The same helper serves the download button and the Session 6 render checks.
// It waits for the site font to finish loading first, so a PNG never falls back to a system font, then renders the exact-size node with html-to-image.
// Landscape is rendered at 2x (1200x675 logical, 2400x1350 pixels); portrait is 1080x1350 at 1x.

import { OTD_SIZES } from './constants'

export type OtdSize = keyof typeof OTD_SIZES

/** Resolves once the font used by `node` (800, 700 and 400) has loaded; false if the browser reports it did not. */
export async function waitForCardFont(node: HTMLElement): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return true
  const family = getComputedStyle(node).fontFamily
  await Promise.all(['800 46px', '700 15px', '400 17px'].map(f => document.fonts.load(`${f} ${family}`).catch(() => [])))
  await document.fonts.ready
  return ['800 46px', '700 15px', '400 17px'].every(f => document.fonts.check(`${f} ${family}`))
}

/** The card node as a PNG data URL at the size's export scale. Throws if the font did not load. */
export async function renderOtdPng(node: HTMLElement, size: OtdSize): Promise<string> {
  if (!(await waitForCardFont(node))) throw new Error('The card font did not load, so the PNG would use a fallback font. Reload and try again.')
  const { toPng } = await import('html-to-image')
  const { w, h, ratio } = OTD_SIZES[size]
  return toPng(node, { cacheBust: true, backgroundColor: '#FAF8F3', width: w, height: h, pixelRatio: ratio })
}

const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)

/** "2026-11-02-cubs-game7" style: a preset id that already starts with its post date is used as it is; otherwise today's date plus a slug of the headline. */
export function otdFileName(id: string, headline: string, today: Date = new Date()): string {
  if (/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(id)) return `${id}.png`
  const d = today.toLocaleDateString('en-CA')
  return `${d}-${slug(headline) || 'card'}.png`
}
