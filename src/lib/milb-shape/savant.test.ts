import { describe, it, expect } from 'vitest'
import { fetchRange, halve, looksTruncated, parseCsv, planChunks, savantUrl, type ChunkCache, type Fetcher } from './savant'
import { csvText, row } from './test-fixtures'

const memCache = (): ChunkCache & { size: () => number } => {
  const m = new Map<string, string>()
  return { async get(k) { return m.get(k) ?? null }, async set(k, t) { m.set(k, t) }, size: () => m.size }
}
const noSleep = async () => undefined
const dayOf = (url: string, which: 'gt' | 'lt') => url.match(new RegExp(`game_date_${which}=(\\d{4}-\\d{2}-\\d{2})`))![1]
const daysIn = (a: string, b: string) => { const out: string[] = []; for (let d = Date.parse(a); d <= Date.parse(b); d += 86400000) out.push(new Date(d).toISOString().slice(0, 10)); return out }

/** A fake Savant: 30 rows a day, but at most `cap` rows per response, silently (like the real endpoint at 25,000). Rows are dated, so a truncated response misses later days. */
function fakeSavant(cap: number, perDay = 30): { fetcher: Fetcher; calls: string[] } {
  const calls: string[] = []
  const fetcher: Fetcher = async url => {
    calls.push(url)
    const rows = daysIn(dayOf(url, 'gt'), dayOf(url, 'lt')).flatMap(d => Array.from({ length: perDay }, (_, i) => row({ game: 1001, ab: Number(d.slice(8)), pn: i + 1, game_date: d })))
    return { status: 200, text: csvText(rows.slice(0, cap)) }
  }
  return { fetcher, calls }
}

describe('parseCsv', () => {
  it('strips the BOM and reads quoted fields with commas, quotes and newlines', () => {
    const t = '﻿"pitch_type","des"\n"FF","Smith, Jo ""JJ""\nsecond line"\n"SL","x"\n'
    expect(parseCsv(t)).toEqual([{ pitch_type: 'FF', des: 'Smith, Jo "JJ"\nsecond line' }, { pitch_type: 'SL', des: 'x' }])
  })
})

describe('the request', () => {
  it('always says minors=true and asks for the level it wants', () => {
    const a = savantUrl({ start: '2026-08-01', end: '2026-08-01' }, 2026, 'aaa'), f = savantUrl({ start: '2026-08-01', end: '2026-08-01' }, 2026, 'fsl')
    expect(a).toContain('minors=true'); expect(f).toContain('minors=true')
    expect(a).toContain('hfLevel=AAA%7C'); expect(f).toContain('hfLevel=A%7C')
    expect(a).toContain('statcast-search-minors')
  })
})

