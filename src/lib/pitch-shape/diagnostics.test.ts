import { describe, it, expect } from 'vitest'
import { diagOf, leagueOf, type DiagRow } from './diagnostics'

const row = (o: Partial<DiagRow> = {}): DiagRow => ({ sd_hb: 2, sd_ivb: 1.5, n_taken: 100, n_gift: 5, n_miss: 4, n_pitches: 500, ...o })

describe('diagOf', () => {
  it('turns counts into rates, and leaves a missing count as null (never a guess)', () => {
    const d = diagOf(row({ n_loc: 400, n_zone: 200, n_heart: 40, n_ooz: 150, n_chase: 45, n_bbe: 80, xwoba_con_sum: '28', n_bbe_w: 80, woba_con_sum: 30 }))
    expect(d.zonePct).toBeCloseTo(0.5); expect(d.heartPct).toBeCloseTo(0.1); expect(d.chasePct).toBeCloseTo(0.3)
    expect(d.xwobaCon).toBeCloseTo(0.35); expect(d.wobaCon).toBeCloseTo(0.375)
    expect(d.giftPct).toBeCloseTo(0.05)
    const old = diagOf(row())
    expect(old.zonePct).toBeNull(); expect(old.chasePct).toBeNull(); expect(old.wobaCon).toBeNull()
  })
  it('falls back to the per-side xwOBA sums for contact quality when the new counts are not there yet', () => {
    const d = diagOf(row({ batter_sides: [{ bbe: 50, xwoba_sum: 17 }, { bbe: 30, xwoba_sum: 11 }] }))
    expect(d.nBbe).toBe(80); expect(d.xwobaCon).toBeCloseTo(0.35)
  })
})

describe('leagueOf', () => {
  it('pools the pitchers (bigger samples count for more) and is null where no row has the count', () => {
    const l = leagueOf([row({ n_loc: 100, n_zone: 50, n_ooz: 40, n_chase: 10 }), row({ n_loc: 300, n_zone: 180, n_ooz: 100, n_chase: 40 })])
    expect(l.zonePct).toBeCloseTo(230 / 400); expect(l.chasePct).toBeCloseTo(50 / 140)
    expect(leagueOf([row(), row()]).zonePct).toBeNull()
  })
})
