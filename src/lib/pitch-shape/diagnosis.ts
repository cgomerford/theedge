import 'server-only'
// src/lib/pitch-shape/diagnosis.ts
//
// Server read for the Pitch Shape Lab's "Where is it leaking?": one pitcher's season, set against his shape and against league pitchers with his mix. Reads the shape_situation_lines SQL
// function (pitch_events), pitch_shape_pitcher (his average shape per pitch), pitch_shape_results_pitcher (his own run value per pitch) and the results grids (what each shape has produced).
// Returns { needsSql: true } until the SQL function exists, and null on any other failure (logged), so the page shows an empty state and nothing is guessed.

import { createAdminClient } from '@/lib/supabase'
import { logOnce } from '@/lib/log'
import { normalise, processFindings, rankArsenal, situationLeaks, summarise, type ArsenalGap, type Leak, type Line, type Process, type Summary } from './diagnose'
import { getShapeSavedFor } from './results'
import { PITCH_NAMES, type Hand } from './model'
import { MIN_OWN_PITCHES } from './results-math'

export type Diagnosis = {
  pitcherId: number; season: number
  arsenal: ArsenalGap[]
  leaks: Leak[]
  process: Process[]
  summary: Summary[]
  /** wOBA minus xwOBA over his whole season (positive: results worse than the contact quality he allowed), null when thin */
  contactGap: number | null
  /** pitches behind the situation and process checks */
  pitches: number
}
export type DiagnosisResult = Diagnosis | { needsSql: true } | null

const LEAGUE_TTL_MS = 6 * 60 * 60 * 1000
const leagueCache = new Map<number, { at: number; lines: Line[] }>()
const missingFn = (m: string) => /could not find the function|does not exist|schema cache/i.test(m)

async function lines(season: number, pitcher: number | null): Promise<Line[] | 'missing' | null> {
  if (pitcher == null) { const hit = leagueCache.get(season); if (hit && Date.now() - hit.at <= LEAGUE_TTL_MS) return hit.lines }
  const { data, error } = await createAdminClient().rpc('shape_situation_lines', { p_season: season, p_pitcher: pitcher })
  if (error) {
    if (missingFn(error.message)) return 'missing'
    logOnce('diagnosis:rpc', 'getDiagnosis', 'Supabase error', error.message)
    return null
  }
  const out = ((data ?? []) as Record<string, unknown>[]).map(normalise)
  if (pitcher == null) leagueCache.set(season, { at: Date.now(), lines: out })
  return out
}

export async function getDiagnosis(pitcherId: number, season: number): Promise<DiagnosisResult> {
  const mine = await lines(season, pitcherId)
  if (mine === 'missing') return { needsSql: true }
  if (!mine) return null
  const league = await lines(season, null)   // separate await: the league pass is the slow, cached one
  if (league === 'missing') return { needsSql: true }
  if (!league) return null

  const supa = createAdminClient()
  const [shapes, owns] = await Promise.all([
    supa.from('pitch_shape_pitcher').select('pitch_type,p_throws,n_pitches,hb,ivb').eq('season', season).eq('pitcher_id', pitcherId),
    supa.from('pitch_shape_results_pitcher').select('pitch_type,n_pitches,rv_n,rv,woba_den,woba_sum,xwoba_sum').eq('season', season).eq('pitcher_id', pitcherId),
  ])
  if (shapes.error) { logOnce('diagnosis:shapes', 'getDiagnosis', 'Supabase error', shapes.error.message); return null }
  if (owns.error) { logOnce('diagnosis:owns', 'getDiagnosis', 'Supabase error', owns.error.message); return null }
  type Sh = { pitch_type: string; p_throws: string; n_pitches: number; hb: string | number; ivb: string | number }
  type Ow = { pitch_type: string; n_pitches: number; rv_n: number; rv: string | number; woba_den: string | number; woba_sum: string | number; xwoba_sum: string | number }
  const ownBy = new Map(((owns.data ?? []) as unknown as Ow[]).map(o => [o.pitch_type, o]))
  const shapeRows = ((shapes.data ?? []) as unknown as Sh[]).filter(r => r.pitch_type in PITCH_NAMES)
  const total = shapeRows.reduce((s, r) => s + r.n_pitches, 0)

  const raw = await Promise.all(shapeRows.map(async r => {
    const got = await getShapeSavedFor(r.pitch_type, (r.p_throws === 'L' ? 'L' : 'R') as Hand, Number(r.hb), Number(r.ivb))
    const o = ownBy.get(r.pitch_type)
    const ownRuns = o && o.rv_n >= 100 ? (Number(o.rv) / o.rv_n) * 100 : null
    return { pitchType: r.pitch_type, name: PITCH_NAMES[r.pitch_type], pitches: r.n_pitches, share: total ? r.n_pitches / total : 0, shapeSaved: got?.shapeSaved ?? null, ownSaved: ownRuns != null && got?.leagueRuns100 != null ? got.leagueRuns100 - ownRuns : null, small: !!o && o.rv_n < MIN_OWN_PITCHES }
  }))
  const arsenal = rankArsenal(raw)
  const leaks = situationLeaks(mine, league), process = processFindings(mine, league)

  let wd = 0, w = 0, x = 0
  for (const o of ownBy.values()) { wd += Number(o.woba_den); w += Number(o.woba_sum); x += Number(o.xwoba_sum) }
  const contactGap = wd >= 100 ? w / wd - x / wd : null
  const pitches = mine.reduce((s, l) => s + l.pitches, 0)
  return { pitcherId, season, arsenal, leaks, process, summary: summarise(arsenal, leaks, process, contactGap, t => PITCH_NAMES[t] ?? t), contactGap, pitches }
}
