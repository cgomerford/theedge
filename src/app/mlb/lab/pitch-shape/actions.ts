'use server'

// src/app/mlb/lab/pitch-shape/actions.ts
//
// Server actions for the Pitch Shape Lab's two interactive parts, so the browser never fetches league data itself:
//   shapeHeat      the league map restricted to a speed and arm-angle range (built from the 2-inch league bins; see filtered-heat.ts)
//   shapeSpot      for one spot on the map: how many pitchers throw that shape, how the shape ranks, and how those pitchers do (the hover panel)
//   shapePitchers  the pitchers who throw the shape around a chosen spot, grouped by whether their own whiffs per swing is below, at or above the league rate at that shape
// Pro rule, unchanged: four-seam and sweeper are free, every other pitch type is Pro. It is enforced here, so the UI lock is not the gate. Reads the league tables only, never Savant.
// Describes what already happened; "below" and "above" are against the league rate for the same shape and filter, not a forecast.

import { isProViewer } from '@/lib/require-pro'
import { getPitcherPitchLog } from '@/lib/pitcher-pitch-log'
import { getWhy, type WhyResult } from '@/lib/pitch-shape/diagnosis'
import { getPitchViewMonths, getLeagueBins, getPitcherPoints, getPitcherRepertoire, getPitcherSampleRows, searchPitchers } from '@/lib/pitch-shape/data'
import { getMilbBoard, getResultsPayloadAround, getShapeBoard, type Board } from '@/lib/pitch-shape/results'
import { getPitcherOverall, type Overall } from '@/lib/pitch-shape/overall'
import { getDiagnosis, type DiagnosisResult } from '@/lib/pitch-shape/diagnosis'
import { getResultsGrid, metricLattice, type CellMetric, type MetricLattice } from '@/lib/pitch-shape/results-grid'
import { measuresOf, percentile, runsSaved, windowSums, type Measures, type ResultsPayload } from '@/lib/pitch-shape/results-math'
import { METRICS, type MetricKey } from '@/components/pitch-shape/metrics'
import { getBinsFor, levelHasArm, seasonFor } from '@/lib/pitch-shape/cells-for'
import { centreOf, filteredHeat, NO_FILTER, rateAt, type BinFilter, type BinMetric, type FilteredHeat, type Standing } from '@/lib/pitch-shape/filtered-heat'
import { describeSpot, outliersOf, pitchersAtSpot, rate as rateOf, type Outliers, type Spot, type SpotDot, type SpotInput } from '@/lib/pitch-shape/spot'
import { FREE_SANDBOX_TYPES, PITCH_NAMES, type Hand, type ShapeBin } from '@/lib/pitch-shape/model'
import { handsOf, mergeBoards, type ViewHand } from '@/components/pitch-shape/bothHands'
import { limitsFor } from '@/lib/milb-shape/limits'
import { isMilb, parseLevel } from '@/lib/milb-shape/levels'

const num = (v: unknown, lo: number, hi: number, fallback: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback }
const cleanFilter = (f: Partial<BinFilter> | undefined): BinFilter => ({
  vMin: num(f?.vMin, 0, 200, NO_FILTER.vMin), vMax: num(f?.vMax, 0, 200, NO_FILTER.vMax),
  aMin: num(f?.aMin, 0, 100, NO_FILTER.aMin), aMax: num(f?.aMax, 0, 100, NO_FILTER.aMax),
})

type Base = { type: string; hand: ViewHand; level: string; radius: number; filter?: Partial<BinFilter> }
async function gate(type: string, hand: string): Promise<'ok' | 'bad' | 'pro'> {
  if (!(type in PITCH_NAMES) || !(hand === 'R' || hand === 'L' || hand === 'B')) return 'bad'
  if (!(FREE_SANDBOX_TYPES as readonly string[]).includes(type) && !(await isProViewer())) return 'pro'
  return 'ok'
}

