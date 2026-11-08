// src/lib/milb-shape/aggregate.ts
//
// Turns de-duplicated, league-verified Savant minor-league pitch rows into the three tables the Pitch Shape Lab reads, using EXACTLY the definitions of the MLB builders
// (scripts/build_pitch_shape_bins.py, build_pitch_shape_cells.py, build_pitch_shape_pitcher.py). Only the table and the `level` column differ.
//
//   bins     velocity (1 mph) x induced vertical break (2 in) x horizontal break (2 in) x arm-angle band (10 degrees), with swing / whiff / called-strike / contact counts.
//            Pitches with no arm angle go to slot_bin = -1 (the MLB builder drops them); the readers leave -1 out of a four-axis read, and a cohort with no arm
//            angle at all is read on three axes and says so.
//   cells    0.1-inch cells on the ride x run map: [hb10, ivb10, pitches, swings, whiffs] flattened. Needs speed and movement only.
//   pitcher  one row per pitcher x pitch type x level x season (50+ pitches with an arm angle, as the MLB builder keeps): average shape, spread, results, a 60-pitch sample,
//            location and contact diagnostics, counts and batter-side splits.
//
// Everything is accumulated as rows arrive (no raw pitch is kept), so a full Triple-A season fits in memory. The 60-pitch sample is the 60 pitches with the smallest hash of
// their own identity, so it is random-looking but identical on every run, whatever order the rows arrive in.

import { fromCsv, halfUp, type CsvPitch } from './normalise'
import type { MilbLevel } from './levels'

export const PITCH_TYPES = new Set(['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'CH', 'FS', 'SV'])
export const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'])
export const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])
const BALLS = new Set(['ball', 'blocked_ball'])
const HIT_BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }
const AB_EVENTS = new Set([...Object.keys(HIT_BASES), 'field_out', 'strikeout', 'strikeout_double_play', 'double_play', 'grounded_into_double_play', 'force_out', 'fielders_choice', 'fielders_choice_out', 'field_error', 'triple_play', 'other_out'])
const RS = 12   // the summable fields per pitch below
export const MIN_PITCHES = 50
export const N_POINTS = 60
export const NO_SLOT = -1

export type BinRow = {
  level: MilbLevel; span: string; pitch_type: string; p_throws: string; velo_bin: number; ivb_bin: number; hb_bin: number; slot_bin: number
  n_pitches: number; n_swings: number; n_whiffs: number; n_called_strikes: number; n_csw: number; n_bbe: number; xwoba_con_sum: number; n_hard_hit: number; n_gb: number
}
export type CellsRow = { level: MilbLevel; span: string; pitch_type: string; p_throws: string; n_pitches: number; n_swings: number; n_whiffs: number; cells: number[] }
export type PitcherRow = {
  level: MilbLevel; season: number; pitcher_id: number; pitch_type: string; pitcher_name: string; team_abbr: string | null; p_throws: string; n_pitches: number
  velo: number; ivb: number; hb: number; slot: number; sd_hb: number; sd_ivb: number; n_swings: number; n_whiffs: number
  n_taken: number; n_gift: number; n_miss: number; n_loc: number; n_zone: number; n_heart: number; n_ooz: number; n_chase: number
  n_bbe: number; xwoba_con_sum: number; n_bbe_w: number; woba_con_sum: number
  points: { hb: number; ivb: number }[]
  counts: { label: string; swings: number; whiffs: number }[]
  batter_sides: { label: string; bbe: number; xwoba_sum: number }[]
}
/** League outcomes at 0.1 in on the movement map: FOURTEEN numbers per cell, exactly as pitch_shape_results (see results-math.ts): hb10, ivb10, pitches, swings, whiffs, rv_n, rv*1000, pa, ab, hits, tb, woba_den, woba_sum*1000, xwoba_sum*1000. */
export type ResultsCellsRow = { level: MilbLevel; span: string; pitch_type: string; p_throws: string; n_pitches: number; cells: number[] }
/** One pitcher's own outcomes on one pitch type (real units), as pitch_shape_results_pitcher. */
export type ResultsPitcherRow = {
  level: MilbLevel; season: number; pitcher_id: number; pitch_type: string; p_throws: string
  n_pitches: number; n_swings: number; n_whiffs: number; rv_n: number; rv: number; pa: number; ab: number; hits: number; tb: number; woba_den: number; woba_sum: number; xwoba_sum: number
}
export type CoverageRow = { level: MilbLevel; season: number; month: number; park: string; games: number; pitches: number; tracked: number }

