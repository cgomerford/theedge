// src/lib/platoon/model.ts
//
// Pure (no server imports) model for the Platoon Lab. Rows come from batter_platoon_process (migration 20261023100000, written by scripts/build_batter_platoon.py):
// COUNTS AND SUMS per batter x season x side batted from x pitcher hand x metric, so every readout can show the sample behind it.
//   mean = value_sum / n        standard deviation = sqrt(value_sq_sum / n - mean^2)        batter_id 0 = the league row
// A switch hitter's two batting sides are never mixed: every function here takes the rows of ONE side. Descriptions only: nothing says what a hitter should do.
// The page shows each value with its n; below a metric's minimum sample it shows "Not enough data yet (n = X of Y needed)". There are no quality tiers: the sample ladder
// just marks the minimum and the sample at which a read is usually steady.

export type Hand = 'L' | 'R'
export type SprayKey = 'spray_gb_pull' | 'spray_gb_straight' | 'spray_gb_oppo' | 'spray_air_pull' | 'spray_air_straight' | 'spray_air_oppo'
export type MetricKey =
  | 'bat_speed' | 'swing_tilt' | 'contact_depth' | 'attack_direction' | 'chase' | 'zone_contact' | 'squared_up' | 'pull_air'
  | 'k_pct' | 'bb_pct' | 'xwoba' | 'woba' | 'contact_x' | SprayKey

export type PlatoonRow = {
  batter_id: number; season: number; coord_era: string; bat_side: Hand; p_throws: Hand; metric: string
  n: number; value_sum: number; value_sq_sum: number
}

export type MetricDef = {
  key: MetricKey; label: string; unit: string; nUnit: string; group: 'process' | 'outcome'; kind: 'mean' | 'rate'
  gate: number       // below this n on a side: no readout, "Not enough data yet"
  steady: number     // the sample at which a read of this metric is usually steady (shown as a tick on the sample ladder; demo values until split-half reliability is computed)
  practical: number  // a gap smaller than this is called "the same" (demo thresholds)
  scaleMax: number   // butterfly bar length = |readout| / scaleMax
  word: (gap: number) => string // "bat speed is 1.8 mph lower" for a gap (vs LHP minus vs RHP)
}
const lowerHigher = (noun: string, unit: string, digits = 1) => (g: number) => `${noun} is ${Math.abs(g).toFixed(digits)}${unit} ${g < 0 ? 'lower' : 'higher'}`
const pts = (noun: string) => (g: number) => `${noun} is ${Math.abs(g * 100).toFixed(0)} points ${g < 0 ? 'lower' : 'higher'}`