export type HeatResult = { ok: true; heat: FilteredHeat } | { ok: false; error: 'pro' | 'bad' | 'none' }

export async function shapeHeat(input: Base & { centre: { hb: number; ivb: number }; /** the measure to build (whiffs per swing unless another bin measure is asked for) */ metric?: BinMetric }): Promise<HeatResult> {
  const g = await gate(input.type, input.hand)
  if (g !== 'ok') return { ok: false, error: g }
  const level = parseLevel(input.level)
  const bins = await getBinsFor(input.type, input.hand, level)
  if (bins.length === 0) return { ok: false, error: 'none' }
  const centre = { hb: num(input.centre?.hb, -60, 60, centreOf(bins).hb), ivb: num(input.centre?.ivb, -60, 60, centreOf(bins).ivb) }
  const metric: BinMetric = (['whiff', 'csw', 'hardhit', 'gb', 'xwobacon'] as const).find(m => m === input.metric) ?? 'whiff'
  return { ok: true, heat: filteredHeat(bins, cleanFilter(input.filter), num(input.radius, 0.5, 2, 1), centre, metric) }
}

export type PitcherRow = { pitcherId: number; name: string; teamAbbr: string; hand: Hand; nPitches: number; velo: number; slot: number; hb: number; ivb: number; swings: number; whiffs: number; rate: number; diff: number; standing: Standing
  /** how many of his sampled pitches are in the window, how many were sampled, and that share applied to all his pitches of this type (a rough count) */
  inSpot: number; sample: number; est: number }
export type PitchersResult =
  | { ok: true; leagueRate: number | null; leagueSwings: number; windowIn: number; season: number; groups: Record<Standing, { rows: PitcherRow[]; total: number }>; tooFew: number; inWindow: number }
  | { ok: false; error: 'pro' | 'bad' }
export type SpotResult = { ok: true; spot: Spot; leagueRate: number | null; windowIn: number; season: number } | { ok: false; error: 'pro' | 'bad' }

const LIST_MAX = 12

/** every pitcher's average shape and 60-pitch sample for the type, level and hand(s), in the form spot.ts reads */
async function spotDots(type: string, hand: ViewHand, level: ReturnType<typeof parseLevel>, season: number): Promise<SpotDot[]> {
  const per = await Promise.all(handsOf(hand).map(h => getPitcherSampleRows(type, h, season, level)))
  return per.flat().map(r => ({ id: r.pitcherId, name: r.name, team: r.teamAbbr, hand: r.hand, hb: r.hb, ivb: r.ivb, v: r.velo, s: r.slot, sw: r.nSwings, wh: r.nWhiffs, p: r.nPitches, pts: r.points }))
}

type SpotBase = Base & { hb: number; ivb: number; /** the league rate the map shows at this spot, so the panel and the colour agree; null = too few swings, omitted = work it out from the league bins */ leagueRate?: number | null; leagueSwings?: number }

async function prepare(input: SpotBase) {
  const level = parseLevel(input.level)
  const filter = cleanFilter(input.filter), radius = num(input.radius, 0.5, 2, 1)
  const hb = num(input.hb, -60, 60, 0), ivb = num(input.ivb, -60, 60, 0)
  const season = await seasonFor(level)
  let leagueRate: number | null, leagueSwings: number
  if (input.leagueRate !== undefined) { leagueRate = input.leagueRate == null ? null : num(input.leagueRate, 0, 1, 0); leagueSwings = num(input.leagueSwings, 0, 1e9, 0) }
  else { const r = rateAt(await getBinsFor(input.type, input.hand, level), filter, radius, hb, ivb); leagueRate = r.rate; leagueSwings = r.swings }
  const q: SpotInput = {
    probe: { hb, ivb }, leagueRate, windowIn: Math.max(1, radius),
    vRange: filter.vMin > 0 || filter.vMax < 200 ? [filter.vMin, filter.vMax] : null, aRange: filter.aMin > 0 || filter.aMax < 100 ? [filter.aMin, filter.aMax] : null,
    minSwings: Math.max(limitsFor(level).ownSwings, 50),
  }
  return { level, season, q, dots: await spotDots(input.type, input.hand, level, season), leagueSwings }
}