/** Fields whose missing values are counted per level and season (the coverage report and the capability service read these). */
export const NULL_FIELDS = ['pitch_type', 'release_speed', 'pfx_x', 'pfx_z', 'arm_angle', 'release_extension', 'release_spin_rate', 'plate_x', 'plate_z', 'zone', 'delta_run_exp'] as const
export const BBE_FIELDS = ['estimated_woba_using_speedangle', 'launch_speed', 'bb_type'] as const

const present = (v: unknown) => v != null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
const n = (v: unknown): number | null => { if (!present(v)) return null; const x = Number(v); return Number.isFinite(x) ? x : null }

/** FNV-1a 32-bit, for the stable sample. */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}

export const cleanName = (s: unknown): string => {
  if (typeof s !== 'string') return ''
  const i = s.indexOf(', ')
  return i > 0 ? `${s.slice(i + 2)} ${s.slice(0, i)}` : s
}

const mode = (m: Map<string, number>): string | null => { let best: string | null = null, bn = -1; for (const [k, v] of m) if (v > bn || (v === bn && best != null && k < best)) { best = k; bn = v } return best }
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by)
const r = (x: number, d: number) => { const p = 10 ** d; return Math.round(x * p) / p }

type PitcherAcc = {
  names: Map<string, number>; teams: Map<string, number>; hands: Map<string, number>
  n: number; sHb: number; sHb2: number; sIvb: number; sIvb2: number; sVelo: number; sSlot: number
  swings: number; whiffs: number; taken: number; gift: number; miss: number; loc: number; zone: number; heart: number; ooz: number; chase: number
  bbe: number; xw: number; bbeW: number; wobaCon: number
  states: Record<string, { swings: number; whiffs: number }>; stands: Record<string, { bbe: number; xw: number }>
  sample: { h: number; hb: number; ivb: number }[]
}

export type Summary = {
  rows: number            // raw rows seen after de-duplication
  duplicates: number      // exact repeat rows dropped (Savant lists some balls in play twice)
  keyConflicts: number    // same (game_pk, at_bat_number, pitch_number) with different content: first kept
  usable: number          // pitches that reach the cells (standard type, tracked speed and movement)
  withSlot: number        // of those, pitches with an arm angle
  nulls: Record<string, number>
  bbe: number             // balls in play
  bbeNulls: Record<string, number>
  perType: Record<string, { pitches: number; withSlot: number }>
}

export class Aggregator {
  private seen = new Map<string, string>()
  private bins = new Map<string, BinRow>()
  private cells = new Map<string, { n: number; sw: number; wh: number; byCell: Map<string, [number, number, number, number, number]> }>()
  private pit = new Map<string, PitcherAcc & { id: number; type: string }>()
  /** results per pitch type and hand per 0.1 in cell, and per pitcher: [pitches, swings, whiffs, rv_n, rv, pa, ab, hits, tb, woba_den, woba_sum, xwoba_sum] */
  private resCells = new Map<string, Map<string, { hb10: number; ivb10: number; s: number[] }>>()
  private resPit = new Map<string, { id: number; type: string; hands: Map<string, number>; s: number[] }>()
  private cov = new Map<string, { month: number; park: string; games: Set<number>; pitches: number; tracked: number }>()
  readonly summary: Summary = { rows: 0, duplicates: 0, keyConflicts: 0, usable: 0, withSlot: 0, nulls: {}, bbe: 0, bbeNulls: {}, perType: {} }

  constructor(readonly level: MilbLevel, readonly season: number) {
    for (const f of NULL_FIELDS) this.summary.nulls[f] = 0
    for (const f of BBE_FIELDS) this.summary.bbeNulls[f] = 0
  }

