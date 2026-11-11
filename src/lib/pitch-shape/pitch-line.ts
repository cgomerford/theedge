// src/lib/pitch-shape/pitch-line.ts
//
// One pitcher's full stat line on ONE pitch type, counted from his per-pitch log (RawPitch): what he threw, how hitters swung, what ended plate appearances on it, and the contact that came back.
// ERA belongs to the pitcher (it needs innings and runs charged to him), so it is not a pitch stat: here a plate appearance is credited to the pitch that ENDED it, and the line is the
// slash line, strikeout and walk rates, home runs, wOBA and xwOBA of those plate appearances. Pure functions; no database, no fetching. Description only: it counts what has happened.

import type { RawPitch } from '@/lib/pitcher-pitch-log'

const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])
const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'hit_into_play'])
const HIT: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }
const NOT_AB = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_bunt', 'sac_fly', 'sac_bunt_double_play', 'sac_fly_double_play', 'catcher_interf', 'truncated_pa'])
const STRIKEOUT = new Set(['strikeout', 'strikeout_double_play'])
const NOT_PA = new Set(['truncated_pa', 'sac_bunt', 'sac_bunt_double_play', 'catcher_interf'])
const ENDS_PA = new Set([...Object.keys(HIT), ...NOT_AB, ...STRIKEOUT, 'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'fielders_choice', 'fielders_choice_out', 'field_error', 'triple_play'])
const inZone = (z: string | null) => z != null && Number(z) >= 1 && Number(z) <= 9

/** The event that ended the plate appearance on this pitch, or null when it did not end one (RawPitch.result then repeats the pitch call). */
const eventOf = (p: RawPitch) => (p.result != null && (p.result !== p.description || p.result === 'hit_by_pitch') && ENDS_PA.has(p.result) ? p.result : null)

export type PitchLine = {
  // what he threw
  pitches: number
  /** share of all his pitches (null when his total is not given) */
  usage: number | null
  velo: number | null; spin: number | null; ivb: number | null; hb: number | null; ext: number | null
  // swing and miss
  swings: number; whiffs: number
  whiffPct: number | null; cswPct: number | null; zonePct: number | null; chasePct: number | null
  // plate appearances that ended on it
  pa: number; ab: number; hits: number; hr: number; bb: number; k: number
  avg: number | null; obp: number | null; slg: number | null; ops: number | null; kPct: number | null; bbPct: number | null
  // contact and expected results
  bbe: number; avgEv: number | null; hardHitPct: number | null
  woba: number | null; xwoba: number | null
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const rate = (n: number, d: number) => (d > 0 ? n / d : null)

/** The line on one pitch type. null when he has not thrown it. pitchesAll (all his pitches) gives usage. */
export function pitchLine(all: RawPitch[], pitchType: string, pitchesAll: number | null = all.length): PitchLine | null {
  const ps = all.filter(p => p.pitchType === pitchType)
  if (ps.length === 0) return null
  let swings = 0, whiffs = 0, csw = 0, withZone = 0, zoneIn = 0, outPitches = 0, outSwings = 0
  let pa = 0, ab = 0, hits = 0, tb = 0, hr = 0, bb = 0, k = 0, hbp = 0, sf = 0
  const evs: number[] = []
  let wNum = 0, wDen = 0, xNum = 0
  for (const p of ps) {
    const d = p.description ?? ''
    const sw = SWING.has(d)
    if (sw) swings++
    if (WHIFF.has(d)) whiffs++
    if (d === 'called_strike' || WHIFF.has(d)) csw++
    if (p.zone != null) {
      withZone++
      if (inZone(p.zone)) zoneIn++
      else { outPitches++; if (sw) outSwings++ }
    }
    const e = eventOf(p)
    if (e != null && !NOT_PA.has(e)) {
      pa++
      if (!NOT_AB.has(e)) { ab++; if (e in HIT) { hits++; tb += HIT[e] } }
      if (e === 'home_run') hr++
      if (e === 'walk' || e === 'intent_walk') bb++
      if (e === 'hit_by_pitch') hbp++
      if (e === 'sac_fly' || e === 'sac_fly_double_play') sf++
      if (STRIKEOUT.has(e)) k++
    }
    if (d === 'hit_into_play' && p.exitVelo != null) evs.push(p.exitVelo)
    if (p.wobaDen != null && p.wobaDen > 0) {
      wDen += p.wobaDen; wNum += p.woba ?? 0
      xNum += d === 'hit_into_play' && p.xwoba != null ? p.xwoba : p.woba ?? 0
    }
  }
  const avg = rate(hits, ab), slg = rate(tb, ab)
  const obpDen = ab + bb + hbp + sf
  const obp = rate(hits + bb + hbp, obpDen)
  return {
    pitches: ps.length,
    usage: pitchesAll && pitchesAll > 0 ? ps.length / pitchesAll : null,
    velo: mean(ps.flatMap(p => (p.velo != null ? [p.velo] : []))),
    spin: mean(ps.flatMap(p => (p.spinRate != null ? [p.spinRate] : []))),
    ivb: mean(ps.flatMap(p => (p.pfx ? [p.pfx[1] * 12] : []))),
    hb: mean(ps.flatMap(p => (p.pfx ? [Math.abs(p.pfx[0] * 12)] : []))),
    ext: mean(ps.flatMap(p => (p.extension != null ? [p.extension] : []))),
    swings, whiffs,
    whiffPct: rate(whiffs, swings), cswPct: rate(csw, ps.length), zonePct: rate(zoneIn, withZone), chasePct: rate(outSwings, outPitches),
    pa, ab, hits, hr, bb, k,
    avg, obp, slg, ops: obp != null && slg != null ? obp + slg : null, kPct: rate(k, pa), bbPct: rate(bb, pa),
    bbe: evs.length, avgEv: mean(evs), hardHitPct: rate(evs.filter(v => v >= 95).length, evs.length),
    woba: rate(wNum, wDen), xwoba: rate(xNum, wDen),
  }
}

/**
 * Every pitch of one type as a point on the movement map: [run toward the arm side, ride], inches. Savant's horizontal break is from the catcher's view, so for a right-hander it is flipped to make
 * arm-side positive for either arm (the same convention as the league map). Pitches with no tracked movement are left out.
 */
export function movementPoints(pitches: RawPitch[], pitchType: string, throws: 'L' | 'R' | null): [number, number][] {
  const sign = throws === 'R' ? -1 : 1
  return pitches.flatMap(p => (p.pitchType === pitchType && p.pfx ? [[sign * p.pfx[0] * 12, p.pfx[1] * 12] as [number, number]] : []))
}
