import { describe, expect, it } from 'vitest'
import { buildStory } from '../buildStory'
import { challengerRole, reduceAbs, reduceCatcherBars, reduceClub, reduceDefDesk, reduceLate, reduceRun } from '../scoutReduce'
import { extras, fullGame } from './fixtures'
import type { ScoutExtras } from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const strip = (label: string, value: number) => ({ label, unit: 's', value, lo: 0, hi: 9, q1: 1, median: 2, q3: 3, rank: 4, of: 30, betterLow: true, decimals: 2 })

describe('scoutReduce', () => {
  it('run: keeps catcher strips + top-3 sprint speeds; null when nothing to show', () => {
    const rg: any = {
      offense: { sb: 80, cs: 20, games: 162, attemptsPerGame: 0.62, successPct: 80, league: { attemptsPerGame: 0.5, successPct: 78 }, rank: { attempts: 3, of: 30 },
        runners: [{ name: 'A One', sprint: 28, sb: 1, cs: 0 }, { name: 'B Two', sprint: 30, sb: 2, cs: 0 }, { name: 'C Three', sprint: null, sb: 0, cs: 0 }, { name: 'D Four', sprint: 27, sb: 0, cs: 0 }, { name: 'E Five', sprint: 29, sb: 0, cs: 0 }] },
      catcher: { id: 1, name: 'Will Smith', popAttempts: 30, strips: [strip('Pop time to 2B', 1.9), strip('Exchange (glove to release)', 0.7), strip('Arm strength', 85)], field: [], sb: 20, cs: 9 },
      pitcher: { id: 2, name: 'Dylan Cease', throws: 'R', sb: 5, cs: 1, pickoffs: 2, ip: 100, bf: 400 }, leagueCatcherCsPct: 22,
    }
    const c = reduceRun(rg, 'SD', 'LAD')!
    expect(c.catcher!.strips.map(s => s.label)).toEqual(['Pop time', 'Exchange', 'Arm'])
    expect(c.runners.map(r => r.short)).toEqual(['B. Two', 'E. Five', 'A. One'])
    expect(reduceRun(null, 'SD', 'LAD')).toBeNull()
    expect(reduceRun({ ...rg, catcher: null, offense: { ...rg.offense, attemptsPerGame: null } }, 'SD', 'LAD')).toBeNull()
  })
  it('abs: thin samples are dropped; regular season is cut at the last club game; roles and W-L from the log', () => {
    const mk = (n: number, ov: number): any => ({
      season: { games: 10, all: { n, ov } }, league: { games: 20, all: { n: 100, ov: 50 } }, perGame: [{ date: '2026-09-28' }, { date: '2026-09-27' }],
      rank: { rate: 3, overturn: 5, of: 30 }, challengers: [],
    })
    const row = (o: any): any => ({ game_pk: 1, game_date: '2026-09-20', challenging_team_id: 117, challenge_side: 'batting', challenger_player_id: 5, challenger_player_name: 'Jose Altuve', batter_id: 5, pitcher_id: 9, is_overturned: true, plate_x: 0.5, plate_z: 2.5, sz_top: 3.5, sz_bot: 1.5, sz_width_in: 17, ...o })
    const log = [
      row({}), row({ is_overturned: false }), row({ challenge_side: 'fielding', challenger_player_id: 7, challenger_player_name: 'Yainer Diaz' }),
      row({ challenge_side: 'fielding', challenger_player_id: 9, challenger_player_name: 'Hunter Brown' }),
      row({ game_date: '2026-10-05', game_pk: 2 }),                                  // postseason → not counted
    ]
    expect(reduceAbs(mk(3, 1), 'HOU', 117, log, '2026-09-28')).toBeNull()
    const c = reduceAbs(mk(8, 4), 'HOU', 117, log, '2026-09-28')!
    expect(c.overturnPct).toBe(50); expect(c.leagueOverturnPct).toBe(50)
    expect(c.perGame).toBe(0.8); expect(c.leaguePerGame).toBe(5)
    expect(c.split).toEqual({ batter: 2, catcher: 1, pitcher: 1 })
    expect(c.top[0]).toMatchObject({ short: 'J. Altuve', w: 1, l: 1 })
    expect(c.regN).toBe(4); expect(c.postN).toBe(1)
    expect(c.zoneH).toBe(24)                                                        // (3.5 − 1.5) × 12
    expect(c.zone[0]).toEqual({ x: 6, z: 0.5, ov: true })
    const many = Array.from({ length: 120 }, (_, i) => row({ game_pk: 100 + i }))
    expect(reduceAbs(mk(8, 4), 'HOU', 117, many, '2026-09-28')!.zone.length).toBe(40)   // capped: no blob of dots
  })
  it('catcher bars: percentile vs the 1500+ out field, pop from the strip, stale flag, omit when empty', () => {
    const rows: any[] = [
      { player_id: 1, framing_runs: 10, blocking_runs: 1, throwing_runs: 2, outs_2: 2000, updated_at: '2026-08-15T19:00:00Z' },
      { player_id: 2, framing_runs: 0, blocking_runs: 2, throwing_runs: 1, outs_2: 2000, updated_at: '2026-08-15T19:00:00Z' },
      { player_id: 3, framing_runs: -5, blocking_runs: 0, throwing_runs: 0, outs_2: 2000, updated_at: '2026-08-15T19:00:00Z' },
      { player_id: 4, framing_runs: 99, blocking_runs: 9, throwing_runs: 9, outs_2: 400, updated_at: '2026-08-15T19:00:00Z' },   // not qualified → not in the field
    ]
    const bars = reduceCatcherBars({ id: 2, rows, slate: '2026-10-07', popStrip: { value: 1.97, rank: 58, of: 84 }, abs: { n: 144, w: 90 }, absRank: { rank: 4, of: 22 } })!
    expect(bars.framing).toMatchObject({ rank: 2, of: 3, pct: 50 })
    expect(bars.blocking).toMatchObject({ rank: 1, of: 3, pct: 100 })
    expect(bars.pop).toMatchObject({ rank: 58, of: 84 })
    expect(bars.inn).toBe(667); expect(bars.thru).toBe('2026-08-15'); expect(bars.stale).toBe(true)
    expect(bars.abs).toMatchObject({ pct: 63, rank: 4, of: 22 })
    expect(reduceCatcherBars({ id: 77, rows, slate: '2026-10-07', popStrip: null, abs: null, absRank: null })).toBeNull()
  })
  it('challenger roles', () => {
    expect(challengerRole({ challenge_side: 'batting', challenger_player_id: 1, pitcher_id: 2 })).toBe('batter')
    expect(challengerRole({ challenge_side: 'fielding', challenger_player_id: 2, pitcher_id: 2 })).toBe('pitcher')
    expect(challengerRole({ challenge_side: 'fielding', challenger_player_id: 3, pitcher_id: 2 })).toBe('catcher')
  })
  it('club: out/questionable counted, minors moves excluded, empty → null', () => {
    const players: any[] = [
      { name: 'Aaron Judge', pos: 'RF', status: 'out', reason: 'Right elbow inflammation that is quite long' },
      { name: 'Gerrit Cole', pos: 'P', status: 'questionable', reason: null },
    ]
    const c = reduceClub({ players, transactions: [{ effect: 'added', player_name: 'Bo Bichette', category: 'ACTIVATION', is_milb_move: false }, { effect: 'removed', player_name: 'X Y', category: 'OPTION', is_milb_move: true }] } as any, 'NYY')!
    expect(c.out[0].reason.length).toBeLessThanOrEqual(26)
    expect(c.moves).toEqual(['+ B. Bichette · activation'])
    expect(reduceClub({ players: [], transactions: [] } as any, 'NYY')).toBeNull()
  })
  it('late: run differential in the 7th/8th/9th from the schedule linescores', () => {
    const late: any = { season: { games: 160, w: 90, l: 70, scored: [40, 31, 28, 3], allowed: [30, 35, 20, 2] } }
    const c = reduceLate(null, late, 'CLE')!
    expect(c.innings).toEqual([
      { label: '7th', scored: 40, allowed: 30, diff: 10 }, { label: '8th', scored: 31, allowed: 35, diff: -4 }, { label: '9th', scored: 28, allowed: 20, diff: 8 },
    ])
    expect(c.games).toBe(160)
    expect(reduceLate(null, { season: { games: 0, scored: [], allowed: [] } } as any, 'CLE')).toBeNull()
  })
  it('late: splits under 60 PA are left out', () => {
    const lev: any = { offense: { lc: { pa: 200, ops: 0.7, avg: 0.24 }, risp: { pa: 30, ops: 0.9, avg: 0.3 }, late: { pa: 400, ops: 0.72, avg: 0.25 } }, records: { oneRun: { w: 20, l: 15 } } }
    const c = reduceLate(lev, null, 'NYY')!
    expect(c.hitting.map(h => h.label)).toEqual(['Late & close', '7th inning+'])
    expect(reduceLate(null, null, 'NYY')).toBeNull()
  })
  it('defense desk: best positive, worst negative', () => {
    const d: any = { team: { oaa: 12, rank: 3, of: 30 }, fielders: [{ name: 'A Good', pos: 'SS', oaa: 8 }, { name: 'B Bad', pos: 'LF', oaa: -5 }, { name: 'C Null', pos: 'C', oaa: null }] }
    const c = reduceDefDesk(d, 'TB')!
    expect(c.best[0].short).toBe('A. Good')
    expect(c.worst[0].short).toBe('B. Bad')
  })
})

