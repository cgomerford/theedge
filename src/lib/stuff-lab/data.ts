// src/lib/stuff-lab/data.ts
//
// x9Stuff Lab (/mlb/lab/stuff): the in-house pitch grades. Read ONLY from stored rows; nothing is fetched from Savant here.
//   stuff_lab_pitcher_grades / stuff_lab_pitch_grades / stuff_lab_pressure   the model's outputs  [single writer: scripts/load_stuff_lab.py]
//   pitch_shape_pitcher / pitch_shape_monthly                                his measured speed, break and spin per pitch type (arsenal table, movement chart)
//   pitch_events                                                             what actually happened on each pitch type: the outcome tree is real shares, not model output
// Scale: 100 = league average, every 10 points = one standard deviation, higher = better for the pitcher. A column the model has not written yet is NULL and
// comes back as null, so the page shows a "Pending" block instead of a guess. Supabase numerics arrive as strings, so every one goes through Number().

import { createAdminClient } from '@/lib/supabase'
import { getPitcherShape, leagueSpin, type PitcherShape, type SpinAvg } from '@/lib/sequencing-lab/data'

export const MIN_STUFF_PITCHES = 100        // under this a grade is shown as "Small sample"
export const MIN_LEADERBOARD = 250          // default minimum for the leaderboard

export type Grades = { stuff: number | null; command: number | null; overall: number | null; miss: number | null; chase: number | null; steal: number | null; gb: number | null; pop: number | null; weak: number | null }
export type PitcherGrade = Grades & {
  id: number; name: string; hand: 'L' | 'R' | null; pitches: number
  velo: number | null; ivb: number | null; hb: number | null; spin: number | null
  actual: number | null; expected: number | null; era: number | null; xera: number | null; kbb: number | null; note: string | null
}
export type PitchGrade = Grades & {
  type: string; pitches: number; usage: number | null
  velo: number | null; ivb: number | null; hb: number | null; spin: number | null; actual: number | null; expected: number | null; note: string | null
}
export type PressureRow = { pressure: 'high' | 'normal'; pitches: number; overall: number | null; command: number | null; fastballPct: number | null; actual: number | null }

const n = (v: unknown): number | null => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null }
const hand = (v: unknown): 'L' | 'R' | null => (v === 'L' || v === 'R' ? v : null)
type Raw = Record<string, unknown>
const grades = (r: Raw): Grades => ({ stuff: n(r.stuff_grade), command: n(r.command_grade), overall: n(r.overall_grade), miss: n(r.miss_bats_grade), chase: n(r.chase_grade), steal: n(r.steal_strikes_grade), gb: n(r.ground_balls_grade), pop: n(r.pop_ups_grade), weak: n(r.weak_contact_grade) })

export type StuffBoard = { season: number; version: string; updated: string | null; pitchers: PitcherGrade[]; /** the full model (Command, Overall, sub-grades) has been loaded */ full: boolean }

let cache: { at: number; season: number; v: StuffBoard } | null = null

/** Every graded pitcher this season, or null when nothing has been loaded (the page then shows its empty state). */
export async function getStuffBoard(season = new Date().getFullYear()): Promise<StuffBoard | null> {
  if (cache && cache.season === season && Date.now() - cache.at < 30 * 60 * 1000) return cache.v
  const supa = createAdminClient()
  const rows: Raw[] = []
  for (let o = 0; ; o += 1000) {
    const { data, error } = await supa.from('stuff_lab_pitcher_grades').select('*').eq('season', season).order('pitcher_id').range(o, o + 999)
    if (error) { if (error.code !== 'PGRST205' && error.code !== '42P01') console.error('[getStuffBoard] Supabase error:', error.message); return null }
    rows.push(...((data ?? []) as Raw[]))
    if (!data || data.length < 1000) break
  }
  if (rows.length === 0) return null
  const pitchers: PitcherGrade[] = rows.map(r => ({
    id: Number(r.pitcher_id), name: String(r.player_name ?? r.pitcher_id), hand: hand(r.p_throws), pitches: Number(r.pitches) || 0,
    velo: n(r.velo), ivb: n(r.ivb), hb: n(r.hb), spin: n(r.spin), actual: n(r.actual_rv_per100), expected: n(r.expected_rv_per100),
    era: n(r.era), xera: n(r.xera), kbb: n(r.kbb), note: (r.sample_note as string | null) ?? null, ...grades(r),
  }))
  const updated = rows.map(r => String(r.updated_at ?? '')).sort().pop() ?? null
  const v: StuffBoard = { season, version: String(rows[0].model_version ?? ''), updated: updated ? updated.slice(0, 10) : null, pitchers, full: pitchers.some(p => p.command != null || p.overall != null) }
  cache = { at: Date.now(), season, v }
  return v
}

// ─── What actually happened on each pitch type (from the stored pitches) ───