/** shown top to bottom in the butterfly: the fast-settling process metrics first, the slow outcomes last */
export const METRICS: MetricDef[] = [
  { key: 'bat_speed', label: 'Bat speed (location-matched)', unit: 'mph', nUnit: 'swings', group: 'process', kind: 'mean', gate: 25, steady: 90, practical: 1, scaleMax: 85, word: lowerHigher('bat speed', ' mph') },
  { key: 'swing_tilt', label: 'Swing path tilt', unit: '°', nUnit: 'swings', group: 'process', kind: 'mean', gate: 25, steady: 90, practical: 3, scaleMax: 45, word: lowerHigher('swing tilt', '°') },
  { key: 'contact_depth', label: 'Contact depth (intercept y)', unit: 'in', nUnit: 'swings', group: 'process', kind: 'mean', gate: 25, steady: 90, practical: 2, scaleMax: 50, word: lowerHigher('contact point', ' in', 1) },
  { key: 'attack_direction', label: 'Attack direction', unit: '°', nUnit: 'swings', group: 'process', kind: 'mean', gate: 25, steady: 120, practical: 3, scaleMax: 20, word: g => `attack direction differs by ${Math.abs(g).toFixed(1)}°` },
  { key: 'chase', label: 'Chase rate', unit: '%', nUnit: 'pitches outside the zone', group: 'process', kind: 'rate', gate: 100, steady: 350, practical: 0.05, scaleMax: 0.5, word: pts('chase rate') },
  { key: 'zone_contact', label: 'Zone-contact rate', unit: '%', nUnit: 'swings at pitches in the zone', group: 'process', kind: 'rate', gate: 60, steady: 250, practical: 0.04, scaleMax: 1, word: pts('zone-contact rate') },
  { key: 'squared_up', label: 'Squared-up rate', unit: '%', nUnit: 'bat contacts', group: 'process', kind: 'rate', gate: 40, steady: 150, practical: 0.04, scaleMax: 0.5, word: pts('squared-up rate') },
  { key: 'pull_air', label: 'Pull AIR%', unit: '%', nUnit: 'batted balls', group: 'process', kind: 'rate', gate: 40, steady: 160, practical: 0.05, scaleMax: 0.5, word: pts('Pull AIR%') },
  { key: 'k_pct', label: 'K%', unit: '%', nUnit: 'PA', group: 'outcome', kind: 'rate', gate: 60, steady: 250, practical: 0.04, scaleMax: 0.5, word: pts('K%') },
  { key: 'bb_pct', label: 'BB%', unit: '%', nUnit: 'PA', group: 'outcome', kind: 'rate', gate: 120, steady: 450, practical: 0.03, scaleMax: 0.25, word: pts('BB%') },
  { key: 'xwoba', label: 'xwOBA', unit: '', nUnit: 'PA', group: 'outcome', kind: 'mean', gate: 30, steady: 800, practical: 0.04, scaleMax: 0.6, word: g => `xwOBA is ${(Math.abs(g) * 1000).toFixed(0)} points ${g < 0 ? 'lower' : 'higher'}` },
  { key: 'woba', label: 'wOBA', unit: '', nUnit: 'PA', group: 'outcome', kind: 'mean', gate: 1, steady: 2200, practical: 0.04, scaleMax: 0.6, word: g => `wOBA is ${(Math.abs(g) * 1000).toFixed(0)} points ${g < 0 ? 'lower' : 'higher'}` },
]
export const DEF = Object.fromEntries(METRICS.map(m => [m.key, m])) as Record<string, MetricDef>
/** The Book's range for outcome splits to settle, in PA (stated on the page as a fact, not a badge) */
export const WOBA_STEADY_FROM = 1000
export const WOBA_STEADY_TO = 2200

export const belowMinimum = (def: MetricDef, n: number) => n < def.gate

export type Stat = { n: number; mean: number | null; sd: number | null }
const fromRow = (r: PlatoonRow | undefined): Stat => {
  if (!r || r.n <= 0) return { n: 0, mean: null, sd: null }
  const mean = r.value_sum / r.n
  return { n: r.n, mean, sd: Math.sqrt(Math.max(0, r.value_sq_sum / r.n - mean * mean)) }
}
/** One metric for one pitcher hand, from the rows of ONE batting side. Pull AIR% is read from the spray rows (pulled air balls / batted balls) when it has no row of its own. */
export function statOf(rows: PlatoonRow[], metric: MetricKey, hand: Hand): Stat {
  const own = rows.find(x => x.metric === metric && x.p_throws === hand)
  if (own) return fromRow(own)
  if (metric === 'pull_air') return fromRow(rows.find(x => x.metric === 'spray_air_pull' && x.p_throws === hand))
  return { n: 0, mean: null, sd: null }
}
export const fmtVal = (def: MetricDef, v: number | null): string => {
  if (v == null) return '—'
  if (def.key === 'xwoba' || def.key === 'woba') return v.toFixed(3).replace(/^0/, '')
  if (def.kind === 'rate') return `${(v * 100).toFixed(1)}%`
  return `${v.toFixed(1)}${def.unit === 'in' ? ' in' : def.unit}`
}

// ---------- spray (counts per type and direction) ----------
export type SprayCounts = { gb: [number, number, number]; air: [number, number, number]; n: number } // pull, straight, oppo
export function sprayOf(rows: PlatoonRow[], hand: Hand): SprayCounts {
  const get = (k: string) => rows.find(x => x.metric === k && x.p_throws === hand)
  const c = (k: string) => Math.round(get(k)?.value_sum ?? 0)
  const gb: [number, number, number] = [c('spray_gb_pull'), c('spray_gb_straight'), c('spray_gb_oppo')]
  const air: [number, number, number] = [c('spray_air_pull'), c('spray_air_straight'), c('spray_air_oppo')]
  return { gb, air, n: gb.reduce((a, b) => a + b, 0) + air.reduce((a, b) => a + b, 0) }
}