export async function shapeSpot(input: SpotBase): Promise<SpotResult> {
  const g = await gate(input.type, input.hand)
  if (g !== 'ok') return { ok: false, error: g }
  const { q, dots, season } = await prepare(input)
  return { ok: true, spot: describeSpot(dots, q), leagueRate: q.leagueRate, windowIn: q.windowIn, season }
}

export async function shapePitchers(input: SpotBase): Promise<PitchersResult> {
  const g = await gate(input.type, input.hand)
  if (g !== 'ok') return { ok: false, error: g }
  const { q, dots, season, leagueSwings } = await prepare(input)
  const at = pitchersAtSpot(dots, q)
  const groups: Record<Standing, { rows: PitcherRow[]; total: number }> = { below: { rows: [], total: 0 }, at: { rows: [], total: 0 }, above: { rows: [], total: 0 } }
  let tooFew = 0
  if (q.leagueRate != null) {
    const rated = at.filter(m => { const ok = m.dot.sw >= q.minSwings; if (!ok) tooFew++; return ok }).map(m => {
      const s = rateOf(m, q.leagueRate!)
      const d = m.dot
      return { z: s.z, share: m.share, row: { pitcherId: d.id, name: d.name, teamAbbr: d.team, hand: d.hand, nPitches: d.p, velo: d.v, slot: d.s, hb: d.hb, ivb: d.ivb, swings: d.sw, whiffs: d.wh, rate: d.sw > 0 ? d.wh / d.sw : 0, diff: s.diff, standing: s.standing, inSpot: m.k, sample: d.pts.length, est: m.est } as PitcherRow }
    })
    for (const k of ['below', 'at', 'above'] as Standing[]) {
      const mine = rated.filter(r => r.row.standing === k)
      mine.sort((a, b) => (k === 'below' ? a.z - b.z : k === 'above' ? b.z - a.z : b.row.est - a.row.est))
      groups[k] = { rows: mine.slice(0, LIST_MAX).map(r => r.row), total: mine.length }
    }
  }
  return { ok: true, leagueRate: q.leagueRate, leagueSwings, windowIn: q.windowIn, season, groups, tooFew, inWindow: at.length }
}

export type OutliersResult = { ok: true; data: Outliers | null; season: number } | { ok: false; error: 'pro' | 'bad' }

/** the average shape of the pitch and the pitchers furthest from it (inside any speed and arm-angle range that is on): what the map marks by default */
export async function shapeOutliers(input: { type: string; hand: ViewHand; level: string; filter?: Partial<BinFilter> }): Promise<OutliersResult> {
  const g = await gate(input.type, input.hand)
  if (g !== 'ok') return { ok: false, error: g }
  const level = parseLevel(input.level)
  const f = cleanFilter(input.filter)
  const season = await seasonFor(level)
  const dots = await spotDots(input.type, input.hand, level, season)
  return { ok: true, data: outliersOf(dots, { vRange: f.vMin > 0 || f.vMax < 200 ? [f.vMin, f.vMax] : null, aRange: f.aMin > 0 || f.aMax < 100 ? [f.aMin, f.aMax] : null }), season }
}

export type PitcherHitLite = { id: number; name: string; team: string; hand: Hand; types: { code: string; n: number }[] }
export type FindResult = { ok: true; hits: PitcherHitLite[] } | { ok: false; error: 'bad' }

