// src/lib/swing-decisions/model.ts
//
// Pure (no server imports) model for the Swing Lab — the Batting Lab "Decisions" tab. Client components and the
// pitch-list API both import it.
//
// WHAT IT MEASURES: for every pitch a hitter saw, was his choice (swing or take) the league's average-value
// choice for that count × spot × pitch family × pitcher hand? decision value = what the league's pitches got when
// they were swung at (or taken) in that spot, for the choice HE made, minus the average over every pitch in that
// spot, per 100 pitches:
//     dv = (his swing rate − league swing rate) × (league swing run value − league take run value) × 100
// His own contact luck is deliberately NOT in it. Descriptions only; nothing here looks forward.
//
// CLASSIFICATION (classifyPitch, groupOf, familyOf, cellOf) mirrors scripts/build_swing_decisions.py line for line —
// that script is the writer of every table this reads. Change one, change the other.
//   swing = swinging_strike, swinging_strike_blocked, foul, foul_tip, hit_into_play
//   take  = ball, called_strike, blocked_ball
//   zone  = 5×5 in the batter's frame: zone_r 0 above .. 4 below; zone_c 0 wide inside .. 4 wide away.

export const SEASON = 2026
export const COORD_ERA = '2026'
export const GATE = { season: 300, group: 100, cell: 15, count: 30 } as const

export type CountGroup = 'even' | 'hitters' | 'two_strike'
export type Family = 'fastball' | 'breaking' | 'offspeed'
export type Hand = 'R' | 'L'
export type HandFilter = 'all' | Hand

export const COUNT_GROUPS: { key: CountGroup; label: string; defn: string; list: string[] }[] = [
  { key: 'even', label: 'Even', defn: '0-0 and 1-1', list: ['0-0', '1-1'] },
  { key: 'hitters', label: 'Hitter’s', defn: '1-0, 2-0, 3-0, 2-1, 3-1', list: ['1-0', '2-0', '3-0', '2-1', '3-1'] },
  { key: 'two_strike', label: 'Two-strike', defn: 'any count with two strikes', list: ['0-2', '1-2', '2-2', '3-2'] },
]
export const FAMILIES: { key: Family; label: string }[] = [
  { key: 'fastball', label: 'Fastballs' },
  { key: 'breaking', label: 'Breaking' },
  { key: 'offspeed', label: 'Offspeed' },
]
export const HANDS: { key: HandFilter; label: string }[] = [
  { key: 'all', label: 'All pitchers' },
  { key: 'R', label: 'vs RHP' },
  { key: 'L', label: 'vs LHP' },
]
export const ROW_LABELS = ['Above zone', 'High', 'Middle', 'Low', 'Below zone']
export const COL_LABELS = ['Wide in', 'In', 'Middle', 'Away', 'Wide away']
/** The 12 counts in ladder order. */
export const COUNTS_12: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2]]

export const inZone = (r: number, c: number) => r >= 1 && r <= 3 && c >= 1 && c <= 3

// ---------- row types (the shapes the UI is built on) ----------

/** One batter × count group × family × pitcher hand × cell. */
export type SwingDecisionRow = {
  batter_id: number
  season: number
  count_group: CountGroup
  family: Family
  p_throws: Hand
  zone_r: number
  zone_c: number
  n_pitches: number
  swing_rate: number
  decision_value_per100: number
  reliability: 'ok' | 'thin'
}

/** League baseline for the same key (swing_decision_league; numerics already coerced). */
export type LeagueCell = {
  count_group: CountGroup; family: Family; p_throws: Hand; zone_r: number; zone_c: number
  n: number; swing_rate: number; rv_swing_mean: number | null; rv_take_mean: number | null
}

/** One batter × exact count × family × hand (the count ladder). */
export type LadderRow = { balls: number; strikes: number; family: Family; p_throws: Hand; n_pitches: number; swing_rate: number }
export type LeagueCountRow = { balls: number; strikes: number; family: Family; p_throws: Hand; n: number; swing_rate: number }

