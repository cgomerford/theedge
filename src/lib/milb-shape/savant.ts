// src/lib/milb-shape/savant.ts
//
// Pulls Baseball Savant's minor-league pitch CSV in date chunks, safely.
//   URL (curl-verified 2026-11-08): https://baseballsavant.mlb.com/statcast-search-minors/csv?all=true&hfGT=R%7C&hfSea=Y%7C&game_date_gt=D&game_date_lt=D&type=details&player_type=pitcher&minors=true&hfLevel=AAA%7C
//   * minors=true is mandatory. hfLevel=AAA| returns Triple-A, hfLevel=A| returns all of Single-A (three leagues; league.ts keeps only the Florida State League).
//   * The endpoint silently stops at exactly 25,000 rows. A 7-day request on 2026-08-01..07 returned 25,000 rows covering only Aug 2 (partly) and Aug 4-7: Aug 1 and 3 were
//     missing with no warning. So any response at or over the cap, or with a suspicious round row count, is split in half until it is not truncated. One day with one level
//     filter holds about 5,000 rows, so a single-day cap would be a real surprise: it is recorded as an incomplete chunk (a gap), never accepted and never retried in a loop.
//   * Requests are sequential and rate-limited, retried a bounded number of times with backoff, and the raw text is cached on disk (gzip) so a failed run resumes where it stopped.
// The network and the disk are injected, so the tests run on fixtures.

import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { MilbLevel } from './levels'

export const SAVANT_CAP = 25000
const LEVEL_FILTER: Record<'aaa' | 'fsl', string> = { aaa: 'AAA', fsl: 'A' }

export type Chunk = { start: string; end: string }
export type Fetcher = (url: string) => Promise<{ status: number; text: string }>
export type ChunkCache = { get(key: string): Promise<string | null>; set(key: string, text: string): Promise<void> }

/**
 * The Savant request for one chunk. Triple-A and the Florida State League use the minor-league endpoint (minors=true, regular season). Spring Training is the major-league
 * endpoint with game type S (curl-verified 2026-03-05: about 4,550 pitches a day, speed and movement on 99%, no arm angle). The Arizona Fall League is not on Savant at all:
 * its pitches come from the MLB Stats API game feed (see exhibition.ts), so asking for its Savant URL is a bug and throws.
 */
export function savantUrl(c: Chunk, season: number, level: MilbLevel): string {
  if (level === 'afl') throw new Error('[savantUrl] the Arizona Fall League is not on Savant; it is read from the game feed')
  const common = `all=true&hfSea=${season}%7C&game_date_gt=${c.start}&game_date_lt=${c.end}&type=details&player_type=pitcher`
  if (level === 'st') return `https://baseballsavant.mlb.com/statcast_search/csv?${common}&hfGT=S%7C`
  return `https://baseballsavant.mlb.com/statcast-search-minors/csv?${common.replace('all=true&', 'all=true&hfGT=R%7C&')}&minors=true&hfLevel=${LEVEL_FILTER[level]}%7C`
}

/** Parse CSV text (BOM-safe, quoted fields, embedded commas and newlines) to row objects keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else q = false } else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  if (rows.length === 0) return []
  const head = rows[0]
  return rows.slice(1).map(r => { const o: Record<string, string> = {}; head.forEach((h, i) => { o[h] = r[i] ?? '' }); return o })
}

const looksLikeCsv = (t: string) => t.replace(/^﻿/, '').trimStart().startsWith('"pitch_type"')

/** A row count that says "the server stopped here": at or over the cap, or a large exact multiple of 5,000. */
export const looksTruncated = (rows: number, cap = SAVANT_CAP) => rows >= cap || (rows >= cap * 0.4 && rows % (cap / 5) === 0)

export type Gap = { start: string; end: string; reason: string }
export type FetchReport = { requests: number; fromCache: number; truncatedChunks: Chunk[]; gaps: Gap[]; chunks: number }
export type FetchOpts = {
  start: string; end: string; season: number; level: MilbLevel
  fetcher: Fetcher; cache?: ChunkCache; sleep?: (ms: number) => Promise<void>
  chunkDays?: number; tries?: number; gapMs?: number
  /** the server's row cap; the real one by default (a test passes a small one) */
  cap?: number
  log?: (msg: string) => void
}

