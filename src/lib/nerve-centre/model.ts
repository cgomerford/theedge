// src/lib/nerve-centre/model.ts
//
// Pure (no server imports) model for the Contact Lab's Swing Changes and Three True Outcomes sections (the Batting Lab
// "Nerve Centre", mockup x9Lab Batting Lab_ Nerve Centre mockup.html). Rows come from batter_swing_monthly and batter_tto
// (migrations 20261022100000 / 20261022120000); batter_id 0 is the league row. Descriptions only: the sentences say what moved
// "alongside" or "over the same months", never what caused what.

// ---------- Swing Changes ----------

export type SwingMonthRow = {
  batter_id: number; season: number; month: number
  n_swings: number; n_contact: number | null; n_bbe: number | null
  bat_speed_mean: number | null; attack_angle_mean: number | null; squared_up_n: number | null
  stance_angle_mean: number | null; stance_width_mean: number | null
}
/** one month of a hitter's contact outcomes, from batter_contact_profile month rows */
export type OutcomeMonthRow = { month: number; n_bbe: number; pull_air: number; barrel: number }

export const MONTHS = [4, 5, 6, 7, 8, 9]           // April..September (March and October have too few swings to chart)
export const MONTH_LABEL = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
export const EARLY = [4, 5]                          // Apr–May
export const LATE = [7, 8, 9]                        // Jul–Sep  (June is left out of the comparison on purpose)
export const INPUT_GATE = 50                         // swings in a month for a shape-type input
export const OUTPUT_GATE = 40                        // batted balls in a month for an outcome

export type MetricDef = { k: string; label: string; unit: string; threshold: number }
export const INPUTS: MetricDef[] = [
  { k: 'stance', label: 'Stance angle', unit: '°', threshold: 3 },
  { k: 'width', label: 'Stance width', unit: ' in', threshold: 1 },
  { k: 'bat', label: 'Bat speed', unit: ' mph', threshold: 1 },
  { k: 'aa', label: 'Attack angle', unit: '°', threshold: 2 },
]
export const OUTPUTS: MetricDef[] = [
  { k: 'pullAir', label: 'Pull AIR%', unit: '%', threshold: 4 },
  { k: 'barrel', label: 'Barrel rate', unit: '%', threshold: 3 },
  { k: 'sq', label: 'Squared-up rate', unit: '%', threshold: 3 },
]

export type MonthSeries = { values: (number | null)[]; ns: number[]; gate: boolean[] } // one entry per MONTHS item
const idx = <T extends { month: number }>(rows: T[]) => new Map(rows.map(r => [r.month, r]))

/** monthly series for the four swing inputs: value null (and gate false) when Savant has no value or the month has under INPUT_GATE swings */
export function inputSeries(rows: SwingMonthRow[]): Record<string, MonthSeries> {
  const by = idx(rows)
  const make = (get: (r: SwingMonthRow) => number | null): MonthSeries => {
    const values: (number | null)[] = [], ns: number[] = [], gate: boolean[] = []
    for (const m of MONTHS) {
      const r = by.get(m), v = r ? get(r) : null
      values.push(v); ns.push(r?.n_swings ?? 0); gate.push(!!r && v != null && r.n_swings >= INPUT_GATE)
    }
    return { values, ns, gate }
  }
  return { stance: make(r => r.stance_angle_mean), width: make(r => r.stance_width_mean), bat: make(r => r.bat_speed_mean), aa: make(r => r.attack_angle_mean) }
}
/** monthly series for the three outcomes: Pull AIR% and barrel rate from contact month rows, squared-up rate from swing months */
export function outputSeries(contact: OutcomeMonthRow[], swing: SwingMonthRow[]): Record<string, MonthSeries> {
  const c = idx(contact), s = idx(swing)
  const make = (get: (m: number) => { v: number | null; n: number }): MonthSeries => {
    const values: (number | null)[] = [], ns: number[] = [], gate: boolean[] = []
    for (const m of MONTHS) { const { v, n } = get(m); values.push(v); ns.push(n); gate.push(v != null && n >= OUTPUT_GATE) }
    return { values, ns, gate }
  }
  return {
    pullAir: make(m => { const r = c.get(m); return { v: r && r.n_bbe ? (r.pull_air / r.n_bbe) * 100 : null, n: r?.n_bbe ?? 0 } }),
    barrel: make(m => { const r = c.get(m); return { v: r && r.n_bbe ? (r.barrel / r.n_bbe) * 100 : null, n: r?.n_bbe ?? 0 } }),
    sq: make(m => { const r = s.get(m); return { v: r && r.n_contact && r.squared_up_n != null ? (r.squared_up_n / r.n_contact) * 100 : null, n: r?.n_contact ?? 0 } }),
  }
}

/** Groups a monthly series into the early (Apr–May) and late (Jul–Sep) periods: each period's sample-weighted mean over its months that clear the gate.
 *  null when a period has no month that clears it. (The period-comparison helper behind the Swing Changes sentence.) */
export function groupByPeriod(s: MonthSeries, early = EARLY, late = LATE) {
  const mean = (months: number[]) => {
    let w = 0, a = 0
    months.forEach(m => { const i = MONTHS.indexOf(m); if (i >= 0 && s.gate[i] && s.values[i] != null) { w += s.ns[i]; a += s.ns[i] * (s.values[i] as number) } })
    return w ? a / w : null
  }
  const e = mean(early), l = mean(late)
  return { early: e, late: l, delta: e != null && l != null ? l - e : null }
}
export type Compared = MetricDef & { early: number | null; late: number | null; delta: number | null; moved: boolean }
export function compare(defs: MetricDef[], series: Record<string, MonthSeries>): Compared[] {
  return defs.map(d => { const g = groupByPeriod(series[d.k]); return { ...d, ...g, moved: g.delta != null && Math.abs(g.delta) >= d.threshold } })
}

