'use client'

// PNG capture for Pitching Desk cards (html-to-image, already in the stack).
// pixelRatio 2; anything marked data-no-export (the tool buttons) is left out of the picture;
// free viewers get a small the site domain footer appended for the capture only.

import { toPng } from 'html-to-image'
import { SITE_HOST } from '@/lib/site'

const slug = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** the-edge-{team}-{pitcher}-{card}.png */
export function cardFilename(team: string, pitcher: string, card: string): string {
  return `the-edge-${slug(team)}-${slug(pitcher)}-${slug(card)}.png`
}

export async function exportCard(node: HTMLElement, filename: string, addFooter: boolean): Promise<boolean> {
  let footer: HTMLElement | null = null
  try {
    if (addFooter) {
      footer = document.createElement('div')
      footer.textContent = `${SITE_HOST} · x9Lab`
      footer.style.cssText = 'font:600 10px var(--font-redhat), sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#a89e8c;text-align:right;padding-top:10px'
      node.appendChild(footer)
    }
    const url = await toPng(node, {
      pixelRatio: 2, backgroundColor: '#ffffff',
      filter: n => !(n instanceof HTMLElement && n.dataset.noExport !== undefined),
    })
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    return true
  } catch (e) {
    console.error('[exportCard]', filename, e)
    return false
  } finally {
    footer?.remove()
  }
}
