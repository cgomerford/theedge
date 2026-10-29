// src/lib/graphics/creator.ts
//
// Graphic Creator: the free-form design tool at /admin/creator (separate from Graphic Blocks, which fills fixed templates from the data).
// A document is a size, a background and a stack of layers placed on a canvas in design pixels. Everything here is pure (no DOM), so it is tested:
// resizing a document to another canvas, the starting layouts, the text the checks read, and the checks themselves.

import { lintProse } from '@/lib/banned-words'

export type CreatorSize = 'landscape' | 'portrait' | 'square' | 'story'
export const CREATOR_SIZES: Record<CreatorSize, { w: number; h: number; label: string }> = {
  landscape: { w: 1200, h: 675, label: 'X landscape 1200×675' },
  portrait: { w: 1080, h: 1350, label: 'X portrait 1080×1350' },
  square: { w: 1080, h: 1080, label: 'Square 1080×1080' },
  story: { w: 1080, h: 1920, label: 'Story 1080×1920' },
}
/** The footer strip (x9 mark and source line) is drawn on every export and cannot be removed; layers should stay above it. */
export const FOOTER_H = 64

export type Background = { kind: 'cream' | 'white' | 'dark' } | { kind: 'team'; team: string } | { kind: 'color'; color: string }

interface Base { id: string; x: number; y: number; w: number; h: number }
export interface TextLayer extends Base { kind: 'text'; text: string; size: number; weight: 400 | 700 | 800; color: string; align: 'left' | 'center' | 'right'; caps: boolean }
export interface ImageLayer extends Base { kind: 'image'; src: string; fit: 'cover' | 'contain'; radius: number; alt: string }
export interface HeadshotLayer extends Base { kind: 'headshot'; playerId: number; name: string }
export interface LogoLayer extends Base { kind: 'logo'; team: string }
export interface RectLayer extends Base { kind: 'rect'; color: string; radius: number }
export interface BarsLayer extends Base { kind: 'bars'; rows: { label: string; value: string; pct: number }[]; color: string }
export interface StatLayer extends Base { kind: 'stat'; value: string; label: string; sample: string; tone: 'light' | 'dark' | 'accent' }
export type Layer = TextLayer | ImageLayer | HeadshotLayer | LogoLayer | RectLayer | BarsLayer | StatLayer

export interface CreatorDoc { size: CreatorSize; bg: Background; layers: Layer[] }

export const INK = '#1A1A1A'
export const ORANGE = '#FF5722'
export const CREAM = '#FAF8F3'

