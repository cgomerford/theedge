import 'server-only'
// src/lib/pitch-shape/overall.ts
//
// One pitcher's OVERALL numbers (every pitch he threw, one season) and where each ranks among pitchers, for the Pitch Shape Lab's player detail: the shape tells you
// what a pitch has produced for shapes like it; this tells you what the pitcher has done overall, so a pitcher whose results and shape disagree can be told from one
// whose whole line says the same thing. Reads pitch_shape_results_pitcher (written by scripts/build_pitch_shape_results.py), the stored Savant percentile ranks
// (player_percentiles, Pro-trimmed on the server) and his season line from the MLB Stats API (workload). Returns null on failure with a logged reason; nothing is guessed.

import { createAdminClient } from '@/lib/supabase'
import { milbDb } from '@/lib/milb-shape/dev-db'
import { isMilb, type Level } from '@/lib/milb-shape/levels'
import { logOnce } from '@/lib/log'
import { getPercentileBlocks, type PctBlock } from '@/lib/follows/percentiles'
import { measuresOf, pitcherSums, zeroSums, type Measures, type Sums } from './results-math'
import { getWorkload, type Workload } from './workload'
import { FREE_SANDBOX_TYPES, PITCH_NAMES } from './model'

const MIN_PITCHES = 500            // a pitcher needs this many pitches in the season to be ranked
const TTL_MS = 60 * 60 * 1000

type Raw = { season: number; pitcher_id: number; pitch_type: string; n_pitches: number; n_swings: number; n_whiffs: number; rv_n: number; rv: string | number; pa: number; ab: number; hits: number; tb: number; woba_den: string | number; woba_sum: string | number; xwoba_sum: string | number }
const cached = new Map<string, { at: number; rows: Raw[] }>()

/** One season's pitcher rows: MLB as always, or a minor-league level's own table (the cache key carries the level, so the two never share an entry). */
async function loadSeason(season: number, level: Level = 'mlb'): Promise<Raw[] | null> {
  const ck = isMilb(level) ? `${level}|${season}` : String(season)
  const hit = cached.get(ck)
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.rows
  const supa = isMilb(level) ? await milbDb() : createAdminClient()
  const rows: Raw[] = []
  for (let from = 0; ; from += 1000) {
    const base = isMilb(level) ? supa.from('pitch_shape_results_pitcher_milb').select('season,pitcher_id,pitch_type,n_pitches,n_swings,n_whiffs,rv_n,rv,pa,ab,hits,tb,woba_den,woba_sum,xwoba_sum').eq('level', level) : supa.from('pitch_shape_results_pitcher').select('season,pitcher_id,pitch_type,n_pitches,n_swings,n_whiffs,rv_n,rv,pa,ab,hits,tb,woba_den,woba_sum,xwoba_sum')
    const { data, error } = await base
      .eq('season', season).order('pitcher_id').order('pitch_type').range(from, from + 999)
    if (error) { logOnce('overall:load', 'getPitcherOverall', 'Supabase error', error.message); return null }
    rows.push(...((data ?? []) as unknown as Raw[]))
    if ((data ?? []).length < 1000) break
  }
  cached.set(ck, { at: Date.now(), rows })
  return rows
}

const toSums = (r: Raw): Sums => pitcherSums({ ...r, rv: Number(r.rv), woba_den: Number(r.woba_den), woba_sum: Number(r.woba_sum), xwoba_sum: Number(r.xwoba_sum) })
const add = (a: Sums, b: Sums): Sums => ({ pitches: a.pitches + b.pitches, swings: a.swings + b.swings, whiffs: a.whiffs + b.whiffs, rvN: a.rvN + b.rvN, rv: a.rv + b.rv, pa: a.pa + b.pa, ab: a.ab + b.ab, hits: a.hits + b.hits, tb: a.tb + b.tb, wd: a.wd + b.wd, w: a.w + b.w, x: a.x + b.x })

export type OverallRank = { id: 'runs' | 'woba' | 'xwoba' | 'avg' | 'slg' | 'whiff'; label: string; value: number | null; /** 1 = best */ rank: number | null; of: number; /** share of ranked pitchers he is better than, 1 to 99 */ pct: number | null; fmt: 'runs' | 'rate3' | 'pct' }
export type OverallPitch = { pitchType: string; name: string; pitches: number; share: number; woba: number | null; xwoba: number | null; whiff: number | null; runs100: number | null }
export type Overall = {
  pitcherId: number; season: number
  pitches: number
  /** every measure from his whole season, ungated (a thin sample is labelled by the caller from `ranked`) */
  measures: Measures
  /** true when he has enough pitches to be ranked */
  ranked: boolean
  ranks: OverallRank[]
  byPitch: OverallPitch[]
  workload: Workload | null
  savant: { rows: { key: string; label: string; pct: number }[]; lockedCount: number } | null
}

/** Direction for each ranked measure: true = higher is better for the pitcher. */
const METRIC: { id: OverallRank['id']; label: string; up: boolean; fmt: OverallRank['fmt']; get: (m: Measures) => number | null }[] = [
  { id: 'runs', label: 'Runs allowed per 100 pitches', up: false, fmt: 'runs', get: m => m.runs100 },
  { id: 'woba', label: 'wOBA against', up: false, fmt: 'rate3', get: m => m.woba },
  { id: 'xwoba', label: 'xwOBA against', up: false, fmt: 'rate3', get: m => m.xwoba },
  { id: 'avg', label: 'Average against', up: false, fmt: 'rate3', get: m => m.avg },
  { id: 'slg', label: 'Slugging against', up: false, fmt: 'rate3', get: m => m.slg },
  { id: 'whiff', label: 'Whiffs per swing', up: true, fmt: 'pct', get: m => m.whiff },
]

