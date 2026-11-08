import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const isPro = vi.fn(async () => false)
vi.mock('@/lib/require-pro', () => ({ isProViewer: () => isPro() }))
vi.mock('@/lib/deep-look', () => ({ requireDeepLook: async () => null }))

const data = {
  getLeagueBins: vi.fn(async () => []), getPitcherRepertoire: vi.fn(async () => ({ pitcherId: 1, name: 'X', teamAbbr: '', hand: 'R', season: 2026, rows: [{ pitchType: 'FF' }], lockedTypes: 0 })), getMovementCells: vi.fn(async () => ({ seasons: [], latest: 2026 })), getPitcherDots: vi.fn(async () => ({ dots: [], league: {} })),
  getPitcherPoints: vi.fn(async () => []), getThrowersDetailed: vi.fn(async () => ({ throwers: [], league: {} })), searchPitchers: vi.fn(async () => []),
}
vi.mock('@/lib/pitch-shape/data', () => data)
const results = { getResultsPayload: vi.fn(async () => null), getMilbBoard: vi.fn(async () => null), getShapeBoard: vi.fn(async () => null), getMilbVsShape: vi.fn(async () => null), getMlbShapeMeasures: vi.fn(async () => null), getMlbPitcherResults: vi.fn(async () => new Map()) }
vi.mock('@/lib/pitch-shape/results', () => results)
vi.mock('@/lib/pitch-shape/overall', () => ({ getPitcherOverall: vi.fn(async () => null) }))
vi.mock('@/lib/milb-shape/compare-server', () => ({ getLevelsCompared: vi.fn(async () => ({ levels: [], movers: [] })) }))
const caps = { level: 'aaa', season: 2026, coverage: 'full', axes: { velo: true, ride: true, run: true, armAngle: true }, types: { FF: { pitches: 900, armAngle: true }, SL: { pitches: 500, armAngle: false } } }
vi.mock('@/lib/milb-shape/server', () => ({
  getCapabilities: async (level: string, season: number) => (level === 'mlb' ? { level: 'mlb', season, coverage: 'full' } : { ...caps, level, season }),
  resolveSeason: async (_l: string, raw: string | null) => (raw ? Number(raw) : 2026),
  latestMilbSeason: async () => 2026,
}))

const req = (path: string) => new NextRequest(`http://localhost/api/mlb/pitch-shape/${path}`)
beforeEach(() => { vi.clearAllMocks(); isPro.mockResolvedValue(false) })

describe('MLB regression: no level means the MLB readers with exactly the arguments they always had', () => {
  it('bins', async () => {
    const { GET } = await import('./bins/route')
    expect((await GET(req('bins?type=FF&hand=R'))).status).toBe(200)
    expect(data.getLeagueBins).toHaveBeenCalledWith('FF', 'R')
  })
  it('cells', async () => {
    const { GET } = await import('./cells/route')
    await GET(req('cells?type=FF&hand=R&center=league&half=12'))
    expect(data.getMovementCells).toHaveBeenCalledWith('FF', 'R', null, null, 12)
  })
  it('pitcher dots, throwers and search', async () => {
    await (await import('./pitcher-dots/route')).GET(req('pitcher-dots?type=FF&hand=R&season=2026'))
    expect(data.getPitcherDots).toHaveBeenCalledWith('FF', 'R', 2026, 'mlb')
    await (await import('./throwers/route')).GET(req('throwers?type=FF&hand=R&hb=8&ivb=15&radius=1&season=2026'))
    expect(data.getThrowersDetailed).toHaveBeenCalledWith('FF', 'R', 8, 15, 1, 2026, 40, 'mlb')
    await (await import('./pitchers/route')).GET(req('pitchers?q=early'))
    expect(data.searchPitchers).toHaveBeenCalledWith('early', false, 'mlb', undefined)
  })
  it('an unrecognised level is MLB, never a minor-league table', async () => {
    const { GET } = await import('./bins/route')
    await GET(req('bins?type=FF&hand=R&level=double-a'))
    expect(data.getLeagueBins).toHaveBeenCalledWith('FF', 'R')
    await GET(req('bins?type=FF&hand=R&level=AAA'))
    expect(data.getLeagueBins).toHaveBeenLastCalledWith('FF', 'R')
  })
})