export type SwingLabData = {
  batterId: number
  season: number
  nSeason: number              // every decision pitch he saw this season (the 300-pitch gate reads this)
  nL30: number                 // same, last 30 days
  rows: SwingDecisionRow[]     // season
  l30Rows: SwingDecisionRow[]  // last 30 days
  ladder: LadderRow[]          // season, all 12 counts
  league: LeagueCell[]
  leagueCounts: LeagueCountRow[]
}

// ---------- unpack the stored counts and attach decision value ----------

const GROUP_BY_INDEX: CountGroup[] = ['even', 'hitters', 'two_strike']
const FAMILY_BY_INDEX: Family[] = ['fastball', 'breaking', 'offspeed']

export type LeagueIndex = Map<string, LeagueCell>
const lkey = (g: string, f: string, h: string, r: number, c: number) => `${g}|${f}|${h}|${r}|${c}`
export function leagueIndex(league: LeagueCell[]): LeagueIndex {
  const m: LeagueIndex = new Map()
  for (const x of league) m.set(lkey(x.count_group, x.family, x.p_throws, x.zone_r, x.zone_c), x)
  return m
}
export const lgOf = (idx: LeagueIndex, x: { count_group: string; family: string; p_throws: string; zone_r: number; zone_c: number }) =>
  idx.get(lkey(x.count_group, x.family, x.p_throws, x.zone_r, x.zone_c))

/** batter_swing_decisions.cells (7 ints per entry) → rows with decision value. A cell the league has no swing or no take
 *  for cannot be baselined: it is marked 'thin' (shown as not estimated), never given a guessed value. */
export function expandCells(flat: number[], batterId: number, season: number, idx: LeagueIndex): SwingDecisionRow[] {
  const out: SwingDecisionRow[] = []
  for (let i = 0; i + 6 < flat.length; i += 7) {
    const row = {
      count_group: GROUP_BY_INDEX[flat[i]], family: FAMILY_BY_INDEX[flat[i + 1]], p_throws: (flat[i + 2] ? 'L' : 'R') as Hand,
      zone_r: flat[i + 3], zone_c: flat[i + 4],
    }
    const n = flat[i + 5], sw = flat[i + 6]
    const L = lgOf(idx, row)
    const baselined = !!L && L.rv_swing_mean != null && L.rv_take_mean != null && n > 0
    const dv = baselined ? ((sw / n) - L!.swing_rate) * (L!.rv_swing_mean! - L!.rv_take_mean!) * 100 : 0
    out.push({
      batter_id: batterId, season, ...row, n_pitches: n, swing_rate: n ? sw / n : 0,
      decision_value_per100: Math.round(dv * 100) / 100, reliability: baselined && n >= GATE.cell ? 'ok' : 'thin',
    })
  }
  return out
}

/** batter_swing_decisions.counts (6 ints per entry) → ladder rows. */
export function expandCounts(flat: number[]): LadderRow[] {
  const out: LadderRow[] = []
  for (let i = 0; i + 5 < flat.length; i += 6) {
    const n = flat[i + 4]
    out.push({ balls: flat[i], strikes: flat[i + 1], family: FAMILY_BY_INDEX[flat[i + 2]], p_throws: flat[i + 3] ? 'L' : 'R', n_pitches: n, swing_rate: n ? flat[i + 5] / n : 0 })
  }
  return out
}

// ---------- aggregation (used by the tiles, grid, lists, ladder and dumbbell) ----------

export type Agg = { n: number; swing: number | null; lg: number | null; dv: number | null; gap: number | null }
const EMPTY: Agg = { n: 0, swing: null, lg: null, dv: null, gap: null }

export function filterRows(rows: SwingDecisionRow[], count: CountGroup | null, family: Family | null, hand: HandFilter): SwingDecisionRow[] {
  return rows.filter(x => (count == null || x.count_group === count) && (family == null || x.family === family) && (hand === 'all' || x.p_throws === hand))
}