// ---------- the verdict ----------
export type VerdictKind = 'agree' | 'results_split' | 'process_split' | 'not_enough'
export type Verdict = { kind: VerdictKind; badge: string; sentence: string; matched: string[]; moved: string[]; ready: number; of: number }
const processDefs = METRICS.filter(m => m.group === 'process')
const wobaFmt = (v: number) => v.toFixed(3).replace(/^0/, '')
const list = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const fmt = (n: number) => n.toLocaleString('en-US')

/** Does process agree with results? (descriptive thresholds) A process metric is READY when both hands clear its minimum; it MOVED when the gap (vs LHP minus vs RHP) is at least its practical
 *  threshold, otherwise it MATCHED. Results are SPLIT when the wOBA gap is at least .040. Fewer than three ready process metrics = Not enough data yet. */
export function verdictFor(rows: PlatoonRow[]): Verdict {
  const ready: { def: MetricDef; gap: number }[] = []
  for (const def of processDefs) {
    const l = statOf(rows, def.key, 'L'), r = statOf(rows, def.key, 'R')
    if (l.mean != null && r.mean != null && l.n >= def.gate && r.n >= def.gate) ready.push({ def, gap: l.mean - r.mean })
  }
  const wl = statOf(rows, 'woba', 'L'), wr = statOf(rows, 'woba', 'R')
  const base = { ready: ready.length, of: processDefs.length }
  const sl = statOf(rows, 'bat_speed', 'L').n, sr = statOf(rows, 'bat_speed', 'R').n
  if (ready.length < 3 || wl.mean == null || wr.mean == null) {
    return { kind: 'not_enough', badge: 'Not enough data yet', matched: [], moved: [], ...base,
      sentence: `Only ${ready.length} of ${processDefs.length} process metrics clear their minimum on both sides (n = ${fmt(sl)} / ${fmt(sr)} swings vs L / vs R), so there is nothing to compare yet. His wOBA is ${wl.mean == null ? '—' : wobaFmt(wl.mean)} vs LHP over ${fmt(wl.n)} PA and ${wr.mean == null ? '—' : wobaFmt(wr.mean)} vs RHP over ${fmt(wr.n)} PA.` }
  }
  const matched = ready.filter(x => Math.abs(x.gap) < x.def.practical), moved = ready.filter(x => Math.abs(x.gap) >= x.def.practical)
  const gapW = wl.mean - wr.mean, resultsSplit = Math.abs(gapW) >= DEF.woba.practical
  const swings = `n = ${fmt(sl)} / ${fmt(sr)} swings`
  const names = (xs: typeof ready) => xs.slice(0, 3).map(x => x.def.label.replace(/ \(.*\)/, '').toLowerCase())
  const settle = `outcome splits usually take ${fmt(WOBA_STEADY_FROM)} to ${fmt(WOBA_STEADY_TO)} PA to settle`
  if (resultsSplit && moved.length === 0) {
    return { kind: 'results_split', badge: "Results split, process doesn't", matched: matched.map(x => x.def.key), moved: [], ...base,
      sentence: `Vs lefties his ${list(names(matched))} match his vs-righties profile (${swings}). His ${wobaFmt(wl.mean)} wOBA vs LHP comes from ${fmt(wl.n)} PA; ${settle}.` }
  }
  if (moved.length === 0) {
    return { kind: 'agree', badge: 'Process and results agree', matched: matched.map(x => x.def.key), moved: [], ...base,
      sentence: `Vs lefties his ${list(names(matched))} match his vs-righties profile (${swings}), and his wOBA is within .040 on both sides (${wobaFmt(wl.mean)} over ${fmt(wl.n)} PA vs LHP, ${wobaFmt(wr.mean)} over ${fmt(wr.n)} PA vs RHP).` }
  }
  const phrase = moved.slice(0, 3).map(x => x.def.word(x.gap))
  if (resultsSplit) {
    return { kind: 'agree', badge: 'Process and results agree', matched: matched.map(x => x.def.key), moved: moved.map(x => x.def.key), ...base,
      sentence: `Vs lefties his ${list(phrase)} than vs righties (${swings}). His wOBA is ${wobaFmt(Math.abs(gapW))} ${gapW < 0 ? 'lower' : 'higher'} vs LHP over ${fmt(wl.n)} PA, so both the swing numbers and the results differ between sides; ${settle}.` }
  }
  return { kind: 'process_split', badge: "Process splits, results haven't", matched: matched.map(x => x.def.key), moved: moved.map(x => x.def.key), ...base,
    sentence: `Vs lefties his ${list(phrase)} than vs righties (${swings}), but his wOBA is within .040 on both sides (${wobaFmt(wl.mean)} vs LHP, ${wobaFmt(wr.mean)} vs RHP).` }
}

