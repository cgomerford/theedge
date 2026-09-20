// src/lib/player-trends/rolling.ts
//
// Pure math + types for the Pro "Statcast trends" tab. NO server imports — the
// client charts import this too, so rolling windows and the toggles (window
// size, vs LHP/RHP, day/night) recompute instantly in the browser from the
// compact rows the server sends.
//
// Idea (same as the Pro postgame dials, src/lib/postgame/hittercheck.ts and
// pitchercheck.ts): trajectory versus SELF — recent form against his own
// baseline — not a matchup lab. Every threshold that decides a label lives in
// TREND below, in one place, marked as a proposal to tune.
//
// Sample rules: a rolling point needs a full window; a rate needs a minimum
// denominator or it is null (a gap in the line), never a guess.

export const HARD = 95            // mph — Statcast hard-hit line
export const BB_WEIGHT = 0.69     // wOBA weight for a non-intentional walk (standard scale)
export const HBP_WEIGHT = 0.72

// ── types (compact on purpose: sent from server to client as JSON) ────────────

export type PaRow = {
  n: number; d: string; pk: number
  h: 'L' | 'R' | null            // hand of the pitcher faced
  dn: 'day' | 'night' | null     // game session, when the schedule knows the game
  ev: string | null              // PA-ending event
  sw: number; wh: number; oz: number; ozs: number    // swings, whiffs, pitches outside the zone, swings at them
  x: number | null               // xwOBA contribution; null = excluded from the denominator
  ab: 0 | 1; hit: 0 | 1
  bbe: { s: number | null; b: 0 | 1 } | null          // exit speed, barrel flag
}

export type BbePoint = { d: string; pk: number; x: number | null; y: number | null; st: 'L' | 'R' | null; h: 'L' | 'R' | null; s: number | null; a: number | null }

export type BatterTrendsData = {
  playerId: number; season: number
  pa: PaRow[]
  bbe: BbePoint[] | null           // this season's balls in play (Savant), for spray + EV
  bbePrev: BbePoint[] | null       // last season's, for the EV overlay
  prevSeason: number
  dayNightKnown: number            // PAs whose game session is known
  handKnown: number                // PAs whose pitcher hand is known
}

export type PitTypeGame = { n: number; velo: number | null; sw: number; wh: number }
export type PitGame = {
  pk: number; d: string; n: number
  types: Record<string, PitTypeGame>
  zin: number; zn: number        // pitches in the zone / pitches with a zone code
  oz: number; ozs: number        // pitches outside the zone / swings at them (chase induced)
  bbe: number; hh: number; brl: number   // balls in play with a tracked exit speed, of which 95+ / barrels
  paN: number; xwSum: number     // PAs with an xwOBA-against value, and their summed value
  ip: number | null; er: number | null; bb: number | null; so: number | null; hr: number | null; hbp: number | null; gs: number | null
}
export type PitcherTrendsData = { playerId: number; season: number; games: PitGame[]; cFIP: number }

// ── thresholds — PROPOSALS, tune here ─────────────────────────────────────────
export const TREND = {
  // Hitter dial: last RECENT PAs vs the BASE PAs before them (same idea as "tonight vs his last 15" in the postgame check)
  RECENT: 30, BASE: 60, MIN_TOTAL: 90,
  EV: 1.5, HH: 10, XW: 0.04, WHIFF: 5, CHASE: 5,        // how far recent must sit from base to count as up / down (mph, pts, wOBA, pts, pts)
  HOT: 0.03,                                             // base already this far above his season xwOBA = "running hot"
  LUCK: 0.04,                                            // xwOBA − BA gap that earns the results-vs-contact flag
  MIN_BBE: 8, MIN_XW_PA: 20, MIN_SWINGS: 25, MIN_OZ: 30,
  // Pitcher dial
  P_VELO_DROP: 1.5, P_VELO_MIN: 20, P_RECENT_GAMES: 3, P_VELO_GAMES: 2,
  P_WHIFF_RATIO: 0.5, P_WHIFF_MIN_SWINGS: 12, P_SEASON_WHIFF: 20, P_MIN_USAGE: 10,
  P_HH_SPIKE: 10, P_MIN_BBE: 15,
} as const