describe('truncation: the server stops silently at its cap', () => {
  it('spots the cap and a suspicious round number', () => {
    expect(looksTruncated(25000)).toBe(true)
    expect(looksTruncated(30000)).toBe(true)
    expect(looksTruncated(15000)).toBe(true)
    expect(looksTruncated(6444)).toBe(false)
    expect(looksTruncated(24999)).toBe(false)
  })
  it('splits a truncated chunk in half until nothing is truncated, and ends with every day exactly once', async () => {
    const { fetcher, calls } = fakeSavant(100)   // 3 days x 30 = 90 fits; 7 days x 30 = 210 does not
    const got: string[] = []
    const rep = await fetchRange({ start: '2026-08-01', end: '2026-08-14', season: 2026, level: 'aaa', fetcher, sleep: noSleep, gapMs: 0, chunkDays: 7, cap: 100 }, rows => rows.forEach(r => got.push(r.game_date)))
    expect(rep.gaps).toEqual([])
    expect(rep.truncatedChunks.length).toBeGreaterThan(0)
    expect(new Set(got).size).toBe(14)
    expect(got.length).toBe(14 * 30)           // no day twice, none missing
    expect(calls.length).toBeGreaterThan(2)
  })
  it('a single day that is still at the cap is reported as a gap, never accepted and never looped on', async () => {
    const { fetcher, calls } = fakeSavant(20)    // 30 rows a day but only 20 come back
    const got: string[] = []
    const rep = await fetchRange({ start: '2026-08-01', end: '2026-08-04', season: 2026, level: 'aaa', fetcher, sleep: noSleep, gapMs: 0, chunkDays: 4, cap: 20 }, rows => rows.forEach(r => got.push(r.game_date)))
    expect(got).toEqual([])
    expect(rep.gaps.map(g => g.start)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'])
    expect(rep.gaps[0].reason).toMatch(/cap/)
    expect(calls.length).toBeLessThan(20)
  })
  it('halves into two chunks that cover the whole range', () => {
    const [a, b] = halve({ start: '2026-08-01', end: '2026-08-07' })
    expect(a).toEqual({ start: '2026-08-01', end: '2026-08-03' }); expect(b).toEqual({ start: '2026-08-04', end: '2026-08-07' })
    expect(planChunks('2026-08-01', '2026-08-08', 3).map(c => `${c.start}..${c.end}`)).toEqual(['2026-08-01..2026-08-03', '2026-08-04..2026-08-06', '2026-08-07..2026-08-08'])
  })
})

describe('retries, rate limit and cache', () => {
  it('retries a bad response a bounded number of times with backoff, then reports a gap', async () => {
    let n = 0
    const sleeps: number[] = []
    const rep = await fetchRange({ start: '2026-08-01', end: '2026-08-01', season: 2026, level: 'aaa', fetcher: async () => { n++; return { status: 503, text: 'busy' } }, sleep: async ms => { sleeps.push(ms) }, gapMs: 0, tries: 3 }, () => undefined)
    expect(n).toBe(3)
    expect(rep.gaps).toHaveLength(1)
    expect(sleeps.filter(x => x >= 2000)).toEqual([2000, 4000, 8000])
  })
  it('retries after a thrown network error and then succeeds', async () => {
    let n = 0
    const rows: unknown[] = []
    const rep = await fetchRange({ start: '2026-08-01', end: '2026-08-01', season: 2026, level: 'aaa', fetcher: async () => { n++; if (n < 2) throw new Error('reset'); return { status: 200, text: csvText([row({ game: 1001, ab: 1, pn: 1 })]) } }, sleep: noSleep, gapMs: 0 }, r => rows.push(...r))
    expect(rep.gaps).toEqual([]); expect(rows).toHaveLength(1); expect(n).toBe(2)
  })
  it('an empty body is a day with no games, not a failure', async () => {
    const rep = await fetchRange({ start: '2026-08-01', end: '2026-08-01', season: 2026, level: 'aaa', fetcher: async () => ({ status: 200, text: '' }), sleep: noSleep, gapMs: 0 }, () => undefined)
    expect(rep.gaps).toEqual([]); expect(rep.chunks).toBe(1)
  })
  it('spaces requests by the rate limit', async () => {
    const waits: number[] = []
    const { fetcher } = fakeSavant(1000)
    await fetchRange({ start: '2026-08-01', end: '2026-08-09', season: 2026, level: 'aaa', fetcher, sleep: async ms => { waits.push(ms) }, gapMs: 1000, chunkDays: 3 }, () => undefined)
    expect(waits.length).toBeGreaterThan(0)
    expect(waits.every(w => w <= 1000)).toBe(true)
  })
  it('answers from the cache on a second run: no request is made', async () => {
    const cache = memCache()
    const { fetcher, calls } = fakeSavant(1000)
    const o = { start: '2026-08-01', end: '2026-08-06', season: 2026, level: 'aaa' as const, fetcher, cache, sleep: noSleep, gapMs: 0, chunkDays: 3 }
    await fetchRange(o, () => undefined)
    const first = calls.length
    const rep = await fetchRange(o, () => undefined)
    expect(calls.length).toBe(first)
    expect(rep.fromCache).toBe(2)
    expect(cache.size()).toBe(2)
  })
})
