import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPitcherPitchLog } from './pitcher-pitch-log'

const HEAD = ['pitch_type', 'game_date', 'release_speed', 'plate_x', 'plate_z', 'zone', 'description', 'events', 'balls', 'strikes', 'batter', 'game_pk', 'at_bat_number', 'pitch_number', 'p_throws']
const row = (g: number, ab: number, pn: number, extra: Record<string, string> = {}) => {
  const base: Record<string, string> = { pitch_type: 'FF', game_date: '2026-08-01', release_speed: '94.1', plate_x: '0.1', plate_z: '2.5', zone: '5', description: 'ball', events: '', balls: '0', strikes: '0', batter: '9', game_pk: String(g), at_bat_number: String(ab), pitch_number: String(pn), p_throws: 'R', ...extra }
  return HEAD.map(h => `"${base[h]}"`).join(',')
}
const csv = (rows: string[]) => `﻿${HEAD.map(h => `"${h}"`).join(',')}\n${rows.join('\n')}\n`

const urls: string[] = []
function mockFetch(csvText: string, gameLog: { gamePk: number; league: number }[]) {
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    urls.push(u)
    if (u.includes('statsapi.mlb.com/api/v1/people/') && u.includes('gameLog')) return { ok: true, json: async () => ({ stats: [{ splits: gameLog.map(g => ({ game: { gamePk: g.gamePk }, league: { id: g.league }, stat: { numberOfPitches: 90 } })) }] }) }
    if (u.includes('/api/v1/people?personIds')) return { ok: true, json: async () => ({ people: [] }) }
    return { ok: true, text: async () => csvText }
  }))
}
afterEach(() => { vi.unstubAllGlobals(); urls.length = 0 })

describe('the pitch log at a level', () => {
  it('MLB reads the MLB endpoint exactly as before (no minors parameters) and needs no game log', async () => {
    mockFetch(csv([row(1, 1, 1)]), [])
    const log = await getPitcherPitchLog(5, 2026, 'season')
    expect(log?.pitches).toHaveLength(1)
    expect(urls.some(u => u.includes('statcast_search/csv') && !u.includes('minors'))).toBe(true)
    expect(urls.some(u => u.includes('gameLog'))).toBe(false)
  })
  it('Triple-A asks Savant\'s minors endpoint with minors=true and keeps only the games the Stats API places there', async () => {
    mockFetch(csv([row(100, 1, 1), row(100, 1, 2), row(200, 1, 1)]), [{ gamePk: 100, league: 117 }])   // game 200 is not a Triple-A game of his
    const log = await getPitcherPitchLog(5, 2026, 'season', 'aaa')
    const savant = urls.find(u => u.includes('statcast-search-minors'))!
    expect(savant).toContain('minors=true'); expect(savant).toContain('hfLevel=AAA%7C')
    expect(log?.pitches).toHaveLength(2)
    expect(log?.pitches.every(p => p.gamePk === 100)).toBe(true)
  })
  it('the Florida State League keeps only league 123 games out of Single-A', async () => {
    mockFetch(csv([row(100, 1, 1), row(300, 1, 1)]), [{ gamePk: 100, league: 123 }, { gamePk: 300, league: 122 }])   // 300 is a Carolina League game
    const log = await getPitcherPitchLog(5, 2026, 'season', 'fsl')
    expect(urls.find(u => u.includes('statcast-search-minors'))).toContain('hfLevel=A%7C')
    expect(log?.pitches.map(p => p.gamePk)).toEqual([100])
  })
  it('a level he did not pitch at is no log, and never a fallback to MLB', async () => {
    mockFetch(csv([row(100, 1, 1)]), [])
    expect(await getPitcherPitchLog(5, 2026, 'season', 'aaa')).toBeNull()
    expect(urls.some(u => u.includes('statcast_search/csv'))).toBe(false)
  })
  it('drops exact repeat rows (Savant lists some balls in play twice) at every level, keeping distinct pitches', async () => {
    const bip = row(100, 4, 2, { description: 'hit_into_play', events: 'single' })
    mockFetch(csv([row(100, 4, 1), bip, bip, row(100, 5, 1)]), [{ gamePk: 100, league: 117 }])
    expect((await getPitcherPitchLog(5, 2026, 'season', 'aaa'))?.pitches).toHaveLength(3)
    mockFetch(csv([row(100, 4, 1), bip, bip, row(100, 5, 1)]), [])
    expect((await getPitcherPitchLog(5, 2026, 'season'))?.pitches).toHaveLength(3)
  })
  it('a minor level is a season only, even if a career was asked for', async () => {
    mockFetch(csv([row(100, 1, 1)]), [{ gamePk: 100, league: 117 }])
    await getPitcherPitchLog(5, 2026, 'career', 'aaa')
    const savant = urls.find(u => u.includes('statcast-search-minors'))!
    expect(savant).toContain('hfSea=2026%7C'); expect(savant).not.toContain('2015')
  })
})
