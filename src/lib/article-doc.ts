// src/lib/article-doc.ts
//
// Helpers over the stored article document (Tiptap JSON): the text of every node (for the word check and read time), and the image and
// block counts the Checks tab reports. Pure functions, no Tiptap import, so server routes and the browser both use them.

import type { TiptapDoc } from '@/lib/articles'

export interface DocNode {
  type: string
  text?: string
  content?: DocNode[]
  attrs?: Record<string, unknown>
}

// An empty editor serialises as { type: 'doc' } with no content array, so every helper reads it as [].
const asNodes = (doc: TiptapDoc): DocNode[] => (doc.content ?? []) as unknown as DocNode[]

/** Every piece of reader-visible text, one block per line: paragraphs, captions, pull quotes, stat labels, table cells, card lines. */
export function docText(doc: TiptapDoc): string {
  const out: string[] = []
  const walk = (n: DocNode) => {
    if (n.type === 'text' && n.text) { out.push(n.text); return }
    const a = n.attrs ?? {}
    for (const k of ['caption', 'credit', 'alt', 'text', 'line', 'name']) if (typeof a[k] === 'string' && a[k]) out.push(a[k] as string)
    if (n.type === 'statRow' && Array.isArray(a.items)) for (const it of a.items as { value?: string; label?: string; sample?: string }[]) out.push(`${it.value ?? ''} ${it.label ?? ''} ${it.sample ?? ''}`)
    if (n.type === 'dataTable' && typeof a.rows === 'string') out.push(a.rows)
    if (n.type === 'gallery' && Array.isArray(a.images)) for (const im of a.images as { caption?: string; alt?: string }[]) out.push(`${im.caption ?? ''} ${im.alt ?? ''}`)
    n.content?.forEach(walk)
  }
  asNodes(doc).forEach(walk)
  return out.join('\n')
}

export function wordCount(doc: TiptapDoc): number {
  const t = docText(doc).trim()
  return t ? t.split(/\s+/).length : 0
}

/** About 230 words a minute for an adult reading analysis, never under one minute. */
export function readMinutes(doc: TiptapDoc): number {
  return Math.max(1, Math.round(wordCount(doc) / 230))
}

export interface ImageRef { src: string; alt: string; where: string }

/** Every image in the body (figures, gallery images, plain images), for the missing-alt check. */
export function docImages(doc: TiptapDoc): ImageRef[] {
  const out: ImageRef[] = []
  const walk = (n: DocNode) => {
    const a = n.attrs ?? {}
    if ((n.type === 'figure' || n.type === 'image') && typeof a.src === 'string') out.push({ src: a.src, alt: String(a.alt ?? ''), where: 'Image' })
    if (n.type === 'gallery' && Array.isArray(a.images)) (a.images as { src?: string; alt?: string }[]).forEach((im, i) => im.src && out.push({ src: im.src, alt: String(im.alt ?? ''), where: `Gallery image ${i + 1}` }))
    if (n.type === 'playerCard') { /* headshots carry the player name as their label */ }
    n.content?.forEach(walk)
  }
  asNodes(doc).forEach(walk)
  return out
}

/** True when the last paragraph or a source line mentions where the numbers came from. */
export function hasSourceLine(doc: TiptapDoc): boolean {
  return /\b(source|sources|statcast|baseball savant|mlb stats api|fangraphs data)\b/i.test(docText(doc))
}

/** Numbers like .231 or 34% or 3.20 in prose, versus a sample marker (n = 212, 212 pitches, over 600 PA). Used for the "every number has its sample" nudge. */
export function sampleMentions(doc: TiptapDoc): { numbers: number; samples: number } {
  const t = docText(doc)
  const numbers = (t.match(/(?:^|[\s(])(?:\.\d{2,3}|\d+(?:\.\d+)?%)/g) ?? []).length
  const samples = (t.match(/\bn\s*=\s*[\d,]+|\b[\d,]{2,}\s+(?:pitches|plate appearances|PA|batters faced|innings|IP|swings|balls in play|games|starts)\b/gi) ?? []).length
  return { numbers, samples }
}
