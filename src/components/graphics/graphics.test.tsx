import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FOOTER_TEXT, HANDLE } from '@/lib/graphics/constants'
import { OTD_PRESETS } from '@/lib/graphics/otd-presets'
import { SCOUT_PRESETS as PRESETS } from '@/lib/graphics/presets'
import { validateSpec } from '@/lib/graphics/schema'
import type { SizeKey } from '@/lib/graphics/types'
import { BLOCKS } from './index'

const SIZE_KEYS: SizeKey[] = ['landscape', 'portrait']

describe('presets', () => {
  it('all six validate', () => {
    expect(PRESETS).toHaveLength(6)
    for (const p of PRESETS) expect(validateSpec(p), p.id).toMatchObject({ ok: true })
  })
  it('keeps the real minus sign', () => {
    expect(JSON.stringify(PRESETS[0])).toContain('−32')
  })
})

describe('schema', () => {
  it('rejects an empty title and zero stats', () => {
    expect(validateSpec({ ...PRESETS[0], title: '' }).ok).toBe(false)
    expect(validateSpec({ ...PRESETS[0], stats: [] }).ok).toBe(false)
  })
  it('rejects long labels outside the numbered list', () => {
    const s = { ...PRESETS[0], stats: [{ label: 'x'.repeat(61), value: '1' }] }
    expect(validateSpec(s).ok).toBe(false)
  })
})

describe('blocks', () => {
  for (const p of PRESETS) for (const size of SIZE_KEYS) {
    const html = renderToStaticMarkup(createElement(BLOCKS[p.template], { spec: p, size }))
    it(`${p.id} ${size}: footer present, no external requests`, () => {
      expect(html).toContain(FOOTER_TEXT)
      expect(html).toContain(HANDLE)
      expect(html).not.toContain('<img')
      expect(html).not.toMatch(/https?:/)
    })
  }
  it('cannot lose the footer through any spec field', () => {
    const html = renderToStaticMarkup(createElement(BLOCKS.textlist, { spec: { ...PRESETS[5], kicker: '', subtitle: '', chips: [] }, size: 'landscape' }))
    expect(html).toContain(FOOTER_TEXT)
  })
})

describe('images', () => {
  const images = { x9: 'data:image/png;base64,AAAA', 'team:TB': 'data:image/svg+xml;base64,AAAA', 'team:MIL': 'data:image/svg+xml;base64,AAAA', 'player:607259': 'data:image/png;base64,AAAA' }
  it('renders only data: URLs when images are supplied', () => {
    for (const p of PRESETS) {
      const html = renderToStaticMarkup(createElement(BLOCKS[p.template], { spec: p, size: 'landscape', images }))
      const srcs = [...html.matchAll(/src="([^"]*)"/g)].map(m => m[1])
      expect(srcs.length, p.id).toBeGreaterThan(0)
      for (const s of srcs) expect(s.startsWith('data:'), s).toBe(true)
    }
  })
})

describe('headshots on rows', () => {
  it('shows a round photo for a stat with a playerId and an empty ring without the image', () => {
    const withImg = renderToStaticMarkup(createElement(BLOCKS.collision, { spec: PRESETS[0], size: 'landscape', images: { 'player:607259': 'data:image/png;base64,AAAA' } }))
    expect(withImg).toContain('data:image/png;base64,AAAA')
    const without = renderToStaticMarkup(createElement(BLOCKS.collision, { spec: PRESETS[0], size: 'landscape' }))
    expect(without).not.toContain('<img')
    expect(without).toContain('border-radius:50%')
  })
})

describe('On this day presets', () => {
  it('are the seven week-1 cards, all valid, and draw no image at all', () => {
    expect(OTD_PRESETS.map(p => p.id)).toEqual(['2026-11-02-cubs-game7', '2026-11-03-brewers-cy-youngs', '2026-11-04-dbacks-game7', '2026-11-05-astros-pena', '2026-11-06-walter-johnson', '2026-11-07-gregg-olson', '2026-11-08-green-mondesi-trade'])
    for (const p of OTD_PRESETS) {
      expect(validateSpec(p), p.id).toMatchObject({ ok: true })
      for (const size of SIZE_KEYS) expect(renderToStaticMarkup(createElement(BLOCKS[p.template], { spec: p, size })), `${p.id} ${size}`).not.toMatch(/<img|src="/i)
    }
  })
})

// Every word and number in the seed data must reach the rendered card (compared case-insensitively: labels are drawn in capitals).
function seedStrings(p: (typeof OTD_PRESETS)[number]): string[] {
  const o = p.otd!, b = o.body
  const out: string[] = [p.title, p.subtitle ?? '', `ON THIS DAY · ${o.date}`]
  b.sections.forEach(s => {
    out.push(s.label)
    if (s.type === 'kv') s.rows.forEach(r => out.push(r.label, r.value))
    if (s.type === 'linescore') s.rows.forEach(r => out.push(r.team, r.total, ...r.runs.map(String)))
    if (s.type === 'timeline') s.points.forEach(q => out.push(q.date, q.label, q.detail ?? ''))
    if (s.type === 'vbars') { s.bars.forEach(q => out.push(q.label, q.display ?? String(q.value))); out.push(s.note ?? '', s.marker?.label ?? '') }
    if (s.type === 'hbars') s.rows.forEach(r => out.push(r.label, r.display))
    if (s.type === 'games') s.games.forEach(g => out.push(`GAME ${g.n}`, g.score, g.winner))
    if (s.type === 'trade') { s.groups.forEach(g => out.push(g.label, ...g.names)); out.push(s.note?.title ?? '', s.note?.value ?? '', s.note?.detail ?? '') }
    if (s.type === 'slash') out.push(s.line, s.caption, s.detail ?? '')
  })
  b.tiles?.forEach(t => out.push(t.label, t.value, t.detail ?? ''))
  return out.filter(Boolean)
}

describe('On this day cards carry every seed word and number', () => {
  for (const p of OTD_PRESETS) for (const size of SIZE_KEYS) {
    it(`${p.id} · ${size}`, () => {
      const html = renderToStaticMarkup(createElement(BLOCKS[p.template], { spec: p, size }))
      const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').toLowerCase()
      expect(seedStrings(p).filter(x => !text.includes(x.replace(/\s+/g, ' ').toLowerCase()))).toEqual([])
      expect(text).toContain('built on public game data. independent, not affiliated with mlb.')
      expect(text).toContain('@x9labhq')
    })
  }
})
