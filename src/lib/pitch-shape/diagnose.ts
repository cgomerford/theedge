// src/lib/pitch-shape/diagnose.ts
//
// "Where is it leaking?" For a pitcher whose shape has produced more than his results show, say where the gap sits: on which pitch, in which situation (batter side, count, time through
// the order), and in the process measures that point to sequencing and command (first-pitch strikes, pitches in the zone, chase, repeating the last pitch, fastball use when ahead).
// Pure functions over aggregated lines (the shape_situation_lines SQL function) and per-pitch shape gaps; no server imports. Everything compares him with league pitchers THROWING THE SAME
// PITCH TYPES TO THE SAME KIND OF BATTER, so a pitcher who throws a lot of sliders is held to the league's slider results, not the league's average pitch. It describes what has happened, with
// the sample behind each finding. It cannot see command inside the zone, defense, park or luck beyond the contact-quality check, and it does not predict.

export type Line = {
  pitch_type: string; p_throws: string; stand: string; count_state: string; tto: number
  pitches: number; swings: number; whiffs: number; rv_n: number; rv: number
  pa: number; wd: number; w: number; x: number
  zone_n: number; ooz_n: number; chase_n: number; first_n: number; first_strike: number; prev_n: number; repeat_n: number
}
export const SITUATION_MIN_PITCHES = 150
/** A situation or process gap smaller than this is not worth naming. */
export const LEAK_RUNS = 0.2          // runs per 100 pitches, overall
export const PROCESS_PTS = 0.03        // three points on a rate
export const REPEAT_PTS = 0.04
export const MIN_PROCESS_N = { first: 150, zone: 300, chase: 100, repeat: 300 }

const num = (v: unknown) => Number(v) || 0
export const normalise = (r: Record<string, unknown>): Line => ({
  pitch_type: String(r.pitch_type), p_throws: String(r.p_throws), stand: String(r.stand), count_state: String(r.count_state), tto: num(r.tto),
  pitches: num(r.pitches), swings: num(r.swings), whiffs: num(r.whiffs), rv_n: num(r.rv_n), rv: num(r.rv), pa: num(r.pa), wd: num(r.wd), w: num(r.w), x: num(r.x),
  zone_n: num(r.zone_n), ooz_n: num(r.ooz_n), chase_n: num(r.chase_n), first_n: num(r.first_n), first_strike: num(r.first_strike), prev_n: num(r.prev_n), repeat_n: num(r.repeat_n),
})

const rv100 = (s: { rv: number; rv_n: number }) => (s.rv_n > 0 ? (s.rv / s.rv_n) * 100 : null)
const sum = (ls: Line[]) => ls.reduce((a, l) => ({ ...a, pitches: a.pitches + l.pitches, swings: a.swings + l.swings, whiffs: a.whiffs + l.whiffs, rv_n: a.rv_n + l.rv_n, rv: a.rv + l.rv, pa: a.pa + l.pa, wd: a.wd + l.wd, w: a.w + l.w, x: a.x + l.x, zone_n: a.zone_n + l.zone_n, ooz_n: a.ooz_n + l.ooz_n, chase_n: a.chase_n + l.chase_n, first_n: a.first_n + l.first_n, first_strike: a.first_strike + l.first_strike, prev_n: a.prev_n + l.prev_n, repeat_n: a.repeat_n + l.repeat_n }),
  { pitch_type: '', p_throws: '', stand: '', count_state: '', tto: 0, pitches: 0, swings: 0, whiffs: 0, rv_n: 0, rv: 0, pa: 0, wd: 0, w: 0, x: 0, zone_n: 0, ooz_n: 0, chase_n: 0, first_n: 0, first_strike: 0, prev_n: 0, repeat_n: 0 } as Line)

type Dim = 'stand' | 'count_state' | 'tto'
const leagueFor = (league: Line[], hand: string, t: string, dim: Dim | null, v: string | number | null) => league.filter(l => l.p_throws === hand && l.pitch_type === t && (dim == null || l[dim] === v))

/**
 * The league's value of a measure for the pitch types he throws, weighted by how much he throws each: what a league pitcher with HIS mix would have, in the same slice.
 * `weight` says how many of his pitches stand behind each type (so chase is weighted by his out-of-zone pitches, repeats by his pitches with a predecessor).
 */
function expected(mine: Line[], league: Line[], hand: string, dim: Dim | null, v: string | number | null, rate: (s: Line) => number | null, weight: (s: Line) => number): number | null {
  const types = [...new Set(mine.map(m => m.pitch_type))]
  let num = 0, den = 0
  for (const t of types) {
    const w = weight(sum(mine.filter(m => m.pitch_type === t)))
    const lr = rate(sum(leagueFor(league, hand, t, dim, v)))
    if (w > 0 && lr != null) { num += w * lr; den += w }
  }
  return den > 0 ? num / den : null
}

