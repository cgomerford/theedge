import { describe, it, expect, vi, beforeEach } from 'vitest'

// A fake Supabase client: player_percentiles returns one batter with 8 ranks; batted_ball_events reports 80 batted balls.
const ranks = { xwoba: 97, xba: 98, bb_percent: 97, xslg: 80, brl_percent: 60, k_percent: 55, whiff_percent: 52, chase_percent: 14, hard_hit_percent: 90, sprint_speed: 30 }
let bbe = 80
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      if (t === 'player_percentiles') return { select: () => ({ eq: () => ({ in: async () => ({ data: [{ player_id: 1, kind: 'batter', ranks }], error: null }) }) }) }
      return { select: () => ({ eq: () => ({ gte: () => ({ lt: async () => ({ count: bbe, error: null }) }) }) }) }
    },
  }),
}))
import { getPercentileBlocks } from './percentiles'

describe('getPercentileBlocks: the Pro trim happens on the server', () => {
  beforeEach(() => { bbe = 80 })
  it('a non-Pro viewer gets only the top 3 ranks and a count of the rest, nothing else about them', async () => {
    const b = (await getPercentileBlocks([{ id: 1, isPitcher: false, n: 600 }], 2026, false)).get(1)!
    expect(b.state).toBe('ok')
    expect(b.rows.map(r => r.pct)).toEqual([98, 97, 97])
    expect(b.lockedCount).toBe(7)
    const json = JSON.stringify(b)
    for (const hidden of ['Hard-hit%', 'xSLG', 'Barrel%', 'Chase%', 'Sprint speed', 'Whiff%', 'K%', '"pct":90', '"pct":80', '"pct":14']) expect(json).not.toContain(hidden)
  })
  it('a Pro viewer gets the whole set, high to low', async () => {
    const b = (await getPercentileBlocks([{ id: 1, isPitcher: false, n: 600 }], 2026, true)).get(1)!
    expect(b.rows).toHaveLength(10)
    expect(b.lockedCount).toBe(0)
    expect(b.rows.map(r => r.pct)).toEqual([...b.rows.map(r => r.pct)].sort((x, y) => y - x))
  })
  it('below the plate-appearance minimum the block is a small sample with no ranks', async () => {
    const b = (await getPercentileBlocks([{ id: 1, isPitcher: false, n: 20 }], 2026, true)).get(1)!
    expect(b.state).toBe('small'); expect(b.rows).toEqual([])
  })
  it('Hard-hit% is left out below the batted-ball minimum, and says how many there were', async () => {
    bbe = 10
    const b = (await getPercentileBlocks([{ id: 1, isPitcher: false, n: 600 }], 2026, true)).get(1)!
    expect(b.rows.some(r => r.key === 'hard_hit_percent')).toBe(false)
    expect(b.hardHitSmall).toBe(10)
  })
  it('a player with no stored ranks is pending', async () => {
    const b = (await getPercentileBlocks([{ id: 2, isPitcher: false, n: 600 }], 2026, true)).get(2)!
    expect(b.state).toBe('pending')
  })
})