/** pitchers whose name contains the text, at a level, for the search box. Only pitch types the viewer may see are listed (Pro types need Pro), the same rule searchPitchers applies. */
export async function findPitchers(input: { q: string; level: string }): Promise<FindResult> {
  const q = String(input.q ?? '').slice(0, 40)
  if (q.trim().length < 2) return { ok: true, hits: [] }
  const level = parseLevel(input.level)
  const hits = await searchPitchers(q, await isProViewer(), level, await seasonFor(level))
  return { ok: true, hits: hits.map(h => ({ id: h.id, name: h.name, team: h.team, hand: h.hand, types: h.pitches.map(p => ({ code: p.pitchType, n: p.n })).sort((a, b) => b.n - a.n) })) }
}

// ---- outcome measures (wOBA, xwOBA, runs saved, average, slugging) and the numbers behind each ----

export type MetricResult = { ok: true; lattice: MetricLattice } | { ok: false; error: 'pro' | 'bad' | 'none' }

/** the map for one outcome measure, read from the 0.1-inch league outcomes on the server (they cannot be filtered by speed or arm angle) */
export async function shapeMetric(input: { type: string; hand: ViewHand; level: string; metric: MetricKey; radius: number; centre: { hb: number; ivb: number }; year?: number }): Promise<MetricResult> {
  const g = await gate(input.type, input.hand)
  if (g !== 'ok') return { ok: false, error: g }
  if (!(METRICS[input.metric]?.source === 'cells')) return { ok: false, error: 'bad' }
  const b = await getResultsGrid(input.type, input.hand, parseLevel(input.level), yearOf(input.year))
  if (!b) return { ok: false, error: 'none' }
  const centre = { hb: num(input.centre?.hb, -60, 60, 0), ivb: num(input.centre?.ivb, -60, 60, 0) }
  return { ok: true, lattice: metricLattice(b, input.metric as CellMetric, num(input.radius, 0.5, 2, 1), centre) }
}

// ---- the original results table and pitcher board (the sections the finder always had) ----

const boardCache = new Map<string, { at: number; board: Board | null }>()
/** the Shape Score board for a pitch type, level and hand(s): every pitcher with enough of the pitch, his shape, his own results and what pitches shaped like his have produced. Both hands are merged, as the old finder did. */
async function boardFor(type: string, hand: ViewHand, level: ReturnType<typeof parseLevel>): Promise<Board | null> {
  const key = `${level}|${type}|${hand}`
  const hit = boardCache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.board
  const season = await seasonFor(level)
  const boards = await Promise.all(handsOf(hand).map(h => (isMilb(level) ? getMilbBoard(level, season, type, h) : getShapeBoard(type, h))))
  const board = boards[0] && boards[1] ? mergeBoards(boards[0], boards[1]) : boards[0] ?? boards[1] ?? null
  if (board) boardCache.set(key, { at: Date.now(), board })
  return board
}

/** a season the viewer chose, or undefined for every season added up */
const yearOf = (y: unknown) => (typeof y === 'number' && Number.isInteger(y) && y >= 2015 && y <= 2100 ? y : undefined)

export type BoardResult = { ok: true; board: Board | null } | { ok: false; error: 'pro' | 'bad' }
export async function shapeBoard(input: { type: string; hand: ViewHand; level: string }): Promise<BoardResult> {
  const g = await gate(input.type, input.hand)
  if (g !== 'ok') return { ok: false, error: g }
  return { ok: true, board: await boardFor(input.type, input.hand, parseLevel(input.level)) }
}