const dayMs = 86400000
const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * dayMs).toISOString().slice(0, 10)
const span = (c: Chunk) => Math.round((Date.parse(c.end) - Date.parse(c.start)) / dayMs) + 1

export function planChunks(start: string, end: string, chunkDays: number): Chunk[] {
  const out: Chunk[] = []
  for (let d = start; d <= end; d = addDays(d, chunkDays)) out.push({ start: d, end: addDays(d, chunkDays - 1) > end ? end : addDays(d, chunkDays - 1) })
  return out
}

/** Split a multi-day chunk in half. */
export function halve(c: Chunk): [Chunk, Chunk] {
  const n = span(c), mid = addDays(c.start, Math.floor(n / 2) - 1)
  return [{ start: c.start, end: mid }, { start: addDays(mid, 1), end: c.end }]
}

/**
 * Fetch every chunk between start and end, splitting any truncated one. Yields each good chunk's rows (strings, as parsed) with its chunk, in date order.
 * Rows are handed to `onRows` as they arrive so nothing has to be held. Resolves with the report; `gaps` lists anything that could not be completed.
 */
export async function fetchRange(o: FetchOpts, onRows: (rows: Record<string, string>[], c: Chunk) => void): Promise<FetchReport> {
  const sleep = o.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
  const tries = o.tries ?? 4, gapMs = o.gapMs ?? 1000
  const log = o.log ?? (() => undefined)
  const rep: FetchReport = { requests: 0, fromCache: 0, truncatedChunks: [], gaps: [], chunks: 0 }
  let last = 0

  async function get(c: Chunk): Promise<string | null> {
    const url = savantUrl(c, o.season, o.level)
    const key = crypto.createHash('sha1').update(url).digest('hex')
    const cached = o.cache ? await o.cache.get(key) : null
    if (cached != null) { rep.fromCache++; return cached }
    for (let attempt = 0; attempt < tries; attempt++) {
      const wait = gapMs - (Date.now() - last)
      if (wait > 0) await sleep(wait)
      last = Date.now()
      rep.requests++
      try {
        const res = await o.fetcher(url)
        if (res.status === 200 && looksLikeCsv(res.text)) { if (o.cache) await o.cache.set(key, res.text); return res.text }
        if (res.status === 200 && res.text.trim().length < 500) { if (o.cache) await o.cache.set(key, ''); return '' }   // a day with no games
        log(`  ${c.start}..${c.end}: unexpected response (HTTP ${res.status}, ${res.text.length} bytes), try ${attempt + 1}/${tries}`)
      } catch (e) {
        log(`  ${c.start}..${c.end}: ${e instanceof Error ? e.message : e}, try ${attempt + 1}/${tries}`)
      }
      await sleep(2000 * 2 ** attempt)
    }
    return null
  }

  async function run(c: Chunk): Promise<void> {
    const text = await get(c)
    if (text == null) { rep.gaps.push({ ...c, reason: `no usable response after ${tries} tries` }); return }
    const rows = text === '' ? [] : parseCsv(text)
    if (looksTruncated(rows.length, o.cap)) {
      rep.truncatedChunks.push(c)
      if (span(c) > 1) { log(`  ${c.start}..${c.end}: ${rows.length} rows looks truncated, splitting`); const [a, b] = halve(c); await run(a); await run(b); return }
      rep.gaps.push({ ...c, reason: `a single day returned ${rows.length} rows, at the server's cap; coverage for it is incomplete` })
      return
    }
    rep.chunks++
    onRows(rows, c)
  }

  for (const c of planChunks(o.start, o.end, o.chunkDays ?? 3)) await run(c)
  return rep
}

/** Disk cache of raw responses, gzip-compressed, one file per request. */
export function fileCache(dir: string): ChunkCache {
  fs.mkdirSync(dir, { recursive: true })
  const f = (k: string) => path.join(dir, `${k}.csv.gz`)
  return {
    async get(k) { try { return zlib.gunzipSync(fs.readFileSync(f(k))).toString('utf8') } catch { return null } },
    async set(k, t) { const tmp = `${f(k)}.tmp`; fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(t, 'utf8'))); fs.renameSync(tmp, f(k)) },
  }
}