export type Leak = { dim: 'stand' | 'count' | 'tto'; label: string; pitches: number; share: number; mine100: number; expected100: number; /** runs per 100 of ALL his pitches that this slice costs (positive = costs him) */ cost: number }
const DIM_LABEL: Record<string, string> = { first: 'the first pitch (0-0)', ahead: 'counts where he is ahead', even: 'even counts', behind: 'counts where he is behind' }
const standText = (s: string) => (s === 'L' ? 'left-handed batters' : 'right-handed batters')
const ttoText = (n: number) => (n === 1 ? 'the first time through the order' : n === 2 ? 'the second time through' : 'the third time through or later')

/** Slices (batter side, count, time through the order) where he allows more runs than league pitchers with his mix, worst first. Slices under 150 of his pitches are skipped. */
export function situationLeaks(mine: Line[], league: Line[]): Leak[] {
  if (mine.length === 0) return []
  const hand = mine[0].p_throws
  const total = sum(mine).pitches
  const out: Leak[] = []
  const dims: { dim: Dim; key: Leak['dim']; values: (string | number)[]; label: (v: string | number) => string }[] = [
    { dim: 'stand', key: 'stand', values: ['L', 'R'], label: v => standText(String(v)) },
    { dim: 'count_state', key: 'count', values: ['first', 'ahead', 'even', 'behind'], label: v => DIM_LABEL[String(v)] },
    { dim: 'tto', key: 'tto', values: [1, 2, 3], label: v => ttoText(Number(v)) },
  ]
  for (const d of dims) for (const v of d.values) {
    const slice = mine.filter(m => m[d.dim] === v)
    const s = sum(slice)
    if (s.pitches < SITUATION_MIN_PITCHES || s.rv_n === 0) continue
    const mine100 = rv100(s) as number
    const exp100 = expected(slice, league, hand, d.dim, v, l => rv100(l), l => l.rv_n)
    if (exp100 == null) continue
    out.push({ dim: d.key, label: d.label(v), pitches: s.pitches, share: total ? s.pitches / total : 0, mine100, expected100: exp100, cost: (mine100 - exp100) * (s.pitches / total) })
  }
  return out.filter(l => l.cost >= LEAK_RUNS).sort((a, b) => b.cost - a.cost)
}

export type Process = { id: 'first' | 'zone' | 'chase' | 'repeat' | 'aheadFb'; label: string; mine: number; expected: number; n: number; /** true when the gap is the unhelpful way round for him */ hurts: boolean; text: string }
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const FASTBALLS = new Set(['FF', 'SI', 'FC'])

/** First-pitch strikes, pitches in the zone, chase, repeating the last pitch and fastball use when ahead, each against league pitchers with his mix. Only gaps worth naming are returned. */
export function processFindings(mine: Line[], league: Line[]): Process[] {
  if (mine.length === 0) return []
  const hand = mine[0].p_throws
  const m = sum(mine)
  const out: Process[] = []
  const add = (id: Process['id'], label: string, mineV: number | null, exp: number | null, n: number, minN: number, notice: number, lowerHurts: boolean, say: (a: string, b: string, lower: boolean) => string, onlyHigher = false) => {
    if (mineV == null || exp == null || n < minN || Math.abs(mineV - exp) < notice) return
    const lower = mineV < exp
    if (onlyHigher && lower) return
    out.push({ id, label, mine: mineV, expected: exp, n, hurts: lowerHurts ? lower : !lower, text: say(pct(mineV), pct(exp), lower) })
  }
  add('first', 'First-pitch strikes', m.first_n ? m.first_strike / m.first_n : null,
    expected(mine, league, hand, null, null, l => (l.first_n ? l.first_strike / l.first_n : null), l => l.first_n), m.first_n, MIN_PROCESS_N.first, PROCESS_PTS, true,
    (a, b) => `He gets a strike on ${a} of first pitches; league pitchers with his mix get ${b}.`)
  add('zone', 'Pitches in the zone', m.pitches ? m.zone_n / m.pitches : null,
    expected(mine, league, hand, null, null, l => (l.pitches ? l.zone_n / l.pitches : null), l => l.pitches), m.pitches, MIN_PROCESS_N.zone, PROCESS_PTS, true,
    (a, b) => `${a} of his pitches are in the strike zone; league pitchers with his mix throw ${b}.`)
  add('chase', 'Chase on pitches outside the zone', m.ooz_n ? m.chase_n / m.ooz_n : null,
    expected(mine, league, hand, null, null, l => (l.ooz_n ? l.chase_n / l.ooz_n : null), l => l.ooz_n), m.ooz_n, MIN_PROCESS_N.chase, PROCESS_PTS, true,
    (a, b) => `Hitters swing at ${a} of his pitches outside the zone; against league pitchers with his mix they swing at ${b}.`)
  add('repeat', 'Repeating the last pitch', m.prev_n ? m.repeat_n / m.prev_n : null,
    expected(mine, league, hand, null, null, l => (l.prev_n ? l.repeat_n / l.prev_n : null), l => l.prev_n), m.prev_n, MIN_PROCESS_N.repeat, REPEAT_PTS, false,
    (a, b, lower) => `He throws the same pitch twice in a row ${a} of the time; league pitchers with his mix do it ${b}. ${lower ? 'He mixes his pitches more than they do, which makes the pattern harder to read.' : 'More repeats is a more predictable pattern.'}`)
  // fastball use when ahead: his share of fastballs (four-seam, sinker, cutter) in counts where he is ahead, against the league's for his hand
  const mineAhead = mine.filter(l => l.count_state === 'ahead'), leagueAhead = league.filter(l => l.p_throws === hand && l.count_state === 'ahead')
  const fb = (ls: Line[]) => { const t = ls.reduce((a, l) => a + l.pitches, 0); return t ? ls.filter(l => FASTBALLS.has(l.pitch_type)).reduce((a, l) => a + l.pitches, 0) / t : null }
  const nAhead = mineAhead.reduce((a, l) => a + l.pitches, 0)
  add('aheadFb', 'Fastballs when ahead', fb(mineAhead), fb(leagueAhead), nAhead, 150, 0.08, false,
    (a, b) => `When he is ahead in the count, ${a} of his pitches are fastballs; league ${hand === 'R' ? 'right' : 'left'}-handers throw ${b}. Relying on fastballs ahead in the count is a pattern hitters can plan for.`, true)
  return out
}