export async function getPitcherOverall(pitcherId: number, season: number, isPro: boolean, level: Level = 'mlb'): Promise<Overall | null> {
  const all = await loadSeason(season, level)
  if (!all) return null
  const mine = all.filter(r => r.pitcher_id === pitcherId)
  if (mine.length === 0) return null
  // every pitcher's whole-season line, to rank against (ranked pitchers only)
  const by = new Map<number, Sums>()
  for (const r of all) by.set(r.pitcher_id, add(by.get(r.pitcher_id) ?? zeroSums(), toSums(r)))
  const league = [...by.entries()].filter(([, s]) => s.pitches >= MIN_PITCHES).map(([id, s]) => ({ id, m: measuresOf(s) }))
  const mineSums = mine.map(toSums).reduce(add, zeroSums())
  const measures = measuresOf(mineSums, false)
  const ranked = mineSums.pitches >= MIN_PITCHES
  const ranks: OverallRank[] = METRIC.map(mt => {
    const vals = league.map(l => mt.get(l.m)).filter((v): v is number => v != null)
    const own = mt.get(measuresOf(mineSums))   // gated: a rank needs the stat's own sample
    if (!ranked || own == null) return { id: mt.id, label: mt.label, value: mt.get(measures), rank: null, of: vals.length, pct: null, fmt: mt.fmt }
    const better = vals.filter(v => (mt.up ? v > own : v < own)).length
    return { id: mt.id, label: mt.label, value: own, rank: better + 1, of: vals.length, pct: Math.max(1, Math.min(99, Math.round(((vals.length - better - 1) / Math.max(1, vals.length - 1)) * 100))), fmt: mt.fmt }
  })
  const total = mineSums.pitches
  // a viewer who is not Pro only gets the free pitch types' own lines (four-seam, sweeper); the rest of his arsenal stays on the server
  const byPitch: OverallPitch[] = mine.filter(r => r.pitch_type in PITCH_NAMES && (isPro || (FREE_SANDBOX_TYPES as readonly string[]).includes(r.pitch_type))).sort((a, b) => b.n_pitches - a.n_pitches).map(r => {
    const m = measuresOf(toSums(r), false)
    return { pitchType: r.pitch_type, name: PITCH_NAMES[r.pitch_type], pitches: r.n_pitches, share: total ? r.n_pitches / total : 0, woba: m.woba, xwoba: m.xwoba, whiff: m.whiff, runs100: m.runs100 }
  })
  // innings, ERA and Savant percentiles are MLB season lines: a minor-league view carries none of them (null, never a stand-in)
  const workload = isMilb(level) ? null : await getWorkload(pitcherId, season)   // separate await: the percentile block needs his batters faced
  const blocks = isMilb(level) ? new Map<number, PctBlock>() : await getPercentileBlocks([{ id: pitcherId, isPitcher: true, n: workload?.bf ?? 0 }], season, isPro)
  const block: PctBlock | undefined = blocks.get(pitcherId)
  return {
    pitcherId, season, pitches: total, measures, ranked, ranks, byPitch, workload,
    savant: block && block.state === 'ok' ? { rows: block.rows, lockedCount: block.lockedCount } : null,
  }
}

export type OverallLine = { pitches: number; /** pitches since 2024 (every season we hold), so a pitcher with a long full-time record can be told from a new or part-time one */ careerPitches: number; /** share (1 to 99) of ranked pitchers he is better than; null under the sample gate or when he is not ranked */ runsPct: number | null; wobaPct: number | null; xwobaPct: number | null }

/** Every pitcher's whole-season standing in one pass, for the finder: total pitches and where runs allowed, wOBA and xwOBA rank among pitchers with 500+ pitches. */
export async function getOverallLines(season: number): Promise<Map<number, OverallLine> | null> {
  const all = await loadSeason(season)
  if (!all) return null
  const by = new Map<number, Sums>()
  for (const r of all) by.set(r.pitcher_id, add(by.get(r.pitcher_id) ?? zeroSums(), toSums(r)))
  const ranked = [...by.entries()].filter(([, sums]) => sums.pitches >= MIN_PITCHES).map(([id, sums]) => ({ id, m: measuresOf(sums) }))
  const pctOf = (get: (m: Measures) => number | null, mine: number | null, up: boolean): number | null => {
    if (mine == null) return null
    const vals = ranked.map(r => get(r.m)).filter((v): v is number => v != null)
    const better = vals.filter(v => (up ? v > mine : v < mine)).length
    return Math.max(1, Math.min(99, Math.round(((vals.length - better - 1) / Math.max(1, vals.length - 1)) * 100)))
  }
  // pitches in the earlier seasons we hold, added to this one (separate awaits: each season is its own cached read)
  const career = new Map<number, number>()
  for (let y = 2024; y <= season; y++) {
    const rows = y === season ? all : await loadSeason(y)
    for (const r of rows ?? []) career.set(r.pitcher_id, (career.get(r.pitcher_id) ?? 0) + r.n_pitches)
  }
  const out = new Map<number, OverallLine>()
  for (const [id, sums] of by) {
    const m = sums.pitches >= MIN_PITCHES ? measuresOf(sums) : null
    out.set(id, { pitches: sums.pitches, careerPitches: career.get(id) ?? sums.pitches, runsPct: m ? pctOf(x => x.runs100, m.runs100, false) : null, wobaPct: m ? pctOf(x => x.woba, m.woba, false) : null, xwobaPct: m ? pctOf(x => x.xwoba, m.xwoba, false) : null })
  }
  return out
}
