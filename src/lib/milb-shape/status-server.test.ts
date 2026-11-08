import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/log', () => ({ logOnce: () => undefined, log: { error: () => undefined } }))
const lines = (m: Record<number, { pitches: number; rvN: number; rv: number }>, league: number | null) => ({ by: new Map(Object.entries(m).map(([k, v]) => [Number(k), v])), leagueRuns100: league })
vi.mock('@/lib/pitch-shape/overall', () => ({
  getSeasonPitcherLines: vi.fn(async (y: number) => (y === 2026 ? lines({ 1: { pitches: 900, rvN: 900, rv: 9 }, 2: { pitches: 0, rvN: 0, rv: 0 } }, 0.5) : y === 2025 ? lines({ 1: { pitches: 300, rvN: 300, rv: 3 } }, 0.5) : lines({}, 0.5))),
}))

const person = (id: number, extra: Record<string, unknown> = {}) => ({ id, currentAge: 25, mlbDebutDate: undefined, draftYear: 2021, currentTeam: { id: 234 }, transactions: [], ...extra })
afterEach(() => vi.unstubAllGlobals())

describe('getPitcherStatuses', () => {
  it('builds age, debut, org, trades, options and MLB pitches and run value; a minor-league club maps to its parent', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(u); return { ok: true, json: async () => ({ people: [
      person(1, { mlbDebutDate: '2025-08-30', currentTeam: { id: 133 }, transactions: [{ date: '2026-07-20T00:00:00', typeCode: 'TR' }, { date: '2025-01-05', typeCode: 'TR' }, { date: '2026-05-15', typeCode: 'OPT' }, { date: '2026-06-02', typeCode: 'CU' }] }),
      person(2, { currentTeam: { id: 234 } }),   // Durham, Triple-A: its parent is the Rays
    ] }) } }))
    const { getPitcherStatuses } = await import('./status-server')
    const out = await getPitcherStatuses([1, 2], 2026)
    expect(out.leagueRuns100).toBe(0.5)
    const [a, b] = out.statuses
    expect(a).toMatchObject({ id: 1, age: 25, debut: '2025-08-30', orgId: 133, optioned: true, mlbPitches: { 2025: 300, 2026: 900 }, mlbRvPitches: 900 })
    expect(a.mlbRuns100).toBeCloseTo(1, 6)
    expect(a.trades).toEqual(['2025-01-05', '2026-07-20'])
    expect(b.orgId).toBe(139)   // Tampa Bay Rays
    expect(b.mlbPitches).toEqual({}); expect(b.mlbRuns100).toBeNull()
    expect(calls[0]).toContain('hydrate=transactions,currentTeam')
  })
  it('a pitcher the API does not return is left out, so his status is unknown rather than "never pitched in MLB"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ people: [person(7)] }) })))
    const { getPitcherStatuses } = await import('./status-server')
    const out = await getPitcherStatuses([7, 8], 2026)
    expect(out.statuses.map(s => s.id)).toEqual([7])
  })
  it('an unreadable API leaves nothing rather than inventing statuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    const { getPitcherStatuses } = await import('./status-server')
    expect((await getPitcherStatuses([21, 22], 2026)).statuses).toEqual([])
  })
})