/** n-weighted: his swing rate, the league's on the same pitches, decision value per 100, and what a swing is worth over a take (per 100). */
export function aggregate(rows: SwingDecisionRow[], idx: LeagueIndex): Agg {
  let n = 0, s = 0, l = 0, d = 0, g = 0
  for (const x of rows) {
    const L = lgOf(idx, x)
    if (!L) continue
    n += x.n_pitches; s += x.n_pitches * x.swing_rate; l += x.n_pitches * L.swing_rate; d += x.n_pitches * x.decision_value_per100
    g += x.n_pitches * ((L.rv_swing_mean ?? 0) - (L.rv_take_mean ?? 0)) * 100
  }
  return n ? { n, swing: s / n, lg: l / n, dv: d / n, gap: g / n } : EMPTY
}

/** A pitch is "hittable" when the league's swing beats its take in that spot, "swing-losing" otherwise. */
export function summarize(rows: SwingDecisionRow[], idx: LeagueIndex) {
  const gapOf = (x: SwingDecisionRow) => { const L = lgOf(idx, x); return L && L.rv_swing_mean != null && L.rv_take_mean != null ? L.rv_swing_mean - L.rv_take_mean : null }
  const withGap = rows.filter(x => gapOf(x) != null)
  return {
    all: aggregate(rows, idx),
    junk: aggregate(withGap.filter(x => gapOf(x)! < 0), idx),
    hit: aggregate(withGap.filter(x => gapOf(x)! >= 0), idx),
    out: aggregate(rows.filter(x => !inZone(x.zone_r, x.zone_c)), idx),
    mid: aggregate(rows.filter(x => x.zone_r === 2 && x.zone_c === 2), idx),
  }
}

export type CellAgg = Agg & { r: number; c: number; ok: boolean }
export function cellsFor(rows: SwingDecisionRow[], idx: LeagueIndex, count: CountGroup, family: Family, hand: HandFilter): CellAgg[] {
  const sel = filterRows(rows, count, family, hand), out: CellAgg[] = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const here = sel.filter(x => x.zone_r === r && x.zone_c === c)
    const a = aggregate(here, idx)
    // a cell is estimated only when every row in it could be baselined and the pitches clear the gate
    out.push({ r, c, ...a, ok: a.n >= GATE.cell && here.every(x => x.reliability === 'ok' || x.n_pitches === 0) })
  }
  return out
}

export type LadderEntry = { balls: number; strikes: number; n: number; swing: number; lg: number }
export function ladderFor(ladder: LadderRow[], leagueCounts: LeagueCountRow[], family: Family | null, hand: HandFilter): LadderEntry[] {
  const lg = new Map(leagueCounts.map(x => [`${x.balls}|${x.strikes}|${x.family}|${x.p_throws}`, x.swing_rate]))
  return COUNTS_12.map(([b, s]) => {
    let n = 0, sw = 0, l = 0
    for (const x of ladder) {
      if (x.balls !== b || x.strikes !== s || (family && x.family !== family) || (hand !== 'all' && x.p_throws !== hand)) continue
      n += x.n_pitches; sw += x.n_pitches * x.swing_rate; l += x.n_pitches * (lg.get(`${b}|${s}|${x.family}|${x.p_throws}`) ?? 0)
    }
    return { balls: b, strikes: s, n, swing: n ? sw / n : 0, lg: n ? l / n : 0 }
  })
}

// ---------- pitch classification (mirror of the Python builder) ----------

const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play'])
const TAKE = new Set(['ball', 'called_strike', 'blocked_ball'])
const FAMILY_OF: Record<string, Family> = { FF: 'fastball', SI: 'fastball', FC: 'fastball', SL: 'breaking', ST: 'breaking', CU: 'breaking', KC: 'breaking', SV: 'breaking', CH: 'offspeed', FS: 'offspeed', FO: 'offspeed' }
const HALF = 0.83
const PAD = 0.12

export const familyOf = (pitchType: string): Family | null => FAMILY_OF[pitchType] ?? null
/** 0-1 is in no group (it only shows on the ladder). */
export function groupOf(balls: number, strikes: number): CountGroup | null {
  if (strikes === 2) return 'two_strike'
  if ((balls === 0 && strikes === 0) || (balls === 1 && strikes === 1)) return 'even'
  if (balls > strikes && strikes < 2) return 'hitters'
  return null
}
/** Batter's frame: plate_x is flipped for left-handed batters so column 0 is always "wide inside". */
export function cellOf(plateX: number, plateZ: number, stand: Hand, szTop: number | null, szBot: number | null): { r: number; c: number } {
  const xIn = stand === 'R' ? plateX : -plateX
  const u = (xIn + HALF) / (2 * HALF / 3)
  const c = u < 0 ? 0 : u >= 3 ? 4 : 1 + Math.floor(u)
  const top = (szTop ?? 3.5) + PAD, bot = (szBot ?? 1.5) - PAD
  const v = (plateZ - bot) / (top - bot) * 3
  const r = v < 0 ? 4 : v >= 3 ? 0 : 3 - Math.floor(v)
  return { r, c }
}