describe('buildStory with desk data', () => {
  const scout = (): ScoutExtras => ({
    arsenal: { away: null, home: null }, run: { away: null, home: null },
    abs: { away: { abbr: 'MIL', games: 1, challenges: 9, overturns: 4, overturnPct: 44, leagueOverturnPct: 50, perGame: 9, leaguePerGame: 5, split: { batter: 5, catcher: 3, pitcher: 1 }, top: [], zone: [], zoneH: 20, regN: 9, postN: 0 }, home: null },
    club: { away: null, home: null }, late: { away: null, home: null }, defdesk: { away: null, home: null },
  })
  it('desk slides are offered when data exists, off by default, and added in canonical position when switched on', () => {
    const base = buildStory(fullGame(), extras, '2026-10-07', { scout: scout() })
    expect(base.segments.map(s => s.id)).not.toContain('abs')
    expect(base.available).toEqual(expect.arrayContaining(['abs', 'sp-tto', 'lineup-away']))
    expect(base.available).not.toContain('run-game')
    const on = buildStory(fullGame(), extras, '2026-10-07', { on: ['abs', 'run-game', 'lineup-away'], scout: scout() })
    const ids = on.segments.map(s => s.id)
    expect(ids).toContain('abs'); expect(ids).toContain('lineup-away'); expect(ids).not.toContain('run-game')
    expect(ids.indexOf('lineup-away')).toBeLessThan(ids.indexOf('abs'))
    expect(ids.indexOf('abs')).toBeLessThan(ids.indexOf('close'))
  })
})