// ---------- the call: Platoon yes or no ----------
// A description turned into a decision rule, stated on the page. Thresholds are working values (same status as the practical gaps in METRICS) until they are tuned.
//  weaker side   the pitcher hand he has the lower wOBA against.
//  results split his wOBA is .040 or more lower against that hand (DEF.woba.practical).
//  swing support at least two of the four swing-quality measures (bat speed, squared-up, zone contact, chase) differ by more than their practical gap AND are worse against that hand,
//                and they outnumber the ones that are better there.
//  Yes           results split + swing support + his wOBA against that hand is below the league's for hitters on his batting side against that hand.
//  No            anything else: no split, results only, swing only, or a real split that still leaves him at or above league average against the weaker side ("not worth").
export type CallKind = 'yes' | 'no' | 'not_enough'
export type CallReason = 'supported' | 'no_split' | 'results_only' | 'swing_only' | 'not_worth' | 'not_enough'
export type PlatoonCall = { call: CallKind; reason: CallReason; badge: string; sentence: string; weak: Hand | null; weakWoba: number | null; leagueWoba: number | null; moved: string[]; matched: string[]; ready: number; of: number }
const QUALITY: Partial<Record<MetricKey, 1 | -1>> = { bat_speed: 1, squared_up: 1, zone_contact: 1, chase: -1 } // +1: higher is better for the hitter
export const handName = (h: Hand) => (h === 'L' ? 'LHP' : 'RHP')
/** A call needs this many PA against each hand: below it a wOBA gap is mostly sample size (the wOBA split itself is always shown). */
export const CALL_MIN_PA = 100

export function platoonCall(rows: PlatoonRow[], league: PlatoonRow[]): PlatoonCall {
  const v = verdictFor(rows)
  const base = { moved: v.moved, matched: v.matched, ready: v.ready, of: v.of }
  const wl = statOf(rows, 'woba', 'L'), wr = statOf(rows, 'woba', 'R')
  if (v.kind === 'not_enough' || wl.mean == null || wr.mean == null) {
    return { call: 'not_enough', reason: 'not_enough', badge: 'Not enough data yet', sentence: v.sentence, weak: null, weakWoba: null, leagueWoba: null, ...base }
  }
  if (wl.n < CALL_MIN_PA || wr.n < CALL_MIN_PA) {
    const short: Hand = wl.n <= wr.n ? 'L' : 'R'
    return { call: 'not_enough', reason: 'not_enough', badge: 'Not enough data yet', sentence: `A call needs ${CALL_MIN_PA} PA against each hand and he has ${fmt(statOf(rows, 'woba', short).n)} against ${handName(short)} (${fmt(wl.n)} vs LHP, ${fmt(wr.n)} vs RHP), so the wOBA split of ${wobaFmt(Math.abs(wl.mean - wr.mean))} is mostly sample size so far.`, weak: null, weakWoba: null, leagueWoba: null, ...base }
  }
  const gapW = wl.mean - wr.mean // vs LHP minus vs RHP
  const resultsSplit = Math.abs(gapW) >= DEF.woba.practical
  const weak: Hand = gapW <= 0 ? 'L' : 'R', other: Hand = weak === 'L' ? 'R' : 'L'
  const ww = weak === 'L' ? wl : wr, wo = weak === 'L' ? wr : wl
  const against: { key: MetricKey; gap: number }[] = []
  let favour = 0
  for (const key of Object.keys(QUALITY) as MetricKey[]) {
    if (!v.moved.includes(key)) continue
    const a = statOf(rows, key, weak).mean, b = statOf(rows, key, other).mean
    if (a == null || b == null) continue
    if ((a - b) * (QUALITY[key] as number) < 0) against.push({ key, gap: a - b }); else favour++
  }
  const swingSupports = against.length >= 2 && against.length > favour
  const lg = statOf(league, 'woba', weak).mean
  const out = (call: CallKind, reason: CallReason, badge: string, sentence: string): PlatoonCall => ({ call, reason, badge, sentence, weak, weakWoba: ww.mean, leagueWoba: lg, ...base })
  const sl = statOf(rows, 'bat_speed', 'L').n, sr = statOf(rows, 'bat_speed', 'R').n
  const swings = `n = ${fmt(sl)} / ${fmt(sr)} swings vs L / vs R`
  const results = `Against ${handName(weak)} his wOBA is ${wobaFmt(Math.abs(gapW))} lower (${wobaFmt(ww.mean as number)} over ${fmt(ww.n)} PA, against ${wobaFmt(wo.mean as number)} over ${fmt(wo.n)} PA vs ${handName(other)})`
  const settle = `outcome splits usually take ${fmt(WOBA_STEADY_FROM)} to ${fmt(WOBA_STEADY_TO)} PA to settle`
  if (resultsSplit && swingSupports) {
    const phrase = list(against.slice(0, 3).map(x => DEF[x.key].word(x.gap)))
    if (lg != null && (ww.mean as number) >= lg) {
      return out('no', 'not_worth', 'Platoon: No', `${results}, and his ${phrase} against ${handName(weak)} (${swings}). But ${wobaFmt(ww.mean as number)} is still above the league’s ${wobaFmt(lg)} for batters on his side against ${handName(weak)}, so the split is real but he is not below average even there.`)
    }
    return out('yes', 'supported', 'Platoon: Yes', `${results}, and his ${phrase} against ${handName(weak)} (${swings}). That is below the league’s ${lg == null ? 'average' : wobaFmt(lg)} for batters on his side against ${handName(weak)}, and the swing and the results point the same way; ${settle}.`)
  }
  if (resultsSplit) {
    if (v.moved.length === 0) return out('no', 'results_only', 'Platoon: No', v.sentence)
    return out('no', 'results_only', 'Platoon: No', `${results}, but the swing doesn’t back it: ${against.length} of the four swing-quality measures (bat speed, squared-up, zone contact, chase) is worse against ${handName(weak)} (${swings}); ${settle}.`)
  }
  if (v.moved.length > 0) return out('no', 'swing_only', 'Platoon: No', v.sentence)
  return out('no', 'no_split', 'Platoon: No', v.sentence)
}

