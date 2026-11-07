// src/lib/pitch-shape/explain.ts
//
// Why might a pitch trail (or beat) what its movement alone has produced? The map's "shape" is movement only (ride and run, all speeds and arm angles). The stored shape bins also
// carry speed and arm angle, so this takes league pitches that move like his and compares what they produced overall with what they produced at HIS speed and at HIS arm angle.
// If pitches at his speed do worse than pitches at every speed, speed is part of why his results trail movement alone; same for arm angle. It describes what league pitches have
// produced, with the samples behind it. It cannot see location, sequencing, deception or defense, and the bins hold whiffs and contact quality only (not run value).
// Pure functions, no server imports.

import { BIN_WIDTH, GATE, binOf, type Shape, type ShapeBin } from './model'

export type Rate = { whiff: number | null; xwobaCon: number | null; swings: number; bbe: number; pitches: number }
export type Explain = {
  typicalVelo: number | null; typicalSlot: number | null
  /** his speed (mph) and arm angle (degrees) minus the typical for league pitches that move like his */
  veloDiff: number | null; slotDiff: number | null
  /** league pitches that move like his: all speeds and arm angles, then at his speed band, at his arm-angle band, at both */
  all: Rate; atSpeed: Rate; atAngle: Rate; atBoth: Rate
  /** whiff-rate difference (fraction, so -0.03 is 3 points fewer misses) made by matching his speed / his arm angle / both, against all league pitches that move like his */
  whiffEffect: { speed: number | null; angle: number | null; both: number | null }
  /** the same for xwOBA on contact (positive is more damage) */
  contactEffect: { speed: number | null; angle: number | null; both: number | null }
}

const rateOf = (rows: ShapeBin[]): Rate => {
  let sw = 0, wh = 0, bbe = 0, xw = 0, p = 0
  for (const b of rows) { sw += b.swings; wh += b.whiffs; bbe += b.bbe; xw += b.xwobaConSum; p += b.pitches }
  return { whiff: sw >= GATE.swings ? wh / sw : null, xwobaCon: bbe >= GATE.bbe ? xw / bbe : null, swings: sw, bbe, pitches: p }
}
const diff = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b)

/** Movement window = ±1 bin of ride and of run (2 in bins, so about ±2 in); speed band = ±1 bin (1 mph bins); arm-angle band = ±1 bin (10 degree bins). null when no league pitches move like his. */
export function explainShape(bins: ShapeBin[], shape: Shape): Explain | null {
  const t = binOf(shape)
  const move = bins.filter(b => Math.abs(b.ivbBin - t.ivbBin) <= 1 && Math.abs(b.hbBin - t.hbBin) <= 1)
  if (move.length === 0) return null
  const p = move.reduce((s, b) => s + b.pitches, 0)
  const typicalVelo = p ? move.reduce((s, b) => s + b.veloBin * BIN_WIDTH.velo * b.pitches, 0) / p : null
  const typicalSlot = p ? move.reduce((s, b) => s + (b.slotBin * BIN_WIDTH.slot + BIN_WIDTH.slot / 2) * b.pitches, 0) / p : null
  const near = (a: number, b: number) => Math.abs(a - b) <= 1
  const all = rateOf(move), atSpeed = rateOf(move.filter(b => near(b.veloBin, t.veloBin))), atAngle = rateOf(move.filter(b => near(b.slotBin, t.slotBin)))
  const atBoth = rateOf(move.filter(b => near(b.veloBin, t.veloBin) && near(b.slotBin, t.slotBin)))
  return {
    typicalVelo, typicalSlot,
    veloDiff: typicalVelo == null ? null : shape.velo - typicalVelo, slotDiff: typicalSlot == null ? null : shape.slot - typicalSlot,
    all, atSpeed, atAngle, atBoth,
    whiffEffect: { speed: diff(atSpeed.whiff, all.whiff), angle: diff(atAngle.whiff, all.whiff), both: diff(atBoth.whiff, all.whiff) },
    contactEffect: { speed: diff(atSpeed.xwobaCon, all.xwobaCon), angle: diff(atAngle.xwobaCon, all.xwobaCon), both: diff(atBoth.xwobaCon, all.xwobaCon) },
  }
}

/** A difference this small (3 points of whiff, 0.015 of xwOBA on contact) is noise, not a reason. */
export const WHIFF_NOTICE = 0.03
export const CONTACT_NOTICE = 0.015
/** Speed or arm angle this far from typical for his movement is worth naming. */
export const SPEED_NOTICE = 1.5
export const ANGLE_NOTICE = 8

export type Reason = { factor: 'speed' | 'angle'; text: string; /** positive = helps the pitcher, negative = hurts */ lean: -1 | 0 | 1 }

/** Plain sentences for speed and arm angle, from an Explain, with the sample behind each. lean says whether the factor helps or hurts him against movement alone. */
export function reasons(e: Explain, shape: Shape, lc: string): Reason[] {
  const out: Reason[] = []
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const pts = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} pts`
  const x3 = (v: number) => v.toFixed(3).replace(/^0/, '')
  const one = (factor: 'speed' | 'angle', rate: Rate, wEff: number | null, cEff: number | null, label: string, diffText: string, big: boolean) => {
    if (!big) return
    const bits: string[] = []
    let lean: -1 | 0 | 1 = 0
    if (wEff != null && Math.abs(wEff) >= WHIFF_NOTICE) { bits.push(`they get ${pct(rate.whiff ?? 0)} whiffs per swing against ${pct(e.all.whiff ?? 0)} at every ${factor === 'speed' ? 'speed' : 'angle'} (${pts(wEff)}, ${rate.swings.toLocaleString()} swings)`); lean = wEff > 0 ? 1 : -1 }
    if (cEff != null && Math.abs(cEff) >= CONTACT_NOTICE) { bits.push(`contact against them averages ${x3(rate.xwobaCon ?? 0)} xwOBA against ${x3(e.all.xwobaCon ?? 0)} (${cEff > 0 ? 'more' : 'less'} damage, ${rate.bbe.toLocaleString()} batted balls)`); if (lean === 0) lean = cEff < 0 ? 1 : -1 }
    out.push({ factor, lean, text: bits.length ? `${label}, ${diffText}. League ${lc}s that move like his and match it: ${bits.join('; ')}.` : `${label}, ${diffText}, but league ${lc}s that match it have not done noticeably better or worse than those at every ${factor === 'speed' ? 'speed' : 'angle'}.` })
  }
  if (e.veloDiff != null && e.typicalVelo != null)
    one('speed', e.atSpeed, e.whiffEffect.speed, e.contactEffect.speed, `His speed is ${shape.velo.toFixed(1)} mph`, `${Math.abs(e.veloDiff).toFixed(1)} mph ${e.veloDiff < 0 ? 'below' : 'above'} the ${e.typicalVelo.toFixed(1)} typical for ${lc}s that move like his`, Math.abs(e.veloDiff) >= SPEED_NOTICE)
  if (e.slotDiff != null && e.typicalSlot != null)
    one('angle', e.atAngle, e.whiffEffect.angle, e.contactEffect.angle, `His arm angle is ${shape.slot.toFixed(0)}°`, `${Math.abs(e.slotDiff).toFixed(0)}° ${e.slotDiff < 0 ? 'lower' : 'higher'} than the ${e.typicalSlot.toFixed(0)}° typical for ${lc}s that move like his`, Math.abs(e.slotDiff) >= ANGLE_NOTICE)
  return out
}