// ── generic ────────────────────────────────────────────────────────────────────
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null)
const pct = (n: number, d: number, minD: number) => (d >= minD ? (n / d) * 100 : null)

/** Trailing window of `win` rows ending at each row; null until the window is full. */
export function trailing<T>(rows: T[], win: number, f: (slice: T[]) => number | null): (number | null)[] {
  return rows.map((_, i) => (i + 1 < win ? null : f(rows.slice(i - win + 1, i + 1))))
}

// ── hitter metrics over a slice of PAs ─────────────────────────────────────────
const tracked = (s: PaRow[]) => s.flatMap(r => (r.bbe && r.bbe.s != null ? [r.bbe] : []))

export const H = {
  xwoba: (s: PaRow[]): number | null => {
    const v = s.filter(r => r.x != null)
    return v.length >= Math.max(5, Math.ceil(s.length * 0.6)) ? sum(v.map(r => r.x as number)) / v.length : null
  },
  hardHit: (s: PaRow[]): number | null => { const b = tracked(s); return pct(b.filter(x => (x.s as number) >= HARD).length, b.length, TREND.MIN_BBE > 5 ? 5 : TREND.MIN_BBE) },
  barrel: (s: PaRow[]): number | null => { const b = tracked(s); return pct(b.filter(x => x.b === 1).length, b.length, 5) },
  avgEv: (s: PaRow[]): number | null => mean(tracked(s).map(x => x.s as number)),
  whiff: (s: PaRow[]): number | null => pct(sum(s.map(r => r.wh)), sum(s.map(r => r.sw)), 15),
  chase: (s: PaRow[]): number | null => pct(sum(s.map(r => r.ozs)), sum(s.map(r => r.oz)), 15),
  bb: (s: PaRow[]): number | null => pct(s.filter(r => r.ev === 'walk' || r.ev === 'intent_walk').length, s.length, 1),
  k: (s: PaRow[]): number | null => pct(s.filter(r => r.ev === 'strikeout' || r.ev === 'strikeout_double_play').length, s.length, 1),
  ba: (s: PaRow[]): number | null => { const ab = sum(s.map(r => r.ab)); return ab >= 10 ? sum(s.map(r => r.hit)) / ab : null },
}

export type HitterFilter = 'all' | 'L' | 'R' | 'day' | 'night'
export function filterPa(rows: PaRow[], f: HitterFilter): PaRow[] {
  if (f === 'all') return rows
  if (f === 'L' || f === 'R') return rows.filter(r => r.h === f)
  return rows.filter(r => r.dn === f)
}

// ── spray: pull / center / oppo thirds over a trailing window of balls in play ─
// Same thirds as lib/batter-spray.ts (25 units either side of the plate line, hc_x ≈ 125).
const PULL_MARGIN = 25
export function sprayZone(p: BbePoint): 'pull' | 'center' | 'oppo' | null {
  if (p.x == null || p.st == null) return null
  const d = p.st === 'R' ? 125 - p.x : p.x - 125       // + = toward the pull side
  return d > PULL_MARGIN ? 'pull' : d < -PULL_MARGIN ? 'oppo' : 'center'
}

// ── hitter dial ────────────────────────────────────────────────────────────────
export type FactorState = 'up' | 'down' | 'flat' | 'na'
export type DialFactor = { key: string; label: string; recent: number | null; base: number | null; season: number | null; state: FactorState; unit: string; why: string }
export type HitterDial =
  | { kind: 'nodata'; reason: string }
  | {
      kind: 'read'; verdict: 'Staying hot' | 'Turning a corner' | 'Steady' | 'Cooling' | 'Dropping off'; tone: 'up' | 'down' | 'flat'
      up: number; down: number; counted: number; factors: DialFactor[]
      gap: { xw: number; ba: number; diff: number; kind: 'behind' | 'ahead' | 'even' } | null
      hhDelta: number | null; recentPa: number
    }

