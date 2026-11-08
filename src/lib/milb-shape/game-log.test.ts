import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLevelUse, getMilbGames } from './game-log'

const split = (gamePk: number, league: number, pitches = 80) => ({ game: { gamePk }, league: { id: league }, stat: { numberOfPitches: pitches } })
function mockLog(bySport: Record<number, ReturnType<typeof split>[] | 'fail'>) {
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    const sport = Number(u.match(/sportId=(\d+)/)![1])
    const v = bySport[sport]
    if (v === 'fail') return { ok: false, status: 500, json: async () => ({}) }
    return { ok: true, json: async () => ({ stats: [{ splits: v ?? [] }] }) }
  }))
}
afterEach(() => vi.unstubAllGlobals())

describe('where a pitcher threw', () => {
  it('lists the levels he pitched at with games and pitches, leaving out the ones he did not', async () => {
    mockLog({ 1: [split(1, 103, 90), split(2, 104, 70)], 11: [split(3, 117, 85)], 14: [] })
    expect(await getLevelUse(5, 2026)).toEqual([{ level: 'mlb', games: 2, pitches: 160 }, { level: 'aaa', games: 1, pitches: 85 }])
  })
  it('Single-A counts only for the Florida State League (league 123), never the Carolina or California League', async () => {
    mockLog({ 1: [], 11: [], 14: [split(10, 123), split(11, 122), split(12, 110)] })
    expect(await getLevelUse(5, 2026)).toEqual([{ level: 'fsl', games: 1, pitches: 80 }])
    expect([...(await getMilbGames(5, 2026, 'fsl'))!]).toEqual([10])
  })
  it('Triple-A takes both of its leagues', async () => {
    mockLog({ 11: [split(20, 117), split(21, 112)] })
    expect([...(await getMilbGames(5, 2026, 'aaa'))!].sort()).toEqual([20, 21])
  })
  it('an unreadable Stats API is null, never "no games"', async () => {
    mockLog({ 11: 'fail' })
    expect(await getMilbGames(5, 2026, 'aaa')).toBeNull()
  })
})
