// src/lib/zone-stats.ts
//
// Zone-by-zone results for one pitcher from his per-pitch log (src/lib/pitcher-pitch-log.ts). Pure functions, safe to import in the browser.
// A pitch is placed by Savant's own zone number (1-9 are the strike zone seen from behind the plate, 11-14 the four corners around it).
// Everything is a count or a ratio of counts: nothing is estimated except xwOBA, which is Savant's expected value for a ball in play.
/** The few fields zone maths reads, so a pitcher's pitch and a batter's pitch both fit. */
export type ZonePitch = { zone: string | null; description: string | null; result: string | null; isHit: boolean; exitVelo: number | null; woba: number | null; xwoba: number | null; wobaDen: number | null }

export const IN_ZONE = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
export const OUT_ZONE = ['11', '12', '13', '14'] as const
export const ALL_ZONES = [...IN_ZONE, ...OUT_ZONE] as const

const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'hit_into_play'])
const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])
const AB_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play',
  'fielders_choice', 'fielders_choice_out', 'other_out',
])
const BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }
export const HARD_HIT_MPH = 95

export type Agg = {
  n: number; swings: number; whiffs: number; takes: number; called: number
  ab: number; hits: number; bases: number
  woba: number; xwoba: number; den: number
  bbe: number; hard: number
}

export const emptyAgg = (): Agg => ({ n: 0, swings: 0, whiffs: 0, takes: 0, called: 0, ab: 0, hits: 0, bases: 0, woba: 0, xwoba: 0, den: 0, bbe: 0, hard: 0 })

export function add(a: Agg, p: ZonePitch): void {
  a.n++
  const d = p.description ?? ''
  if (SWING.has(d)) { a.swings++; if (WHIFF.has(d)) a.whiffs++ } else a.takes++
  if (d === 'called_strike') a.called++
  const bip = d === 'hit_into_play'
  if (bip && p.exitVelo != null) { a.bbe++; if (p.exitVelo >= HARD_HIT_MPH) a.hard++ }
  // Only the pitch that ended a plate appearance carries a result.
  if (p.wobaDen != null && p.wobaDen > 0) {
    a.den += p.wobaDen
    a.woba += p.woba ?? 0
    a.xwoba += bip && p.xwoba != null ? p.xwoba : p.woba ?? 0
  }
  const ev = p.result ?? ''
  if (AB_EVENTS.has(ev)) { a.ab++; if (p.isHit) a.hits++; a.bases += BASES[ev] ?? 0 }
}

export function aggregate(pitches: ZonePitch[]): { all: Agg; byZone: Record<string, Agg> } {
  const all = emptyAgg()
  const byZone: Record<string, Agg> = {}
  for (const z of ALL_ZONES) byZone[z] = emptyAgg()
  for (const p of pitches) {
    add(all, p)
    if (p.zone && byZone[p.zone]) add(byZone[p.zone], p)
  }
  return { all, byZone }
}

export function merge(list: Agg[]): Agg {
  const o = emptyAgg()
  for (const a of list) for (const k of Object.keys(o) as (keyof Agg)[]) o[k] += a[k]
  return o
}

export type MetricKey = 'pitches' | 'usage' | 'xwoba' | 'ba' | 'slg' | 'whiff' | 'swing' | 'take' | 'called' | 'hard'
export type Dir = 'volume' | 'hitter' | 'pitcher'   // hitter: higher is better for the hitter; pitcher: higher is better for the pitcher
export const METRIC_DEFS: { key: MetricKey; label: string; dir: Dir; spread: number; hint: string }[] = [
  { key: 'pitches', label: 'Pitches', dir: 'volume', spread: 0, hint: 'How many pitches crossed here' },
  { key: 'usage', label: 'Share of pitches', dir: 'volume', spread: 0, hint: 'Share of this pitch selection that crossed here' },
  { key: 'xwoba', label: 'xwOBA', dir: 'hitter', spread: 0.15, hint: 'Expected wOBA on plate appearances that ended on a pitch here' },
  { key: 'ba', label: 'BA', dir: 'hitter', spread: 0.1, hint: 'Hits per at-bat ended on a pitch here' },
  { key: 'slg', label: 'SLG', dir: 'hitter', spread: 0.25, hint: 'Total bases per at-bat ended on a pitch here' },
  { key: 'hard', label: 'Hard-hit', dir: 'hitter', spread: 0.2, hint: 'Balls in play hit 95 mph or harder' },
  { key: 'whiff', label: 'Whiff', dir: 'pitcher', spread: 0.15, hint: 'Swings and misses per swing' },
  { key: 'swing', label: 'Swing', dir: 'volume', spread: 0, hint: 'Swings per pitch' },
  { key: 'take', label: 'Take', dir: 'volume', spread: 0, hint: 'Pitches the batter did not swing at' },
  { key: 'called', label: 'Called strike', dir: 'volume', spread: 0, hint: 'Called strikes per pitch' },
]

const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

/** The value, plus how many chances stand behind it (for the small-sample star). */
export function metric(a: Agg, key: MetricKey, total: number): { v: number | null; chances: number; text: string } {
  const f3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
  const pc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
  switch (key) {
    case 'pitches': return { v: a.n, chances: a.n, text: String(a.n) }
    case 'usage': { const v = ratio(a.n, total); return { v, chances: a.n, text: v == null ? '—' : `${(v * 100).toFixed(1)}%` } }
    case 'xwoba': { const v = ratio(a.xwoba, a.den); return { v, chances: a.den, text: f3(v) } }
    case 'ba': { const v = ratio(a.hits, a.ab); return { v, chances: a.ab, text: f3(v) } }
    case 'slg': { const v = ratio(a.bases, a.ab); return { v, chances: a.ab, text: f3(v) } }
    case 'hard': { const v = ratio(a.hard, a.bbe); return { v, chances: a.bbe, text: pc(v) } }
    case 'whiff': { const v = ratio(a.whiffs, a.swings); return { v, chances: a.swings, text: pc(v) } }
    case 'swing': { const v = ratio(a.swings, a.n); return { v, chances: a.n, text: pc(v) } }
    case 'take': { const v = ratio(a.takes, a.n); return { v, chances: a.n, text: pc(v) } }
    case 'called': { const v = ratio(a.called, a.n); return { v, chances: a.n, text: pc(v) } }
  }
}

/** Fewer chances than this and the number is shown with a red star. Volume numbers only need the zone-cell minimum. */
export function smallFor(key: MetricKey, chances: number, cellMin: number): boolean {
  if (key === 'xwoba' || key === 'ba' || key === 'slg') return chances < 10
  if (key === 'hard') return chances < 8
  if (key === 'whiff') return chances < 10
  return chances < cellMin
}

/** Agg as a plain number array (for sending many of them compactly), and back. */
export const AGG_KEYS = Object.keys(emptyAgg()) as (keyof Agg)[]
export const aggToArr = (a: Agg): number[] => AGG_KEYS.map(k => a[k])
export function arrToAgg(arr: number[]): Agg { const a = emptyAgg(); AGG_KEYS.forEach((k, i) => { a[k] = arr[i] ?? 0 }); return a }