export type ArsenalGap = { pitchType: string; name: string; pitches: number; share: number; /** runs saved per 100 pitches on this pitch against the league's for the type */ shapeSaved: number | null; ownSaved: number | null; /** own minus shape: negative means he is below what the shape has produced */ gap: number | null; /** runs per 100 of ALL his pitches this pitch costs against its shape (positive = costs him) */ cost: number | null; small: boolean }

/** Per-pitch gaps ranked by what they cost across his whole arsenal. */
export function rankArsenal(rows: Omit<ArsenalGap, 'gap' | 'cost'>[]): ArsenalGap[] {
  return rows.map(r => {
    const gap = r.ownSaved != null && r.shapeSaved != null ? r.ownSaved - r.shapeSaved : null
    return { ...r, gap, cost: gap == null ? null : -gap * r.share }
  }).sort((a, b) => (b.cost ?? -99) - (a.cost ?? -99))
}

export type Summary = { text: string; tone: 'leak' | 'ok' }
/** The plain-language read, most important first. `contactGap` is wOBA minus xwOBA overall (positive: results worse than the contact quality he allowed). */
export function summarise(arsenal: ArsenalGap[], leaks: Leak[], process: Process[], contactGap: number | null, nameOf: (t: string) => string = t => t): Summary[] {
  const out: Summary[] = []
  const worst = arsenal.find(a => a.cost != null && a.cost >= LEAK_RUNS && a.gap != null && a.gap < 0)
  if (worst) out.push({ tone: 'leak', text: `Most of the shortfall is on his ${nameOf(worst.pitchType).toLowerCase()}: it has saved ${worst.ownSaved == null ? '' : `${worst.ownSaved >= 0 ? '+' : '−'}${Math.abs(worst.ownSaved).toFixed(2)}`} runs per 100 pitches against the ${worst.shapeSaved == null ? '' : `${worst.shapeSaved >= 0 ? '+' : '−'}${Math.abs(worst.shapeSaved).toFixed(2)}`} its shape has produced, and it is ${(worst.share * 100).toFixed(0)}% of his pitches, so it costs about ${worst.cost?.toFixed(2)} runs per 100 pitches overall.${worst.small ? ' Small sample.' : ''}` })
  else if (arsenal.some(a => a.gap != null)) out.push({ tone: 'ok', text: 'No single pitch explains it: none of his pitches is far enough below its shape to account for a gap of about a fifth of a run per 100 pitches.' })
  const l = leaks[0]
  if (l) out.push({ tone: 'leak', text: `Hitters do more damage than expected against his mix in ${l.label}: ${l.mine100.toFixed(2)} runs per 100 pitches against ${l.expected100.toFixed(2)} for league pitchers with his mix (${l.pitches.toLocaleString()} pitches).` })
  for (const p of process.filter(x => x.hurts).slice(0, 2)) out.push({ tone: 'leak', text: p.text })
  if (contactGap != null && contactGap >= 0.03) out.push({ tone: 'leak', text: 'His results are worse than the contact quality he allowed (wOBA above xwOBA), which can point to defense or luck rather than to the pitches.' })
  if (contactGap != null && contactGap <= -0.03) out.push({ tone: 'ok', text: 'His results are better than the contact quality he allowed (wOBA below xwOBA), so defense or luck may be helping him.' })
  return out
}
