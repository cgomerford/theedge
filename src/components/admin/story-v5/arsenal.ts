// src/components/admin/story-v5/arsenal.ts
//
// Pure aggregation of one pitcher's Savant pitch-level rows (regular season + postseason) into the arsenal and times-through-order
// numbers the scenes show. Whiff% = whiffs / swings. Swings are swinging strikes, foul tips, fouls, bunts and balls in play.
// A pitch type needs MIN_PITCHES (20) pitches to count. xwOBA = sum(estimated_woba_using_speedangle, else woba_value) / sum(woba_denom)
// over plate-appearance-ending pitches, grouped by n_thruorder_pitcher.

import { MIN_PITCHES, averagePath, pathFor, type StatcastPitch } from './trajectory'
import type { ArsenalPitch, TimesThrough } from './types'

type Row = Record<string, string>
const num = (v: string | undefined): number => (v == null || v === '' ? NaN : Number(v))

export const PITCH_NAME: Record<string, string> = {
  FF: 'Four-seamer', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper', CU: 'Curveball', KC: 'Knuckle curve',
  CH: 'Changeup', FS: 'Splitter', SV: 'Slurve', FO: 'Forkball', KN: 'Knuckleball', CS: 'Slow curve', EP: 'Eephus',
}
export const FASTBALLS = ['FF', 'SI', 'FC']
/** Pitch colours for the renderer. */
export const PITCH_COLOR: Record<string, string> = {
  FF: '#FF5722', SI: '#FFC52F', FC: '#8FBCE6', CH: '#5CE1A0', SL: '#C77DFF', CU: '#4D96FF', ST: '#E85D9E', FS: '#2EC4B6', KC: '#7A5CFF',
}
const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'foul', 'foul_bunt', 'missed_bunt', 'hit_into_play', 'bunt_foul_tip'])
const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul_tip', 'missed_bunt', 'bunt_foul_tip'])

const asPitch = (r: Row): StatcastPitch => ({
  release_pos_x: num(r.release_pos_x), release_pos_y: num(r.release_pos_y), release_pos_z: num(r.release_pos_z),
  vx0: num(r.vx0), vy0: num(r.vy0), vz0: num(r.vz0), ax: num(r.ax), ay: num(r.ay), az: num(r.az),
})

/** Up to `max` pitch types with MIN_PITCHES or more pitches, most used first. Types whose rows have no usable trajectory are dropped. */
export function buildArsenal(rows: Row[], max = 4): ArsenalPitch[] {
  const total = rows.filter(r => r.pitch_type).length
  const by = new Map<string, Row[]>()
  for (const r of rows) if (r.pitch_type) (by.get(r.pitch_type) ?? by.set(r.pitch_type, []).get(r.pitch_type)!).push(r)
  const out: ArsenalPitch[] = []
  for (const [code, rs] of by) {
    if (rs.length < MIN_PITCHES) continue
    const paths = rs.map(r => pathFor(asPitch(r))).filter((p): p is NonNullable<typeof p> => !!p)
    const avg = averagePath(paths)
    const speeds = rs.map(r => num(r.release_speed)).filter(Number.isFinite)
    if (!avg || paths.length < MIN_PITCHES || !speeds.length) continue
    const swings = rs.filter(r => SWING.has(r.description)).length
    const whiffs = rs.filter(r => WHIFF.has(r.description)).length
    out.push({
      code, name: PITCH_NAME[code] ?? code, n: rs.length, usagePct: round1((rs.length / total) * 100),
      velo: round1(speeds.reduce((a, b) => a + b, 0) / speeds.length),
      whiffPct: swings >= MIN_PITCHES ? round1((whiffs / swings) * 100) : null, swings,
      path: { points: avg.points, tPlate: avg.tPlate },
    })
  }
  return out.sort((a, b) => b.n - a.n).slice(0, max)
}

export const MIN_TTO_PA = 20
export function timesThrough(rows: Row[]): TimesThrough | null {
  const agg = (tto: string) => {
    let num_ = 0, den = 0, pa = 0
    for (const r of rows) {
      if (!r.events || r.n_thruorder_pitcher !== tto) continue
      const denom = num(r.woba_denom)
      if (!(denom > 0)) continue
      const v = Number.isFinite(num(r.estimated_woba_using_speedangle)) ? num(r.estimated_woba_using_speedangle) : num(r.woba_value)
      if (!Number.isFinite(v)) continue
      num_ += v * denom; den += denom; pa++
    }
    return { x: den > 0 ? num_ / den : NaN, pa }
  }
  const a = agg('1'), b = agg('2')
  if (a.pa < MIN_TTO_PA || b.pa < MIN_TTO_PA || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return null
  return { first: Math.round(a.x * 1000) / 1000, second: Math.round(b.x * 1000) / 1000, paFirst: a.pa, paSecond: b.pa }
}

export const round1 = (n: number) => Math.round(n * 10) / 10
