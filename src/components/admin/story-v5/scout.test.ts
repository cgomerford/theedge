import { describe, expect, it } from 'vitest'
import { buildScout, type ScoutLike } from './scout'
import { BLOCK_TYPES, CONTENT_H, EMPTY_CUSTOM, customHeight, customReady, migrateCustom, newBlock, parseNumber } from './remotion/custom'

const catcher = (id: number, name: string, sb: number, cs: number, pop: number | null) => ({ id, name, sb, cs, strips: pop == null ? [] : [{ label: 'Pop time', value: pop }] })
const base: ScoutLike = {
  // away offence meets the HOME catcher, home offence meets the AWAY catcher
  run: { away: { catcher: catcher(1, 'William Contreras', 14, 6, 1.95), attemptsPerGame: 0.55 }, home: { catcher: catcher(2, 'Liam Hicks', 8, 1, 2.05), attemptsPerGame: 0.4 } },
  abs: { away: { challenges: 10, overturns: 4 }, home: null },
  late: { away: { hitting: [{ label: 'Late and close', pa: 120, ops: 0.71 }, { label: 'RISP', pa: 300, ops: null }], oneRun: { w: 20, l: 15 } }, home: null },
}

describe('buildScout', () => {
  const s = buildScout(base, { away: 139, home: 158 })
  it('puts each catcher on the club he plays for', () => {
    expect(s.run.map(r => [r.side, r.catcher, r.teamId])).toEqual([['away', 'Liam Hicks', 139], ['home', 'William Contreras', 158]])
  })
  it('caught stealing needs 10 tries, pop time is read from the strips, ABS only when there were challenges', () => {
    const home = s.run.find(r => r.side === 'home')!, away = s.run.find(r => r.side === 'away')!
    expect(home).toMatchObject({ pop: 1.95, csPct: 30, csOf: 20, attemptsPerGame: 0.55, abs: null })
    expect(away).toMatchObject({ pop: 2.05, csPct: null, csOf: null, abs: { challenges: 10, overturns: 4 } })
  })
  it('late and close keeps only rows with an OPS and skips a club with none', () => {
    expect(s.late).toHaveLength(1)
    expect(s.late[0]).toMatchObject({ side: 'away', rows: [{ label: 'Late and close', ops: 0.71, pa: 120 }], oneRun: { w: 20, l: 15 } })
  })
  it('returns empty lists, not zeros, when a desk had nothing', () => {
    expect(buildScout(null, { away: 1, home: 2 })).toEqual({ run: [], late: [] })
    expect(buildScout({ ...base, run: { away: { catcher: null, attemptsPerGame: null }, home: null } }, { away: 1, home: 2 }).run).toEqual([])
  })
})

describe('custom slide', () => {
  it('is available only when there are words or a block with something to show', () => {
    expect(customReady(EMPTY_CUSTOM)).toBe(false)
    expect(customReady({ ...EMPTY_CUSTOM, kicker: '  ' })).toBe(false)
    expect(customReady({ ...EMPTY_CUSTOM, headline: 'Hello' })).toBe(true)
    expect(customReady({ ...EMPTY_CUSTOM, blocks: [newBlock('number')] })).toBe(false)       // an empty number is left out
    expect(customReady({ ...EMPTY_CUSTOM, blocks: [{ ...newBlock('number'), value: '12' } as never] })).toBe(true)
    expect(customReady({ ...EMPTY_CUSTOM, blocks: [newBlock('logos')] })).toBe(true)          // logos, matchup, pitchers always have something
  })
  it('every block type can be added', () => {
    for (const t of BLOCK_TYPES) expect(newBlock(t.type).type).toBe(t.type)
  })
  it('an old saved slide (value, label, lines) becomes blocks', () => {
    const m = migrateCustom({ kicker: 'K', headline: 'H', value: '2', valueLabel: 'changeups', lines: ['a', '', 'b'] })
    expect(m.kicker).toBe('K')
    expect(m.blocks.map(b => b.type)).toEqual(['number', 'lines'])
    expect(m.blocks[1]).toMatchObject({ lines: ['a', 'b'] })
    expect(migrateCustom(null)).toEqual({ kicker: '', headline: '', blocks: [] })
  })
  it('estimates the space used so an overfull slide can be flagged', () => {
    const logos = { ...newBlock('logos'), size: 'l' } as never, match = newBlock('matchup'), cmp = { ...newBlock('compare'), rows: [{ label: 'a', away: '1', home: '2' }, { label: 'b', away: '3', home: '4' }, { label: 'c', away: '5', home: '6' }, { label: 'd', away: '7', home: '8' }] } as never
    expect(customHeight({ ...EMPTY_CUSTOM, blocks: [logos] })).toBeLessThan(CONTENT_H)
    expect(customHeight({ ...EMPTY_CUSTOM, blocks: [logos, match, cmp] })).toBeGreaterThan(CONTENT_H)
  })
  it('reads typed numbers with their sign and unit, and leaves words alone', () => {
    expect(parseNumber('+12%')).toEqual({ prefix: '+', num: 12, suffix: '%', decimals: 0 })
    expect(parseNumber('.253')).toEqual({ prefix: '', num: 0.253, suffix: '', decimals: 3 })
    expect(parseNumber('35.9%')).toMatchObject({ num: 35.9, suffix: '%', decimals: 1 })
    expect(parseNumber('1,250')).toMatchObject({ num: 1250 })
    expect(parseNumber('Cutter')).toBeNull()
    expect(parseNumber('2 of 7')).toBeNull()
  })
})
