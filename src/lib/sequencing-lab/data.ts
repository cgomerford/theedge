// src/lib/sequencing-lab/data.ts
//
// Sequencing Lab (/mlb/lab/sequencing): how every pitcher in the league sequences, read ONLY from rows that are already stored; nothing is fetched from Savant here.
//   pitcher_pitch_sequencing  per pitcher and hitter side: after pitch X, what came next (counts and shares)   [written by scripts/fetch_pitcher_hot_zones.py]
//   pitcher_count_tendency    per pitcher and hitter side: in each count, the pitch mix and the zone each pitch most often goes to
//   pitcher_stats             the pitcher's club
//   MLB Stats API people      throwing hand (one batched call per 100 pitchers, kept 24 hours; a pitcher's hand never changes)
// Exact location, movement and foul types are NOT in these tables (no plate location, break or launch angle on fouls), so the page says so and does not invent them.
// Shares are pooled, not averaged: a league figure is every pitcher's counts added together, so a pitcher with more pitches counts for more.
// Everything is read once per 30 minutes per server process; Supabase numerics are coerced with Number() and every read is paginated past the 1,000 row limit.

import { createAdminClient } from '@/lib/supabase'
import { MLB_TEAMS } from '@/lib/teams'

const MLB = 'https://statsapi.mlb.com/api/v1'
const TTL_MS = 30 * 60 * 1000
export const MIN_SEQ = 150            // follow-up pitches a pitcher needs before a sequencing rate is shown as a number
export const FASTBALLS = new Set(['FF', 'SI', 'FC', 'FT', 'FA'])
export const COUNTS = ['0-0', '1-0', '0-1', '1-1', '2-0', '0-2', '2-1', '1-2', '3-0', '3-1', '2-2', '3-2'] as const
const TWO_STRIKE = new Set(['0-2', '1-2', '2-2', '3-2'])

export type SeqSplit = 'all' | 'vs_lhb' | 'vs_rhb'
const SPLITS: SeqSplit[] = ['all', 'vs_lhb', 'vs_rhb']

type RawNext = { pct: number; count: number; pitch_name: string; pitch_type: string }
type RawTrans = Record<string, { pitch_name?: string; total_followed?: number; next_pitches?: RawNext[] }>
type RawCell = { pitches?: { pct: number; count_n: number; top_zone: string | number | null; pitch_name: string; pitch_type: string; top_zone_label?: string }[] }
type SeqRow = { player_id: number | string; player_name: string; season: number | string; split: SeqSplit; transitions: RawTrans | null; updated_at: string | null }
type CountRow = { player_id: number | string; player_name: string; season: number | string; split: SeqSplit; counts: Record<string, RawCell> | null }

export type Metrics = {
  /** follow-up pitches behind the transition rates (n) */
  n: number
  repeat: number | null       // the next pitch is the same type
  fbToOff: number | null      // after a fastball, something that is not a fastball
  offToFb: number | null      // after a non-fastball, a fastball
  firstFb: number | null      // fastball share in 0-0
  twoOff: number | null       // non-fastball share with two strikes
  topShare: number | null     // share of all his pitches that is his single most-used pitch
  variety: number             // pitch types thrown 5% or more
  mix: { code: string; pct: number }[]   // overall mix, top five
}
export type BoardRow = { id: number; name: string; team: string | null; hand: 'L' | 'R' | null } & Metrics

type Acc = { rep: [number, number]; fbOff: [number, number]; offFb: [number, number]; first: [number, number]; two: [number, number]; mix: Map<string, number>; n: number }
const acc = (): Acc => ({ rep: [0, 0], fbOff: [0, 0], offFb: [0, 0], first: [0, 0], two: [0, 0], mix: new Map(), n: 0 })
const pct = (p: [number, number]) => (p[1] > 0 ? (p[0] / p[1]) * 100 : null)
const add = (a: [number, number], num: number, den: number) => { a[0] += num; a[1] += den }

