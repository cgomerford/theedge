// src/lib/pitch-shape/model.ts
//
// Pure (no server, no fetch) logic for the Pitch Shape Lab and Shape Sandbox. Works on rows shaped
// like the `pitch_shape_bins` table, so the same code runs in the lab tab, the sandbox and the
// dev preview (which feeds it clearly-labelled synthetic bins).
//
// Method (mirrors mockups/pitch-shape-lab.html, § 05):
//   - A "neighborhood" is the bin a shape falls in plus r bins either side in velocity, IVB and HB,
//     in the SAME slot band, same pitch type and hand. r = 1 first, widened to r = 2, then empty.
//   - Bins nearer the target count a little more (weight 1 / (1 + 0.5·distance)).
//   - Rates come from SUMMED counts (Σ w·whiffs ÷ Σ w·swings), never from averaging rates.
//   - Every metric has its own sample gate. Under the gate the value is null — never an estimate.
//
// BIN_WIDTH must match the writer of pitch_shape_bins (the migration says the writer owns the
// widths). Bin index = Math.round(value / width), i.e. the bin is centred on index × width.
// HB is arm-side positive with left-handers already flipped (writer's job, see mockup footnote).

export const BIN_WIDTH = { velo: 1, ivb: 2, hb: 2, slot: 10 } as const
export const GATE = { swings: 150, pitches: 300, bbe: 100 } as const

export type Hand = 'R' | 'L'

/** One row of pitch_shape_bins, camelCased. Numerics are already Number()-coerced. */
export type ShapeBin = {
  veloBin: number
  ivbBin: number
  hbBin: number
  slotBin: number
  pitches: number
  swings: number
  whiffs: number
  calledStrikes: number
  csw: number
  bbe: number
  xwobaConSum: number
  hardHit: number
  gb: number
}

export type Shape = { velo: number; ivb: number; hb: number; slot: number }

export type Reach = 0 | 1 | 2 // 0 = too thin, 1 = ±1 bin, 2 = widened to ±2

export type MetricRead = { value: number | null; reach: Reach }

export type Neighborhood = {
  radius: 1 | 2
  swings: number
  pitches: number
  bbe: number
  whiff: number | null
  csw: number | null
  gb: number | null
  xwobaCon: number | null
}

export type ShapeLookup = {
  whiff: MetricRead
  csw: MetricRead
  gb: MetricRead
  xwobaCon: MetricRead
  /** raw counts behind the narrowest neighborhood that cleared each gate (else the widest tried) */
  swings: number
  pitches: number
  bbe: number
  /** 1 or 2 when whiff% cleared its gate, 0 when it did not */
  reach: Reach
}

export const slotBandOf = (slot: number) => Math.floor(slot / BIN_WIDTH.slot) * BIN_WIDTH.slot
export const binOf = (s: Shape) => ({
  veloBin: Math.round(s.velo / BIN_WIDTH.velo),
  ivbBin: Math.round(s.ivb / BIN_WIDTH.ivb),
  hbBin: Math.round(s.hb / BIN_WIDTH.hb),
  slotBin: Math.round(slotBandOf(s.slot) / BIN_WIDTH.slot),
})

const key = (v: number, i: number, h: number, s: number) => `${v}|${i}|${h}|${s}`

/** Index once, look up many times (the sandbox looks up on every slider tick). */
export type BinIndex = Map<string, ShapeBin>
export function indexBins(bins: ShapeBin[]): BinIndex {
  const m: BinIndex = new Map()
  for (const b of bins) m.set(key(b.veloBin, b.ivbBin, b.hbBin, b.slotBin), b)
  return m
}

