import { describe, expect, it } from 'vitest'
import { H, HP, PT, hitTypeLine, hitTypesRanked, type HitGame, type HitTypeGame, type PaRow, type PitGame } from './rolling'

const pa = (ev: string, over: Partial<PaRow> = {}): PaRow => ({
  n: 1, d: '2026-06-01', pk: 1, h: null, dn: null, ev, sw: 0, wh: 0, oz: 0, ozs: 0, x: null,
  ab: ['walk', 'intent_walk', 'hit_by_pitch', 'sac_bunt', 'sac_fly'].includes(ev) ? 0 : 1,
  hit: ['single', 'double', 'triple', 'home_run'].includes(ev) ? 1 : 0, bbe: null, ...over,
})
const rep = (ev: string, n: number) => Array.from({ length: n }, () => pa(ev))

describe('batting line over plate appearances', () => {
  // 10 singles, 5 doubles, 5 home runs, 10 outs, 5 walks, 5 strikeouts = 40 PA, 35 AB
  const rows = [...rep('single', 10), ...rep('double', 5), ...rep('home_run', 5), ...rep('field_out', 10), ...rep('walk', 5), ...rep('strikeout', 5)]
  it('computes AVG, OBP, SLG, OPS, ISO and HR from the events', () => {
    expect(H.ba(rows)).toBeCloseTo(20 / 35, 6)
    expect(H.obp(rows)).toBeCloseTo(25 / 40, 6)
    expect(H.slg(rows)).toBeCloseTo((10 + 10 + 20) / 35, 6)
    expect(H.ops(rows)).toBeCloseTo(25 / 40 + 40 / 35, 6)
    expect(H.iso(rows)).toBeCloseTo(40 / 35 - 20 / 35, 6)
    expect(H.hr(rows)).toBe(5)
  })
  it('leaves sacrifice bunts out of OBP and gives no value on a tiny sample', () => {
    expect(H.obp([...rep('single', 10), ...rep('field_out', 10), ...rep('sac_bunt', 5)])).toBeCloseTo(10 / 20, 6)
    expect(H.ba(rep('single', 4))).toBeNull()
    expect(H.obp(rep('single', 10))).toBeNull()
  })
  it('leaves strikeouts and home runs out of BABIP', () => {
    const r = [...rep('single', 8), ...rep('field_out', 12), ...rep('strikeout', 10), ...rep('home_run', 4)]
    expect(H.babip(r)).toBeCloseTo(8 / 20, 6)
  })
})

const t = (over: Partial<HitTypeGame>): HitTypeGame => ({ n: 0, sw: 0, wh: 0, oz: 0, ozs: 0, cs: 0, bbe: 0, hh: 0, brl: 0, evSum: 0, xwN: 0, xwSum: 0, pa: 0, ab: 0, h: 0, tb: 0, bb: 0, k: 0, hr: 0, ...over })
const g = (types: Record<string, HitTypeGame>, d = '2026-06-01'): HitGame => ({ pk: 1, d, types })

describe('pitch-specific hitter rates', () => {
  const games = [
    g({ FF: t({ n: 60, sw: 20, wh: 4, oz: 20, ozs: 6, bbe: 8, hh: 4, evSum: 700, xwN: 12, xwSum: 4.8, ab: 12, h: 4, tb: 7 }), SL: t({ n: 40, sw: 20, wh: 10, oz: 20, ozs: 10, bbe: 4, hh: 1, xwN: 6, xwSum: 1.2, ab: 6, h: 1, tb: 1 }) }),
  ]
  it('counts each pitch on its own', () => {
    expect(HP.whiff(games, 'FF')).toBeCloseTo(20, 6)
    expect(HP.whiff(games, 'SL')).toBeCloseTo(50, 6)
    expect(HP.chase(games, 'SL')).toBeCloseTo(50, 6)
    expect(HP.hardHit(games, 'FF')).toBeCloseTo(50, 6)
    expect(HP.xwoba(games, 'FF')).toBeCloseTo(0.4, 6)
    expect(HP.ba(games, 'FF')).toBeCloseTo(4 / 12, 6)
    expect(HP.slg(games, 'FF')).toBeCloseTo(7 / 12, 6)
    expect(HP.ev(games, 'FF')).toBeCloseTo(87.5, 6)
  })
  it('pools every pitch when no type is given and reports shares of the whole', () => {
    expect(HP.whiff(games, null)).toBeCloseTo(14 / 40 * 100, 6)
    expect(HP.usage(games, 'FF')).toBeCloseTo(60, 6)
  })
  it('gives null, not zero, when too little stands behind a rate', () => {
    expect(HP.hardHit(games, 'SL')).toBeNull()          // 4 tracked balls
    expect(HP.xwoba(games, 'SL')).toBeNull()            // 6 plate appearances
    expect(HP.whiff(games, 'CU')).toBeNull()            // never thrown
  })
  it('ranks the types he sees and builds a season line', () => {
    expect(hitTypesRanked(games)).toEqual(['FF', 'SL'])
    const l = hitTypeLine(games, 'FF')
    expect(l.share).toBeCloseTo(60, 6); expect(l.n).toBe(60); expect(l.slg).toBeCloseTo(7 / 12, 6)
  })
})

describe('pitch-specific pitcher rates', () => {
  const full = { n: 100, velo: 94, sw: 30, wh: 9, zin: 50, zn: 100, oz: 40, ozs: 12, bbe: 10, hh: 3, brl: 1, xwN: 20, xwSum: 6 }
  const games = [{ pk: 1, d: '2026-06-01', n: 100, types: { FF: full } } as unknown as PitGame]
  it('reads each measure from the counts', () => {
    expect(PT.velo(games, 'FF')).toBeCloseTo(94, 6)
    expect(PT.whiff(games, 'FF')).toBeCloseTo(30, 6)
    expect(PT.zone(games, 'FF')).toBeCloseTo(50, 6)
    expect(PT.chase(games, 'FF')).toBeCloseTo(30, 6)
    expect(PT.hardHit(games, 'FF')).toBeCloseTo(30, 6)
    expect(PT.xwoba(games, 'FF')).toBeCloseTo(0.3, 6)
    expect(PT.usage(games, 'FF')).toBeCloseTo(100, 6)
  })
  it('is null for a pitch he never threw', () => { expect(PT.whiff(games, 'CU')).toBeNull() })
})
