import { describe, it, expect } from 'vitest'
import { SIT_DEFAULT, SIT_OPTIONS, cleanSit, describeSit, savantParams } from './situations'

describe('team situations', () => {
  it('turns filters into Savant parameters, leaving out the unset ones', () => {
    expect(savantParams(SIT_DEFAULT)).toBe('&hfGT=R%7C')
    const q = savantParams({ ...SIT_DEFAULT, count: '2k', runners: 'risp', pitch: 'brk' })
    expect(q).toContain('&hfC=02%7C12%7C22%7C'); expect(q).toContain('&hfRO=5%7C'); expect(q).toContain('&hfPT=SL%7CST%7CCU%7CKC%7CSV%7CCS%7C')
  })
  it('drops anything that is not a listed option, so a request cannot add its own parameter', () => {
    const c = cleanSit({ count: '2k&hfSea=1999', outs: '2', runners: 5, bogus: 'x', gt: 'PO' })
    expect(c).toEqual({ ...SIT_DEFAULT, outs: '2', gt: 'PO' })
    expect(cleanSit(null)).toEqual(SIT_DEFAULT); expect(cleanSit('x')).toEqual(SIT_DEFAULT)
  })
  it('describes the situation in words', () => {
    expect(describeSit(SIT_DEFAULT)).toBe('')
    expect(describeSit({ ...SIT_DEFAULT, count: '2k', runners: 'risp' })).toBe('with two strikes, with runners in scoring position')
    expect(describeSit({ ...SIT_DEFAULT, pitch: 'fast', gt: 'PO' })).toBe('against fastballs, in the postseason')
  })
  it('every option has a unique id within its filter', () => {
    for (const k of Object.keys(SIT_OPTIONS) as (keyof typeof SIT_OPTIONS)[]) { const ids = SIT_OPTIONS[k].options.map(o => o.id); expect(new Set(ids).size).toBe(ids.length) }
  })
})
