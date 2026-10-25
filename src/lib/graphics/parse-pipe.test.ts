import { describe, expect, it } from 'vitest'
import { parseItemList, parsePipeList } from './parse-pipe'

describe('parsePipeList', () => {
  it('splits label, value and trailing sub', () => {
    const r = parsePipeList('Brewers chase rate 26.7% (lowest in MLB) | Martinez walk rate 3.6%')
    expect(r.errors).toEqual([])
    expect(r.stats).toEqual([
      { label: 'Brewers chase rate', value: '26.7%', sub: 'lowest in MLB' },
      { label: 'Martinez walk rate', value: '3.6%' },
    ])
  })
  it('keeps phrase values and signed numbers', () => {
    const r = parsePipeList('Rays steals 11 for 11 | Infield OAA −32 | Outfield OAA +38 | Sinker .336')
    expect(r.stats.map(s => s.value)).toEqual(['11 for 11', '−32', '+38', '.336'])
  })
  it('reports the index of a bad entry', () => {
    const r = parsePipeList('Walk rate 3.6% | no number here | 12 only')
    expect(r.stats).toHaveLength(1)
    expect(r.errors.map(e => e.index)).toEqual([1, 2])
  })
})

describe('parseItemList', () => {
  it('numbers entries in order', () => {
    expect(parseItemList('First thing (why) | Second thing')).toEqual([
      { label: 'First thing', value: '1', sub: 'why' },
      { label: 'Second thing', value: '2' },
    ])
  })
})
