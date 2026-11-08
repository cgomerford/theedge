import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const isPro = vi.fn(async () => false)
vi.mock('@/lib/require-pro', () => ({ isProViewer: () => isPro() }))
vi.mock('@/lib/milb-shape/server', () => ({ resolveSeason: async () => 2026 }))
const filters: Record<string, unknown>[] = []
vi.mock('@/lib/milb-shape/dev-db', () => ({
  milbDb: async () => ({ from: () => { const q: Record<string, unknown> = {}; const b: Record<string, unknown> = {}
    for (const m of ['select', 'gte', 'limit']) b[m] = () => b
    b.eq = (k: string, v: unknown) => { q[k] = v; return b }
    b.then = (res: (v: unknown) => unknown) => { filters.push(q); return Promise.resolve({ data: [{ pitcher_id: 11 }, { pitcher_id: 12 }], error: null }).then(res) }
    return b } }),
}))
const getStatuses = vi.fn(async (ids: number[], _season?: number) => ({ statuses: ids.map(id => ({ id })), leagueRuns100: 0.1 }))
vi.mock('@/lib/milb-shape/status-server', () => ({ getPitcherStatuses: (ids: number[], season: number) => getStatuses(ids, season) }))

const req = (q: string) => new NextRequest(`http://localhost/api/mlb/pitch-shape/pitcher-status?${q}`)
beforeEach(() => { vi.clearAllMocks(); filters.length = 0; isPro.mockResolvedValue(false) })

describe('pitcher-status', () => {
  it('reads the cohort of the level, type and hand, then their statuses', async () => {
    const { GET } = await import('./pitcher-status/route')
    const j = await (await GET(req('level=aaa&type=FF&hand=R'))).json()
    expect(filters[0]).toMatchObject({ level: 'aaa', season: 2026, pitch_type: 'FF', p_throws: 'R' })
    expect(getStatuses).toHaveBeenCalledWith([11, 12], expect.any(Number))
    expect(j.requested).toBe(2); expect(j.statuses).toHaveLength(2)
  })
  it('is for minor levels only, and bad input is a 400', async () => {
    const { GET } = await import('./pitcher-status/route')
    for (const q of ['level=mlb&type=FF&hand=R', 'level=aaa&type=ZZ&hand=R', 'level=aaa&type=FF&hand=X', 'level=nope&type=FF&hand=R']) expect((await GET(req(q))).status, q).toBe(400)
  })
  it('refuses a Pro pitch type to a free viewer, server-side, and serves it to Pro', async () => {
    const { GET } = await import('./pitcher-status/route')
    expect((await GET(req('level=fsl&type=CH&hand=L'))).status).toBe(403)
    expect(getStatuses).not.toHaveBeenCalled()
    isPro.mockResolvedValue(true)
    expect((await GET(req('level=fsl&type=CH&hand=L'))).status).toBe(200)
  })
})
