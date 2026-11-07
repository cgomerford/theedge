// src/lib/pitch-shape/decompose.ts
//
// Why are a pitch's results not what its shape has produced? Take league pitches of the same type and hand with the same movement (the "shape window") and ask, one factor at a time, how much of
// the gap between his results and the shape's results comes from HOW HE USES the pitch rather than the pitch itself:
//   platoon    the mix of left- and right-handed batters he throws it to, against the league's for that shape
//   location   where it crosses the plate (the nine zone squares and outside), against the league's for that shape: the command question
//   sequencing the counts he throws it in (first pitch, ahead, even, behind), against the league's for that shape
// Each is a mix effect: his share of the pitch in each slice, times the league shape-window's run value in that slice, summed, minus the league window's overall run value. Positive means his mix
// costs him (more of his pitches sit where the league's did worse), negative means it helps. Velocity and extension are differences from the league window's average, reported without an effect
// size (the speed-and-arm-angle split in explain.ts gives the whiff and contact effect). What is left after the three mix effects is "execution inside those slices, defense and luck".
// The effects overlap a little (a count and a zone can say the same thing) so they are shown side by side, not added up. All of it describes what has happened; none of it is a forecast.
// Pure functions, no server imports.

export type WindowLine = {
  stand: string; count_state: string; zone: number
  pitches: number; swings: number; whiffs: number; rv_n: number; rv: number
  pa: number; wd: number; w: number; x: number
  velo_n: number; velo_sum: number; ext_n: number; ext_sum: number
}
const n = (v: unknown) => Number(v) || 0
export const normaliseWindow = (r: Record<string, unknown>): WindowLine => ({
  stand: String(r.stand), count_state: String(r.count_state), zone: n(r.zone),
  pitches: n(r.pitches), swings: n(r.swings), whiffs: n(r.whiffs), rv_n: n(r.rv_n), rv: n(r.rv), pa: n(r.pa), wd: n(r.wd), w: n(r.w), x: n(r.x),
  velo_n: n(r.velo_n), velo_sum: n(r.velo_sum), ext_n: n(r.ext_n), ext_sum: n(r.ext_sum),
})

/** A slice needs at least this many LEAGUE pitches in the window before his share of it is priced; thinner slices are pooled with the rest. */
export const MIN_SLICE_LEAGUE = 150
/** A mix effect smaller than this (runs per 100 pitches of the pitch) is noise. */
export const EFFECT_NOTICE = 0.15
export const SPEED_NOTICE_MPH = 1.0
export const EXTENSION_NOTICE_FT = 0.25

const sum = (ls: WindowLine[], f: (l: WindowLine) => number) => ls.reduce((a, l) => a + f(l), 0)
const rv100 = (ls: WindowLine[]) => { const rn = sum(ls, l => l.rv_n); return rn > 0 ? (sum(ls, l => l.rv) / rn) * 100 : null }

export type Slice = { key: string; label: string; his: number; league: number; /** the league window's runs per 100 in this slice */ leagueRv100: number | null; hisRv100: number | null; hisN: number; leagueN: number }
export type Factor = {
  id: 'platoon' | 'location' | 'sequencing'
  label: string
  /** runs per 100 pitches of this pitch his mix costs (positive) or saves (negative), against the league window's mix */
  effect: number | null
  slices: Slice[]
}

function mixEffect(his: WindowLine[], league: WindowLine[], keyOf: (l: WindowLine) => string, labelOf: (k: string) => string, keys: string[]): { effect: number | null; slices: Slice[] } {
  const leagueAll = rv100(league), hisN = sum(his, l => l.pitches), leagueN = sum(league, l => l.pitches)
  if (leagueAll == null || hisN === 0 || leagueN === 0) return { effect: null, slices: [] }
  const slices: Slice[] = []
  let priced = 0, expected = 0
  for (const k of keys) {
    const h = his.filter(l => keyOf(l) === k), g = league.filter(l => keyOf(l) === k)
    const hn = sum(h, l => l.pitches), gn = sum(g, l => l.pitches)
    const lr = rv100(g)
    slices.push({ key: k, label: labelOf(k), his: hn / hisN, league: gn / leagueN, leagueRv100: lr, hisRv100: rv100(h), hisN: hn, leagueN: gn })
    // price his share of this slice at the league's run value in it; a thin or empty league slice is priced at the league window's overall value (it neither helps nor hurts)
    const price = gn >= MIN_SLICE_LEAGUE && lr != null ? lr : leagueAll
    expected += (hn / hisN) * price; priced += hn / hisN
  }
  return { effect: priced > 0 ? expected - leagueAll : null, slices }
}

