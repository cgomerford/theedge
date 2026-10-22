// src/components/platoon-lab/demo.ts
//
// DEMO DATA for the Platoon Lab mockup (/dev/platoon-mockup). Nothing here is real. The rows are shaped exactly like batter_platoon_process, so the mockup runs through the same
// components and the same model (src/lib/platoon/model.ts) as the live pages. The thresholds and sample numbers come from the model; the demo only supplies hitters.

import { CP, DEF, type Hand, type MetricKey, type PlatoonHitter, type PlatoonRow } from '@/lib/platoon/model'
import type { LeagueDot } from './PlatoonView'

type Spec = { metric: MetricKey; hand: Hand; n: number; mean: number; sd?: number }
function mkRows(batterId: number, side: Hand, specs: Spec[]): PlatoonRow[] {
  return specs.map(s => {
    const rate = DEF[s.metric]?.kind === 'rate'   // contact_x is a hidden metric (the contact-point map only), so it has no registry entry
    const sd = rate ? Math.sqrt(s.mean * (1 - s.mean)) : s.sd ?? 1
    return {
      batter_id: batterId, season: 2026, coord_era: '2026', bat_side: side, p_throws: s.hand, metric: s.metric, n: s.n,
      value_sum: +(s.n * s.mean).toFixed(3), value_sq_sum: rate ? +(s.n * s.mean).toFixed(3) : +(s.n * (sd * sd + s.mean * s.mean)).toFixed(3),
    }
  })
}
const SD: Partial<Record<MetricKey, number>> = { bat_speed: 7.5, swing_tilt: 8, contact_depth: 7, attack_direction: 8, contact_x: 5, xwoba: 0.42, woba: 0.46 }
/** one metric on both hands: [nL, meanL, nR, meanR] */
const both = (metric: MetricKey, nL: number, mL: number, nR: number, mR: number): Spec[] => [
  { metric, hand: 'L', n: nL, mean: mL, sd: SD[metric] }, { metric, hand: 'R', n: nR, mean: mR, sd: SD[metric] },
]
/** spray counts [pull, straight, oppo] for ground balls and air balls on one hand, as the six spray rows */
function sprayRows(batterId: number, side: Hand, hand: Hand, gb: [number, number, number], air: [number, number, number]): PlatoonRow[] {
  const n = gb.reduce((a, b) => a + b, 0) + air.reduce((a, b) => a + b, 0)
  const keys = ['pull', 'straight', 'oppo']
  const mk = (typ: string, i: number, c: number): PlatoonRow => ({ batter_id: batterId, season: 2026, coord_era: '2026', bat_side: side, p_throws: hand, metric: `spray_${typ}_${keys[i]}`, n, value_sum: c, value_sq_sum: c })
  return n ? [...gb.map((c, i) => mk('gb', i, c)), ...air.map((c, i) => mk('air', i, c))] : []
}