export function neighborhood(index: BinIndex, shape: Shape, radius: 1 | 2): Neighborhood {
  const t = binOf(shape)
  let swings = 0, pitches = 0, bbe = 0
  let wSwings = 0, wWhiffs = 0, wPitches = 0, wCsw = 0, wBbe = 0, wGb = 0, wXw = 0
  for (let dv = -radius; dv <= radius; dv++) {
    for (let di = -radius; di <= radius; di++) {
      for (let dh = -radius; dh <= radius; dh++) {
        const b = index.get(key(t.veloBin + dv, t.ivbBin + di, t.hbBin + dh, t.slotBin))
        if (!b) continue
        const w = 1 / (1 + 0.5 * Math.sqrt(dv * dv + di * di + dh * dh))
        swings += b.swings; pitches += b.pitches; bbe += b.bbe
        wSwings += w * b.swings; wWhiffs += w * b.whiffs
        wPitches += w * b.pitches; wCsw += w * b.csw
        wBbe += w * b.bbe; wGb += w * b.gb; wXw += w * b.xwobaConSum
      }
    }
  }
  return {
    radius, swings, pitches, bbe,
    whiff: swings >= GATE.swings && wSwings > 0 ? wWhiffs / wSwings : null,
    csw: pitches >= GATE.pitches && wPitches > 0 ? wCsw / wPitches : null,
    gb: bbe >= GATE.bbe && wBbe > 0 ? wGb / wBbe : null,
    xwobaCon: bbe >= GATE.bbe && wBbe > 0 ? wXw / wBbe : null,
  }
}

/** ±1 → ±2 → empty. Each metric is gated independently. */
export function lookup(index: BinIndex, shape: Shape): ShapeLookup {
  const a = neighborhood(index, shape, 1)
  const b = neighborhood(index, shape, 2)
  const pick = (k: 'whiff' | 'csw' | 'gb' | 'xwobaCon'): MetricRead =>
    a[k] != null ? { value: a[k], reach: 1 } : b[k] != null ? { value: b[k], reach: 2 } : { value: null, reach: 0 }
  const whiff = pick('whiff'), csw = pick('csw'), gb = pick('gb'), xwobaCon = pick('xwobaCon')
  return {
    whiff, csw, gb, xwobaCon,
    swings: a.whiff != null ? a.swings : b.swings,
    pitches: a.csw != null ? a.pitches : b.pitches,
    bbe: a.xwobaCon != null ? a.bbe : b.bbe,
    reach: whiff.reach,
  }
}

/** League averages for one pitch type + hand, from the same bins (so they use the same definitions). */
export type LeagueAverages = { whiff: number | null; csw: number | null; gb: number | null; xwobaCon: number | null }
export function leagueAverages(bins: ShapeBin[]): LeagueAverages {
  let sw = 0, wh = 0, p = 0, csw = 0, bbe = 0, gb = 0, xw = 0
  for (const b of bins) { sw += b.swings; wh += b.whiffs; p += b.pitches; csw += b.csw; bbe += b.bbe; gb += b.gb; xw += b.xwobaConSum }
  return {
    whiff: sw >= GATE.swings ? wh / sw : null,
    csw: p >= GATE.pitches ? csw / p : null,
    gb: bbe >= GATE.bbe ? gb / bbe : null,
    xwobaCon: bbe >= GATE.bbe ? xw / bbe : null,
  }
}

// ---------- movement map ----------

export const MAP_CELLS = 20 // 20 × 20 cells
export const MAP_CELL_IN = 2 // 2-inch cells → 40 in × 40 in window

export type MapCell = { hb: number; ivb: number; swings: number; whiffRate: number | null }
export type MapWindow = { hb0: number; ivb0: number }

/** Window centred on the pitch-weighted mean shape of the league bins. */
export function mapWindow(bins: ShapeBin[]): MapWindow | null {
  let n = 0, h = 0, i = 0
  for (const b of bins) { n += b.pitches; h += b.pitches * b.hbBin * BIN_WIDTH.hb; i += b.pitches * b.ivbBin * BIN_WIDTH.ivb }
  if (n <= 0) return null
  const half = (MAP_CELLS * MAP_CELL_IN) / 2
  return { hb0: Math.round(h / n) - half, ivb0: Math.round(i / n) - half }
}

/** Whiff% per 2-inch movement cell, pooled over all velocities and arm slots. Under-gate cells get null. */
export function movementCells(bins: ShapeBin[], win: MapWindow): MapCell[] {
  const sw = new Float64Array(MAP_CELLS * MAP_CELLS)
  const wh = new Float64Array(MAP_CELLS * MAP_CELLS)
  for (const b of bins) {
    const cx = Math.floor((b.hbBin * BIN_WIDTH.hb - win.hb0) / MAP_CELL_IN)
    const cy = Math.floor((b.ivbBin * BIN_WIDTH.ivb - win.ivb0) / MAP_CELL_IN)
    if (cx < 0 || cx >= MAP_CELLS || cy < 0 || cy >= MAP_CELLS) continue
    sw[cy * MAP_CELLS + cx] += b.swings
    wh[cy * MAP_CELLS + cx] += b.whiffs
  }
  const out: MapCell[] = []
  for (let cy = 0; cy < MAP_CELLS; cy++) {
    for (let cx = 0; cx < MAP_CELLS; cx++) {
      const s = sw[cy * MAP_CELLS + cx]
      out.push({
        hb: win.hb0 + cx * MAP_CELL_IN,
        ivb: win.ivb0 + cy * MAP_CELL_IN,
        swings: s,
        whiffRate: s >= GATE.swings ? wh[cy * MAP_CELLS + cx] / s : null,
      })
    }
  }
  return out
}

