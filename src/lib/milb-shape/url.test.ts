import { describe, it, expect } from 'vitest'
import { applyShapeUrl, levelAfterKey, parseShapeUrl } from './url'
import { LEVELS, parseLevel, parseSeason } from './levels'

describe('parseShapeUrl', () => {
  it('reads every parameter the Lab writes', () => {
    expect(parseShapeUrl('?level=aaa&season=2026&pitch=SL&hand=L&window=all&radius=2&spitch=FF&shand=R&v=94.5&ride=16&run=9&arm=45')).toEqual({
      level: 'aaa', season: 2026, pitch: 'SL', hand: 'L', window: 'all', radius: 2, spitch: 'FF', shand: 'R', v: 94.5, ride: 16, run: 9, arm: 45,
    })
  })
  it('drops anything unrecognised so the Lab falls back to its own default', () => {
    expect(parseShapeUrl('?level=double-a&season=1999&pitch=fastball&hand=X&window=never&radius=7&v=500&arm=-4')).toEqual({})
    expect(parseShapeUrl('')).toEqual({})
  })
  it('level is MLB unless it is exactly one of the three', () => {
    expect(parseLevel('aaa')).toBe('aaa'); expect(parseLevel('fsl')).toBe('fsl'); expect(parseLevel('mlb')).toBe('mlb')
    for (const bad of ['AAA', 'Florida', 'milb', '', null, undefined, 3]) expect(parseLevel(bad)).toBe('mlb')
    expect(parseSeason('2026', 2026)).toBe(2026); expect(parseSeason('x', 2026)).toBe(2026); expect(parseSeason('1990', 2026)).toBe(2026)
  })
})

describe('the Refine choices in the address', () => {
  it('round-trip, and anything unrecognised is dropped', () => {
    const view = { level: 'aaa', rmlb: 'never', rres: 'struggled', rmov: 'traded-12', rcarry: 'minors-only', rver: 'behind', rrank: 70, rmin: 22, rmax: 27, rorg: 133 } as const
    expect(parseShapeUrl(applyShapeUrl('', view))).toEqual(view)
    expect(parseShapeUrl('?rmlb=maybe&rres=bad&rmov=x&rcarry=y&rver=z&rrank=3&rmin=2&rmax=99&rorg=5')).toEqual({})
  })
})

describe('applyShapeUrl: reload, share and back/forward', () => {
  it('writes a view and reads the same view back (a reload or a shared link restores it)', () => {
    const view = { level: 'fsl', season: 2026, pitch: 'FF', hand: 'L', v: 93.5, ride: 14.2, run: 11, arm: 38 } as const
    const qs = applyShapeUrl('', view)
    expect(parseShapeUrl(qs)).toEqual({ level: 'fsl', season: 2026, pitch: 'FF', hand: 'L', v: 93.5, ride: 14.2, run: 11, arm: 38 })
  })
  it('MLB is the default: it is not written, and removes an earlier level', () => {
    expect(applyShapeUrl('level=aaa&pitch=FF', { level: 'mlb' })).toBe('pitch=FF')
    expect(applyShapeUrl('', { level: 'mlb' })).toBe('')
  })
  it('keeps parameters it does not own, and undefined removes one', () => {
    expect(applyShapeUrl('utm_source=x&level=aaa', { pitch: 'FF' })).toBe('utm_source=x&level=aaa&pitch=FF')
    expect(applyShapeUrl('level=aaa&season=2026', { season: undefined })).toBe('level=aaa')
  })
  it('stepping back through a history of views restores each one exactly', () => {
    const steps = [{ level: 'mlb' as const, pitch: 'FF' }, { level: 'aaa' as const, pitch: 'FF' }, { level: 'fsl' as const, pitch: 'SL' }]
    const history: string[] = []
    let qs = ''
    for (const s of steps) { qs = applyShapeUrl(qs, s); history.push(qs) }
    const back = history.map(parseShapeUrl)
    expect(back.map(b => b.level ?? 'mlb')).toEqual(['mlb', 'aaa', 'fsl'])
    expect(back.map(b => b.pitch)).toEqual(['FF', 'FF', 'SL'])
  })
})

describe('level selector keyboard (a radio group)', () => {
  it('arrows move and wrap, Home and End jump, other keys do nothing', () => {
    expect(LEVELS).toEqual(['mlb', 'aaa', 'fsl', 'afl', 'st'])
    expect(levelAfterKey(LEVELS, 'mlb', 'ArrowRight')).toBe('aaa')
    expect(levelAfterKey(LEVELS, 'aaa', 'ArrowDown')).toBe('fsl')
    expect(levelAfterKey(LEVELS, 'fsl', 'ArrowRight')).toBe('afl')
    expect(levelAfterKey(LEVELS, 'st', 'ArrowRight')).toBe('mlb')
    expect(levelAfterKey(LEVELS, 'mlb', 'ArrowLeft')).toBe('st')
    expect(levelAfterKey(LEVELS, 'aaa', 'ArrowUp')).toBe('mlb')
    expect(levelAfterKey(LEVELS, 'aaa', 'Home')).toBe('mlb')
    expect(levelAfterKey(LEVELS, 'aaa', 'End')).toBe('st')
    expect(levelAfterKey(LEVELS, 'aaa', 'Tab')).toBeNull()
    expect(levelAfterKey(LEVELS, 'aaa', 'a')).toBeNull()
  })
})

describe('both hands', () => {
  it('the map accepts hand=B (left and right together); the sandbox hand stays a single arm', () => {
    expect(parseShapeUrl('?hand=B&shand=B')).toEqual({ hand: 'B' })
  })
})