export function hitterDial(rows: PaRow[]): HitterDial {
  const T = TREND
  if (rows.length < T.MIN_TOTAL) return { kind: 'nodata', reason: `Needs ${T.MIN_TOTAL}+ plate appearances; ${rows.length} so far` }
  const recent = rows.slice(-T.RECENT), base = rows.slice(-(T.RECENT + T.BASE), -T.RECENT)
  const judge = (r: number | null, b: number | null, thr: number, higherBetter: boolean, ok: boolean): FactorState => {
    if (!ok || r == null || b == null) return 'na'
    const d = (r - b) * (higherBetter ? 1 : -1)
    return d >= thr ? 'up' : d <= -thr ? 'down' : 'flat'
  }
  const bbeOk = tracked(recent).length >= T.MIN_BBE && tracked(base).length >= T.MIN_BBE
  const xwOk = recent.filter(r => r.x != null).length >= T.MIN_XW_PA && base.filter(r => r.x != null).length >= T.MIN_XW_PA
  const swOk = sum(recent.map(r => r.sw)) >= T.MIN_SWINGS && sum(base.map(r => r.sw)) >= T.MIN_SWINGS
  const ozOk = sum(recent.map(r => r.oz)) >= T.MIN_OZ && sum(base.map(r => r.oz)) >= T.MIN_OZ
  const f = (key: string, label: string, fn: (s: PaRow[]) => number | null, thr: number, hb: boolean, ok: boolean, unit: string, why: string): DialFactor => {
    const r = fn(recent), b = fn(base)
    return { key, label, recent: r, base: b, season: fn(rows), state: judge(r, b, thr, hb, ok), unit, why }
  }
  const factors: DialFactor[] = [
    f('ev', 'Exit velo', H.avgEv, T.EV, true, bbeOk, ' mph', `Average exit velocity on balls in play. Up/down = ${T.EV}+ mph different from his prior ${T.BASE} PA.`),
    f('hh', 'Hard-hit %', H.hardHit, T.HH, true, bbeOk, '%', `Share of balls in play 95+ mph. Up/down = ${T.HH}+ points different.`),
    f('xw', 'xwOBA', H.xwoba, T.XW, true, xwOk, '', `What his plate appearances were worth from contact quality, walks and strikeouts. Up/down = ${T.XW.toFixed(3).replace(/^0/, '')}+ different.`),
    f('wh', 'Whiff %', H.whiff, T.WHIFF, false, swOk, '%', `Share of swings that missed; fewer misses reads as up. ${T.WHIFF}+ points different.`),
    f('ch', 'Chase %', H.chase, T.CHASE, false, ozOk, '%', `Share of pitches outside the zone he swung at; fewer chases reads as up. ${T.CHASE}+ points different.`),
  ]
  const counted = factors.filter(x => x.state !== 'na').length
  if (counted < 3) return { kind: 'nodata', reason: 'Not enough tracked balls, swings and chases in the recent windows to judge' }
  const up = factors.filter(x => x.state === 'up').length, down = factors.filter(x => x.state === 'down').length
  const bx = H.xwoba(base), sx = H.xwoba(rows)
  const hot = bx != null && sx != null && bx - sx >= T.HOT
  const net = up - down
  const verdict = net >= 2 ? (hot ? 'Staying hot' : 'Turning a corner') : net <= -2 ? (hot ? 'Cooling' : 'Dropping off') : 'Steady'
  const rx = H.xwoba(recent), rba = H.ba(recent)
  const gap = rx != null && rba != null ? { xw: rx, ba: rba, diff: rx - rba, kind: (rx - rba >= T.LUCK ? 'behind' : rx - rba <= -T.LUCK ? 'ahead' : 'even') as 'behind' | 'ahead' | 'even' } : null
  const rh = H.hardHit(recent), sh = H.hardHit(rows)
  return { kind: 'read', verdict, tone: net >= 2 ? 'up' : net <= -2 ? 'down' : 'flat', up, down, counted, factors, gap, hhDelta: rh != null && sh != null ? rh - sh : null, recentPa: recent.length }
}

