import { describe, it, expect } from 'vitest'
import { filterSpring, rowsFromFeed, type Feed, type SpringRegistry } from './exhibition'
import { Aggregator } from './aggregate'
import { limitsFor } from './limits'
import { isExhibition, isLevel, parseLevel } from './levels'
import { savantUrl } from './savant'
import { fromCsv } from './normalise'

const pitch = (n: number, code: string, speed: number, bh: number, bv: number, call: string, count: { balls: number; strikes: number }) => ({
  isPitch: true, pitchNumber: n, details: { call: { code: call }, type: { code } }, count,
  pitchData: { startSpeed: speed, zone: 5, coordinates: { pX: 0.1, pZ: 2.5 }, breaks: { breakHorizontal: bh, breakVerticalInduced: bv, spinRate: 2300 } },
})
const feed = (hand: 'R' | 'L'): Feed => ({
  gameData: { datetime: { officialDate: '2026-10-20' }, teams: { home: { abbreviation: 'gdd' }, away: { abbreviation: 'srr' } } },
  liveData: { plays: { allPlays: [{
    result: { eventType: 'strikeout' }, about: { atBatIndex: 0, isTopInning: true },
    matchup: { pitcher: { id: 703186, fullName: 'Jarlin Susana' }, pitchHand: { code: hand }, batSide: { code: 'L' } },
    playEvents: [
      pitch(1, 'FF', 98.4, 7.2, 14.1, 'B', { balls: 1, strikes: 0 }),
      pitch(2, 'FF', 99.1, 7.0, 14.5, 'S', { balls: 1, strikes: 1 }),
      { isPitch: false },
      pitch(3, 'SL', 88.0, -4.0, 2.0, 'C', { balls: 1, strikes: 2 }),
    ],
  }] } },
})

describe('rowsFromFeed (the Arizona Fall League game feed as Savant-shaped rows)', () => {
  it('makes one row per pitch, in the aggregator\'s fields, with the count BEFORE each pitch', () => {
    const rows = rowsFromFeed(feed('R'), 867729)
    expect(rows).toHaveLength(3)
    expect(rows.map(r => [r.balls, r.strikes])).toEqual([[0, 0], [1, 0], [1, 1]])
    expect(rows[0]).toMatchObject({ game_pk: 867729, game_date: '2026-10-20', home_team: 'GDD', away_team: 'SRR', inning_topbot: 'Top', at_bat_number: 1, pitch_number: 1, pitcher: 703186, p_throws: 'R', stand: 'L', pitch_type: 'FF', description: 'ball' })
    expect(rows[1].description).toBe('swinging_strike')
    expect(rows[2].description).toBe('called_strike')
    expect(rows[2].events).toBe('strikeout')   // the result rides on the last pitch only
    expect(rows[0].events).toBe('')
    expect('arm_angle' in rows[0]).toBe(false)   // never estimated
  })
  it('converts movement back to the Lab\'s units for both hands (arm-side positive)', () => {
    const r = rowsFromFeed(feed('R'), 1)[0], l = rowsFromFeed(feed('L'), 1)[0]
    const a = fromCsv(r)!, b = fromCsv(l)!
    expect(a.hb).toBeCloseTo(7.2, 6); expect(a.ivb).toBeCloseTo(14.1, 6); expect(a.slot).toBeNull()
    expect(b.hb).toBeCloseTo(-7.2, 6); expect(b.ivb).toBeCloseTo(14.1, 6); expect(b.slot).toBeNull()
  })
})

describe('Spring Training filter', () => {
  const reg: SpringRegistry = { games: new Map([[1, { date: '2026-03-01', home: 'NYY', away: 'BOS' }]]), first: '2026-03-01', last: '2026-03-01', skipped: 1 }
  it('keeps only verified major-league spring games and counts the rest', () => {
    const f = filterSpring([{ game_pk: 1 }, { game_pk: 1 }, { game_pk: 2 }], reg)
    expect(f.rows).toHaveLength(2)
    expect(f.rejects.unresolved).toBe(1)
    expect(f.rejects.kept.st).toBe(2)
    expect(f.rejects.quarantinedGames).toEqual([2])
  })
  it('asks Savant for game type S on the major-league endpoint, and never asks Savant for the Fall League', () => {
    const u = savantUrl({ start: '2026-03-04', end: '2026-03-05' }, 2026, 'st')
    expect(u).toContain('/statcast_search/csv?'); expect(u).toContain('hfGT=S%7C'); expect(u).not.toContain('minors=true')
    expect(() => savantUrl({ start: '2026-10-20', end: '2026-10-20' }, 2026, 'afl')).toThrow(/not on Savant/)
  })
})

describe('a small 30-pitch minimum at the exhibition levels', () => {
  it('limits: MLB and the minors keep their gates; the two exhibition levels have none', () => {
    expect(limitsFor('mlb')).toMatchObject({ gated: true, comparePitches: 300, boardPitches: 100, windowSwings: 40 })
    expect(limitsFor('aaa').gated).toBe(true)
    for (const l of ['afl', 'st'] as const) expect(limitsFor(l)).toMatchObject({ gated: false, comparePitches: 30, boardPitches: 30, ownPitches: 30, windowSwings: 1, ownSwings: 1, spotSwings: 15, priorSwings: 30 })
    expect(isExhibition('st')).toBe(true); expect(isExhibition('fsl')).toBe(false)
    expect(isLevel('afl') && isLevel('st')).toBe(true); expect(parseLevel('spring')).toBe('mlb')
  })
  it('the aggregator keeps a pitcher with ONE tracked pitch and no arm angle at the exhibition levels, and drops him at Triple-A', () => {
    const row = { game_pk: 1, at_bat_number: 1, pitch_number: 1, game_date: '2026-03-01', home_team: 'NYY', away_team: 'BOS', inning_topbot: 'Top', pitcher: 99, player_name: 'Doe, Jo', p_throws: 'R', pitch_type: 'FF', release_speed: 95, pfx_x: -0.6, pfx_z: 1.2, description: 'swinging_strike' }
    const st = new Aggregator('st', 2026); st.add(row)
    const aaa = new Aggregator('aaa', 2026); aaa.add(row)
    expect(st.pitcherRows()).toHaveLength(1)
    expect(st.pitcherRows()[0]).toMatchObject({ pitcher_id: 99, n_pitches: 1, slot: null, pitcher_name: 'Jo Doe' })
    expect(st.resultsPitcherRows()).toHaveLength(1)
    expect(aaa.pitcherRows()).toHaveLength(0)   // Triple-A still needs an arm angle and 50 pitches
    expect(st.cellRows()).toHaveLength(1)
  })
})