const STAND_LABEL: Record<string, string> = { L: 'Left-handed batters', R: 'Right-handed batters' }
const COUNT_LABEL: Record<string, string> = { first: 'First pitch (0-0)', ahead: 'Ahead in the count', even: 'Even count', behind: 'Behind in the count' }
/** Statcast zone numbers as readable places. 1 to 9 are the nine squares of the zone from the catcher's view; 11 to 14 are outside it. */
export const ZONE_LABEL: Record<string, string> = { '1': 'Upper left', '2': 'Upper middle', '3': 'Upper right', '4': 'Middle left', '5': 'Heart', '6': 'Middle right', '7': 'Lower left', '8': 'Lower middle', '9': 'Lower right', '11': 'Out, upper left', '12': 'Out, upper right', '13': 'Out, lower left', '14': 'Out, lower right' }
const ZONES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14']

export type Why = {
  /** his own runs allowed per 100 on the pitch, the league window's, and the gap (positive = he allows more than the shape has) */
  his100: number | null; league100: number | null; gap: number | null
  hisPitches: number; leaguePitches: number
  factors: Factor[]
  /** what is left of the gap after the biggest mix effect, for the "execution, defense, luck" line */
  velocity: { his: number | null; league: number | null; diff: number | null }
  extension: { his: number | null; league: number | null; diff: number | null }
}

export function decompose(his: WindowLine[], league: WindowLine[]): Why | null {
  if (his.length === 0 || league.length === 0) return null
  const his100 = rv100(his), league100 = rv100(league)
  const stand = mixEffect(his, league, l => l.stand, k => STAND_LABEL[k] ?? k, ['L', 'R'])
  const count = mixEffect(his, league, l => l.count_state, k => COUNT_LABEL[k] ?? k, ['first', 'ahead', 'even', 'behind'])
  const zone = mixEffect(his, league, l => String(l.zone), k => ZONE_LABEL[k] ?? k, ZONES)
  const mean = (ls: WindowLine[], nf: (l: WindowLine) => number, sf: (l: WindowLine) => number) => { const c = sum(ls, nf); return c >= 50 ? sum(ls, sf) / c : null }
  const hv = mean(his, l => l.velo_n, l => l.velo_sum), lv = mean(league, l => l.velo_n, l => l.velo_sum)
  const he = mean(his, l => l.ext_n, l => l.ext_sum), le = mean(league, l => l.ext_n, l => l.ext_sum)
  return {
    his100, league100, gap: his100 != null && league100 != null ? his100 - league100 : null,
    hisPitches: sum(his, l => l.pitches), leaguePitches: sum(league, l => l.pitches),
    factors: [
      { id: 'platoon', label: 'Platoon: who he throws it to', ...stand },
      { id: 'location', label: 'Location: where it crosses the plate', ...zone },
      { id: 'sequencing', label: 'Sequencing: the counts he throws it in', ...count },
    ],
    velocity: { his: hv, league: lv, diff: hv != null && lv != null ? hv - lv : null },
    extension: { his: he, league: le, diff: he != null && le != null ? he - le : null },
  }
}

export type Verdict = 'explains' | 'small' | 'helps'
/** Is this factor a real part of the gap? explains = costs him at least a notice; helps = saves him at least a notice; small = neither. */
export const verdictOf = (effect: number | null): Verdict | null => (effect == null ? null : effect >= EFFECT_NOTICE ? 'explains' : effect <= -EFFECT_NOTICE ? 'helps' : 'small')

/** The zone square where he throws it more than the league does by the widest margin, for the one-line location read ("14% down the middle vs 10% for the league"). */
export function biggestZoneShift(f: Factor): Slice | null {
  const inZone = f.slices.filter(s => Number(s.key) <= 9 && s.hisN + s.leagueN > 0)
  if (inZone.length === 0) return null
  return [...inZone].sort((a, b) => (b.his - b.league) - (a.his - a.league))[0]
}