/** what the league has produced at the selected shape, in the form the original results table (ResultsReadout) reads: this shape's measures, the league's, runs saved and the Shape Score (where those runs saved rank among every shape) */
export type Readout = { here: Measures; league: Measures; saved: number | null; score: number | null }
export type ReadoutResult = { ok: true; readout: Readout | null } | { ok: false; error: 'pro' | 'bad' }
export async function shapeReadout(input: { type: string; hand: ViewHand; level: string; hb: number; ivb: number; radius: number; year?: number }): Promise<ReadoutResult> {
  const g = await gate(input.type, input.hand)
  if (g !== 'ok') return { ok: false, error: g }
  const level = parseLevel(input.level)
  const [grid, board] = await Promise.all([getResultsGrid(input.type, input.hand, level, yearOf(input.year)), boardFor(input.type, input.hand, level)])
  if (!grid) return { ok: true, readout: null }
  const gated = limitsFor(level).gated
  const hb = num(input.hb, -60, 60, 0), ivb = num(input.ivb, -60, 60, 0), radius = num(input.radius, 0.5, 2, 1)
  const here = measuresOf(windowSums(grid.grid, Math.round(hb * 10), Math.round(ivb * 10), Math.round(radius * 10)), gated)
  const league = measuresOf(grid.grid.total, gated)
  const saved = runsSaved(here, league)
  return { ok: true, readout: { here, league, saved, score: saved != null && board && board.dist.length ? percentile(board.dist, saved) : null } }
}

// ---- a chosen pitcher ----

export type FocusData = {
  id: number; name: string; team: string; hand: 'R' | 'L'; season: number; type: string
  row: { velo: number; ivb: number; hb: number; slot: number; nPitches: number; nSwings: number; nWhiffs: number }
  points: [number, number][]
  repertoire: { code: string; name: string; n: number; href: string }[]
  lockedTypes: number
}
export type FocusResult = { ok: true; focus: FocusData } | { ok: false; error: 'pro' | 'bad' | 'none' }

/** one pitcher's shape for one pitch type: his average, a sample of up to 60 of his pitches, and his repertoire, for the map's pitcher card */
export async function shapePitcher(input: { id: number; type?: string; level: string }): Promise<FocusResult> {
  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'bad' }
  const level = parseLevel(input.level)
  const season = await seasonFor(level)
  const pro = await isProViewer()
  const rep = await getPitcherRepertoire(id, season, pro, level)
  if (!rep || rep.rows.length === 0) return { ok: false, error: 'none' }
  const row = rep.rows.find(r => r.pitchType === input.type) ?? rep.rows[0]
  const points = await getPitcherPoints(row.pitchType, rep.hand, season, id, level)
  return { ok: true, focus: {
    id, name: rep.name, team: rep.teamAbbr, hand: rep.hand, season, type: row.pitchType,
    row: { velo: row.velo, ivb: row.ivb, hb: row.hb, slot: row.slot, nPitches: row.nPitches, nSwings: row.nSwings, nWhiffs: row.nWhiffs },
    points, lockedTypes: rep.lockedTypes,
    repertoire: rep.rows.map(r => ({ code: r.pitchType, name: PITCH_NAMES[r.pitchType] ?? r.pitchType, n: r.nPitches, href: `/mlb/lab/pitch-shape?pitcher=${id}&type=${r.pitchType}${level !== 'mlb' ? `&level=${level}` : ''}` })),
  } }
}

/**
 * Everything the original pitcher detail (ShapePlayerDetail) reads, in one go: the Shape Score board for his pitch, the league outcomes around his own average shape (for what pitches shaped like his
 * have produced and the "dial it in" step), the speed and arm-angle bins, his overall ranks, and where he is leaking (MLB, Pro). Large, so it is asked for only when his full detail is opened.
 */
export type DetailBundle = { board: Board | null; results: ResultsPayload | null; bins: ShapeBin[] | null; overall: Overall | null; diagnosis: DiagnosisResult | 'locked' | undefined; season: number }
export type DetailResult = { ok: true; bundle: DetailBundle } | { ok: false; error: 'pro' | 'bad' | 'none' }