export type DemoMeta = { id: 'A' | 'B' | 'C' | 'D'; tag: string }
export const DEMO_META: DemoMeta[] = [
  { id: 'A', tag: 'lefties look the same' }, { id: 'B', tag: 'the split shows in the swing' }, { id: 'C', tag: 'switch hitter' }, { id: 'D', tag: 'small sample' },
]
const A = [
  ...mkRows(900001, 'R', [
    ...both('bat_speed', 88, 71.8, 301, 72.1), ...both('swing_tilt', 88, 29.5, 301, 29.9), ...both('contact_depth', 88, 37.2, 301, 37.6), ...both('contact_x', 88, 38.0, 301, 38.4),
    ...both('attack_direction', 88, -5.1, 301, -5.4), ...both('chase', 210, 0.27, 720, 0.26), ...both('zone_contact', 66, 0.86, 190, 0.85), ...both('squared_up', 52, 0.3, 160, 0.31),
    ...both('k_pct', 74, 0.22, 480, 0.21), ...both('bb_pct', 74, 0.08, 480, 0.09), ...both('xwoba', 74, 0.31, 480, 0.325), ...both('woba', 74, 0.24, 480, 0.335),
  ]),
  ...sprayRows(900001, 'R', 'L', [25, 8, 5], [9, 27, 16]), ...sprayRows(900001, 'R', 'R', [75, 24, 17], [33, 55, 52]),
]
const B = [
  ...mkRows(900002, 'L', [
    ...both('bat_speed', 140, 69.5, 520, 72.0), ...both('swing_tilt', 140, 27.1, 520, 30.4), ...both('contact_depth', 140, 34.0, 520, 37.5), ...both('contact_x', 140, 35.5, 520, 38.9),
    ...both('attack_direction', 140, -2.8, 520, -6.0), ...both('chase', 330, 0.36, 1100, 0.28), ...both('zone_contact', 100, 0.79, 330, 0.87), ...both('squared_up', 84, 0.24, 290, 0.31),
    ...both('k_pct', 150, 0.29, 560, 0.21), ...both('bb_pct', 150, 0.07, 560, 0.1), ...both('xwoba', 150, 0.27, 560, 0.34), ...both('woba', 150, 0.275, 560, 0.355),
  ]),
  ...sprayRows(900002, 'L', 'L', [28, 22, 34], [8, 33, 43]), ...sprayRows(900002, 'L', 'R', [108, 52, 40], [55, 120, 115]),
]
// the switch hitter: batting left he mostly faces right-handers, batting right he mostly faces left-handers; a side's off-hand rows are tiny
const C_L = [
  ...mkRows(900003, 'L', [
    ...both('bat_speed', 6, 70.9, 380, 71.5), ...both('swing_tilt', 6, 31.0, 380, 31.2), ...both('contact_depth', 6, 36.1, 380, 36.8), ...both('contact_x', 6, 37.0, 380, 37.9),
    ...both('attack_direction', 6, -6.0, 380, -5.4), ...both('chase', 14, 0.3, 880, 0.29), ...both('zone_contact', 5, 0.8, 270, 0.84), ...both('squared_up', 3, 0.33, 210, 0.28),
    ...both('k_pct', 4, 0.25, 360, 0.2), ...both('bb_pct', 4, 0.0, 360, 0.11), ...both('xwoba', 4, 0.3, 360, 0.335), ...both('woba', 4, 0.0, 360, 0.33),
  ]),
  ...sprayRows(900003, 'L', 'L', [1, 0, 1], [0, 1, 2]), ...sprayRows(900003, 'L', 'R', [80, 40, 38], [42, 92, 76]),
]
const C_R = [
  ...mkRows(900003, 'R', [
    ...both('bat_speed', 210, 72.4, 11, 72.0), ...both('swing_tilt', 210, 30.1, 11, 30.0), ...both('contact_depth', 210, 37.9, 11, 37.0), ...both('contact_x', 210, 38.6, 11, 38.0),
    ...both('attack_direction', 210, -4.7, 11, -5.0), ...both('chase', 490, 0.27, 24, 0.3), ...both('zone_contact', 150, 0.86, 8, 0.88), ...both('squared_up', 120, 0.33, 6, 0.3),
    ...both('k_pct', 190, 0.19, 8, 0.25), ...both('bb_pct', 190, 0.1, 8, 0.12), ...both('xwoba', 190, 0.345, 8, 0.3), ...both('woba', 190, 0.36, 8, 0.31),
  ]),
  ...sprayRows(900003, 'R', 'L', [45, 24, 18], [48, 40, 32]), ...sprayRows(900003, 'R', 'R', [2, 1, 0], [1, 2, 3]),
]
const D = [
  ...mkRows(900004, 'R', [
    ...both('bat_speed', 18, 70.2, 64, 71.0), ...both('swing_tilt', 18, 28.0, 64, 29.0), ...both('contact_depth', 18, 36.0, 64, 37.0), ...both('contact_x', 18, 37.0, 64, 38.0),
    ...both('attack_direction', 18, -4.0, 64, -5.0), ...both('chase', 52, 0.31, 190, 0.29), ...both('zone_contact', 14, 0.8, 52, 0.84), ...both('squared_up', 10, 0.2, 38, 0.3),
    ...both('k_pct', 21, 0.3, 80, 0.24), ...both('bb_pct', 21, 0.05, 80, 0.08), ...both('xwoba', 21, 0.28, 80, 0.31), ...both('woba', 21, 0.26, 80, 0.3),
  ]),
  ...sprayRows(900004, 'R', 'L', [4, 2, 1], [3, 4, 3]), ...sprayRows(900004, 'R', 'R', [14, 8, 6], [12, 14, 12]),
]
const league = (side: Hand): PlatoonRow[] => [
  ...(['L', 'R'] as Hand[]).flatMap(hand => sprayRows(0, side, hand, [260, 84, 76], [174, 220, 186])),
  ...mkRows(0, side, [{ metric: 'woba', hand: 'L', n: 30000, mean: 0.318, sd: 0.46 }, { metric: 'woba', hand: 'R', n: 60000, mean: 0.322, sd: 0.46 }]),
]
/** demo contact-point cells: a Gaussian around each side-hand's mean (sd 4 in across, 6 in deep), rounded to whole swings so the server and browser draw the same thing */
function cpRows(rows: PlatoonRow[]): PlatoonRow[] {
  const out: PlatoonRow[] = []
  for (const side of ['L', 'R'] as Hand[]) for (const hand of ['L', 'R'] as Hand[]) {
    const mx = rows.find(r => r.bat_side === side && r.p_throws === hand && r.metric === 'contact_x'), my = rows.find(r => r.bat_side === side && r.p_throws === hand && r.metric === 'contact_depth')
    if (!mx || !my) continue
    const cx = mx.value_sum / mx.n, cy = my.value_sum / my.n
    const w: number[] = []; let tot = 0
    for (let by = 0; by < CP.ny; by++) for (let bx = 0; bx < CP.nx; bx++) { const dx = CP.x0 + (bx + 0.5) * CP.step - cx, dy = CP.y0 + (by + 0.5) * CP.step - cy; const v = Math.round(Math.exp(-(dx * dx) / 32 - (dy * dy) / 72) * 1e4) / 1e4; w.push(v); tot += v }
    w.forEach((v, i) => { const c = Math.round((v / tot) * my.n); if (c > 0) out.push({ batter_id: my.batter_id, season: 2026, coord_era: '2026', bat_side: side, p_throws: hand, metric: `cp_${i % CP.nx}_${Math.floor(i / CP.nx)}`, n: c, value_sum: c, value_sq_sum: c }) })
  }
  return out
}
const mk = (id: number, name: string, bats: 'L' | 'R' | 'S', rows0: PlatoonRow[]): PlatoonHitter => { const rows = [...rows0, ...cpRows(rows0)]; return {
  batterId: id, name, team: null, bats, season: 2026, coordEra: '2026',
  bySide: { L: rows.filter(r => r.bat_side === 'L'), R: rows.filter(r => r.bat_side === 'R') }, league: { L: league('L'), R: league('R') },
} }
export const DEMO_HITTERS: PlatoonHitter[] = [mk(900001, 'Hitter A', 'R', A), mk(900002, 'Hitter B', 'L', B), mk(900003, 'Hitter C', 'S', [...C_L, ...C_R]), mk(900004, 'Hitter D', 'R', D)]

