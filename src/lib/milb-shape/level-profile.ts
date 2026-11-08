// src/lib/milb-shape/level-profile.ts
//
// One pitcher at one level, from his per-pitch log (the same RawPitch the Pitching Lab's Location and Sequencing views are built on), reduced to the figures that can be set
// side by side across levels: shape, usage, location, results and sequencing. Pure, so the same function reads an MLB log and a Triple-A log and the two can be compared directly.
// Everything is a count with its sample, and anything under its minimum is null (never a guess). Sequencing needs pitches in thrown order, which the log only carries for a viewer
// who can read the full log (game, at-bat and pitch number): without them `sequencing` is null.

import type { RawPitch } from '@/lib/pitcher-pitch-log'
import type { Level } from './levels'

const SWING = new Set(['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'])
const WHIFF = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])
const FASTBALLS = new Set(['FF', 'SI'])
export const MIN = { pitches: 50, swings: 25, bbe: 15, transitions: 20, grid: 30 } as const

export type CountState = 'first' | 'ahead' | 'even' | 'behind' | 'two'
export const COUNT_LABEL: Record<CountState, string> = { first: 'First pitch', ahead: 'Ahead in the count', even: 'Even count', behind: 'Behind in the count', two: 'Two strikes' }
export const COUNT_STATES: CountState[] = ['first', 'ahead', 'even', 'behind', 'two']

/** 0-0 is the first pitch, two strikes is its own state, then ahead (more strikes than balls), behind (more balls than strikes) and even. null when the count is missing. */
export function countState(balls: number | null, strikes: number | null): CountState | null {
  if (balls == null || strikes == null) return null
  if (balls === 0 && strikes === 0) return 'first'
  if (strikes === 2) return 'two'
  return strikes > balls ? 'ahead' : balls > strikes ? 'behind' : 'even'
}

export type PitchProfile = {
  type: string; n: number; usage: number
  velo: number | null; ride: number | null; run: number | null; slot: number | null; spin: number | null; ext: number | null; relX: number | null; relZ: number | null
  swings: number; whiffs: number; whiffPct: number | null; cswPct: number | null
  zonePct: number | null; heartPct: number | null; chasePct: number | null; zoneContactPct: number | null
  bbe: number; xwobaCon: number | null
}

export const GRID = { cols: 12, rows: 12, x0: -1.5, x1: 1.5, z0: 1, z1: 4 } as const
export type Sequencing = {
  /** pitches thrown after another pitch in the same plate appearance, and how many of them repeat the previous type */
  later: number; repeats: number; repeatPct: number | null
  /** previous type -> next type, with counts */
  transitions: Record<string, Record<string, number>>
}
export type LevelProfile = {
  level: Level; pitches: number; throws: 'L' | 'R' | null
  types: PitchProfile[]
  /** share of each type, by count state and by batter side */
  byCount: Record<CountState, { n: number; share: Record<string, number> }>
  byStand: Record<'L' | 'R', { n: number; share: Record<string, number> }>
  fastballWhenAhead: number | null; fastballWhenBehind: number | null
  /** location density (pitches per cell, catcher's view) for every pitch and for each type */
  grid: { all: number[]; byType: Record<string, number[]> }
  sequencing: Sequencing | null
}