describe('minor-league levels', () => {
  it('bins: passes level, season and the arm-angle mode decided from capabilities, and reports the axes', async () => {
    const { GET } = await import('./bins/route')
    const ok = await (await GET(req('bins?type=FF&hand=R&level=aaa&season=2026'))).json()
    expect(data.getLeagueBins).toHaveBeenCalledWith('FF', 'R', 'aaa', 2026, { arm: true })
    expect(ok).toMatchObject({ level: 'aaa', season: 2026, axes: { armAngle: true } })
    isPro.mockResolvedValue(true)
    const three = await (await GET(req('bins?type=SL&hand=L&level=fsl&season=2026'))).json()
    expect(data.getLeagueBins).toHaveBeenLastCalledWith('SL', 'L', 'fsl', 2026, { arm: false })   // SL has no arm angle at this level: three axes
    expect(three.axes.armAngle).toBe(false)
  })
  it('cells, dots, throwers and search carry the level and season', async () => {
    await (await import('./cells/route')).GET(req('cells?type=FF&hand=R&center=league&half=12&level=fsl&season=2026'))
    expect(data.getMovementCells).toHaveBeenCalledWith('FF', 'R', null, null, 12, 2.5, 'fsl', 2026)
    await (await import('./pitcher-dots/route')).GET(req('pitcher-dots?type=FF&hand=R&level=aaa'))
    expect(data.getPitcherDots).toHaveBeenCalledWith('FF', 'R', 2026, 'aaa')
    await (await import('./pitcher-dots/route')).GET(req('pitcher-dots?type=FF&hand=R&level=aaa&pitcher=123'))
    expect(data.getPitcherPoints).toHaveBeenCalledWith('FF', 'R', 2026, 123, 'aaa')
    await (await import('./throwers/route')).GET(req('throwers?type=FF&hand=R&hb=8&ivb=15&radius=1&level=fsl'))
    expect(data.getThrowersDetailed).toHaveBeenCalledWith('FF', 'R', 8, 15, 1, 2026, 40, 'fsl')
    await (await import('./pitchers/route')).GET(req('pitchers?q=early&level=aaa'))
    expect(data.searchPitchers).toHaveBeenCalledWith('early', false, 'aaa', 2026)
  })
})

describe('the Pro boundary holds at every level, server-side', () => {
  const paths = (t: string, lv: string) => [
    `bins?type=${t}&hand=R&level=${lv}`, `cells?type=${t}&hand=R&center=league&half=12&level=${lv}`, `pitcher-dots?type=${t}&hand=R&level=${lv}`,
    `throwers?type=${t}&hand=R&hb=8&ivb=15&radius=1&level=${lv}`, `closest-mlb?type=${t}&hand=R&velo=94&ivb=15&hb=8&slot=40`,
  ]
  const call = async (p: string) => {
    const name = p.split('?')[0]
    const routes: Record<string, () => Promise<{ GET: (r: NextRequest) => Promise<Response> }>> = {
      bins: () => import('./bins/route'), cells: () => import('./cells/route'), 'pitcher-dots': () => import('./pitcher-dots/route'),
      throwers: () => import('./throwers/route'), 'closest-mlb': () => import('./closest-mlb/route'),
    }
    return (await routes[name]()).GET(req(p))
  }
  for (const lv of ['mlb', 'aaa', 'fsl']) {
    it(`${lv}: a free viewer is refused every Pro pitch type (403) and served the free ones`, async () => {
      for (const p of paths('CH', lv)) { const r = await call(p); expect(r.status, p).toBe(403) }
      for (const p of paths('FF', lv)) { const r = await call(p); expect(r.status, p).toBe(200) }
    })
    it(`${lv}: a Pro viewer is served Pro pitch types`, async () => {
      isPro.mockResolvedValue(true)
      for (const p of paths('CH', lv)) { const r = await call(p); expect(r.status, p).toBe(200) }
    })
  }
  it('pitcher search never returns Pro pitch types to a free viewer at a minor level: it asks the reader for free types only', async () => {
    await (await import('./pitchers/route')).GET(req('pitchers?q=early&level=aaa'))
    expect((data.searchPitchers.mock.calls[0] as unknown as unknown[])[1]).toBe(false)
  })
})

