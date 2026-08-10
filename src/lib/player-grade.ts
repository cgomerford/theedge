// src/lib/player-grade.ts
//
// Composite 0-100 grade — season, career, and month-by-month — for the
// player page's grade banner and monthly grade strip.
//
// EXTENDED 2026-08: MonthGrade now carries `rawStats` (formatted per-stat
// values, not just percentiles) so the monthly strip's expanded table view
// can show actual numbers (e.g. "Jun: .289 AVG / .812 OPS") alongside the
// composite grade, not just a bare score.
//
// Deliberately reuses two percentile sources that already exist rather
// than inventing a third:
//
//   1. Savant-ranked percentiles (SignatureDial.percentile, from
//      player-signature.ts) — real Statcast percentile-vs-league, CURRENT
//      SEASON ONLY. Savant doesn't expose historical per-season Statcast
//      (same limitation CareerStats.tsx already documents on its Advanced tab).
//   2. MLB leaderboard percentile (getMetricPercentile, lib/lab.ts) — real
//      rank against the qualified-player pool for traditional rate stats
//      (OPS/AVG/ERA/etc), CURRENT SEASON ONLY, null if below IP/PA threshold.
//
// Neither source has a career-cumulative equivalent, so CAREER grades fall
// back to fixed-threshold min-max scaling — the same technique
// BattingTabContent.tsx already uses for current-season Statcast bars.
//
// MONTHLY grades (calendar-bucketed) reuse the same fixed-threshold scaling
// as career, for the same reason — no month-granular Savant percentile
// exists, and a single month's Statcast sample would be too noisy to rank
// against a season-long leaderboard pool anyway.

import type { SignatureDial } from './player-signature'
import type { CareerSeasonRow } from './lab'
import type { BatterGame, PitcherGame } from './stats-gamelog'
import { aggregateBatting, aggregatePitching } from './stats-gamelog'

// ─── Types ──────────────────────────────────────────────────────────────

export type GradeSubject = 'batter' | 'pitcher'

export interface GradeComponent {
  key: string
  label: string
  percentile: number      // 0-100, already direction-corrected (higher = better)
  weight: number           // 0-1, weights sum to 1 across components actually used
  source: 'statcast' | 'leaderboard' | 'scaled'
}

export interface PlayerGrade {
  score: number                // 0-100 composite
  grade: string                 // 'Elite' | 'Above avg' | 'Average' | 'Below avg' | 'Replacement' | '—'
  components: GradeComponent[]
  qualified: boolean            // false = sample too small to trust; UI shows '—' not a fabricated number
  method: 'season' | 'career' | 'month'
}

export interface MonthGrade {
  month: string                // 'Apr', 'May', ... calendar label
  monthKey: string              // '2026-04' sortable key
  games: number
  grade: PlayerGrade | null     // null if zero games that month
  headlineStat: { label: string; value: string }
  rawStats: { key: string; label: string; value: string }[]  // formatted actual values, not percentiles
}

// ─── Grade label bands ─────────────────────────────────────────────────

function gradeLabel(score: number): string {
  if (score >= 90) return 'Elite'
  if (score >= 75) return 'Above avg'
  if (score >= 45) return 'Average'
  if (score >= 25) return 'Below avg'
  return 'Replacement'
}

function round(n: number): number {
  return Math.round(n)
}

// ─── Fixed-threshold scaling (career + monthly) ─────────────────────────
//
// Same min-max technique BattingTabContent already uses for its Statcast
// bars. Bands are starting points spanning roughly "replacement level" to
// "batting-title-race" production — not derived from anything, same spirit
// as lab.ts's TREND_EPSILON constants. Tune here without touching callers.

function scale(value: number | null, min: number, max: number, invert = false): number | null {
  if (value == null) return null
  const clamped = Math.min(Math.max(value, min), max)
  const pct = ((clamped - min) / (max - min)) * 100
  return round(invert ? 100 - pct : pct)
}

const BATTER_BANDS = {
  avg: { min: 0.220, max: 0.320 },
  obp: { min: 0.290, max: 0.400 },
  slg: { min: 0.360, max: 0.560 },
  ops: { min: 0.650, max: 0.950 },
}

const PITCHER_BANDS = {
  era: { min: 2.80, max: 5.50 },   // inverted — lower is better
  whip: { min: 0.95, max: 1.55 },  // inverted
  k9: { min: 6.5, max: 11.5 },
}