export async function pitcherDetail(input: { id: number; type: string; hand: 'R' | 'L'; level: string }): Promise<DetailResult> {
  const g = await gate(input.type, input.hand)
  if (g !== 'ok') return { ok: false, error: g }
  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'bad' }
  const level = parseLevel(input.level)
  const season = await seasonFor(level)
  const pro = await isProViewer()
  const rep = await getPitcherRepertoire(id, season, pro, level)
  const row = rep?.rows.find(r => r.pitchType === input.type)
  if (!rep || !row) return { ok: false, error: 'none' }
  const milb = isMilb(level)
  const [board, results, bins, overall, diagnosis] = await Promise.all([
    milb ? getMilbBoard(level, season, input.type, input.hand) : getShapeBoard(input.type, input.hand),
    getResultsPayloadAround(input.type, input.hand, row.hb, row.ivb, 9, 0, level, milb ? season : undefined),
    getLeagueBins(input.type, input.hand, level, season, { arm: levelHasArm(level) }),
    getPitcherOverall(id, season, pro, level),
    !milb ? (pro ? getDiagnosis(id, season) : Promise.resolve('locked' as const)) : Promise.resolve(undefined),
  ])
  return { ok: true, bundle: { board, results, bins, overall, diagnosis, season } }
}

// ---- one pitcher's pitch across the seasons (the "What changed" tab) ----

const YEARS_FROM = 2022
export type YearRow = { season: number; nPitches: number; velo: number; ivb: number; hb: number; slot: number; nSwings: number; nWhiffs: number }
export type YearsResult = { ok: true; rows: YearRow[]; from: number; to: number } | { ok: false; error: 'pro' | 'bad' }
/** His average shape and own whiffs on one pitch for each season from 2022 to now, at the level shown. A season with no rows is simply absent: nothing is carried forward or estimated. */
export async function pitcherYears(input: { id: number; type: string; level: string }): Promise<YearsResult> {
  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'bad' }
  const g = await gate(input.type, 'R')
  if (g !== 'ok') return { ok: false, error: g }
  const level = parseLevel(input.level)
  const pro = await isProViewer()
  const to = new Date().getFullYear()
  const years = Array.from({ length: to - YEARS_FROM + 1 }, (_, i) => YEARS_FROM + i)
  const reps = await Promise.all(years.map(y => getPitcherRepertoire(id, y, pro, level)))
  const rows: YearRow[] = []
  reps.forEach((rep, i) => {
    const r = rep?.rows.find(x => x.pitchType === input.type)
    if (r) rows.push({ season: years[i], nPitches: r.nPitches, velo: r.velo, ivb: r.ivb, hb: r.hb, slot: r.slot, nSwings: r.nSwings, nWhiffs: r.nWhiffs })
  })
  return { ok: true, rows, from: YEARS_FROM, to }
}

// ---- one pitcher's pitches at the plate, as dots (the plate view in the pitcher story and Compare) ----

/** what happened on the pitch: a swing and miss, a called strike, a ball, a foul, a ball in play that was a hit, or a ball in play that was an out (or an error or other result) */
export type PitchOutcome = 'whiff' | 'called' | 'ball' | 'foul' | 'hit' | 'inplay'
/** x, z: where the pitch crossed the plate (feet, catcher's view); hb, ivb: how it moved in the Lab's convention (inches, run toward the arm side positive, ride up), so a dot can be matched to a shape on the map */
export type PlateDot = { x: number; z: number; o: PitchOutcome; v: number | null; d: string; s: 'L' | 'R' | null; c: string | null; hb: number | null; ivb: number | null }
export type DotsResult = { ok: true; dots: PlateDot[]; total: number; season: number } | { ok: false; error: 'pro' | 'bad' | 'none' }

function outcomeOf(description: string | null, isHit: boolean): PitchOutcome | null {
  const d = (description ?? '').toLowerCase()
  if (d === 'swinging_strike' || d === 'swinging_strike_blocked' || d === 'foul_tip' || d === 'missed_bunt') return 'whiff'
  if (d === 'called_strike') return 'called'
  if (d === 'ball' || d === 'blocked_ball' || d === 'intent_ball' || d === 'pitchout' || d === 'hit_by_pitch') return 'ball'
  if (d === 'foul' || d === 'foul_bunt') return 'foul'
  if (d === 'hit_into_play' || d === 'hit_into_play_score' || d === 'hit_into_play_no_out') return isHit ? 'hit' : 'inplay'
  return null
}

