import { beforeEach, describe, expect, it, vi } from 'vitest'

// A fake Supabase client that records every query (table and filters) and answers from a function. data.ts is exercised exactly as the app uses it.
type Q = { table: string; eq: Record<string, unknown>; ins: Record<string, unknown[]>; gte: Record<string, unknown>; gt: Record<string, unknown> }
const log: Q[] = []
let answer: (q: Q) => unknown[] = () => []

function builder(table: string) {
  const q: Q = { table, eq: {}, ins: {}, gte: {}, gt: {} }
  log.push(q)
  const b: Record<string, unknown> = {}
  const chain = (fn?: (...a: unknown[]) => void) => (...a: unknown[]) => { fn?.(...a); return b }
  b.select = chain(); b.order = chain(); b.range = chain(); b.limit = chain(); b.ilike = chain(); b.lt = chain()
  b.eq = chain((k, v) => { q.eq[k as string] = v })
  b.in = chain((k, v) => { q.ins[k as string] = v as unknown[] })
  b.gte = chain((k, v) => { q.gte[k as string] = v })
  b.gt = chain((k, v) => { q.gt[k as string] = v })
  b.maybeSingle = () => Promise.resolve({ data: answer(q)[0] ?? null, error: null })
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: answer(q), error: null, count: answer(q).length }).then(res)
  return b
}
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))
vi.mock('@/lib/log', () => ({ logOnce: () => undefined, log: { error: () => undefined } }))

const bin = (velo: number, ivb: number, hb: number, slot: number, n: number) => ({ velo_bin: velo, ivb_bin: ivb, hb_bin: hb, slot_bin: slot, n_pitches: n, n_swings: 5, n_whiffs: 2, n_called_strikes: 1, n_csw: 3, n_bbe: 1, xwoba_con_sum: 0.3, n_hard_hit: 0, n_gb: 0 })

beforeEach(() => { log.length = 0; answer = () => [] })