let counter = 0
export const layerId = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`

export function emptyDoc(size: CreatorSize = 'landscape'): CreatorDoc { return { size, bg: { kind: 'cream' }, layers: [] } }

/** Moves a document to another canvas: every position and size scales with the canvas, text size with the width. */
export function resizeDoc(doc: CreatorDoc, to: CreatorSize): CreatorDoc {
  const a = CREATOR_SIZES[doc.size], b = CREATOR_SIZES[to]
  const sx = b.w / a.w, sy = b.h / a.h
  const r = (n: number) => Math.round(n)
  return {
    ...doc, size: to,
    layers: doc.layers.map(l => ({ ...l, x: r(l.x * sx), y: r(l.y * sy), w: r(l.w * sx), h: r(l.h * sy), ...(l.kind === 'text' ? { size: Math.max(10, r(l.size * Math.min(sx, sy + 0.0001) )) } : {}) }) as Layer),
  }
}

export function newText(p: Partial<TextLayer> = {}): TextLayer {
  return { id: layerId(), kind: 'text', x: 80, y: 80, w: 600, h: 80, text: 'Headline', size: 56, weight: 800, color: INK, align: 'left', caps: false, ...p }
}
export function newStat(p: Partial<StatLayer> = {}): StatLayer {
  return { id: layerId(), kind: 'stat', x: 80, y: 260, w: 320, h: 170, value: '.231', label: 'xwOBA against', sample: 'n = 212 pitches', tone: 'light', ...p }
}
export function newBars(p: Partial<BarsLayer> = {}): BarsLayer {
  return { id: layerId(), kind: 'bars', x: 80, y: 220, w: 700, h: 300, color: ORANGE, rows: [{ label: 'Four-seam', value: '46%', pct: 46 }, { label: 'Sweeper', value: '24%', pct: 24 }, { label: 'Sinker', value: '16%', pct: 16 }, { label: 'Curve', value: '9%', pct: 9 }, { label: 'Changeup', value: '5%', pct: 5 }], ...p }
}

export type StartId = 'blank' | 'bigNumber' | 'spotlight' | 'matchup' | 'list'
export const STARTS: { id: StartId; name: string; blurb: string }[] = [
  { id: 'blank', name: 'Blank', blurb: 'An empty canvas' },
  { id: 'bigNumber', name: 'One big number', blurb: 'A headline and one stat' },
  { id: 'spotlight', name: 'Player spotlight', blurb: 'Headshot and three stats' },
  { id: 'matchup', name: 'Matchup', blurb: 'Two logos, two stats' },
  { id: 'list', name: 'Ranked list', blurb: 'A title and five bars' },
]

/** A starting layout for any canvas size; coordinates come from the canvas so every size starts inside the footer line. */
export function startDoc(id: StartId, size: CreatorSize): CreatorDoc {
  const { w, h } = CREATOR_SIZES[size]
  const pad = Math.round(w * 0.07), top = Math.round(h * 0.09), inner = w - pad * 2, usable = h - FOOTER_H - top
  const doc = emptyDoc(size)
  const kicker = newText({ x: pad, y: top, w: inner, h: 28, text: 'Scout report', size: 22, weight: 800, color: ORANGE, caps: true })
  switch (id) {
    case 'blank': break
    case 'bigNumber':
      doc.layers = [kicker,
        newText({ x: pad, y: top + 44, w: inner, h: Math.round(h * 0.2), text: 'The headline goes here', size: Math.round(w * 0.05) }),
        newStat({ x: pad, y: top + Math.round(usable * 0.42), w: Math.round(inner * 0.6), h: Math.round(usable * 0.4), value: '.231', label: 'xwOBA against', sample: 'n = 212 pitches', tone: 'accent' })]
      break
    case 'spotlight': {
      const tile = Math.round((inner - 40) / 3)
      doc.layers = [kicker,
        { id: layerId(), kind: 'headshot', playerId: 0, name: '', x: pad, y: top + 40, w: Math.round(h * 0.2), h: Math.round(h * 0.2) },
        newText({ x: pad + Math.round(h * 0.22), y: top + 50, w: inner - Math.round(h * 0.22), h: 70, text: 'Player name', size: Math.round(w * 0.05) }),
        ...[0, 1, 2].map(i => newStat({ x: pad + i * (tile + 20), y: top + Math.round(usable * 0.55), w: tile, h: Math.round(usable * 0.3), value: ['.865', '29', '107'][i], label: ['OPS', 'Home runs', 'Walks'][i], sample: 'n = 693 PA' }))]
      break
    }
    case 'matchup': {
      const logo = Math.round(Math.min(w, h) * 0.2)
      doc.layers = [kicker,
        { id: layerId(), kind: 'logo', team: 'PHI', x: pad, y: top + 50, w: logo, h: logo },
        newText({ x: Math.round(w / 2) - 40, y: top + 50 + Math.round(logo / 2) - 30, w: 80, h: 60, text: 'at', size: 36, weight: 700, align: 'center', color: '#8a8275' }),
        { id: layerId(), kind: 'logo', team: 'LAD', x: w - pad - logo, y: top + 50, w: logo, h: logo },
        newStat({ x: pad, y: top + 60 + logo + 30, w: Math.round(inner / 2) - 12, h: Math.round(usable * 0.3), value: '.231', label: 'Wheeler, xwOBA against', sample: 'n = 212 pitches' }),
        newStat({ x: pad + Math.round(inner / 2) + 12, y: top + 60 + logo + 30, w: Math.round(inner / 2) - 12, h: Math.round(usable * 0.3), value: '.305', label: 'Yamamoto, xwOBA against', sample: 'n = 198 pitches' })]
      break
    }
    case 'list':
      doc.layers = [kicker,
        newText({ x: pad, y: top + 40, w: inner, h: 70, text: 'Pitch mix, 2026', size: Math.round(w * 0.045) }),
        newBars({ x: pad, y: top + 130, w: inner, h: Math.round(usable * 0.65) })]
      break
  }
  return doc
}

/** Every piece of text a reader sees on the canvas. */
export function docTexts(doc: CreatorDoc): string[] {
  const out: string[] = []
  for (const l of doc.layers) {
    if (l.kind === 'text') out.push(l.text)
    else if (l.kind === 'stat') out.push(l.value, l.label, l.sample)
    else if (l.kind === 'bars') for (const r of l.rows) out.push(r.label, r.value)
    else if (l.kind === 'image') out.push(l.alt)
    else if (l.kind === 'headshot') out.push(l.name)
  }
  return out.filter(Boolean)
}

export interface CreatorCheck { id: string; level: 'ok' | 'warn'; text: string; detail?: string }

export function checkCreator(doc: CreatorDoc, caption = ''): CreatorCheck[] {
  const out: CreatorCheck[] = []
  const { w, h } = CREATOR_SIZES[doc.size]
  const seen = new Set<string>()
  for (const t of [...docTexts(doc), caption]) for (const hit of lintProse(t)) {
    const k = hit.word.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ id: `word-${k}`, level: 'warn', text: `Flagged word: "${hit.word}"`, detail: `…${hit.context}…` })
  }
  if (!seen.size) out.push({ id: 'words', level: 'ok', text: 'No betting, prediction or fantasy-advice wording' })

  const off = doc.layers.filter(l => l.x < 0 || l.y < 0 || l.x + l.w > w || l.y + l.h > h)
  out.push(off.length ? { id: 'off', level: 'warn', text: `${off.length} layer${off.length === 1 ? ' runs' : 's run'} off the canvas` } : { id: 'off', level: 'ok', text: 'Everything is inside the canvas' })
  const low = doc.layers.filter(l => l.kind !== 'rect' && l.y + l.h > h - FOOTER_H)
  if (low.length) out.push({ id: 'footer', level: 'warn', text: `${low.length} layer${low.length === 1 ? ' overlaps' : 's overlap'} the footer strip`, detail: 'The x9 mark and source line fill the bottom 64 px.' })
  const tiny = doc.layers.filter((l): l is TextLayer => l.kind === 'text' && l.size < 22)
  if (tiny.length) out.push({ id: 'tiny', level: 'warn', text: `${tiny.length} text layer${tiny.length === 1 ? ' is' : 's are'} under 22 px`, detail: 'Hard to read once X shrinks the picture on a phone.' })
  const noSample = doc.layers.filter((l): l is StatLayer => l.kind === 'stat' && !l.sample.trim())
  if (noSample.length) out.push({ id: 'sample', level: 'warn', text: `${noSample.length} stat${noSample.length === 1 ? ' has' : 's have'} no sample`, detail: 'Put the sample beside the number, e.g. "n = 212 pitches".' })
  const noAlt = doc.layers.filter(l => l.kind === 'image' && !l.alt.trim())
  if (noAlt.length) out.push({ id: 'alt', level: 'warn', text: `${noAlt.length} image${noAlt.length === 1 ? ' has' : 's have'} no description`, detail: 'Used as the alt text when the graphic is posted.' })
  const empty = doc.layers.filter(l => (l.kind === 'headshot' && !l.playerId) || (l.kind === 'image' && !l.src))
  if (empty.length) out.push({ id: 'empty', level: 'warn', text: `${empty.length} picture slot${empty.length === 1 ? ' is' : 's are'} empty` })
  if (!doc.layers.length) out.push({ id: 'blank', level: 'warn', text: 'The canvas is empty' })
  return out
}

/** A stored document from the library, checked before it is trusted. Returns null if it is not a creator document. */
export function parseDoc(raw: unknown): CreatorDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<CreatorDoc>
  if (!d.size || !(d.size in CREATOR_SIZES) || !Array.isArray(d.layers) || !d.bg || typeof d.bg !== 'object') return null
  const kinds = new Set(['text', 'image', 'headshot', 'logo', 'rect', 'bars', 'stat'])
  if (d.layers.length > 80 || !d.layers.every(l => l && typeof l === 'object' && kinds.has((l as Layer).kind) && ['x', 'y', 'w', 'h'].every(k => Number.isFinite((l as unknown as Record<string, number>)[k])))) return null
  return d as CreatorDoc
}
