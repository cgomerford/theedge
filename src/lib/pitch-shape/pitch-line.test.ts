import { describe, it, expect } from 'vitest'
import { movementPoints, pitchLine } from './pitch-line'
import type { RawPitch } from '@/lib/pitcher-pitch-log'

const base = { date: '2026-05-01', pitchType: 'FF', plateX: 0, plateZ: 2.5, zone: '5', velo: 95, result: 'ball', description: 'ball', isHit: false, balls: 0, strikes: 0, inning: 1, batterId: 1, onBase: { first: false, second: false, third: false }, gamePk: 1, atBatNumber: 1, pitchNumber: 1, releasePosX: -2, releasePosZ: 5.8, armAngle: 40, spinRate: 2300, extension: 6.5, traj: null, stand: 'R', topBot: 'T', woba: null, xwoba: null, wobaDen: null, exitVelo: null, pfx: [-0.7, 1.3] } as unknown as RawPitch
const p = (o: Partial<RawPitch>): RawPitch => ({ ...base, ...o } as RawPitch)

describe('pitchLine', () => {
  it('is null for a pitch he did not throw', () => expect(pitchLine([p({})], 'CH')).toBeNull())
  it('counts only that pitch type, with usage against all his pitches', () => {
    const l = pitchLine([p({}), p({}), p({ pitchType: 'SL' }), p({ pitchType: 'SL' })], 'FF', 4)!
    expect(l.pitches).toBe(2)
    expect(l.usage).toBe(0.5)
    expect(l.velo).toBe(95)
    expect(l.ivb).toBeCloseTo(15.6)
    expect(l.hb).toBeCloseTo(8.4)   // size of run, arm-side positive for either hand
  })
  it('swing and miss: whiffs per swing, called plus swinging strikes per pitch, chase on pitches outside the zone', () => {
    const l = pitchLine([
      p({ description: 'swinging_strike', result: 'swinging_strike', zone: '5' }), p({ description: 'foul', result: 'foul', zone: '5' }),
      p({ description: 'called_strike', result: 'called_strike', zone: '5' }), p({ description: 'swinging_strike', result: 'swinging_strike', zone: '12' }),
      p({ description: 'ball', result: 'ball', zone: '12' }),
    ], 'FF')!
    expect(l.swings).toBe(3)
    expect(l.whiffPct).toBeCloseTo(2 / 3)
    expect(l.cswPct).toBeCloseTo(3 / 5)
    expect(l.zonePct).toBeCloseTo(3 / 5)
    expect(l.chasePct).toBeCloseTo(1 / 2)
  })
  it('credits a plate appearance to the pitch that ended it: slash line, strikeouts, walks, home runs', () => {
    const l = pitchLine([
      p({ result: 'single', description: 'hit_into_play', exitVelo: 100, wobaDen: 1, woba: 0.9, xwoba: 0.7 }),
      p({ result: 'home_run', description: 'hit_into_play', exitVelo: 105, wobaDen: 1, woba: 2, xwoba: 1.8 }),
      p({ result: 'strikeout', description: 'swinging_strike', wobaDen: 1, woba: 0 }),
      p({ result: 'walk', description: 'ball', wobaDen: 1, woba: 0.7 }),
      p({ result: 'field_out', description: 'hit_into_play', exitVelo: 80, wobaDen: 1, woba: 0, xwoba: 0.1 }),
    ], 'FF')!
    expect([l.pa, l.ab, l.hits, l.hr, l.bb, l.k]).toEqual([5, 4, 2, 1, 1, 1])
    expect(l.avg).toBeCloseTo(0.5)
    expect(l.slg).toBeCloseTo(5 / 4)   // a single and a home run over four at-bats
    expect(l.obp).toBeCloseTo(3 / 5)
    expect(l.ops).toBeCloseTo(0.6 + 1.25)
    expect(l.kPct).toBeCloseTo(0.2)
    expect(l.bbPct).toBeCloseTo(0.2)
    expect(l.bbe).toBe(3)
    expect(l.hardHitPct).toBeCloseTo(2 / 3)
    expect(l.avgEv).toBeCloseTo((100 + 105 + 80) / 3)
    expect(l.woba).toBeCloseTo((0.9 + 2 + 0 + 0.7 + 0) / 5)
    expect(l.xwoba).toBeCloseTo((0.7 + 1.8 + 0 + 0.7 + 0.1) / 5)   // expected value on balls in play, actual on strikeouts and walks
  })
  it('leaves rates empty when there is nothing to divide', () => {
    const l = pitchLine([p({})], 'FF')!
    expect(l.avg).toBeNull()
    expect(l.whiffPct).toBeNull()
    expect(l.kPct).toBeNull()
  })
})

describe('movementPoints', () => {
  it('gives every pitch of the type as arm-side run and ride in inches, flipped for a right-hander', () => {
    const pts = movementPoints([p({ pfx: [-0.7, 1.3] }), p({ pfx: [-0.8, 1.2] }), p({ pitchType: 'SL', pfx: [0.5, 0] })], 'FF', 'R')
    expect(pts).toHaveLength(2)
    expect(pts[0][0]).toBeCloseTo(8.4)
    expect(pts[0][1]).toBeCloseTo(15.6)
  })
  it('keeps a left-hander as it is, and skips pitches with no tracked movement', () => {
    const pts = movementPoints([p({ pfx: [0.7, 1.3] }), p({ pfx: null })], 'FF', 'L')
    expect(pts).toHaveLength(1)
    expect(pts[0][0]).toBeCloseTo(8.4)
  })
})