describe('level and season isolation in queries and caches', () => {
  it('MLB (the default) reads the MLB table exactly as before: league span and era, no level', async () => {
    const { getLeagueBins } = await import('./data')
    answer = () => [bin(94, 8, 4, 3, 10)]
    const bins = await getLeagueBins('FF', 'R')
    expect(bins).toHaveLength(1)
    const q = log[0]
    expect(q.table).toBe('pitch_shape_bins')
    expect(q.eq).toMatchObject({ span: '2024-2026', coord_era: '2026', pitch_type: 'FF', p_throws: 'R' })
    expect('level' in q.eq).toBe(false)
  })
  it('a minor-league read goes to the minor-league table with its level and season, never the MLB table', async () => {
    const { getLeagueBins } = await import('./data')
    answer = () => [bin(94, 8, 4, 3, 10)]
    await getLeagueBins('SL', 'L', 'aaa', 2026)
    const q = log[0]
    expect(q.table).toBe('pitch_shape_bins_milb')
    expect(q.eq).toMatchObject({ level: 'aaa', span: '2026', pitch_type: 'SL', p_throws: 'L' })
    expect(q.gte).toMatchObject({ slot_bin: 0 })   // four-axis read: pitches with no arm angle are left out
    expect(log.some(l => l.table === 'pitch_shape_bins')).toBe(false)
  })
  it('the cache cannot answer for another level or season: each one queries for itself, and a repeat is served from its own entry', async () => {
    const { getLeagueBins } = await import('./data')
    answer = q => [bin(q.eq.level === 'aaa' ? 95 : 90, 8, 4, 3, 10)]
    const aaa = await getLeagueBins('CH', 'R', 'aaa', 2026)
    const fsl = await getLeagueBins('CH', 'R', 'fsl', 2026)
    const aaa25 = await getLeagueBins('CH', 'R', 'aaa', 2025)
    expect(aaa[0].veloBin).toBe(95); expect(fsl[0].veloBin).toBe(90)
    expect(log.map(l => `${l.eq.level}|${l.eq.span}`)).toEqual(['aaa|2026', 'fsl|2026', 'aaa|2025'])
    const n = log.length
    expect((await getLeagueBins('CH', 'R', 'aaa', 2026))[0].veloBin).toBe(95)
    expect(log.length).toBe(n)
    void aaa25
  })
  it('a cohort with no arm angle is read on three axes: no slot filter, every band collapsed into one', async () => {
    const { getLeagueBins } = await import('./data')
    answer = () => [bin(94, 8, 4, -1, 10), bin(94, 8, 4, 2, 5), bin(94, 8, 4, 5, 1)]
    const bins = await getLeagueBins('KC', 'R', 'fsl', 2026, { arm: false })
    expect('slot_bin' in log[0].gte).toBe(false)
    expect(bins).toHaveLength(1)
    expect(bins[0]).toMatchObject({ pitches: 16, slotBin: 0 })
  })
  it('the movement map reads one minor-league season from the minor-league table; MLB still reads 2024 on', async () => {
    const { getMovementCells } = await import('./data')
    answer = () => [{ span: '2026', n_pitches: 3, n_swings: 2, n_whiffs: 1, cells: [84, 156, 3, 2, 1] }]
    const m = await getMovementCells('FF', 'R', null, null, 12, 2.5, 'fsl', 2026)
    expect(m?.latest).toBe(2026); expect(m?.seasons).toHaveLength(1)
    expect(log[0].table).toBe('pitch_shape_cells_milb')
    expect(log[0].eq).toMatchObject({ level: 'fsl', pitch_type: 'FF', p_throws: 'R' })
    expect(log[0].ins.span).toEqual(['2026'])
    log.length = 0
    answer = () => []
    await getMovementCells('ST', 'L', null, null, 12)
    expect(log[0].table).toBe('pitch_shape_cells')
    expect((log[0].ins.span as string[])[0]).toBe('2024')
    expect('level' in log[0].eq).toBe(false)
  })
  it('a minor level with no rows is an empty answer, not a fallback to MLB rows', async () => {
    const { getMovementCells } = await import('./data')
    answer = () => []
    expect(await getMovementCells('FF', 'R', null, null, 12, 2.5, 'aaa', 2031)).toBeNull()
    expect(log.every(l => l.table === 'pitch_shape_cells_milb')).toBe(true)
  })
  it('pitcher dots, throwers and search use the minor-league pitcher table scoped to the level; MLB is unscoped as before', async () => {
    const { getPitcherDots, getThrowersDetailed, searchPitchers } = await import('./data')
    await getPitcherDots('FF', 'R', 2026, 'aaa')
    await getThrowersDetailed('FF', 'R', 8, 15, 1, 2026, 40, 'fsl')
    await searchPitchers('early', true, 'aaa', 2026)
    expect(log.map(l => [l.table, l.eq.level])).toEqual([['pitch_shape_pitcher_milb', 'aaa'], ['pitch_shape_pitcher_milb', 'fsl'], ['pitch_shape_pitcher_milb', 'aaa']])
    log.length = 0
    await getPitcherDots('FF', 'R', 2026)
    await getThrowersDetailed('FF', 'R', 8, 15, 1, 2026)
    await searchPitchers('early', true)
    expect(log.map(l => [l.table, 'level' in l.eq])).toEqual([['pitch_shape_pitcher', false], ['pitch_shape_pitcher', false], ['pitch_shape_pitcher', false]])
  })
  it('available pitch types for a level come from that level\'s cells', async () => {
    const { getAvailablePitchTypes } = await import('./data')
    answer = () => [{ pitch_type: 'SL', n_pitches: 400 }, { pitch_type: 'FF', n_pitches: 900 }]
    expect(await getAvailablePitchTypes('aaa', 2026)).toEqual(['FF', 'SL'])
    expect(log[0].table).toBe('pitch_shape_cells_milb'); expect(log[0].eq).toMatchObject({ level: 'aaa', span: '2026' })
  })
})
