import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FOOTER_TEXT, HANDLE } from '@/lib/graphics/constants'
import { PRESETS } from '@/lib/graphics/presets'
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
