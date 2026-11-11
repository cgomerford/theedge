// src/lib/pitch-shape/changes.ts
//
// What a pitcher changed during a season, read from his monthly shape rows (pitch_shape_monthly: one row per pitcher, pitch type and month with its pitch count, speed, spin, ride, run,
// release point and extension). Pure functions, no database and no fetching, so the page, the API and the tests all read the same rules. Three questions:
//   * pitchChanges    — did a pitch's shape move between his first and his latest full month? (speed, spin, ride, run, release height and side, extension)
//   * usageChanges    — did he add a pitch (was not thrown early, is thrown now) or drop one (was thrown early, is gone now)?
//   * separations     — did the gap between his fastball and another pitch open or close? (a changeup that stops running away from the fastball is the example)
// A month counts only with MIN_MONTH_PITCHES of that pitch (the same gate as the rest of the Lab); a change needs two months between the two readings, so one odd month is not a trend.
// These describe what already happened. They do not say why, and they do not predict anything: shape moving is a reason to look, not a verdict.

export const MIN_MONTH_PITCHES = 50
export const MIN_MONTHS_APART = 2

/** One pitcher, one pitch type, one month. run and release side are kept as raw numbers; the functions below compare their size (arm-side positive for either hand). */
export type MonthRow = { pitchType: string; month: number; n: number; speed: number; spin: number | null; ivb: number; hb: number; relX: number; relZ: number; ext: number | null }

/** How big a move has to be before it is flagged: about what a hitter, a scout or a radar gun would notice. */
export const THRESH = { velo: 1, spin: 100, ivb: 1, hb: 1, relZ: 0.25, relX: 0.25, ext: 0.25 } as const
export type Axis = keyof typeof THRESH
export const AXIS_LABEL: Record<Axis, string> = { velo: 'Speed', spin: 'Spin', ivb: 'Ride', hb: 'Run', relZ: 'Release height', relX: 'Release side', ext: 'Extension' }
export const AXIS_UNIT: Record<Axis, string> = { velo: ' mph', spin: ' rpm', ivb: ' in', hb: ' in', relZ: ' ft', relX: ' ft', ext: ' ft' }

export type PitchChange = {
  pitchType: string
  first: { month: number; n: number }
  last: { month: number; n: number }
  /** latest minus first, per axis; null when either month has no figure for it */
  delta: Record<Axis, number | null>
  flagged: Axis[]
  /** the biggest flagged move as a multiple of its threshold (2 = twice what is worth flagging), for ranking */
  score: number
}

const pick = (r: MonthRow, a: Axis): number | null =>
  a === 'velo' ? r.speed : a === 'spin' ? r.spin : a === 'ivb' ? r.ivb : a === 'hb' ? Math.abs(r.hb) : a === 'relZ' ? r.relZ : a === 'relX' ? Math.abs(r.relX) : r.ext

const AXES = Object.keys(THRESH) as Axis[]

/** For each pitch type with two full months at least MIN_MONTHS_APART apart: how its shape moved from the first full month to the latest. Largest move first. */
export function pitchChanges(rows: MonthRow[]): PitchChange[] {
  const by = new Map<string, MonthRow[]>()
  for (const r of rows) if (r.n >= MIN_MONTH_PITCHES) (by.get(r.pitchType) ?? by.set(r.pitchType, []).get(r.pitchType)!).push(r)
  const out: PitchChange[] = []
  for (const [pitchType, rs] of by) {
    rs.sort((a, b) => a.month - b.month)
    const a = rs[0], b = rs[rs.length - 1]
    if (b.month - a.month < MIN_MONTHS_APART) continue
    const delta = {} as Record<Axis, number | null>
    const flagged: Axis[] = []
    let score = 0
    for (const ax of AXES) {
      const x = pick(a, ax), y = pick(b, ax)
      const d = x == null || y == null ? null : y - x
      delta[ax] = d
      if (d != null && Math.abs(d) >= THRESH[ax]) { flagged.push(ax); score = Math.max(score, Math.abs(d) / THRESH[ax]) }
    }
    out.push({ pitchType, first: { month: a.month, n: a.n }, last: { month: b.month, n: b.n }, delta, flagged, score })
  }
  return out.sort((x, y) => y.score - x.score)
}

export type UsageChange = {
  pitchType: string
  kind: 'added' | 'dropped'
  /** share of his pitches in his first two months and in his latest two */
  early: number
  late: number
  /** the month it first showed up (added) or last showed up (dropped), with at least 25 of that pitch */
  month: number | null
  /** pitches of it in the period it was thrown in, so the reader sees the sample */
  n: number
}

