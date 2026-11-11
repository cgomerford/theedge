import { describe, it, expect } from 'vitest'
import { headshotChain } from './mlb-assets'

describe('headshotChain', () => {
  it('MLB-level players try the cutout first, then the standard headshot, then the MiLB photo', () => {
    const c = headshotChain(592450, 240)
    expect(c).toHaveLength(3)
    expect(c[0]).toMatch(/\/592450\/headshot\/silo\/current$/)
    expect(c[1]).toMatch(/\/headshot\/67\/current$/)
    expect(c[2]).toMatch(/\/headshot\/milb\/current$/)
  })
  it('minor-league players lead with the standard headshot and the MiLB photo, and keep the cutout last', () => {
    const c = headshotChain(683332, 240, true)
    expect(c.map(u => u.split('/headshot/')[1])).toEqual(['67/current', 'milb/current', 'silo/current'])
  })
  it('carries the width, and no generic default (a missing photo must be a 404 so the next address is tried)', () => {
    for (const u of headshotChain(1, 160, true)) {
      expect(u).toContain('w_160,')
      expect(u).not.toContain('d_people:generic')
    }
  })
})
