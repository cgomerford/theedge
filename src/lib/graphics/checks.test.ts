import { describe, it, expect } from 'vitest'
import { checkGraphic, fillSnapshot } from './checks'
import type { GraphicSpec } from './types'

const spec = (over: Partial<GraphicSpec> = {}): GraphicSpec => ({ id: 'x', template: 'arsenal', kicker: 'Scout', title: 'Zack Wheeler, RHP', chips: [], stats: [{ group: 'pitch', label: 'Four-seam', value: '46%' }], ...over })

describe('checkGraphic', () => {
  it('flags tips and betting wording on the card or in the caption, without blocking', () => {
    const c = checkGraphic(spec({ subtitle: 'Our pick tonight' }), 'A lock for sure', null)
    expect(c.filter(x => x.id.startsWith('word-')).map(x => x.text).join(' ')).toMatch(/pick/)
    expect(c.every(x => x.level !== ('error' as string))).toBe(true)
  })
  it('reports clean wording as ok', () => {
    expect(checkGraphic(spec(), '', null).find(c => c.id === 'words')?.level).toBe('ok')
  })
  it('counts values changed by hand after a fill', () => {
    const base = spec()
    const snap = fillSnapshot(base)
    const edited = spec({ stats: [{ group: 'pitch', label: 'Four-seam', value: '52%' }] })
    expect(checkGraphic(edited, '', snap).find(c => c.id === 'edited')?.level).toBe('warn')
    expect(checkGraphic(base, '', snap).find(c => c.id === 'edited')?.level).toBe('ok')
  })
  it('warns about rows with no value and long headlines and captions', () => {
    const ids = checkGraphic(spec({ title: 'x'.repeat(60), stats: [{ group: 'pitch', label: 'A' }] }), 'y'.repeat(300), null).map(c => c.id)
    expect(ids).toEqual(expect.arrayContaining(['empty', 'long', 'cap']))
  })
})