/**
 * Pitches added or dropped inside the season. His first two and latest two months (each with at least 100 pitches in all) are set side by side: a pitch at 2% or less early and 8% or more
 * now (50+ pitches) was added; 8% or more early (50+ pitches) and 2% or less now was dropped. Needs three such months, so a short stay in the sample is never called a change.
 */
export function usageChanges(rows: MonthRow[]): UsageChange[] {
  const total = new Map<number, number>()
  for (const r of rows) total.set(r.month, (total.get(r.month) ?? 0) + r.n)
  const months = [...total.entries()].filter(([, n]) => n >= 100).map(([m]) => m).sort((a, b) => a - b)
  if (months.length < 3) return []
  const early = months.slice(0, 2), late = months.slice(-2)
  const sum = (ms: number[], t?: string) => rows.filter(r => ms.includes(r.month) && (t == null || r.pitchType === t)).reduce((s, r) => s + r.n, 0)
  const eTot = sum(early), lTot = sum(late)
  const out: UsageChange[] = []
  for (const t of new Set(rows.map(r => r.pitchType))) {
    const en = sum(early, t), ln = sum(late, t), e = en / eTot, l = ln / lTot
    const seen = rows.filter(r => r.pitchType === t && r.n >= 25).map(r => r.month).sort((a, b) => a - b)
    if (e <= 0.02 && l >= 0.08 && ln >= MIN_MONTH_PITCHES) out.push({ pitchType: t, kind: 'added', early: e, late: l, month: seen[0] ?? null, n: ln })
    else if (e >= 0.08 && en >= MIN_MONTH_PITCHES && l <= 0.02) out.push({ pitchType: t, kind: 'dropped', early: e, late: l, month: seen[seen.length - 1] ?? null, n: en })
  }
  return out.sort((a, b) => Math.abs(b.late - b.early) - Math.abs(a.late - a.early))
}

export type Separation = {
  fastball: string
  pitchType: string
  first: { month: number; gap: number }
  last: { month: number; gap: number }
  /** latest gap minus first gap, in inches of movement: negative means the pitch moves more like his fastball than it did */
  change: number
  /** speed gap (fastball minus this pitch) first and latest, mph */
  veloFirst: number
  veloLast: number
}

/** A change in the gap bigger than this, inches, is flagged. */
export const SEPARATION_FLAG = 1.5

const FASTBALLS = ['FF', 'SI']

/**
 * The movement gap between his fastball (four-seam, else sinker, whichever he threw most) and each other pitch, from the same release: the straight-line distance in inches between their
 * average ride and run, in months where both have a full sample. The first reading against the latest, at least two months apart. Largest change first.
 */
export function separations(rows: MonthRow[]): Separation[] {
  const count = (t: string) => rows.filter(r => r.pitchType === t).reduce((s, r) => s + r.n, 0)
  const fb = FASTBALLS.filter(t => count(t) >= MIN_MONTH_PITCHES).sort((a, b) => count(b) - count(a))[0]
  if (!fb) return []
  const fbBy = new Map(rows.filter(r => r.pitchType === fb && r.n >= MIN_MONTH_PITCHES).map(r => [r.month, r]))
  const out: Separation[] = []
  for (const t of new Set(rows.map(r => r.pitchType))) {
    if (t === fb || FASTBALLS.includes(t)) continue
    const pairs = rows.filter(r => r.pitchType === t && r.n >= MIN_MONTH_PITCHES && fbBy.has(r.month)).sort((a, b) => a.month - b.month)
    if (pairs.length < 2) continue
    const a = pairs[0], b = pairs[pairs.length - 1]
    if (b.month - a.month < MIN_MONTHS_APART) continue
    const gap = (r: MonthRow) => { const f = fbBy.get(r.month) as MonthRow; return Math.hypot(f.ivb - r.ivb, f.hb - r.hb) }
    const veloGap = (r: MonthRow) => (fbBy.get(r.month) as MonthRow).speed - r.speed
    out.push({ fastball: fb, pitchType: t, first: { month: a.month, gap: gap(a) }, last: { month: b.month, gap: gap(b) }, change: gap(b) - gap(a), veloFirst: veloGap(a), veloLast: veloGap(b) })
  }
  return out.sort((x, y) => Math.abs(y.change) - Math.abs(x.change))
}