  /** Add one verified row. Returns false when it was a duplicate. */
  add(row: CsvPitch): boolean {
    const key = `${row.game_pk}:${row.at_bat_number}:${row.pitch_number}`
    const fp = `${row.pitcher}|${row.pitch_type}|${row.release_speed}|${row.pfx_x}|${row.pfx_z}|${row.description}`
    const prior = this.seen.get(key)
    if (prior !== undefined) { if (prior === fp) this.summary.duplicates++; else this.summary.keyConflicts++; return false }
    this.seen.set(key, fp)
    const s = this.summary
    s.rows++
    for (const f of NULL_FIELDS) if (!present(row[f])) s.nulls[f]++
    const date = String(row.game_date ?? '')
    const month = Number(date.slice(5, 7)) || 0
    const park = String(row.home_team ?? '')
    const cv = this.cov.get(`${month}|${park}`) ?? { month, park, games: new Set<number>(), pitches: 0, tracked: 0 }
    cv.games.add(Number(row.game_pk)); cv.pitches++
    this.cov.set(`${month}|${park}`, cv)

    const desc = typeof row.description === 'string' ? row.description : ''
    const xw = n(row.estimated_woba_using_speedangle)
    const isBip = desc === 'hit_into_play'
    if (isBip) { s.bbe++; for (const f of BBE_FIELDS) if (!present(row[f])) s.bbeNulls[f]++ }

    const p = fromCsv(row)
    const t = String(row.pitch_type ?? '')
    if (!p || !PITCH_TYPES.has(t)) return true
    cv.tracked++
    s.usable++
    const pt = (s.perType[t] ??= { pitches: 0, withSlot: 0 })
    pt.pitches++
    if (p.slot != null) { s.withSlot++; pt.withSlot++ }

    const swing = SWING.has(desc) ? 1 : 0, whiff = WHIFF.has(desc) ? 1 : 0, called = desc === 'called_strike' ? 1 : 0
    const bbe = isBip && xw != null ? 1 : 0
    const hard = bbe && (n(row.launch_speed) ?? -1) >= 95 ? 1 : 0
    const gb = bbe && row.bb_type === 'ground_ball' ? 1 : 0
    const xwv = bbe ? (xw as number) : 0

    // cells (speed and movement only)
    const ck = `${p.pitchType}|${p.hand}`
    const cell = this.cells.get(ck) ?? { n: 0, sw: 0, wh: 0, byCell: new Map() }
    const h10 = halfUp(p.hb * 10), i10 = halfUp(p.ivb * 10)
    const cc = cell.byCell.get(`${h10},${i10}`) ?? [h10, i10, 0, 0, 0]
    cc[2]++; cc[3] += swing; cc[4] += whiff
    cell.byCell.set(`${h10},${i10}`, cc)
    cell.n++; cell.sw += swing; cell.wh += whiff
    this.cells.set(ck, cell)

    // results (the same sums the MLB results builder takes: run value, wOBA, xwOBA, average and slugging)
    const den = (n(row.woba_denom) ?? 0) > 0 ? (n(row.woba_denom) as number) : 0
    const woba = den > 0 ? n(row.woba_value) ?? 0 : 0
    const xwo = den > 0 ? (xw ?? n(row.woba_value) ?? 0) : 0
    const ev = typeof row.events === 'string' ? row.events : ''
    const rvv = n(row.delta_run_exp)
    const sums = [1, swing, whiff, rvv != null ? 1 : 0, rvv ?? 0, den > 0 ? 1 : 0, AB_EVENTS.has(ev) ? 1 : 0, ev in HIT_BASES ? 1 : 0, HIT_BASES[ev] ?? 0, den, woba, xwo]
    const rc = this.resCells.get(ck) ?? new Map(); this.resCells.set(ck, rc)
    const rk = `${h10},${i10}`
    const re = rc.get(rk) ?? { hb10: h10, ivb10: i10, s: new Array(RS).fill(0) }
    for (let i = 0; i < RS; i++) re.s[i] += sums[i]
    rc.set(rk, re)
    if (present(row.pitcher)) {
      const pk2 = `${Number(row.pitcher)}|${p.pitchType}`
      const rp = this.resPit.get(pk2) ?? { id: Number(row.pitcher), type: p.pitchType, hands: new Map(), s: new Array(RS).fill(0) }
      for (let i = 0; i < RS; i++) rp.s[i] += sums[i]
      bump(rp.hands, p.hand)
      this.resPit.set(pk2, rp)
    }

    // bins (slot -1 when no arm angle)
    const slotBin = p.slot == null ? NO_SLOT : Math.min(9, Math.max(0, Math.floor(p.slot / 10)))
    const velo_bin = halfUp(p.velo), ivb_bin = halfUp(p.ivb / 2), hb_bin = halfUp(p.hb / 2)
    const bk = `${p.pitchType}|${p.hand}|${velo_bin}|${ivb_bin}|${hb_bin}|${slotBin}`
    let b = this.bins.get(bk)
    if (!b) {
      b = { level: this.level, span: String(this.season), pitch_type: p.pitchType, p_throws: p.hand, velo_bin, ivb_bin, hb_bin, slot_bin: slotBin, n_pitches: 0, n_swings: 0, n_whiffs: 0, n_called_strikes: 0, n_csw: 0, n_bbe: 0, xwoba_con_sum: 0, n_hard_hit: 0, n_gb: 0 }
      this.bins.set(bk, b)
    }
    b.n_pitches++; b.n_swings += swing; b.n_whiffs += whiff; b.n_called_strikes += called; b.n_csw += whiff | called
    b.n_bbe += bbe; b.xwoba_con_sum += xwv; b.n_hard_hit += hard; b.n_gb += gb

    // pitcher (MLB's builder needs an arm angle here too)
    if (p.slot != null && present(row.pitcher)) {
      const pid = Number(row.pitcher)
      const pk = `${pid}|${p.pitchType}`
      let a = this.pit.get(pk)
      if (!a) {
        a = { id: pid, type: p.pitchType, names: new Map(), teams: new Map(), hands: new Map(), n: 0, sHb: 0, sHb2: 0, sIvb: 0, sIvb2: 0, sVelo: 0, sSlot: 0, swings: 0, whiffs: 0, taken: 0, gift: 0, miss: 0, loc: 0, zone: 0, heart: 0, ooz: 0, chase: 0, bbe: 0, xw: 0, bbeW: 0, wobaCon: 0, states: {}, stands: {}, sample: [] }
        this.pit.set(pk, a)
      }
      const z = n(row.zone)
      const woba = n(row.woba_value)
      bump(a.names, String(row.player_name ?? '')); bump(a.hands, p.hand)
      bump(a.teams, String(row.inning_topbot === 'Top' ? row.home_team : row.away_team ?? ''))
      a.n++; a.sHb += p.hb; a.sHb2 += p.hb * p.hb; a.sIvb += p.ivb; a.sIvb2 += p.ivb * p.ivb; a.sVelo += p.velo; a.sSlot += p.slot
      a.swings += swing; a.whiffs += whiff
      a.taken += (BALLS.has(desc) || desc === 'called_strike') && z != null ? 1 : 0
      a.gift += desc === 'called_strike' && z != null && z >= 11 ? 1 : 0
      a.miss += BALLS.has(desc) && z != null && z <= 9 ? 1 : 0
      a.loc += z != null ? 1 : 0
      a.zone += z != null && z >= 1 && z <= 9 ? 1 : 0
      a.heart += z === 5 ? 1 : 0
      a.ooz += z != null && z >= 11 ? 1 : 0
      a.chase += z != null && z >= 11 && swing ? 1 : 0
      a.bbe += bbe; a.xw += xwv
      a.bbeW += bbe && woba != null ? 1 : 0; a.wobaCon += bbe && woba != null ? (woba as number) : 0
      const b1 = Number(row.balls), s1 = Number(row.strikes)
      const state = s1 > b1 ? 'Ahead in count' : b1 > s1 ? 'Behind in count' : 'Even count'
      const st = (a.states[state] ??= { swings: 0, whiffs: 0 }); st.swings += swing; st.whiffs += whiff
      const sd = row.stand === 'L' ? 'vs left-handed' : 'vs right-handed'
      const sx = (a.stands[sd] ??= { bbe: 0, xw: 0 }); sx.bbe += bbe; sx.xw += xwv
      const h = hash32(`${pid}:${row.game_pk}:${row.at_bat_number}:${row.pitch_number}`)
      a.sample.push({ h, hb: p.hb, ivb: p.ivb })
      if (a.sample.length > N_POINTS * 2) { a.sample.sort((x, y) => x.h - y.h); a.sample.length = N_POINTS }
    }
    return true
  }