// ── pitcher metrics over a slice of games ──────────────────────────────────────
const FB = ['FF', 'SI', 'FC']
export function typeTotals(games: PitGame[]): Record<string, { n: number; veloW: number; veloN: number; sw: number; wh: number }> {
  const out: Record<string, { n: number; veloW: number; veloN: number; sw: number; wh: number }> = {}
  for (const g of games) for (const [t, v] of Object.entries(g.types)) {
    const o = (out[t] ??= { n: 0, veloW: 0, veloN: 0, sw: 0, wh: 0 })
    o.n += v.n; o.sw += v.sw; o.wh += v.wh
    if (v.velo != null) { o.veloW += v.velo * v.n; o.veloN += v.n }
  }
  return out
}
export const P = {
  hardHit: (g: PitGame[]) => pct(sum(g.map(x => x.hh)), sum(g.map(x => x.bbe)), 8),
  barrel: (g: PitGame[]) => pct(sum(g.map(x => x.brl)), sum(g.map(x => x.bbe)), 8),
  zone: (g: PitGame[]) => pct(sum(g.map(x => x.zin)), sum(g.map(x => x.zn)), 30),
  chase: (g: PitGame[]) => pct(sum(g.map(x => x.ozs)), sum(g.map(x => x.oz)), 20),
  xwobaAgainst: (g: PitGame[]) => (sum(g.map(x => x.paN)) >= 15 ? sum(g.map(x => x.xwSum)) / sum(g.map(x => x.paN)) : null),
  era: (g: PitGame[]) => { const ip = sum(g.map(x => x.ip ?? 0)); return ip >= 5 && g.every(x => x.er != null) ? (sum(g.map(x => x.er ?? 0)) * 9) / ip : null },
  fip: (g: PitGame[], cFIP: number) => {
    const ip = sum(g.map(x => x.ip ?? 0))
    if (ip < 5 || !g.every(x => x.hr != null)) return null
    return (13 * sum(g.map(x => x.hr ?? 0)) + 3 * (sum(g.map(x => x.bb ?? 0)) + sum(g.map(x => x.hbp ?? 0))) - 2 * sum(g.map(x => x.so ?? 0))) / ip + cFIP
  },
}

// ── pitcher dial ───────────────────────────────────────────────────────────────
export type ConcernCheck = { key: 'velo' | 'putaway' | 'hardhit'; label: string; state: 'flag' | 'ok' | 'na'; recent: number | null; season: number | null; unit: string; note: string }
export type PitcherDial =
  | { kind: 'nodata'; reason: string }
  | { kind: 'read'; label: 'Steady' | 'Watch' | 'Concerning'; flags: number; evaluated: number; checks: ConcernCheck[]; primaryFb: string | null; putAway: string | null }