// ---------- arm-slot strip ----------

export const SLOT_BANDS = [20, 30, 40, 50, 60, 70, 80, 90] as const
export type SlotRead = { slot: number; whiff: number | null; swings: number; widened: boolean; current: boolean }

export function slotStrip(index: BinIndex, shape: Shape): SlotRead[] {
  const cur = slotBandOf(shape.slot)
  return SLOT_BANDS.map(slot => {
    const L = lookup(index, { ...shape, slot })
    return { slot, whiff: L.whiff.value, swings: L.swings, widened: L.whiff.reach === 2, current: slot === cur }
  })
}

// ---------- formatting (shared by every component so a number reads the same everywhere) ----------

export const pct = (x: number | null, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
export const woba = (x: number | null) => (x == null ? '—' : x.toFixed(3).replace(/^0/, ''))
export const sgn = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`
export const fmtN = (n: number) => Math.round(n).toLocaleString('en-US')

// ---------- lab payload (what the Shape tab renders) ----------

/** Pitch-type display names. Codes are Statcast pitch_type values. */
export const PITCH_NAMES: Record<string, string> = {
  FF: 'Four-seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper',
  CU: 'Curveball', KC: 'Knuckle curve', CH: 'Changeup', FS: 'Splitter', SV: 'Slurve',
}
/** Sandbox gating: the free tier covers these two types; every other type is Pro. */
export const FREE_SANDBOX_TYPES = ['FF', 'ST'] as const

export type PitchAverageShape = Shape & { sdHb: number; sdIvb: number; n: number }

export type PitcherPitchShape = {
  pitchType: string
  current: PitchAverageShape
  /** last season's average shape; null when he did not throw it enough last year */
  prev: PitchAverageShape | null
  /** a sample of his actual pitches this season, for the dots on the map */
  points: { hb: number; ivb: number }[]
  /** his own whiff% on this pitch this season, with the swing count behind it */
  own: { whiff: number | null; swings: number }
}

/**
 * One month of one pitch type: the MEAN release point, speed, break and Statcast flight terms (feet, mph, inches).
 * `hb` is arm-side positive (left-handers flipped). Source: pitch_shape_monthly. Months under 50 pitches are kept
 * (the model draws them faint and leaves them out of the "what changed" figures).
 */
export type PitchViewMonth = {
  /** calendar month 1-12 */
  month: number
  n: number
  releaseX: number; releaseY: number; releaseZ: number; extension: number | null
  speed: number; spin: number | null
  vx0: number; vy0: number; vz0: number; ax: number; ay: number; az: number
  plateX: number; plateZ: number; szTop: number; szBot: number
  ivb: number; hb: number
  /** outcome counts for the month (null until the shape-monthly cron has re-run on this row; never estimated) */
  nSwings: number | null; nWhiffs: number | null; nCsw: number | null; nBbe: number | null; xwobaConSum: number | null
  /** balls in play Savant classes Weak or Topped (null until the cron has re-run on this row) */
  nWeak: number | null
  /** ABS challenges against this pitch in the period, and how many of those calls stood (null = no challenge log) */
  absN: number | null; absUpheld: number | null
  /** season the row belongs to; `label` overrides the month name (a whole-season row is labelled "2025") */
  season: number
  label?: string
}

import type { ComparePitcher } from './compare'

export type CountSplit = { label: string; whiff: number | null; swings: number }
export type MonthPoint = { label: string; velo: number | null; pitches: number }
export type BatterSideSplit = { label: string; xwobaCon: number | null; bbe: number }

export type ShapeLabData = {
  pitcherId: number
  name: string
  hand: Hand
  teamAbbr: string
  teamColor: string
  season: number
  prevSeason: number
  /** window the league neighborhoods cover, e.g. "2024–2026" */
  leagueSpan: string
  pitches: PitcherPitchShape[]
  /** league bins per pitch type (his hand only) */
  bins: Record<string, ShapeBin[]>
  /** per pitch type; null = not built yet (renders an empty state, never a guess) */
  counts: Record<string, CountSplit[] | null>
  batterSides: Record<string, BatterSideSplit[] | null>
  monthly: Record<string, MonthPoint[] | null>
  /** per pitch type, month order; a type with no rows is absent (the model shows an empty state) */
  view: Record<string, PitchViewMonth[]>
  /** every season we hold monthly rows for (season -> pitch type -> months), oldest first in the UI */
  viewSeasons: Record<string, Record<string, PitchViewMonth[]>>
  /** per pitch type: him, then the closest teammate and league pitchers of the same type and hand (compare.ts) */
  compare: Record<string, ComparePitcher[]>
  validation: { stability: ValidationStat | null; within: ValidationStat | null }
}

export type ValidationStat = { r: number; detail: string }

// ---------- § 03 "where they're vulnerable" ----------

export type VulnRow = { label: string; hb: number; ivb: number; share: number; look: ShapeLookup }

/**
 * Group his own pitches into 2-inch movement cells, then look up what the league's neighborhood at
 * each cell (at his velocity and slot) has produced on contact. Cells holding under 5% of his
 * pitches are skipped. Ranked by xwOBA on contact, highest first; thin neighborhoods sort last and
 * show an empty state rather than a number.
 */
export function vulnerableSpots(index: BinIndex, cur: PitchAverageShape, points: { hb: number; ivb: number }[], max = 4): VulnRow[] {
  if (points.length === 0) return []
  const cells = new Map<string, { hb: number; ivb: number; n: number }>()
  for (const p of points) {
    const hb = Math.round(p.hb / MAP_CELL_IN) * MAP_CELL_IN
    const ivb = Math.round(p.ivb / MAP_CELL_IN) * MAP_CELL_IN
    const k = `${hb}|${ivb}`
    const c = cells.get(k)
    if (c) c.n++
    else cells.set(k, { hb, ivb, n: 1 })
  }
  const rows: VulnRow[] = []
  for (const c of cells.values()) {
    const share = c.n / points.length
    if (share < 0.05) continue
    const di = cur.sdIvb > 0 ? (c.ivb - cur.ivb) / cur.sdIvb : 0
    const dh = cur.sdHb > 0 ? (c.hb - cur.hb) / cur.sdHb : 0
    const parts: string[] = []
    if (di >= 0.5) parts.push('More ride')
    else if (di <= -0.5) parts.push('Less ride')
    if (dh >= 0.5) parts.push('further arm-side')
    else if (dh <= -0.5) parts.push('further glove-side')
    const label = parts.length === 0 ? 'Around his average shape' : parts.join(', ').replace(/^./, ch => ch.toUpperCase())
    rows.push({ label, hb: c.hb, ivb: c.ivb, share, look: lookup(index, { velo: cur.velo, ivb: c.ivb, hb: c.hb, slot: cur.slot }) })
  }
  rows.sort((a, b) => (b.look.xwobaCon.value ?? -1) - (a.look.xwobaCon.value ?? -1))
  return rows.slice(0, max)
}

/** Pitch-weighted mean shape of a set of league bins: where the sandbox sliders start. Null when empty. */
export function typicalShape(bins: ShapeBin[]): Shape | null {
  let n = 0, v = 0, i = 0, h = 0, s = 0
  for (const b of bins) {
    n += b.pitches
    v += b.pitches * b.veloBin * BIN_WIDTH.velo
    i += b.pitches * b.ivbBin * BIN_WIDTH.ivb
    h += b.pitches * b.hbBin * BIN_WIDTH.hb
    s += b.pitches * b.slotBin * BIN_WIDTH.slot
  }
  if (n <= 0) return null
  return { velo: Math.round((v / n) * 10) / 10, ivb: Math.round((i / n) * 10) / 10, hb: Math.round((h / n) * 10) / 10, slot: Math.round(s / n) }
}

// ---------- sandbox pitcher search ----------

/** One search result: a pitcher and each pitch type's average shape (most-thrown first). */
export type PitcherHit = {
  id: number
  name: string
  team: string
  hand: Hand
  season: number
  pitches: { pitchType: string; n: number; shape: Shape }[]
}
