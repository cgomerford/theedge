// src/components/pitch-shape/monthStats.ts
//
// One place that turns a pitch's periods (a month, or a whole season) into the seven measures the Shape tab
// ranks, and picks the standout period for each. The recap, the log table and the trend cards all read this,
// so a gold mark can never disagree with the number beside it. A period under the gates gets null (shown as —),
// never an estimate. "Standout" is the extreme in the stated direction (most movement, softest contact);
// it describes a stretch that already happened and says nothing about what comes next.
import type { PitchViewMonth } from '@/lib/pitch-shape/model'
import { MIN_N } from './pitchViewScene'

// A single month is a small sample, so these are lower than the season gates in model.ts GATE.
// weak is deliberately lower than bbe: more periods show up, but each is a thinner sample (see THIN_WEAK).
export const GATES = { swings: 40, bbe: 25, weak: 15, abs: 5 } as const
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const GOLD = { fill: '#F5B800', soft: '#FFF4CC', ink: '#7A5800', line: '#EBC24A' }

export const periodLabel = (p: PitchViewMonth) => p.label ?? MON[p.month - 1] ?? String(p.month)

export type Metric = 'velo' | 'spin' | 'move' | 'whiff' | 'xw' | 'weak' | 'abs'
export const METRICS: { key: Metric; title: string; crown: string; higherIsBetter: boolean; fmt: (v: number) => string; unit: string; sample: string }[] = [
  { key: 'velo', title: 'Velocity', crown: 'Fastest', higherIsBetter: true, fmt: v => v.toFixed(1), unit: ' mph', sample: 'pitches' },
  { key: 'spin', title: 'Spin rate', crown: 'Most spin', higherIsBetter: true, fmt: v => Math.round(v).toLocaleString(), unit: ' rpm', sample: 'pitches' },
  { key: 'move', title: 'Total movement', crown: 'Most movement', higherIsBetter: true, fmt: v => v.toFixed(1), unit: ' in', sample: 'pitches' },
  { key: 'whiff', title: 'Whiffs per swing', crown: 'Most whiffs', higherIsBetter: true, fmt: v => v.toFixed(1), unit: '%', sample: 'swings' },
  { key: 'xw', title: 'xwOBA on contact', crown: 'Best contact allowed', higherIsBetter: false, fmt: v => v.toFixed(3).replace(/^0/, ''), unit: '', sample: 'balls in play' },
  { key: 'weak', title: 'Weak contact', crown: 'Most weak contact', higherIsBetter: true, fmt: v => v.toFixed(1), unit: '%', sample: 'balls in play' },
  { key: 'abs', title: 'ABS calls upheld', crown: 'Most calls upheld', higherIsBetter: true, fmt: v => v.toFixed(0), unit: '%', sample: 'challenges' },
]

/** A weak-contact figure from fewer balls in play than the standard gate: shown, but a thinner read. */
export const isThinWeak = (p: PitchViewMonth) => p.nBbe != null && p.nBbe >= GATES.weak && p.nBbe < GATES.bbe

export type PeriodValues = Record<Metric, number | null> & { n: Record<Metric, number> }

export function periodValues(p: PitchViewMonth): PeriodValues {
  const big = p.n >= MIN_N
  const n: Record<Metric, number> = { velo: p.n, spin: p.n, move: p.n, whiff: p.nSwings ?? 0, xw: p.nBbe ?? 0, weak: p.nBbe ?? 0, abs: p.absN ?? 0 }
  return {
    velo: big ? p.speed : null,
    spin: big && p.spin != null ? p.spin : null,
    move: big ? Math.hypot(p.ivb, p.hb) : null,
    whiff: big && p.nSwings != null && p.nWhiffs != null && p.nSwings >= GATES.swings ? (p.nWhiffs / p.nSwings) * 100 : null,
    xw: big && p.nBbe != null && p.xwobaConSum != null && p.nBbe >= GATES.bbe ? p.xwobaConSum / p.nBbe : null,
    weak: big && p.nBbe != null && p.nWeak != null && p.nBbe >= GATES.weak ? (p.nWeak / p.nBbe) * 100 : null,
    abs: p.absN != null && p.absUpheld != null && p.absN >= GATES.abs ? (p.absUpheld / p.absN) * 100 : null,
    n,
  }
}

/** Index of the best / worst period for a measure; both null when fewer than two periods qualify (no contest, no crown). */
export function standout(vals: PeriodValues[], metric: Metric): { best: number | null; worst: number | null } {
  const hi = METRICS.find(m => m.key === metric)!.higherIsBetter
  const ok = vals.map((v, i) => [v[metric], i] as [number | null, number]).filter((x): x is [number, number] => x[0] != null)
  if (ok.length < 2) return { best: null, worst: null }
  const better = (a: number, b: number) => (hi ? a > b : a < b)
  let best = ok[0], worst = ok[0]
  for (const x of ok) { if (better(x[0], best[0])) best = x; if (better(worst[0], x[0])) worst = x }
  if (best[0] === worst[0]) return { best: null, worst: null }   // every qualifying period tied
  return { best: best[1], worst: worst[1] }
}

export { aggregateSeason } from '@/lib/pitch-shape/aggregate'

/**
 * The overall standout period: the one that is the standout on the most of the seven measures (equal weight, a
 * count of gold marks, not a hidden score). Only measures with a real contest (two or more qualifying periods)
 * count. Needs a unique leader with at least two gold marks, otherwise there is no overall gold.
 */
export function overallStandout(vals: PeriodValues[]): { index: number | null; wins: Metric[][]; contested: number } {
  const wins: Metric[][] = vals.map(() => [])
  let contested = 0
  for (const m of METRICS) {
    const { best } = standout(vals, m.key)
    if (best != null) { wins[best].push(m.key); contested += 1 }
  }
  const top = Math.max(0, ...wins.map(w => w.length))
  const leaders = wins.map((w, i) => (w.length === top ? i : -1)).filter(i => i >= 0)
  return { index: top >= 2 && leaders.length === 1 ? leaders[0] : null, wins, contested }
}