// ─── Season grade — blends Statcast dial percentiles + leaderboard percentiles ──

export function computeSeasonGrade(opts: {
  dials: SignatureDial[]
  leaderboardPercentiles: { key: string; label: string; percentile: number | null }[]
  gamesPlayed: number
}): PlayerGrade {
  const { dials, leaderboardPercentiles, gamesPlayed } = opts
  const components: GradeComponent[] = []

  const validDials = dials.filter(d => d.percentile != null)
  const dialWeight = validDials.length > 0 ? 0.6 / validDials.length : 0
  for (const d of validDials) {
    components.push({ key: d.label, label: d.label, percentile: d.percentile!, weight: dialWeight, source: 'statcast' })
  }

  const validLB = leaderboardPercentiles.filter(p => p.percentile != null)
  const lbWeight = validLB.length > 0 ? 0.4 / validLB.length : 0
  for (const p of validLB) {
    components.push({ key: p.key, label: p.label, percentile: p.percentile!, weight: lbWeight, source: 'leaderboard' })
  }

  if (components.length === 0) {
    return { score: 0, grade: '—', components: [], qualified: false, method: 'season' }
  }

  const qualified = gamesPlayed >= 10
  const totalWeight = components.reduce((s, c) => s + c.weight, 0)
  const score = round(components.reduce((s, c) => s + c.percentile * c.weight, 0) / (totalWeight || 1))

  return { score, grade: qualified ? gradeLabel(score) : '—', components, qualified, method: 'season' }
}

// ─── Career grade — fixed-threshold scaling on career-cumulative rate stats ──

export function computeCareerGrade(opts: {
  subject: GradeSubject
  seasons: CareerSeasonRow[]
}): PlayerGrade {
  const { subject, seasons } = opts
  if (seasons.length === 0) {
    return { score: 0, grade: '—', components: [], qualified: false, method: 'career' }
  }

  const totals: Record<string, number> = {}
  const sumKeys = subject === 'batter'
    ? ['atBats', 'hits', 'baseOnBalls', 'hitByPitch', 'sacFlies', 'totalBases']
    : ['inningsPitched', 'earnedRuns', 'baseOnBalls', 'hits', 'strikeOuts']

  for (const season of seasons) {
    const map = Object.fromEntries(season.stats.map(s => [s.key, s.value]))
    for (const key of sumKeys) {
      const raw = String(map[key] ?? '0').replace(/[^0-9.]/g, '')
      totals[key] = (totals[key] ?? 0) + (parseFloat(raw) || 0)
    }
  }

  const components: GradeComponent[] = []

  if (subject === 'batter') {
    const ab = totals.atBats ?? 0
    const h = totals.hits ?? 0
    const bb = totals.baseOnBalls ?? 0
    const hbp = totals.hitByPitch ?? 0
    const sf = totals.sacFlies ?? 0
    const tb = totals.totalBases ?? 0
    const avg = ab > 0 ? h / ab : null
    const obpDenom = ab + bb + hbp + sf
    const obp = obpDenom > 0 ? (h + bb + hbp) / obpDenom : null
    const slg = ab > 0 ? tb / ab : null
    const ops = obp != null && slg != null ? obp + slg : null

    const push = (key: keyof typeof BATTER_BANDS, label: string, value: number | null) => {
      const p = scale(value, BATTER_BANDS[key].min, BATTER_BANDS[key].max)
      if (p != null) components.push({ key, label, percentile: p, weight: 0.25, source: 'scaled' })
    }
    push('avg', 'AVG', avg)
    push('obp', 'OBP', obp)
    push('slg', 'SLG', slg)
    push('ops', 'OPS', ops)
  } else {
    const ip = totals.inningsPitched ?? 0
    const er = totals.earnedRuns ?? 0
    const bb = totals.baseOnBalls ?? 0
    const h = totals.hits ?? 0
    const so = totals.strikeOuts ?? 0
    const era = ip > 0 ? (er * 9) / ip : null
    const whip = ip > 0 ? (bb + h) / ip : null
    const k9 = ip > 0 ? (so * 9) / ip : null

    const push = (key: keyof typeof PITCHER_BANDS, label: string, value: number | null, invert = false) => {
      const p = scale(value, PITCHER_BANDS[key].min, PITCHER_BANDS[key].max, invert)
      if (p != null) components.push({ key, label, percentile: p, weight: 1 / 3, source: 'scaled' })
    }
    push('era', 'ERA', era, true)
    push('whip', 'WHIP', whip, true)
    push('k9', 'K/9', k9)
  }

  if (components.length === 0) {
    return { score: 0, grade: '—', components: [], qualified: false, method: 'career' }
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0)
  const score = round(components.reduce((s, c) => s + c.percentile * c.weight, 0) / totalWeight)
  return { score, grade: gradeLabel(score), components, qualified: true, method: 'career' }
}

