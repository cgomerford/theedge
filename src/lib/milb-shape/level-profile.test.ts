import { describe, it, expect } from 'vitest'
import { cellOf, countState, GRID, nextShares, profileOf } from './level-profile'
import type { RawPitch } from '@/lib/pitcher-pitch-log'

let seq = 0
const p = (o: Partial<RawPitch> & { pitchType: string }): RawPitch => ({
  date: '2026-08-01', plateX: 0, plateZ: 2.5, zone: '5', velo: 94, result: 'ball', description: 'ball', isHit: false, balls: 0, strikes: 0, inning: 1, batterId: 1, onBase: { first: false, second: false, third: false },
  gamePk: 1, atBatNumber: 1, pitchNumber: ++seq, releasePosX: -2, releasePosZ: 5.9, armAngle: 40, spinRate: 2200, extension: 6.4, traj: null, pfx: [-0.7, 1.3], stand: 'R', topBot: 'T',
  woba: null, xwoba: null, wobaDen: null, exitVelo: null, effectiveSpeed: null, ...o,
})

describe('count states', () => {
  it('0-0 first, two strikes its own, then ahead, behind and even', () => {
    expect(countState(0, 0)).toBe('first'); expect(countState(1, 2)).toBe('two'); expect(countState(3, 2)).toBe('two')
    expect(countState(0, 1)).toBe('ahead'); expect(countState(2, 1)).toBe('behind'); expect(countState(1, 1)).toBe('even'); expect(countState(null, 1)).toBeNull()
  })
})

describe('profileOf', () => {
  const ff = (n: number, o: Partial<RawPitch> = {}) => Array.from({ length: n }, (_, i) => p({ pitchType: 'FF', gamePk: 1 + (i % 5), atBatNumber: i + 1, pitchNumber: 1, ...o }))
  it('shape: speed, ride, run (arm side positive for either hand), arm angle', () => {
    const r = profileOf('aaa', ff(60), 'R').types[0]
    expect(r.velo).toBeCloseTo(94, 6); expect(r.ride).toBeCloseTo(15.6, 6); expect(r.run).toBeCloseTo(8.4, 6); expect(r.slot).toBe(40)
    const l = profileOf('aaa', ff(60, { pfx: [0.7, 1.3] }), 'L').types[0]
    expect(l.run).toBeCloseTo(8.4, 6)
  })
  it('results: whiffs per swing, called plus swinging strikes, chase, zone contact, with minimums', () => {
    const swings = [...ff(20, { description: 'swinging_strike' }), ...ff(20, { description: 'foul' }), ...ff(10, { description: 'called_strike' }), ...ff(20, { description: 'ball', zone: '12' })]
    const t = profileOf('mlb', swings, 'R').types[0]
    expect(t.swings).toBe(40); expect(t.whiffs).toBe(20); expect(t.whiffPct).toBeCloseTo(0.5, 6)
    expect(t.cswPct).toBeCloseTo(30 / 70, 6)
    expect(t.zoneContactPct).toBeCloseTo(0.5, 6)
    expect(t.chasePct).toBeNull()   // 20 pitches outside the zone is under the 25 minimum
    expect(profileOf('mlb', ff(10), 'R').types[0].whiffPct).toBeNull()
  })
  it('zone share and down-the-middle share', () => {
    const ps = [...ff(30, { zone: '5' }), ...ff(30, { zone: '12' }), ...ff(40, { zone: '1' })]
    const t = profileOf('mlb', ps, 'R').types[0]
    expect(t.zonePct).toBeCloseTo(0.7, 6); expect(t.heartPct).toBeCloseTo(0.3, 6)
  })
  it('usage overall, by batter side and by count', () => {
    const ps = [...ff(60, { stand: 'R', balls: 0, strikes: 1 }), ...Array.from({ length: 60 }, (_, i) => p({ pitchType: 'SL', stand: 'L', balls: 2, strikes: 1, gamePk: 9, atBatNumber: i + 1, pitchNumber: 1 }))]
    const r = profileOf('aaa', ps, 'R')
    expect(r.types.map(t => [t.type, t.usage])).toEqual([['FF', 0.5], ['SL', 0.5]])
    expect(r.byStand.R.share.FF).toBe(1); expect(r.byStand.L.share.SL).toBe(1)
    expect(r.byCount.ahead.share.FF).toBe(1); expect(r.byCount.behind.share.SL).toBe(1)
    expect(r.fastballWhenAhead).toBe(1); expect(r.fastballWhenBehind).toBe(0)
  })
  it('location grid counts pitches in 0.25 ft cells and ignores pitches off the grid', () => {
    expect(cellOf(-1.5, 1)).toBe(0); expect(cellOf(1.49, 3.99)).toBe(GRID.cols * GRID.rows - 1); expect(cellOf(2, 2)).toBeNull()
    const r = profileOf('mlb', [...ff(60), p({ pitchType: 'FF', plateX: 5 })], 'R')
    expect(r.grid.all.reduce((a, b) => a + b, 0)).toBe(60)
  })
  it('sequencing: transitions, repeats and next-pitch shares, within a plate appearance only', () => {
    // 40 plate appearances of FF, SL, SL, then a new plate appearance starts with FF (not counted as a transition from the SL)
    const ps: RawPitch[] = []
    for (let a = 1; a <= 40; a++) { ps.push(p({ pitchType: 'FF', gamePk: 1, atBatNumber: a, pitchNumber: 1 }), p({ pitchType: 'SL', gamePk: 1, atBatNumber: a, pitchNumber: 2 }), p({ pitchType: 'SL', gamePk: 1, atBatNumber: a, pitchNumber: 3 })) }
    const s = profileOf('aaa', ps, 'R').sequencing!
    expect(s.later).toBe(80); expect(s.repeats).toBe(40); expect(s.repeatPct).toBeCloseTo(0.5, 6)
    expect(s.transitions.FF.SL).toBe(40); expect(s.transitions.SL.SL).toBe(40); expect(s.transitions.SL.FF).toBeUndefined()
    expect(nextShares(s, 'FF')).toEqual({ n: 40, share: { SL: 1 } })
    expect(nextShares(s, 'CU')).toBeNull()
  })
  it('without thrown order (a free viewer\'s log) sequencing is null, not guessed', () => {
    const ps = ff(60, { gamePk: null, atBatNumber: null, pitchNumber: null })
    expect(profileOf('mlb', ps, 'R').sequencing).toBeNull()
  })
})