/** Every pitch of one type he threw that season with where it crossed the plate and what happened. Read on demand from the per-pitch log (cached for hours), never during page render. The plate coordinates are Statcast's, catcher's view, in feet. */
export async function pitcherDots(input: { id: number; type: string; level: string; season?: number }): Promise<DotsResult> {
  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'bad' }
  const g = await gate(input.type, 'R')
  if (g !== 'ok') return { ok: false, error: g }
  const level = parseLevel(input.level)
  const season = typeof input.season === 'number' && Number.isInteger(input.season) && input.season >= 2015 && input.season <= 2100 ? input.season : await seasonFor(level)
  const log = await getPitcherPitchLog(id, season, 'season', level)
  if (!log) return { ok: false, error: 'none' }
  const mine = log.pitches.filter(p => p.pitchType === input.type && Number.isFinite(p.plateX) && Number.isFinite(p.plateZ))
  const dots: PlateDot[] = []
  for (const p of mine) {
    const o = outcomeOf(p.description, p.isHit)
    if (o == null) continue
    const right = log.throws !== 'L'   // arm-side-positive run is -pfx_x for a right-hander and +pfx_x for a left-hander, as in the shape tables
    const hb = p.pfx ? Math.round((right ? -p.pfx[0] : p.pfx[0]) * 120) / 10 : null, ivb = p.pfx ? Math.round(p.pfx[1] * 120) / 10 : null
    dots.push({ x: Math.round(p.plateX * 100) / 100, z: Math.round(p.plateZ * 100) / 100, o, v: p.velo, d: p.date, s: p.stand, c: p.balls != null && p.strikes != null ? `${p.balls}-${p.strikes}` : null, hb, ivb })
  }
  if (dots.length === 0) return { ok: false, error: 'none' }
  return { ok: true, dots: dots.slice(0, 4500), total: dots.length, season }
}

// ---- the pitcher story sub-tabs: his other pitches, his months, and the "why" breakdown ----

/** one of his pitch types: how often and how it moves, how hitters swung, where it crossed the plate and the contact, and (when he is on that pitch's board) his results against what league pitches with the shape produced */
export type OtherPitch = {
  code: string; name: string; n: number; usage: number; velo: number; ivb: number; hb: number; slot: number; swings: number; whiffs: number
  zonePct: number | null; heartPct: number | null; chasePct: number | null; xwobaCon: number | null; wobaCon: number | null; nBbe: number; sdHb: number | null; sdIvb: number | null
  results: { score: number | null; ownSaved: number | null; shapeSaved: number | null; gap: number | null; /** his runs saved minus the shape's with no sample gate: shown, marked thin, when the gated gap is blank */ gapRaw: number | null; verdict: 'ahead' | 'level' | 'behind' | null; woba: number | null; xwoba: number | null; avg: number | null; slg: number | null; shapeWhiff: number | null; small: boolean } | null
}
export type PitchesResult = { ok: true; season: number; total: number; rows: OtherPitch[]; lockedTypes: number } | { ok: false; error: 'bad' | 'none' }
/** Every pitch type he threw that season (the viewer's allowed types) with the numbers for each, including his results set against his shape from each pitch's board. */
export async function pitcherPitches(input: { id: number; level: string }): Promise<PitchesResult> {
  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'bad' }
  const level = parseLevel(input.level)
  const season = await seasonFor(level)
  const rep = await getPitcherRepertoire(id, season, await isProViewer(), level)
  if (!rep || rep.rows.length === 0) return { ok: false, error: 'none' }
  const total = rep.rows.reduce((t, r) => t + r.nPitches, 0)
  const boards = await Promise.all(rep.rows.map(r => boardFor(r.pitchType, rep.hand, level).catch(() => null)))
  return { ok: true, season, total, lockedTypes: rep.lockedTypes, rows: rep.rows.map((r, i) => {
    const br = boards[i]?.rows.find(x => x.pitcherId === id) ?? null
    return {
      code: r.pitchType, name: PITCH_NAMES[r.pitchType] ?? r.pitchType, n: r.nPitches, usage: total > 0 ? r.nPitches / total : 0, velo: r.velo, ivb: r.ivb, hb: r.hb, slot: r.slot, swings: r.nSwings, whiffs: r.nWhiffs,
      zonePct: r.diag.zonePct, heartPct: r.diag.heartPct, chasePct: r.diag.chasePct, xwobaCon: r.diag.xwobaCon, wobaCon: r.diag.wobaCon, nBbe: r.diag.nBbe, sdHb: r.diag.sdHb, sdIvb: r.diag.sdIvb,
      results: br ? { score: br.score, ownSaved: br.own.saved ?? br.ownRaw.saved, shapeSaved: br.shape.saved ?? br.shapeRaw.saved, gap: br.gap, gapRaw: br.ownRaw.saved != null && br.shapeRaw.saved != null ? br.ownRaw.saved - br.shapeRaw.saved : null, verdict: br.verdict, woba: br.own.woba ?? br.ownRaw.woba, xwoba: br.own.xwoba ?? br.ownRaw.xwoba, avg: br.own.avg ?? br.ownRaw.avg, slg: br.own.slg ?? br.ownRaw.slg, shapeWhiff: br.shape.whiff ?? br.shapeRaw.whiff, small: br.small } : null,
    }
  }) }
}

