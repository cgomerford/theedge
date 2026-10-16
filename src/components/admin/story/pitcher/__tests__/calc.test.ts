import { describe, expect, it } from 'vitest'
import type { AtBatSummary, BattedBallRecord } from '@/types/postgame'
import { HOME } from '../../diamondGeo'
import { gridToStory, hitsAllowed, ipToOuts, nextStart, per9, throughTheOrder, whip } from '../calc'
import { armSlot } from '../copy'

const ab = (i: number, batterId: number, eventType: string, pitcherId = 1): AtBatSummary => ({
  atBatIndex: i, inning: 1, halfInning: 'top', pitcherId, pitcherName: 'P', batterId, batterName: `B${batterId}`, eventType, resultDescription: '', isScoringPlay: false,
})

describe('throughTheOrder', () => {
  it('buckets by a batter\'s Nth PA, caps at 3rd+, and counts AB correctly', () => {
    const plays = [ab(0, 10, 'single'), ab(1, 11, 'walk'), ab(2, 10, 'strikeout'), ab(3, 10, 'field_out'), ab(4, 10, 'home_run'), ab(5, 99, 'single', 2)]
    const r = throughTheOrder(plays, 1, [0.25, null, 0.3])
    expect(r.map(x => x.pa)).toEqual([2, 1, 2])
    expect(r[0]).toMatchObject({ ab: 1, h: 1, bb: 1, avg: 1, seasonAvg: 0.25 })   // walk is not an AB
    expect(r[1]).toMatchObject({ k: 1, avg: 0 })
    expect(r[2].label).toBe('3rd time +')
    expect(r[2]).toMatchObject({ h: 1, ab: 2 })
  })
  it('drops buckets with no PA', () => {
    expect(throughTheOrder([ab(0, 10, 'single')], 1, [])).toHaveLength(1)
  })
})

describe('hits', () => {
  const bb = (o: Partial<BattedBallRecord>): BattedBallRecord => ({
    atBatIndex: 0, inning: 1, halfInning: 'top', batterId: 5, batterName: 'B', pitcherId: 1, pitcherName: 'P', battingTeamId: 1,
    launchSpeed: 100, launchAngle: 10, totalDistance: null, trajectory: null, hardness: null, coordX: 125, coordY: 205, zone: null, resultEvent: 'single', ...o,
  })
  it('keeps only this pitcher\'s hits that have coordinates, in game order', () => {
    const r = hitsAllowed([bb({ atBatIndex: 5, resultEvent: 'double' }), bb({ atBatIndex: 2 }), bb({ resultEvent: 'field_out' }), bb({ pitcherId: 2 }), bb({ coordX: null })], 1)
    expect(r.map(h => h.kind)).toEqual(['1B', '2B'])
  })
  it('maps home plate to home and second base to the diamond\'s second', () => {
    expect(gridToStory(125, 205)).toEqual({ x: HOME.x, y: HOME.y })
    expect(Math.round(gridToStory(125, 125).y)).toBe(456)
  })
  it('clamps balls hit far outside the box', () => {
    expect(gridToStory(0, 0).y).toBeGreaterThanOrEqual(20)
  })
})

describe('rates', () => {
  it('ip → outs, per9, whip; zero outs gives null not 0', () => {
    expect(ipToOuts('6.1')).toBe(19)
    expect(per9(7, 18)).toBe(10.5)
    expect(whip(3, 1, 18)).toBeCloseTo(0.667, 2)
    expect(per9(1, 0)).toBeNull()
  })
})

describe('nextStart', () => {
  const g = (date: string, p: number | null) => ({ date, oppAbbr: 'BOS', home: true, probablePitcherId: p })
  it('prefers the announced probable', () => {
    expect(nextStart('2026-10-07', 1, [g('2026-10-08', 2), g('2026-10-12', 1)])).toMatchObject({ kind: 'announced', date: '2026-10-12' })
  })
  it('falls back to the first game on the 5th day or later, labelled earliest', () => {
    expect(nextStart('2026-10-07', 1, [g('2026-10-09', null), g('2026-10-12', null)])).toMatchObject({ kind: 'earliest', date: '2026-10-12' })
  })
  it('is null when nothing is scheduled', () => {
    expect(nextStart('2026-10-07', 1, [])).toBeNull()
  })
})

describe('armSlot', () => {
  it('names the slot', () => {
    expect([80, 55, 30, 10].map(armSlot)).toEqual(['Over the top', 'Three-quarters', 'Low three-quarters', 'Sidearm'])
  })
})

import { pitchDots, ZONE_FT } from '../calc'
import type { PitchRecord } from '@/types/postgame'

describe('pitchDots', () => {
  const pr = (o: Partial<PitchRecord>): PitchRecord => ({
    atBatIndex: 0, pitchNumber: 1, inning: 1, halfInning: 'top', pitcherId: 1, pitcherName: 'P', batterId: 2, batterName: 'B', typeCode: 'FF', typeDescription: 'FF',
    callCode: 'B', callDescription: '', startSpeed: 95, endSpeed: null, spinRate: null, breakLength: null, breakVerticalInduced: null, breakHorizontal: null, zone: 5,
    plateX: 0, plateZ: 2.5, strikeZoneTop: 3.5, strikeZoneBottom: 1.5, isStrike: false, isBall: true, isInPlay: false, countAfter: { balls: 1, strikes: 0 }, ...o,
  })
  it('tags each pitch with the count BEFORE it, resetting each plate appearance', () => {
    const r = pitchDots([
      pr({ pitchNumber: 1, countAfter: { balls: 1, strikes: 0 } }),
      pr({ pitchNumber: 2, countAfter: { balls: 1, strikes: 1 } }),
      pr({ atBatIndex: 1, pitchNumber: 1, countAfter: { balls: 0, strikes: 1 } }),
    ], 1)
    expect(r.map(d => `${d.balls}-${d.strikes}`)).toEqual(['0-0', '1-0', '0-0'])
  })
  it('rescales z to the fixed reference zone and skips unlocated pitches / other pitchers', () => {
    const r = pitchDots([pr({ plateZ: 2.5 }), pr({ pitchNumber: 2, plateX: null }), pr({ pitcherId: 9 })], 1)
    expect(r).toHaveLength(1)
    expect(r[0].z).toBeCloseTo(ZONE_FT / 2, 5)
  })
})
