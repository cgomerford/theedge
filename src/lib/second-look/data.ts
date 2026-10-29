// src/lib/second-look/data.ts
//
// Sequencing Lab → Second Look: what happened the next time a hitter saw the same pitcher in the same game. Reads ONLY stored rows, indexed:
//   second_look_summary   counts per scope (league / pitcher / batter / hitter cluster), hand, side, how the first at-bat ended and the pitch that ended it
//   second_look_baseline  the first-pitch mix of every plate appearance for that hand and side (the "0-0" line the second look is set against)
//   league_pa_pairs       the 5 most recent matching pairs (indexed on hand, side, result, pitch)
// Written by scripts/build_league_pa_pairs.py, build_hitter_clusters.py and build_second_look_summary.py. Nothing is counted live and nothing is estimated:
// a missing row is null and the page shows its empty state. Names for the pairs come from one batched MLB people call (free, kept a day).

import { createAdminClient } from '@/lib/supabase'
import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'

export type ResultClass = 'K' | 'BB' | 'HIT' | 'OUT_IN_PLAY'
export const RESULT_CLASSES: ResultClass[] = ['K', 'BB', 'HIT', 'OUT_IN_PLAY']
export type Scope = 'league' | 'pitcher' | 'batter'

export type SlFilters = { hand: 'R' | 'L'; stand: 'R' | 'L'; result: ResultClass; pitch: string | null; scope: Scope; id: number | null; /** the pitch the FIRST at-bat opened with (league view only); null = any */ opened?: string | null }
export type PitchResultTag = 'ball' | 'called' | 'whiff' | 'foul' | 'hit' | 'out' | null
export type PairPitch = { t: string; z: number | null; r: PitchResultTag }
export type SummaryRow = { n: number; opened: number; other: number; mix: Record<string, number>; endingsSame: Record<string, number>; endingsOther: Record<string, number> }
export type RecentPair = { date: string; pitcherId: number; batterId: number; firstClass: string; first: PairPitch[]; second: PairPitch[]; ended: string }
export type SlData = {
  types: { t: string; n: number }[]
  /** the pitches the first at-bat opened with, for this hand, side and result (league view), most common first */
  openers: { t: string; n: number }[]
  pitch: string | null
  row: SummaryRow | null
  baseline: { n: number; mix: Record<string, number> } | null
  recent: RecentPair[]
  names: Record<number, string>
}

type SummaryDb = { n_pairs: number; n_opened_same: number; n_opened_other: number; first_pitch_mix: Record<string, number>; endings_same: Record<string, number>; endings_other: Record<string, number> }
type PairDb = { game_date: string; pitcher_id: number; batter_id: number; ab1_result_class: string; ab1_pitches: PairPitch[]; ab2_pitches: PairPitch[]; ab2_event: string }