export type Outcomes = {
  n: number
  take: number; swing: number
  calledStrike: number; ball: number; hbp: number
  whiff: number; foul: number; inPlay: number
  pop: number; weakGb: number; hardGb: number; line: number; weakFb: number; hardFb: number
  /** balls in play with no launch data yet (rows loaded before the Statcast reload) */
  unclassified: number
}
const emptyOutcomes = (): Outcomes => ({ n: 0, take: 0, swing: 0, calledStrike: 0, ball: 0, hbp: 0, whiff: 0, foul: 0, inPlay: 0, pop: 0, weakGb: 0, hardGb: 0, line: 0, weakFb: 0, hardFb: 0, unclassified: 0 })
const HARD_MPH = 95
const BALL = new Set(['ball', 'blocked_ball', 'pitchout', 'automatic_ball', 'intent_ball'])
const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt'])
const FOUL = new Set(['foul', 'foul_bunt', 'bunt_foul_tip'])

type EventRow = { pitch_type: string | null; description: string | null; bb_type: string | null; launch_speed: number | string | null; launch_angle: number | string | null }

/** Fold one pitch into its type's counts. Exported for the test. */
export function addOutcome(o: Outcomes, r: Pick<EventRow, 'description' | 'bb_type' | 'launch_speed' | 'launch_angle'>) {
  const d = r.description ?? ''
  let counted = true
  if (d === 'called_strike' || d === 'automatic_strike') { o.take++; o.calledStrike++ }
  else if (BALL.has(d)) { o.take++; o.ball++ }
  else if (d === 'hit_by_pitch') { o.take++; o.hbp++ }
  else if (WHIFF.has(d)) { o.swing++; o.whiff++ }
  else if (FOUL.has(d)) { o.swing++; o.foul++ }
  else if (d.startsWith('hit_into_play')) {
    o.swing++; o.inPlay++
    const ls = n(r.launch_speed), la = n(r.launch_angle), bb = r.bb_type
    const kind = bb ?? (la == null ? null : la > 50 ? 'popup' : la >= 25 ? 'fly_ball' : la >= 10 ? 'line_drive' : 'ground_ball')
    const hard = ls != null && ls >= HARD_MPH
    if (kind === 'popup') o.pop++
    else if (kind === 'ground_ball') { if (ls == null) o.unclassified++; else if (hard) o.hardGb++; else o.weakGb++ }
    else if (kind === 'line_drive') o.line++
    else if (kind === 'fly_ball') { if (ls == null) o.unclassified++; else if (hard) o.hardFb++; else o.weakFb++ }
    else o.unclassified++
  } else counted = false
  if (counted) o.n++
}

export type StuffDetail = {
  id: number; hand: 'L' | 'R' | null
  pitchGrades: PitchGrade[]; pressure: PressureRow[]
  shape: PitcherShape; league: Record<string, SpinAvg>
  outcomes: Record<string, Outcomes>
}

/** One pitcher in full: his pitch-type grades and pressure rows, his measured shape and what each pitch type has actually produced. */
export async function getStuffDetail(id: number, season = new Date().getFullYear()): Promise<StuffDetail | null> {
  const supa = createAdminClient()
  const [pg, pr, shape, league, h] = await Promise.all([
    supa.from('stuff_lab_pitch_grades').select('*').eq('season', season).eq('pitcher_id', id),
    supa.from('stuff_lab_pressure').select('*').eq('season', season).eq('pitcher_id', id),
    getPitcherShape(id, season), leagueSpin(season),
    supa.from('pitch_shape_pitcher').select('p_throws').eq('season', season).eq('pitcher_id', id).limit(1),
  ])
  if (pg.error) { console.error('[getStuffDetail] Supabase error:', pg.error.message); return null }
  const outcomes: Record<string, Outcomes> = {}
  for (let o = 0; ; o += 1000) {
    const { data, error } = await supa.from('pitch_events').select('pitch_type, description, bb_type, launch_speed, launch_angle').eq('pitcher_id', id).gte('game_date', `${season}-01-01`).order('game_pk').order('at_bat_number').order('pitch_number').range(o, o + 999)
    if (error) { console.error('[getStuffDetail] pitch_events error:', error.message); break }
    for (const r of (data ?? []) as unknown as EventRow[]) if (r.pitch_type) addOutcome((outcomes[r.pitch_type] ??= emptyOutcomes()), r)
    if (!data || data.length < 1000) break
  }
  const pitchGrades: PitchGrade[] = ((pg.data ?? []) as Raw[]).map(r => ({
    type: String(r.pitch_type), pitches: Number(r.pitches) || 0, usage: n(r.usage_pct), velo: n(r.velo), ivb: n(r.ivb), hb: n(r.hb), spin: n(r.spin),
    actual: n(r.actual_rv_per100), expected: n(r.expected_rv_per100), note: (r.sample_note as string | null) ?? null, ...grades(r),
  }))
  const pressure: PressureRow[] = ((pr.data ?? []) as Raw[]).map(r => ({ pressure: r.pressure === 'high' ? 'high' : 'normal', pitches: Number(r.pitches) || 0, overall: n(r.overall_grade), command: n(r.command_grade), fastballPct: n(r.fastball_pct), actual: n(r.actual_rv_per100) }))
  return { id, hand: hand((h.data as { p_throws: string }[] | null)?.[0]?.p_throws), pitchGrades, pressure, shape, league, outcomes }
}