// ─── Monthly grades — calendar-bucketed, same scaling as career ────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthKeyOf(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr)
  return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTH_LABELS[d.getMonth()] }
}

function fmt3NoLeadingZero(v: number): string { return v.toFixed(3).replace(/^0/, '') }
function fmt3(v: number): string { return v.toFixed(3) }
function fmt2(v: number): string { return v.toFixed(2) }
function fmt1(v: number): string { return v.toFixed(1) }

export function computeMonthlyGrades(
  subject: GradeSubject,
  games: (BatterGame | PitcherGame)[]
): MonthGrade[] {
  const buckets = new Map<string, { label: string; games: (BatterGame | PitcherGame)[] }>()
  for (const g of games) {
    const { key, label } = monthKeyOf(g.date)
    if (!buckets.has(key)) buckets.set(key, { label, games: [] })
    buckets.get(key)!.games.push(g)
  }

  const out: MonthGrade[] = []
  for (const [monthKey, bucket] of Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const components: GradeComponent[] = []
    const rawStats: { key: string; label: string; value: string }[] = []
    let headline = { label: '—', value: '—' }

    if (subject === 'batter') {
      const agg = aggregateBatting(bucket.games as BatterGame[])

      const pushStat = (
        key: keyof typeof BATTER_BANDS, label: string, value: number | null, format: (v: number) => string
      ) => {
        const p = scale(value, BATTER_BANDS[key].min, BATTER_BANDS[key].max)
        if (p != null) components.push({ key, label, percentile: p, weight: 0.25, source: 'scaled' })
        rawStats.push({ key, label, value: value != null ? format(value) : '—' })
      }
      pushStat('avg', 'AVG', agg.avg, fmt3NoLeadingZero)
      pushStat('obp', 'OBP', agg.obp, fmt3NoLeadingZero)
      pushStat('slg', 'SLG', agg.slg, fmt3NoLeadingZero)
      pushStat('ops', 'OPS', agg.ops, fmt3)

      headline = { label: 'OPS', value: agg.ops != null ? fmt3(agg.ops) : '—' }
    } else {
      const agg = aggregatePitching(bucket.games as PitcherGame[])

      const pushStat = (
        key: keyof typeof PITCHER_BANDS, label: string, value: number | null, invert: boolean, format: (v: number) => string
      ) => {
        const p = scale(value, PITCHER_BANDS[key].min, PITCHER_BANDS[key].max, invert)
        if (p != null) components.push({ key, label, percentile: p, weight: 1 / 3, source: 'scaled' })
        rawStats.push({ key, label, value: value != null ? format(value) : '—' })
      }
      pushStat('era', 'ERA', agg.era, true, fmt2)
      pushStat('whip', 'WHIP', agg.whip, true, fmt2)
      pushStat('k9', 'K/9', agg.k9, false, fmt1)

      headline = { label: 'ERA', value: agg.era != null ? fmt2(agg.era) : '—' }
    }

    // Fewer than 3 games in a month is too noisy to grade honestly — shown
    // as '—' rather than a swingy, meaningless number.
    const qualified = components.length > 0 && bucket.games.length >= 3
    let grade: PlayerGrade | null = null
    if (components.length > 0) {
      const totalWeight = components.reduce((s, c) => s + c.weight, 0)
      const score = round(components.reduce((s, c) => s + c.percentile * c.weight, 0) / totalWeight)
      grade = { score, grade: qualified ? gradeLabel(score) : '—', components, qualified, method: 'month' }
    }

    out.push({ month: bucket.label, monthKey, games: bucket.games.length, grade, headlineStat: headline, rawStats })
  }

  return out
}