export type PitchIn = {
  balls: number | null; strikes: number | null; pitchType: string; description: string | null
  plateX: number; plateZ: number; stand: Hand | null; szTop: number | null; szBot: number | null; pitcherThrows: Hand | null
}
/** null = not a decision pitch (bunt, HBP, pitchout, unknown type or side) or not in one of the three count groups. */
export function classifyPitch(p: PitchIn): { group: CountGroup; family: Family; hand: Hand; r: number; c: number; swing: boolean } | null {
  if (p.balls == null || p.strikes == null || !p.stand || !p.pitcherThrows || !p.description) return null
  const swing = SWING.has(p.description)
  if (!swing && !TAKE.has(p.description)) return null
  const family = familyOf(p.pitchType), group = groupOf(p.balls, p.strikes)
  if (!family || !group) return null
  const { r, c } = cellOf(p.plateX, p.plateZ, p.stand, p.szTop, p.szBot)
  return { group, family, hand: p.pitcherThrows, r, c, swing }
}

// ---------- league page (/mlb/swing-decisions) ----------

/** One qualified hitter on the leaderboard; the numbers are computed by the builder (see migration 20261020230000). */
export type LeaderRow = {
  batter_id: number; name: string; team: string | null; n_pitches: number
  selection: number | null; aggression: number | null; decision_runs_per100: number | null
}
export type SwingLeaders = { season: LeaderRow[]; l30: LeaderRow[] }

/** League-wide Selection and Aggression from the league table itself: the share of swing-losing pitches taken and of
 *  hittable pitches swung at, over every pitch the league saw. Also the in-zone and out-of-zone swing rates. */
export function leagueOverall(league: LeagueCell[]) {
  let jn = 0, js = 0, hn = 0, hs = 0, zn = 0, zs = 0, on = 0, os = 0
  for (const x of league) {
    const sw = x.n * x.swing_rate
    const gap = x.rv_swing_mean != null && x.rv_take_mean != null ? x.rv_swing_mean - x.rv_take_mean : null
    if (gap != null) { if (gap < 0) { jn += x.n; js += sw } else { hn += x.n; hs += sw } }
    if (inZone(x.zone_r, x.zone_c)) { zn += x.n; zs += sw } else { on += x.n; os += sw }
  }
  return {
    selection: jn ? 1 - js / jn : null, aggression: hn ? hs / hn : null,
    zoneSwing: zn ? zs / zn : null, outSwing: on ? os / on : null,
  }
}

export type WorthCell = { r: number; c: number; n: number; swingRate: number | null; gap: number | null }
/** What a swing is worth over a take, per 100 pitches, in each cell: the league's swing run result minus its take run
 *  result, pooled over pitcher hands (swings weighted by swings, takes by takes). */
export function leagueWorth(league: LeagueCell[], count: CountGroup, family: Family): WorthCell[] {
  const out: WorthCell[] = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    let n = 0, ns = 0, nt = 0, rs = 0, rt = 0
    for (const x of league) {
      if (x.count_group !== count || x.family !== family || x.zone_r !== r || x.zone_c !== c) continue
      const s = x.n * x.swing_rate, t = x.n - s
      n += x.n; ns += s; nt += t
      if (x.rv_swing_mean != null) rs += s * x.rv_swing_mean
      if (x.rv_take_mean != null) rt += t * x.rv_take_mean
    }
    out.push({ r, c, n, swingRate: n ? ns / n : null, gap: ns > 0 && nt > 0 ? (rs / ns - rt / nt) * 100 : null })
  }
  return out
}