const list = (a: string[]) => (a.length < 2 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const inputWords = (d: Compared) => {
  const x = Math.abs(d.delta as number).toFixed(1), up = (d.delta as number) > 0
  switch (d.k) {
    case 'stance': return `his stance ${up ? 'opened' : 'closed'} ${x}°`
    case 'width': return `his stance ${up ? 'widened' : 'narrowed'} ${x} in`
    case 'bat': return `bat speed ${up ? 'rose' : 'fell'} ${x} mph`
    default: return `attack angle ${up ? 'rose' : 'fell'} ${x}°`
  }
}
/** The one-line summary under Swing Changes. Wording follows the mockup: "alongside" / "over the same months", never "because". */
export function swingSentence(inputs: Compared[], outputs: Compared[], nLateBbe: number): { lead: string; text: string } {
  const haveIn = inputs.filter(d => d.delta != null), haveOut = outputs.filter(d => d.delta != null)
  if (haveIn.length === 0 && haveOut.length === 0) return { lead: 'Not enough monthly data yet.', text: `April–May and July–September each need a month with ${INPUT_GATE}+ swings or ${OUTPUT_GATE}+ batted balls to compare.` }
  const mi = inputs.filter(d => d.moved), mo = outputs.filter(d => d.moved)
  const outTxt = mo.map(d => `${d.k === 'pullAir' ? 'Pull AIR%' : d.label.toLowerCase()} ${(d.delta as number) > 0 ? 'rose' : 'fell'} from ${(d.early as number).toFixed(1)}% to ${(d.late as number).toFixed(1)}%`)
  const n = ` (n = ${nLateBbe} batted balls, Jul–Sep)`
  if (mi.length && mo.length) return { lead: 'Inputs and results moved together.', text: `From Apr–May to Jul–Sep, ${list(mi.map(inputWords))}. Over the same months, ${list(outTxt)}${n}.` }
  if (mi.length) return { lead: 'The swing changed; the results held.', text: `From Apr–May to Jul–Sep, ${list(mi.map(inputWords))}, while contact quality held steady over the same months.` }
  if (haveIn.length === 0) {   // no setup or swing data for these months: say so, never "held steady"
    if (mo.length) return { lead: 'Contact moved; there is no setup or swing data for these months yet.', text: `${list(outTxt)} from Apr–May to Jul–Sep${n}.` }
    return { lead: 'Contact held steady; there is no setup or swing data for these months yet.', text: 'Pull AIR%, barrel rate and squared-up rate all stayed within their thresholds from April to September.' }
  }
  if (mo.length) return { lead: 'Results moved without a change in the inputs we track.', text: `Stance, bat speed and attack angle held steady. ${list(outTxt)} from Apr–May to Jul–Sep${n}.` }
  return { lead: 'A settled hitter.', text: 'Setup, swing and contact quality all held steady from April to September. Nothing in this view moved enough to describe.' }
}

// ---------- Three True Outcomes ----------

export type TtoRow = {
  batter_id: number; season: number; name: string | null; team: string | null
  pa: number; k: number; bb: number; hr: number; hbp: number; hit_in_play: number; other_in_play: number
  gb: number | null; ld: number | null; fb: number | null; pu: number | null
  rolling_tto_n: number[] | null; rolling_k_n: number[] | null; rolling_bb_n: number[] | null; rolling_hr_n: number[] | null
  rolling_tto_sd: number | null
}
export const TTO_MIN_PA = 300
export const ROLL_WINDOW = 100
export const ROLL_STEP = 25
export const tto = (r: Pick<TtoRow, 'k' | 'bb' | 'hr'>) => r.k + r.bb + r.hr
export const ttoRate = (r: TtoRow) => (r.pa ? tto(r) / r.pa : null)

/** Ternary position (0..1 shares) of the K / BB / HR mix among a hitter's three-true-outcome PAs. null when he has none. */
export function ternaryShares(r: Pick<TtoRow, 'k' | 'bb' | 'hr'>): [number, number, number] | null {
  const t = tto(r)
  return t ? [r.k / t, r.bb / t, r.hr / t] : null
}

export type Steadiness = 'steady' | 'some' | 'streaky'
export const STEADY_LABEL: Record<Steadiness, string> = { steady: 'Steady', some: 'Some swings', streaky: 'Streaky' }
/** Steadiness badges from the spread of the rolling 100-PA TTO%: the lowest third of qualified hitters is Steady, the highest third Streaky.
 *  Cut points come from the data (not fixed numbers), so a badge always means "among these hitters". */
export function steadinessCuts(rows: TtoRow[]): [number, number] | null {
  const sd = rows.filter(r => r.pa >= TTO_MIN_PA && r.rolling_tto_sd != null).map(r => r.rolling_tto_sd as number).sort((a, b) => a - b)
  if (sd.length < 9) return null
  return [sd[Math.floor(sd.length / 3)], sd[Math.floor((2 * sd.length) / 3)]]
}
export function steadinessOf(sd: number | null, cuts: [number, number] | null): Steadiness | null {
  if (sd == null || !cuts) return null
  return sd < cuts[0] ? 'steady' : sd < cuts[1] ? 'some' : 'streaky'
}
