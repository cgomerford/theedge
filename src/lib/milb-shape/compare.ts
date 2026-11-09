// src/lib/milb-shape/compare.ts
//
// How one pitch type's shapes compare across MLB, Triple-A and the Florida State League. Pure functions over each level's pitcher rows (pitch_shape_pitcher and
// pitch_shape_pitcher_milb: the same definitions at every level, so the numbers are directly comparable):
//   * a level's average shape for the pitch type, weighted by pitches, and how much pitchers differ from each other (a pitch-weighted standard deviation of the
//     pitcher averages: wide means a level holds many different versions of the pitch);
//   * the same pitcher at two levels: who threw 300+ of the pitch at both, and how his average shape moved. Pitchers keep their MLB player id across levels, so
//     this is the real change in one arm's pitch, not a comparison of different people.
// Outcomes are never compared across levels as if they were one scale: each level's whiff rate is measured against that level's own hitters, parks and zone, and
// the panel says so. Shape (speed, ride, run, arm angle) is physical and is what is compared.

import type { Level } from './levels'

export type PRow = { pitcher_id: number; pitcher_name: string; team_abbr: string | null; n_pitches: number; velo: number; ivb: number; hb: number; slot: number | null; n_swings: number; n_whiffs: number }
export type Shape = { velo: number; ivb: number; hb: number; slot: number }
export type LevelSummary = {
  level: Level; season: number
  pitchers: number; pitches: number
  /** false when the level has no arm angle (Spring Training, Arizona Fall League): mean.slot and spread.slot are then 0 and must be shown as pending */
  slotKnown: boolean
  mean: Shape
  /** pitch-weighted spread of pitcher averages */
  spread: Shape
  swings: number; whiffs: number
}
export type Mover = {
  pitcherId: number; name: string
  low: { level: Level; team: string; pitches: number; shape: Shape }
  high: { level: Level; team: string; pitches: number; shape: Shape }
  /** high minus low */
  delta: Shape
}

const KEYS = ['velo', 'ivb', 'hb', 'slot'] as const
const num = (x: unknown) => Number(x)

export function summarise(level: Level, season: number, rows: PRow[]): LevelSummary | null {
  // speed and movement are needed for a pitcher to count; an arm angle is not (it is null at the exhibition levels), so the arm-angle average is taken over the pitchers that have one
  const use = rows.filter(r => num(r.n_pitches) > 0 && [r.velo, r.ivb, r.hb].every(v => v != null && Number.isFinite(num(v))))
  const total = use.reduce((s, r) => s + num(r.n_pitches), 0)
  if (use.length === 0 || total === 0) return null
  const mean = {} as Shape, spread = {} as Shape
  const withSlot = use.filter(r => r.slot != null && Number.isFinite(num(r.slot)))
  const slotTotal = withSlot.reduce((s, r) => s + num(r.n_pitches), 0)
  for (const k of KEYS) {
    const src = k === 'slot' ? withSlot : use, tot = k === 'slot' ? slotTotal : total
    if (tot === 0) { mean[k] = 0; spread[k] = 0; continue }
    const m = src.reduce((s, r) => s + num(r[k]) * num(r.n_pitches), 0) / tot
    mean[k] = m
    spread[k] = Math.sqrt(src.reduce((s, r) => s + (num(r[k]) - m) ** 2 * num(r.n_pitches), 0) / tot)
  }
  return { level, season, pitchers: use.length, pitches: total, slotKnown: slotTotal > 0, mean, spread, swings: use.reduce((s, r) => s + num(r.n_swings), 0), whiffs: use.reduce((s, r) => s + num(r.n_whiffs), 0) }
}

/** high minus base for each axis. */
export const shapeDelta = (a: Shape, base: Shape): Shape => ({ velo: a.velo - base.velo, ivb: a.ivb - base.ivb, hb: a.hb - base.hb, slot: a.slot - base.slot })

/** Pitchers with at least `min` pitches of the type at both levels (150 by default: enough for a stable average shape), largest smaller sample first. */
export function movers(low: { level: Level; rows: PRow[] }, high: { level: Level; rows: PRow[] }, min = 150): Mover[] {
  const hi = new Map(high.rows.map(r => [r.pitcher_id, r]))
  const out: Mover[] = []
  for (const a of low.rows) {
    const b = hi.get(a.pitcher_id)
    if (!b || num(a.n_pitches) < min || num(b.n_pitches) < min) continue
    const sa: Shape = { velo: num(a.velo), ivb: num(a.ivb), hb: num(a.hb), slot: num(a.slot) }, sb: Shape = { velo: num(b.velo), ivb: num(b.ivb), hb: num(b.hb), slot: num(b.slot) }
    out.push({
      pitcherId: a.pitcher_id, name: b.pitcher_name || a.pitcher_name,
      low: { level: low.level, team: a.team_abbr ?? '', pitches: num(a.n_pitches), shape: sa }, high: { level: high.level, team: b.team_abbr ?? '', pitches: num(b.n_pitches), shape: sb },
      delta: shapeDelta(sb, sa),
    })
  }
  return out.sort((x, y) => Math.min(y.low.pitches, y.high.pitches) - Math.min(x.low.pitches, x.high.pitches) || x.pitcherId - y.pitcherId)
}

/** The average change across a set of movers, weighted by the smaller of their two samples. null with none. */
export function meanDelta(ms: Mover[]): (Shape & { n: number }) | null {
  if (ms.length === 0) return null
  const w = (m: Mover) => Math.min(m.low.pitches, m.high.pitches)
  const tot = ms.reduce((s, m) => s + w(m), 0)
  const o = { n: ms.length } as Shape & { n: number }
  for (const k of KEYS) o[k] = ms.reduce((s, m) => s + m.delta[k] * w(m), 0) / tot
  return o
}