// ---------- league demo ----------
function rngOf(seed: number) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const gauss = (r: () => number) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
export function leagueDemo(pooled: boolean): LeagueDot[] {
  const r = rngOf(pooled ? 77 : 78), out: LeagueDot[] = []
  const q = (v: number, d: number) => Math.round(v * d) / d   // rounded: Math.log / Math.cos can differ in the last digit between Node and the browser (hydration)
  for (let i = 0; i < 150; i++) {
    const z = gauss(r), paL = Math.round(pooled ? 150 + r() * 1050 : 60 + r() * 200)
    const wobaGap = q((0.4 * z + gauss(r) * 0.9) * (pooled ? 0.035 : 0.05), 10000), batGap = q(z * 1.1 + gauss(r) * 0.6, 1000)
    // demo groups only (the live page sorts hitters with the real call and usage in src/lib/platoon/data.ts): a stand-in rule on the dot's own numbers
    const yes = Math.abs(wobaGap) >= 0.04 && Math.abs(batGap) >= 1 && Math.sign(wobaGap) === Math.sign(batGap)
    const sheltered = i % 3 === 0
    const bucket = !pooled ? (yes && i % 7 === 0 ? 'notworth' : yes && !sheltered ? 'should' : !yes && sheltered ? 'everyday' : undefined) : undefined
    const note = bucket === 'should' ? 'demo: faces his weaker hand in 28% of his PA (league 27%)' : bucket === 'everyday' ? 'demo: faces LHP in 11% of his PA (league 27%)' : bucket === 'notworth' ? 'demo: still above the league’s wOBA against his weaker hand' : undefined
    out.push({ batterId: 0, name: `Hitter ${String(i + 1).padStart(3, '0')}`, paL, wobaGap, batGap, chaseGap: q((0.3 * z + gauss(r) * 0.8) * 0.045, 10000), ...(bucket ? { bucket, note } : {}) })
  }
  return out
}