export function pitcherDial(games: PitGame[]): PitcherDial {
  const T = TREND
  if (games.length < 5) return { kind: 'nodata', reason: `Needs 5+ outings; ${games.length} so far` }
  const season = typeTotals(games)

  // 1. primary fastball velocity, last 2 outings vs season
  const fbs = FB.filter(t => season[t]?.veloN).sort((a, b) => season[b].n - season[a].n)
  const pfb = fbs[0] ?? null
  let velo: ConcernCheck
  if (!pfb) velo = { key: 'velo', label: 'Fastball velocity', state: 'na', recent: null, season: null, unit: 'mph', note: 'No tracked fastball velocity' }
  else {
    const rec = typeTotals(games.slice(-T.P_VELO_GAMES))[pfb]
    const sv = season[pfb].veloW / season[pfb].veloN
    if (!rec || rec.veloN < T.P_VELO_MIN) velo = { key: 'velo', label: `${pfb} velocity`, state: 'na', recent: null, season: sv, unit: 'mph', note: `Needs ${T.P_VELO_MIN}+ tracked ${pfb} in the last ${T.P_VELO_GAMES} outings` }
    else {
      const rv = rec.veloW / rec.veloN
      velo = { key: 'velo', label: `${pfb} velocity`, state: sv - rv >= T.P_VELO_DROP ? 'flag' : 'ok', recent: rv, season: sv, unit: 'mph', note: `Flag when the last ${T.P_VELO_GAMES} outings average ${T.P_VELO_DROP}+ mph below his season` }
    }
  }

  // 2. whiff on his put-away pitch (best whiff pitch he throws often), last 3 vs season
  const total = Object.values(season).reduce((a, x) => a + x.n, 0)
  const cands = Object.entries(season)
    .filter(([, v]) => total > 0 && (v.n / total) * 100 >= T.P_MIN_USAGE && v.sw >= 40 && (v.wh / v.sw) * 100 >= T.P_SEASON_WHIFF)
    .sort((a, b) => b[1].wh / b[1].sw - a[1].wh / a[1].sw)
  const put = cands[0]?.[0] ?? null
  let putaway: ConcernCheck
  if (!put) putaway = { key: 'putaway', label: 'Put-away pitch whiff', state: 'na', recent: null, season: null, unit: '%', note: `No pitch thrown ${T.P_MIN_USAGE}%+ with a ${T.P_SEASON_WHIFF}%+ whiff rate` }
  else {
    const sw = (season[put].wh / season[put].sw) * 100
    const rec = typeTotals(games.slice(-T.P_RECENT_GAMES))[put]
    if (!rec || rec.sw < T.P_WHIFF_MIN_SWINGS) putaway = { key: 'putaway', label: `${put} whiff %`, state: 'na', recent: null, season: sw, unit: '%', note: `Needs ${T.P_WHIFF_MIN_SWINGS}+ swings at it in the last ${T.P_RECENT_GAMES} outings` }
    else {
      const rw = (rec.wh / rec.sw) * 100
      putaway = { key: 'putaway', label: `${put} whiff %`, state: rw <= sw * T.P_WHIFF_RATIO ? 'flag' : 'ok', recent: rw, season: sw, unit: '%', note: `Flag when it whiffs at half its season rate or less` }
    }
  }

  // 3. hard-hit spike, last 3 vs season
  const rg = games.slice(-T.P_RECENT_GAMES)
  const rbbe = rg.reduce((a, g) => a + g.bbe, 0)
  const sh = P.hardHit(games), rh = P.hardHit(rg)
  const hardhit: ConcernCheck = rbbe < T.P_MIN_BBE || sh == null || rh == null
    ? { key: 'hardhit', label: 'Hard-hit % against', state: 'na', recent: null, season: sh, unit: '%', note: `Needs ${T.P_MIN_BBE}+ tracked balls in play in the last ${T.P_RECENT_GAMES} outings` }
    : { key: 'hardhit', label: 'Hard-hit % against', state: rh - sh >= T.P_HH_SPIKE ? 'flag' : 'ok', recent: rh, season: sh, unit: '%', note: `Flag when the last ${T.P_RECENT_GAMES} outings run ${T.P_HH_SPIKE}+ points above his season` }

  const checks = [velo, putaway, hardhit]
  const evaluated = checks.filter(c => c.state !== 'na').length
  if (evaluated === 0) return { kind: 'nodata', reason: 'Not enough recent tracked pitches to judge' }
  const flags = checks.filter(c => c.state === 'flag').length
  return { kind: 'read', label: flags === 0 ? 'Steady' : flags === 1 ? 'Watch' : 'Concerning', flags, evaluated, checks, primaryFb: pfb, putAway: put }
}