function fold(a: Acc, tr: RawTrans | null, counts: Record<string, RawCell> | null) {
  for (const [from, t] of Object.entries(tr ?? {})) {
    const fb = FASTBALLS.has(from)
    for (const nx of t.next_pitches ?? []) {
      const c = Number(nx.count) || 0
      a.n += c
      add(a.rep, nx.pitch_type === from ? c : 0, c)
      if (fb) add(a.fbOff, FASTBALLS.has(nx.pitch_type) ? 0 : c, c)
      else add(a.offFb, FASTBALLS.has(nx.pitch_type) ? c : 0, c)
    }
  }
  for (const [ct, cell] of Object.entries(counts ?? {})) {
    for (const p of cell.pitches ?? []) {
      const c = Number(p.count_n) || 0
      a.mix.set(p.pitch_type, (a.mix.get(p.pitch_type) ?? 0) + c)
      if (ct === '0-0') add(a.first, FASTBALLS.has(p.pitch_type) ? c : 0, c)
      if (TWO_STRIKE.has(ct)) {
        add(a.two, FASTBALLS.has(p.pitch_type) ? 0 : c, c)
      }
    }
  }
}
function metricsOf(a: Acc): Metrics {
  const total = [...a.mix.values()].reduce((s, v) => s + v, 0)
  const mix = [...a.mix.entries()].map(([code, v]) => ({ code, pct: total > 0 ? (v / total) * 100 : 0 })).sort((x, y) => y.pct - x.pct)
  return { n: a.n, repeat: pct(a.rep), fbToOff: pct(a.fbOff), offToFb: pct(a.offFb), firstFb: pct(a.first), twoOff: pct(a.two), topShare: mix[0] ? mix[0].pct : null, variety: mix.filter(m => m.pct >= 5).length, mix: mix.slice(0, 5) }
}

export type LeagueMatrix = Record<string, Record<string, number>>     // from pitch -> next pitch -> share of that pitch's follow-ups (%)
export type LeagueCounts = Record<string, Record<string, number>>      // count -> pitch -> share of pitches in that count (%)
export type Board = {
  season: number
  rows: Record<SeqSplit, BoardRow[]>
  league: Record<SeqSplit, Metrics>
  matrix: Record<SeqSplit, LeagueMatrix>
  counts: Record<SeqSplit, LeagueCounts>
  throughDate: string | null
}

async function pageAll<T>(table: string, cols: string, season: number): Promise<T[] | null> {
  const supa = createAdminClient()
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supa.from(table).select(cols).eq('season', season).order('player_id').order('split').range(offset, offset + 999)
    if (error) { console.error(`[sequencing-lab] ${table} Supabase error:`, error.message); return null }
    out.push(...((data ?? []) as unknown as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

async function handsOf(ids: number[]): Promise<Map<number, 'L' | 'R'>> {
  const out = new Map<number, 'L' | 'R'>()
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const res = await fetch(`${MLB}/people?personIds=${ids.slice(i, i + 100).join(',')}&fields=people,id,pitchHand,code`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(12000) })
      if (!res.ok) { console.error('[sequencing-lab] hands HTTP', res.status); continue }
      for (const p of (await res.json()).people ?? []) if (p.pitchHand?.code === 'L' || p.pitchHand?.code === 'R') out.set(p.id, p.pitchHand.code)
    } catch (err) { console.error('[sequencing-lab] hands failed:', err instanceof Error ? err.message : err) }
  }
  return out
}

let cache: { at: number; season: number; board: Board } | null = null

