import { describe, expect, it } from 'vitest'
import { availabilityTag, buildPenTeam, shadeStep, windowDates, type FeedArm, type FeedGame } from '../bullpenModel'

const arm = (id: number, pitches: number, o: Partial<FeedArm> = {}): FeedArm => ({ id, name: `Pitcher ${id}`, hand: 'R', pitches, ...o })
const game = (gamePk: number, date: string, arms: FeedArm[], o: Partial<FeedGame> = {}): FeedGame => ({ gamePk, date, type: 'R', teamId: 1, starterId: arms[0].id, arms, unused: [], ...o })
const SLATE = '2026-10-07'

describe('availabilityTag', () => {
  it('back-to-back beats 30+', () => expect(availabilityTag([0, 0, 12, 35])).toBe('Back-to-back'))
  it('30+ yesterday only when not back-to-back', () => expect(availabilityTag([0, 0, 0, 31])).toBe('30+ yesterday'))
  it('rested only if the last three days are zero', () => {
    expect(availabilityTag([20, 0, 0, 0])).toBe('Rested 3+ days')
    expect(availabilityTag([0, 0, 0, 5])).toBeNull()
  })
  it('never says unavailable', () => {
    for (const d of [[0, 0, 0, 0], [9, 9, 9, 9], [0, 40, 0, 40], [0, 0, 40, 0]]) expect(String(availabilityTag(d)).toLowerCase()).not.toContain('unavailable')
  })
})

describe('buildPenTeam', () => {
  it('uses the 4 days before the slate, oldest → newest', () => {
    expect(windowDates(SLATE)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'])
  })
  it('excludes starters (window and tonight) and orders by pitches', () => {
    const t = buildPenTeam({ slate: SLATE, teamId: 1, tonightStarters: [99], games: [
      game(1, '2026-10-05', [arm(10, 90), arm(21, 12), arm(22, 30), arm(99, 5)]),
      game(2, '2026-10-06', [arm(11, 95), arm(22, 14)]),
    ] })
    const ids = t.rows.map(r => r.id)
    expect(ids).not.toContain(10); expect(ids).not.toContain(11); expect(ids).not.toContain(99)
    expect(ids[0]).toBe(22)                      // 30 + 14
    expect(t.rows[0].days).toEqual([0, 0, 30, 14]); expect(t.rows[0].tag).toBe('Back-to-back')
  })
  it('caps at 7 rows and counts the last 3 days of relievers', () => {
    const arms = [arm(1000, 90), ...Array.from({ length: 10 }, (_, i) => arm(i + 1, 10 + i))]
    const t = buildPenTeam({ slate: SLATE, teamId: 1, tonightStarters: [], games: [game(1, '2026-10-06', arms)] })
    expect(t.rows.length).toBeLessThanOrEqual(7)
    expect(t.last3).toBe(arms.slice(1).reduce((s, a) => s + a.pitches, 0))
  })
  it('sums a doubleheader on one date', () => {
    const t = buildPenTeam({ slate: SLATE, teamId: 1, tonightStarters: [], games: [
      game(1, '2026-10-06', [arm(10, 80), arm(5, 10)]), game(2, '2026-10-06', [arm(11, 80), arm(5, 12)]),
    ] })
    expect(t.rows.find(r => r.id === 5)!.days[3]).toBe(22)
  })
  it('carries no saves/holds data at all', () => {
    const t = buildPenTeam({ slate: SLATE, teamId: 1, tonightStarters: [], games: [game(1, '2026-10-06', [arm(10, 80), arm(5, 12)], { type: 'D' })] })
    expect(Object.keys(t.rows[0]).sort()).toEqual(['days', 'hand', 'id', 'name', 'tag', 'total'])
    expect('postseasonSeasonStats' in t).toBe(false)
  })
  it('shade steps: 0 blank, 1–14, 15–29, 30+', () => {
    expect([0, 1, 14, 15, 29, 30, 80].map(shadeStep)).toEqual([0, 1, 1, 2, 2, 3, 3])
  })
})