  binRows(): BinRow[] {
    return [...this.bins.values()].map(b => ({ ...b, xwoba_con_sum: r(b.xwoba_con_sum, 4) }))
  }

  cellRows(): CellsRow[] {
    const out: CellsRow[] = []
    for (const [k, c] of this.cells) {
      const [pitch_type, p_throws] = k.split('|')
      const cells: number[] = []
      for (const v of [...c.byCell.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])) cells.push(...v)
      out.push({ level: this.level, span: String(this.season), pitch_type, p_throws, n_pitches: c.n, n_swings: c.sw, n_whiffs: c.wh, cells })
    }
    return out
  }

  pitcherRows(): PitcherRow[] {
    const out: PitcherRow[] = []
    for (const a of this.pit.values()) {
      if (a.n < MIN_PITCHES) continue
      const mHb = a.sHb / a.n, mIvb = a.sIvb / a.n
      const sd = (s2: number, m: number) => Math.sqrt(Math.max(0, s2 / a.n - m * m))
      const pts = [...a.sample].sort((x, y) => x.h - y.h).slice(0, N_POINTS)
      out.push({
        level: this.level, season: this.season, pitcher_id: a.id, pitch_type: a.type, pitcher_name: cleanName(mode(a.names)), team_abbr: mode(a.teams) || null, p_throws: mode(a.hands) ?? 'R',
        n_pitches: a.n, velo: r(a.sVelo / a.n, 2), ivb: r(mIvb, 2), hb: r(mHb, 2), slot: r(a.sSlot / a.n, 1), sd_hb: r(sd(a.sHb2, mHb), 2), sd_ivb: r(sd(a.sIvb2, mIvb), 2),
        n_swings: a.swings, n_whiffs: a.whiffs, n_taken: a.taken, n_gift: a.gift, n_miss: a.miss, n_loc: a.loc, n_zone: a.zone, n_heart: a.heart, n_ooz: a.ooz, n_chase: a.chase,
        n_bbe: a.bbe, xwoba_con_sum: r(a.xw, 4), n_bbe_w: a.bbeW, woba_con_sum: r(a.wobaCon, 4),
        points: pts.map(q => ({ hb: r(q.hb, 1), ivb: r(q.ivb, 1) })),
        counts: Object.entries(a.states).sort().map(([label, v]) => ({ label, swings: v.swings, whiffs: v.whiffs })),
        batter_sides: Object.entries(a.stands).sort().map(([label, v]) => ({ label, bbe: v.bbe, xwoba_sum: r(v.xw, 4) })),
      })
    }
    return out.sort((a, b) => a.pitcher_id - b.pitcher_id || a.pitch_type.localeCompare(b.pitch_type))
  }

  resultsCellRows(): ResultsCellsRow[] {
    const out: ResultsCellsRow[] = []
    for (const [k, cells] of this.resCells) {
      const [pitch_type, p_throws] = k.split('|')
      const flat: number[] = []
      let nP = 0
      for (const c of [...cells.values()].sort((a, b) => a.hb10 - b.hb10 || a.ivb10 - b.ivb10)) {
        const s = c.s
        nP += s[0]
        flat.push(c.hb10, c.ivb10, s[0], s[1], s[2], s[3], Math.round(s[4] * 1000), s[5], s[6], s[7], s[8], Math.round(s[9]), Math.round(s[10] * 1000), Math.round(s[11] * 1000))
      }
      out.push({ level: this.level, span: String(this.season), pitch_type, p_throws, n_pitches: nP, cells: flat })
    }
    return out
  }

  resultsPitcherRows(): ResultsPitcherRow[] {
    const out: ResultsPitcherRow[] = []
    for (const a of this.resPit.values()) {
      const s = a.s
      if (s[0] < MIN_PITCHES) continue   // the same minimum as the pitcher table: the board never lists a pitcher the map does not
      out.push({ level: this.level, season: this.season, pitcher_id: a.id, pitch_type: a.type, p_throws: mode(a.hands) ?? 'R', n_pitches: s[0], n_swings: s[1], n_whiffs: s[2], rv_n: s[3], rv: r(s[4], 3), pa: s[5], ab: s[6], hits: s[7], tb: s[8], woba_den: r(s[9], 3), woba_sum: r(s[10], 3), xwoba_sum: r(s[11], 3) })
    }
    return out.sort((x, y) => x.pitcher_id - y.pitcher_id || x.pitch_type.localeCompare(y.pitch_type))
  }

  coverageRows(): CoverageRow[] {
    return [...this.cov.values()].map(c => ({ level: this.level, season: this.season, month: c.month, park: c.park, games: c.games.size, pitches: c.pitches, tracked: c.tracked }))
      .sort((a, b) => a.month - b.month || a.park.localeCompare(b.park))
  }
}