export type MonthRow = { month: number; n: number; speed: number; ivb: number; hb: number; swings: number | null; whiffs: number | null; bbe: number | null; xwobaConSum: number | null }
export type MonthsResult = { ok: true; seasons: { season: number; months: MonthRow[] }[] } | { ok: false; error: 'pro' | 'bad' | 'none' }
/** His month-by-month shape and results on one pitch, for the latest season and the one before (the monthly table holds those two). A month with too few pitches is returned with its count so the page can grey it. */
export async function pitcherMonths(input: { id: number; type: string }): Promise<MonthsResult> {
  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'bad' }
  const g = await gate(input.type, 'R')
  if (g !== 'ok') return { ok: false, error: g }
  const now = new Date().getFullYear()
  const out: { season: number; months: MonthRow[] }[] = []
  for (const season of [now - 1, now]) {
    const byType = await getPitchViewMonths(id, season)
    const ms = byType[input.type] ?? []
    if (ms.length > 0) out.push({ season, months: ms.map(m => ({ month: m.month, n: m.n, speed: m.speed, ivb: m.ivb, hb: m.hb, swings: m.nSwings, whiffs: m.nWhiffs, bbe: m.nBbe, xwobaConSum: m.xwobaConSum })) })
  }
  return out.length > 0 ? { ok: true, seasons: out } : { ok: false, error: 'none' }
}

export type WhyActionResult = { ok: true; why: WhyResult; season: number } | { ok: false; error: 'pro' | 'bad' }
/** The "why the results" breakdown for one pitch (platoon, speed, extension, arm angle, location, sequencing against league pitches with his shape). Pro, and MLB only. */
export async function pitcherWhy(input: { id: number; type: string; level: string; half?: number }): Promise<WhyActionResult> {
  const id = Number(input.id)
  if (!Number.isInteger(id) || id <= 0 || !(input.type in PITCH_NAMES)) return { ok: false, error: 'bad' }
  if (parseLevel(input.level) !== 'mlb') return { ok: false, error: 'bad' }
  if (!(await isProViewer())) return { ok: false, error: 'pro' }
  const half = num(input.half, 0.5, 2, 1), season = new Date().getFullYear()
  return { ok: true, why: await getWhy(id, season, input.type, half, half), season }
}
