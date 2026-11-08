// src/lib/milb-shape/capability.ts
//
// What a level and season can show, worked out from the importer's own counts (pitch_shape_milb_runs.summary). Pure and shared: the importer stores the result, the
// server returns it, the client reads it. The rule is one sentence: a measurement is available when at least 90% of the usable pitches carry it, and an unavailable
// one is "pending" in the interface, never zero and never filled from MLB.
//
//   velo / ride / run  need release speed and the two movement fields (the same pitches the map uses, so these are available whenever the level has any data)
//   armAngle           Savant's arm_angle column. Observed only; the live feed has none and it is never estimated from release position.
//   contact            xwOBA on contact and ground-ball rate need estimated_woba_using_speedangle and bb_type on balls in play
// There is no extension axis in the Lab's sandbox (extension appears only in the explanations), so none is reported here.

import type { Level } from './levels'
import type { Summary } from './aggregate'

export const AXIS_MIN_SHARE = 0.9

export type Capabilities = {
  level: Level
  season: number
  /** 'full' every chunk fetched; 'partial' a gap was reported; 'none' nothing loaded for this level and season */
  coverage: 'full' | 'partial' | 'none'
  pitches: number
  usable: number
  firstDate: string | null
  lastDate: string | null
  fetchedAt: string | null
  axes: { velo: boolean; ride: boolean; run: boolean; armAngle: boolean }
  armAngleShare: number | null
  outcomes: { swings: boolean; whiffs: boolean; contact: boolean }
  /** per pitch type: usable pitches and whether enough carry an arm angle for the four-axis cohort */
  types: Record<string, { pitches: number; armAngle: boolean }>
  /** why a measurement is pending, in words, for the interface */
  pending: { armAngle: string | null; contact: string | null }
  note: string
}

export const NO_CAPS = (level: Level, season: number): Capabilities => ({
  level, season, coverage: 'none', pitches: 0, usable: 0, firstDate: null, lastDate: null, fetchedAt: null,
  axes: { velo: false, ride: false, run: false, armAngle: false }, armAngleShare: null, outcomes: { swings: false, whiffs: false, contact: false }, types: {},
  pending: { armAngle: 'No data loaded for this level yet.', contact: 'No data loaded for this level yet.' }, note: 'No data loaded for this level and season yet.',
})

export const MLB_CAPS = (season: number): Capabilities => ({
  level: 'mlb', season, coverage: 'full', pitches: 0, usable: 0, firstDate: null, lastDate: null, fetchedAt: null,
  axes: { velo: true, ride: true, run: true, armAngle: true }, armAngleShare: null, outcomes: { swings: true, whiffs: true, contact: true }, types: {},
  pending: { armAngle: null, contact: null }, note: 'Major-league pitches, 2024 on.',
})

const share = (have: number, of: number) => (of > 0 ? have / of : 0)

export function capabilitiesFrom(level: Exclude<Level, 'mlb'>, season: number, s: Summary, complete: boolean, firstDate: string | null, lastDate: string | null, fetchedAt: string | null): Capabilities {
  const usable = s.usable
  if (usable === 0) return { ...NO_CAPS(level, season), fetchedAt }
  const slotShare = share(s.withSlot, usable)
  const armAngle = slotShare >= AXIS_MIN_SHARE
  const tracked = Math.max(0, s.rows - s.nulls.release_speed) > 0
  const bbe = s.bbe
  const contactShare = bbe > 0 ? 1 - Math.max(s.bbeNulls.estimated_woba_using_speedangle, s.bbeNulls.bb_type) / bbe : 0
  const contact = bbe >= 100 && contactShare >= 0.5
  const types: Capabilities['types'] = {}
  for (const [t, v] of Object.entries(s.perType)) types[t] = { pitches: v.pitches, armAngle: share(v.withSlot, v.pitches) >= AXIS_MIN_SHARE }
  return {
    level, season, coverage: complete ? 'full' : 'partial', pitches: s.rows, usable, firstDate, lastDate, fetchedAt,
    axes: { velo: tracked, ride: tracked, run: tracked, armAngle }, armAngleShare: slotShare,
    outcomes: { swings: true, whiffs: true, contact },
    types,
    pending: {
      armAngle: armAngle ? null : `Arm angle is on ${(slotShare * 100).toFixed(0)}% of this level's pitches, below the ${AXIS_MIN_SHARE * 100}% needed, so it is pending.`,
      contact: contact ? null : 'Too few balls in play with contact-quality data at this level yet.',
    },
    note: complete ? 'Every day in the season range was loaded.' : 'Some days could not be loaded in full; these numbers reflect only the days that were loaded.',
  }
}