async function namesOf(ids: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {}
  const uniq = [...new Set(ids)].filter(Boolean)
  if (uniq.length === 0) return out
  try {
    const res = await throttledMlbFetch(`https://statsapi.mlb.com/api/v1/people?personIds=${uniq.join(',')}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) { console.error('[second-look] names HTTP', res.status); return out }
    for (const p of ((await res.json()).people ?? []) as { id: number; fullName: string }[]) out[p.id] = p.fullName
  } catch (err) { console.error('[second-look] names failed:', err instanceof Error ? err.message : err) }
  return out
}

export async function getSecondLook(f: SlFilters, season = new Date().getFullYear()): Promise<SlData | null> {
  const supa = createAdminClient()
  // The opening-pitch split (second_look_open_summary) is league view only. If that table is not there yet the page still works without it.
  const useOpen = f.scope === 'league' && !!f.opened
  const typesQ = useOpen
    ? supa.from('second_look_open_summary').select('ab1_final_pitch_type, n_pairs').eq('season', season).eq('p_throws', f.hand).eq('stand', f.stand).eq('ab1_first_pitch_type', f.opened as string).eq('ab1_result_class', f.result)
    : supa.from('second_look_summary').select('ab1_final_pitch_type, n_pairs')
      .eq('season', season).eq('scope_type', 'league').eq('scope_id', 0).eq('p_throws', f.hand).eq('stand', f.stand).eq('look_number', 0).eq('ab1_result_class', f.result)
  const baseQ = supa.from('second_look_baseline').select('n_pitches, first_pitch_mix').eq('season', season).eq('p_throws', f.hand).eq('stand', f.stand).limit(1)
  const openersQ = f.scope === 'league'
    ? supa.from('second_look_open_summary').select('ab1_first_pitch_type, n_pairs').eq('season', season).eq('p_throws', f.hand).eq('stand', f.stand).eq('ab1_result_class', f.result)
    : Promise.resolve({ data: [] as unknown[], error: null })
  const [types, base, openersRes] = await Promise.all([typesQ, baseQ, openersQ])
  if (types.error || base.error) { console.error('[getSecondLook] Supabase error:', types.error?.message ?? base.error?.message); return null }
  if (openersRes.error) console.error('[getSecondLook] opening-pitch table not available:', openersRes.error.message)
  const om = new Map<string, number>()
  for (const r of ((openersRes.error ? [] : openersRes.data) ?? []) as { ab1_first_pitch_type: string; n_pairs: number }[]) om.set(r.ab1_first_pitch_type, (om.get(r.ab1_first_pitch_type) ?? 0) + Number(r.n_pairs))
  const openers = [...om.entries()].map(([t, n]) => ({ t, n })).sort((a, b) => b.n - a.n)
  const typeRows = ((types.data ?? []) as { ab1_final_pitch_type: string; n_pairs: number }[]).map(r => ({ t: r.ab1_final_pitch_type, n: Number(r.n_pairs) })).sort((a, b) => b.n - a.n)
  const pitch = f.pitch && typeRows.some(t => t.t === f.pitch) ? f.pitch : (typeRows[0]?.t ?? null)
  const b = (base.data as { n_pitches: number; first_pitch_mix: Record<string, number> }[] | null)?.[0]
  const baseline = b ? { n: Number(b.n_pitches), mix: b.first_pitch_mix } : null
  if (!pitch) return { types: typeRows, openers, pitch: null, row: null, baseline, recent: [], names: {} }

  const scopeId = f.scope === 'league' ? 0 : f.id
  const rowQ = scopeId == null ? Promise.resolve({ data: null, error: null })
    : useOpen
      ? supa.from('second_look_open_summary').select('n_pairs, n_opened_same, n_opened_other, first_pitch_mix, endings_same, endings_other')
        .eq('season', season).eq('p_throws', f.hand).eq('stand', f.stand).eq('ab1_first_pitch_type', f.opened as string).eq('ab1_result_class', f.result).eq('ab1_final_pitch_type', pitch).limit(1)
      : supa.from('second_look_summary').select('n_pairs, n_opened_same, n_opened_other, first_pitch_mix, endings_same, endings_other')
        .eq('season', season).eq('scope_type', f.scope).eq('scope_id', scopeId).eq('p_throws', f.hand).eq('stand', f.stand).eq('look_number', 0).eq('ab1_result_class', f.result).eq('ab1_final_pitch_type', pitch).limit(1)
  let pairQ = supa.from('league_pa_pairs').select('game_date, pitcher_id, batter_id, ab1_result_class, ab1_pitches, ab2_pitches, ab2_event')
    .eq('season', season).eq('p_throws', f.hand).eq('stand', f.stand).eq('ab1_result_class', f.result).eq('ab1_final_pitch_type', pitch)
  if (useOpen) pairQ = pairQ.filter('ab1_pitches->0->>t', 'eq', f.opened as string)
  if (f.scope === 'pitcher' && f.id) pairQ = pairQ.eq('pitcher_id', f.id)
  if (f.scope === 'batter' && f.id) pairQ = pairQ.eq('batter_id', f.id)
  const [rowRes, pairRes] = await Promise.all([rowQ, pairQ.order('game_date', { ascending: false }).limit(5)])
  if (rowRes.error || pairRes.error) { console.error('[getSecondLook] Supabase error:', rowRes.error?.message ?? pairRes.error?.message); return null }
  const r = (rowRes.data as SummaryDb[] | null)?.[0]
  const row: SummaryRow | null = r ? { n: Number(r.n_pairs), opened: Number(r.n_opened_same), other: Number(r.n_opened_other), mix: r.first_pitch_mix, endingsSame: r.endings_same, endingsOther: r.endings_other } : null
  const recent: RecentPair[] = ((pairRes.data ?? []) as PairDb[]).map(p => ({ date: p.game_date, pitcherId: p.pitcher_id, batterId: p.batter_id, firstClass: p.ab1_result_class, first: p.ab1_pitches, second: p.ab2_pitches, ended: p.ab2_event }))
  const names = await namesOf([...recent.flatMap(p => [p.pitcherId, p.batterId]), ...(f.scope !== 'league' && f.id ? [f.id] : [])])
  return { types: typeRows, openers, pitch, row, baseline, recent, names }
}