/** The whole league board, or null when the sequencing tables are empty or unreadable. */
export async function getSeqBoard(season = new Date().getFullYear()): Promise<Board | null> {
  if (cache && cache.season === season && Date.now() - cache.at < TTL_MS) return cache.board
  const [seq, cnt] = await Promise.all([pageAll<SeqRow>('pitcher_pitch_sequencing', 'player_id, player_name, season, split, transitions, updated_at', season), pageAll<CountRow>('pitcher_count_tendency', 'player_id, player_name, season, split, counts', season)])
  if (!seq || seq.length === 0) return null
  const counts = new Map<string, CountRow>((cnt ?? []).map(r => [`${Number(r.player_id)}|${r.split}`, r]))
  const teamOf = new Map<number, number>()
  const supa = createAdminClient()
  const { data: st } = await supa.from('pitcher_stats').select('player_id, team_id').eq('season', season).range(0, 999)
  for (const r of (st ?? []) as { player_id: number | string; team_id: number | string | null }[]) if (r.team_id != null) teamOf.set(Number(r.player_id), Number(r.team_id))
  const hands = await handsOf([...new Set(seq.filter(r => r.split === 'all').map(r => Number(r.player_id)))])

  const rows = { all: [], vs_lhb: [], vs_rhb: [] } as Record<SeqSplit, BoardRow[]>
  const pool = { all: acc(), vs_lhb: acc(), vs_rhb: acc() } as Record<SeqSplit, Acc>
  const mat = { all: {}, vs_lhb: {}, vs_rhb: {} } as Record<SeqSplit, Record<string, Record<string, number>>>
  const cmix = { all: {}, vs_lhb: {}, vs_rhb: {} } as Record<SeqSplit, Record<string, Record<string, number>>>
  let through: string | null = null
  for (const r of seq) {
    if (!SPLITS.includes(r.split)) continue
    const id = Number(r.player_id), c = counts.get(`${id}|${r.split}`)
    const a = acc()
    fold(a, r.transitions, c?.counts ?? null)
    fold(pool[r.split], r.transitions, c?.counts ?? null)
    for (const [from, t] of Object.entries(r.transitions ?? {})) for (const nx of t.next_pitches ?? []) { const m = (mat[r.split][from] ??= {}); m[nx.pitch_type] = (m[nx.pitch_type] ?? 0) + (Number(nx.count) || 0) }
    for (const [ct, cell] of Object.entries(c?.counts ?? {})) for (const p of cell.pitches ?? []) { const m = (cmix[r.split][ct] ??= {}); m[p.pitch_type] = (m[p.pitch_type] ?? 0) + (Number(p.count_n) || 0) }
    if (r.updated_at && (!through || r.updated_at > through)) through = r.updated_at
    const team = teamOf.get(id)
    rows[r.split].push({ id, name: r.player_name, team: team ? MLB_TEAMS.find(t => t.id === team)?.abbrev ?? null : null, hand: hands.get(id) ?? null, ...metricsOf(a) })
  }
  const norm = (m: Record<string, Record<string, number>>): Record<string, Record<string, number>> => Object.fromEntries(Object.entries(m).map(([k, v]) => { const t = Object.values(v).reduce((s, x) => s + x, 0); return [k, Object.fromEntries(Object.entries(v).map(([c, x]) => [c, t > 0 ? (x / t) * 100 : 0]))] }))
  const board: Board = {
    season, rows,
    league: { all: metricsOf(pool.all), vs_lhb: metricsOf(pool.vs_lhb), vs_rhb: metricsOf(pool.vs_rhb) },
    matrix: { all: norm(mat.all), vs_lhb: norm(mat.vs_lhb), vs_rhb: norm(mat.vs_rhb) },
    counts: { all: norm(cmix.all), vs_lhb: norm(cmix.vs_lhb), vs_rhb: norm(cmix.vs_rhb) },
    throughDate: through ? through.slice(0, 10) : null,
  }
  cache = { at: Date.now(), season, board }
  return board
}

export type Detail = {
  id: number; name: string
  transitions: Record<SeqSplit, Record<string, { name: string; total: number; next: { code: string; pct: number; n: number }[] }>>
  counts: Record<SeqSplit, Record<string, { code: string; name: string; pct: number; n: number; zone: string | null; zoneLabel: string | null }[]>>
}

/** One pitcher's full transitions and count cells for all three hitter sides. */
export async function getSeqDetail(id: number, season = new Date().getFullYear()): Promise<Detail | null> {
  const supa = createAdminClient()
  const [a, b] = await Promise.all([
    supa.from('pitcher_pitch_sequencing').select('player_name, split, transitions').eq('player_id', id).eq('season', season),
    supa.from('pitcher_count_tendency').select('split, counts').eq('player_id', id).eq('season', season),
  ])
  if (a.error || b.error) { console.error('[getSeqDetail] Supabase error:', a.error?.message ?? b.error?.message); return null }
  const seq = (a.data ?? []) as unknown as { player_name: string; split: SeqSplit; transitions: RawTrans | null }[]
  if (seq.length === 0) return null
  const d: Detail = { id, name: seq[0].player_name, transitions: { all: {}, vs_lhb: {}, vs_rhb: {} }, counts: { all: {}, vs_lhb: {}, vs_rhb: {} } }
  for (const r of seq) for (const [from, t] of Object.entries(r.transitions ?? {})) d.transitions[r.split][from] = { name: t.pitch_name ?? from, total: Number(t.total_followed) || 0, next: (t.next_pitches ?? []).map(n => ({ code: n.pitch_type, pct: Number(n.pct), n: Number(n.count) })) }
  for (const r of (b.data ?? []) as unknown as { split: SeqSplit; counts: Record<string, RawCell> | null }[]) for (const [ct, cell] of Object.entries(r.counts ?? {})) d.counts[r.split][ct] = (cell.pitches ?? []).map(p => ({ code: p.pitch_type, name: p.pitch_name, pct: Number(p.pct), n: Number(p.count_n), zone: p.top_zone == null ? null : String(p.top_zone), zoneLabel: p.top_zone_label ?? null }))
  return d
}