const mean = (xs: (number | null | undefined)[]): number | null => { const v = xs.filter((x): x is number => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const ratio = (a: number, b: number, min: number): number | null => (b >= min ? a / b : null)

export function cellOf(x: number, z: number): number | null {
  if (x < GRID.x0 || x >= GRID.x1 || z < GRID.z0 || z >= GRID.z1) return null
  const c = Math.floor(((x - GRID.x0) / (GRID.x1 - GRID.x0)) * GRID.cols), r = Math.floor(((z - GRID.z0) / (GRID.z1 - GRID.z0)) * GRID.rows)
  return r * GRID.cols + c
}

function shareOf(ps: RawPitch[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const p of ps) c[p.pitchType] = (c[p.pitchType] ?? 0) + 1
  const out: Record<string, number> = {}
  for (const [t, n] of Object.entries(c)) out[t] = n / ps.length
  return out
}

export function profileOf(level: Level, pitches: RawPitch[], throws: 'L' | 'R' | null): LevelProfile {
  const total = pitches.length
  const byType = new Map<string, RawPitch[]>()
  for (const p of pitches) { const a = byType.get(p.pitchType); if (a) a.push(p); else byType.set(p.pitchType, [p]) }
  const hbOf = (p: RawPitch) => (p.pfx ? (throws === 'L' ? p.pfx[0] : -p.pfx[0]) * 12 : null)
  const types: PitchProfile[] = [...byType.entries()].sort((a, b) => b[1].length - a[1].length).map(([type, ps]) => {
    const swing = ps.filter(p => p.description != null && SWING.has(p.description))
    const whiffs = swing.filter(p => WHIFF.has(p.description as string)).length
    const csw = ps.filter(p => p.description === 'called_strike' || (p.description != null && WHIFF.has(p.description))).length
    const located = ps.filter(p => p.zone != null)
    const inZone = located.filter(p => Number(p.zone) >= 1 && Number(p.zone) <= 9)
    const ooz = located.filter(p => Number(p.zone) >= 11)
    const swingZ = swing.filter(p => p.zone != null && Number(p.zone) >= 1 && Number(p.zone) <= 9)
    const bbe = ps.filter(p => p.description === 'hit_into_play' && p.xwoba != null)
    return {
      type, n: ps.length, usage: total ? ps.length / total : 0,
      velo: mean(ps.map(p => p.velo)), ride: mean(ps.map(p => (p.pfx ? p.pfx[1] * 12 : null))), run: mean(ps.map(hbOf)), slot: mean(ps.map(p => p.armAngle)),
      spin: mean(ps.map(p => p.spinRate)), ext: mean(ps.map(p => p.extension)), relX: mean(ps.map(p => p.releasePosX)), relZ: mean(ps.map(p => p.releasePosZ)),
      swings: swing.length, whiffs, whiffPct: ratio(whiffs, swing.length, MIN.swings), cswPct: ratio(csw, ps.length, MIN.pitches),
      zonePct: ratio(inZone.length, located.length, MIN.pitches), heartPct: ratio(located.filter(p => Number(p.zone) === 5).length, located.length, MIN.pitches),
      chasePct: ratio(ooz.filter(p => p.description != null && SWING.has(p.description)).length, ooz.length, MIN.swings), zoneContactPct: ratio(swingZ.filter(p => !WHIFF.has(p.description as string)).length, swingZ.length, MIN.swings),
      bbe: bbe.length, xwobaCon: bbe.length >= MIN.bbe ? (mean(bbe.map(p => p.xwoba)) as number) : null,
    }
  })

  const byCount = Object.fromEntries(COUNT_STATES.map(s => [s, { n: 0, share: {} as Record<string, number> }])) as LevelProfile['byCount']
  for (const s of COUNT_STATES) {
    const ps = pitches.filter(p => countState(p.balls, p.strikes) === s)
    byCount[s] = { n: ps.length, share: ps.length >= MIN.pitches ? shareOf(ps) : {} }
  }
  const byStand = { L: { n: 0, share: {} as Record<string, number> }, R: { n: 0, share: {} as Record<string, number> } }
  for (const h of ['L', 'R'] as const) { const ps = pitches.filter(p => p.stand === h); byStand[h] = { n: ps.length, share: ps.length >= MIN.pitches ? shareOf(ps) : {} } }
  const fbRate = (state: CountState) => { const ps = pitches.filter(p => countState(p.balls, p.strikes) === state); return ps.length >= MIN.pitches ? ps.filter(p => FASTBALLS.has(p.pitchType)).length / ps.length : null }

  const all = new Array(GRID.cols * GRID.rows).fill(0) as number[]
  const gridByType: Record<string, number[]> = {}
  for (const p of pitches) {
    const c = cellOf(p.plateX, p.plateZ)
    if (c == null) continue
    all[c]++
    ;(gridByType[p.pitchType] ??= new Array(GRID.cols * GRID.rows).fill(0))[c]++
  }

  // sequencing: needs thrown order
  let sequencing: Sequencing | null = null
  const ordered = pitches.filter(p => p.gamePk != null && p.atBatNumber != null && p.pitchNumber != null)
  if (ordered.length >= MIN.pitches && ordered.length >= total * 0.9) {
    ordered.sort((a, b) => (a.gamePk as number) - (b.gamePk as number) || (a.atBatNumber as number) - (b.atBatNumber as number) || (a.pitchNumber as number) - (b.pitchNumber as number))
    const transitions: Record<string, Record<string, number>> = {}
    let later = 0, repeats = 0
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1], b = ordered[i]
      if (a.gamePk !== b.gamePk || a.atBatNumber !== b.atBatNumber) continue
      later++
      if (a.pitchType === b.pitchType) repeats++
      const row = (transitions[a.pitchType] ??= {})
      row[b.pitchType] = (row[b.pitchType] ?? 0) + 1
    }
    sequencing = { later, repeats, repeatPct: ratio(repeats, later, MIN.transitions), transitions }
  }

  return { level, pitches: total, throws, types, byCount, byStand, fastballWhenAhead: fbRate('ahead'), fastballWhenBehind: fbRate('behind'), grid: { all, byType: gridByType }, sequencing }
}

/** For one pitch type, the share of thrown pitches that follow another type next (a row of the transition matrix as shares), or null under the minimum. */
export function nextShares(seq: Sequencing | null, prev: string): { n: number; share: Record<string, number> } | null {
  const row = seq?.transitions[prev]
  if (!row) return null
  const n = Object.values(row).reduce((a, b) => a + b, 0)
  if (n < MIN.transitions) return null
  return { n, share: Object.fromEntries(Object.entries(row).map(([t, c]) => [t, c / n])) }
}