describe('outcomes at a minor-league level', () => {
  it('results and board: MLB (no level) keeps its readers; a minor level reads its own table for its season', async () => {
    await (await import('./results/route')).GET(req('results?type=FF&hand=R&half=12'))
    expect(results.getResultsPayload).toHaveBeenCalledWith('FF', 'R', 12)
    await (await import('./results/route')).GET(req('results?type=FF&hand=R&half=12&level=aaa&season=2026'))
    expect(results.getResultsPayload).toHaveBeenLastCalledWith('FF', 'R', 12, 2.5, 'aaa', 2026)
    await (await import('./board/route')).GET(req('board?type=FF&hand=R'))
    expect(results.getShapeBoard).toHaveBeenCalledWith('FF', 'R')
    await (await import('./board/route')).GET(req('board?type=FF&hand=R&level=fsl'))
    expect(results.getMilbBoard).toHaveBeenCalledWith('fsl', 2026, 'FF', 'R')
  })
  it('milb-vs-shape is refused for MLB and for a free viewer on a Pro pitch type, and answers a minor level', async () => {
    const { GET } = await import('./milb-vs-shape/route')
    expect((await GET(req('milb-vs-shape?level=mlb&type=FF&hand=R&pitcher=5'))).status).toBe(400)
    expect((await GET(req('milb-vs-shape?level=aaa&type=CH&hand=R&pitcher=5'))).status).toBe(403)
    expect((await GET(req('milb-vs-shape?level=aaa&type=FF&hand=R&pitcher=5'))).status).toBe(200)
    expect(results.getMilbVsShape).toHaveBeenCalledWith('aaa', 2026, 'FF', 'R', 5)
  })
  it('levels-compared and pitcher-levels apply the Pro rule server-side', async () => {
    const lc = await import('./levels-compared/route')
    expect((await lc.GET(req('levels-compared?type=CH&hand=R'))).status).toBe(403)
    expect((await lc.GET(req('levels-compared?type=FF&hand=R'))).status).toBe(200)
    isPro.mockResolvedValue(true)
    expect((await lc.GET(req('levels-compared?type=CH&hand=R'))).status).toBe(200)
    const pl = await import('./pitcher-levels/route')
    await pl.GET(req('pitcher-levels?id=77'))
    expect(data.getPitcherRepertoire).toHaveBeenCalledWith(77, expect.any(Number), true, 'aaa')   // Pro viewer: every type
    isPro.mockResolvedValue(false)
    await pl.GET(req('pitcher-levels?id=77'))
    expect(data.getPitcherRepertoire).toHaveBeenLastCalledWith(77, expect.any(Number), false, 'fsl')   // free viewer: the free types only
  })
})

describe('capabilities', () => {
  it('is public coverage metadata, and answers for a level asked for', async () => {
    const { GET } = await import('./capabilities/route')
    const j = await (await GET(req('capabilities?level=aaa&season=2026'))).json()
    expect(j.capabilities).toMatchObject({ level: 'aaa', season: 2026, coverage: 'full' })
    const m = await (await GET(req('capabilities?level=nope'))).json()
    expect(m.capabilities.level).toBe('mlb')
  })
})
