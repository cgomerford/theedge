import { describe, it, expect } from 'vitest'
import { CREATOR_SIZES, FOOTER_H, STARTS, checkCreator, emptyDoc, newStat, newText, parseDoc, resizeDoc, startDoc, docTexts, type CreatorSize } from './creator'

const SIZES = Object.keys(CREATOR_SIZES) as CreatorSize[]

describe('startDoc', () => {
  it('every starting layout fits inside every canvas and clear of the footer strip', () => {
    for (const s of STARTS) for (const size of SIZES) {
      const { w, h } = CREATOR_SIZES[size]
      for (const l of startDoc(s.id, size).layers) {
        expect(l.x, `${s.id}/${size} x`).toBeGreaterThanOrEqual(0)
        expect(l.y, `${s.id}/${size} y`).toBeGreaterThanOrEqual(0)
        expect(l.x + l.w, `${s.id}/${size} right`).toBeLessThanOrEqual(w)
        expect(l.y + l.h, `${s.id}/${size} bottom`).toBeLessThanOrEqual(h - FOOTER_H)
      }
    }
  })
})

describe('resizeDoc', () => {
  it('scales positions with the canvas and keeps text readable', () => {
    const d = { ...emptyDoc('landscape'), layers: [newText({ x: 120, y: 90, w: 600, h: 80, size: 60 })] }
    const r = resizeDoc(d, 'portrait')
    expect(r.size).toBe('portrait')
    expect(r.layers[0].x).toBe(Math.round(120 * 1080 / 1200))
    expect(r.layers[0].y).toBe(Math.round(90 * 1350 / 675))
    expect((r.layers[0] as { size: number }).size).toBeGreaterThanOrEqual(10)
  })
  it('round trip keeps a layer within a few pixels', () => {
    const d = { ...emptyDoc('landscape'), layers: [newStat({ x: 80, y: 260, w: 320, h: 170 })] }
    const back = resizeDoc(resizeDoc(d, 'story'), 'landscape')
    expect(Math.abs(back.layers[0].x - 80)).toBeLessThanOrEqual(2)
    expect(Math.abs(back.layers[0].y - 260)).toBeLessThanOrEqual(2)
  })
})

describe('checkCreator', () => {
  it('flags tips wording, off-canvas layers, footer overlap, tiny text and stats without a sample', () => {
    const d = { ...emptyDoc('landscape'), layers: [newText({ text: 'Our pick tonight', size: 14, x: 1100, w: 300 }), newStat({ sample: '', y: 640, h: 100 })] }
    const ids = checkCreator(d).filter(c => c.level === 'warn').map(c => c.id)
    expect(ids).toEqual(expect.arrayContaining(['word-pick', 'off', 'footer', 'tiny', 'sample']))
  })
  it('a clean document passes', () => {
    const d = startDoc('bigNumber', 'landscape')
    expect(checkCreator(d).filter(c => c.level === 'warn').map(c => c.id)).toEqual([])
  })
  it('reads text from every layer kind', () => {
    expect(docTexts(startDoc('list', 'landscape')).join(' ')).toContain('Four-seam')
  })
})

describe('parseDoc', () => {
  it('accepts a real document and rejects junk', () => {
    expect(parseDoc(startDoc('matchup', 'square'))).not.toBeNull()
    expect(parseDoc({ size: 'huge', layers: [], bg: {} })).toBeNull()
    expect(parseDoc({ size: 'square', bg: {}, layers: [{ kind: 'script', x: 0, y: 0, w: 1, h: 1 }] })).toBeNull()
    expect(parseDoc(null)).toBeNull()
  })
})

import { newPlayers, MAX_PLAYER_ROWS } from './creator'
describe('players list layer', () => {
  it('starts with real players and a sample on each row, and its text is read by the checks', () => {
    const d = startDoc('players', 'landscape')
    const l = d.layers.find(x => x.kind === 'players')!
    expect(l.kind).toBe('players')
    expect(docTexts(d).join(' ')).toContain('Bryce Harper')
    expect(checkCreator(d).filter(c => c.level === 'warn').map(c => c.id)).toEqual([])
    expect(parseDoc(d)).not.toBeNull()
  })
  it('warns about a number with no sample and a row with no player chosen', () => {
    const p = newPlayers({ rows: [{ playerId: 0, name: 'Someone', team: '', value: '.300', sub: '' }] })
    const ids = checkCreator({ ...emptyDoc('landscape'), layers: [p] }).filter(c => c.level === 'warn').map(c => c.id)
    expect(ids).toEqual(expect.arrayContaining(['psample', 'pheadshot']))
  })
  it('scales with the canvas like any layer and allows up to ten rows', () => {
    const r = resizeDoc({ ...emptyDoc('landscape'), layers: [newPlayers()] }, 'story')
    expect(r.layers[0].w).toBe(Math.round(1040 * 1080 / 1200))
    expect(MAX_PLAYER_ROWS).toBe(10)
  })
})