// ---------- a hitter as the page receives him ----------
export type PlatoonHitter = {
  batterId: number; name: string; team: string | null
  bats: 'L' | 'R' | 'S'           // S = rows exist for both sides with real samples
  season: number; coordEra: string
  bySide: Record<Hand, PlatoonRow[]>  // his rows per side batted from (a side with no rows is [])
  league: Record<Hand, PlatoonRow[]>  // batter_id 0 rows per side
}
/** the side(s) a hitter has data for, most plate appearances first */
export const sidesOf = (h: PlatoonHitter): Hand[] => (['L', 'R'] as Hand[]).filter(s => h.bySide[s].length > 0).sort((a, b) => paOf(h.bySide[b]) - paOf(h.bySide[a]))
export const paOf = (rows: PlatoonRow[]) => rows.filter(r => r.metric === 'woba').reduce((a, r) => a + r.n, 0)

// Contact-point histogram (the heatmap): rows named cp_{column}_{row}, one per 4-inch cell, n = value_sum = swings in that cell. Columns run intercept x 22 to 58 in, rows intercept y 14 to 62 in
// (the edge cells hold everything beyond). Same constants as scripts/build_batter_platoon.py.
export const CP = { x0: 22, y0: 14, step: 4, nx: 9, ny: 12 }
/** Swings per cell for one pitcher hand, [row][column], plus the total; null when the hitter has no cell rows on that hand. */
export function cpOf(rows: PlatoonRow[], hand: Hand): { cells: number[][]; total: number } | null {
  const cells = Array.from({ length: CP.ny }, () => new Array<number>(CP.nx).fill(0))
  let total = 0
  for (const r of rows) {
    if (r.p_throws !== hand || !r.metric.startsWith('cp_')) continue
    const [, bx, by] = r.metric.split('_').map(Number)
    if (!(bx >= 0 && bx < CP.nx && by >= 0 && by < CP.ny)) continue
    const c = Number(r.value_sum)
    cells[by][bx] += c; total += c
  }
  return total > 0 ? { cells, total } : null
}
