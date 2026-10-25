// src/components/admin/story-v5/types.ts
//
// The single typed JSON object every v5 scene reads (buildPreviewData in preview-data.server-fetch-allowed.ts).
// All fields are required: a scene never receives a hole. If a number can't be sourced, buildPreviewData throws PreviewDataError.

import type { P3 } from './trajectory'

export type TeamInfo = { id: number; abbr: string; name: string; nickname: string; primary: string; light: string; logo: string }
export type Side = 'away' | 'home'

export type PitchPath = { points: P3[]; tPlate: number }
export type ArsenalPitch = {
  code: string; name: string; n: number; usagePct: number; velo: number
  whiffPct: number | null; swings: number
  path: PitchPath
}
export type PostseasonLine = { ip: string; er: number; k: number; bb: number; bf: number; bbRatePct: number; label: string }
export type TimesThrough = { first: number; second: number; paFirst: number; paSecond: number }
export type Starter = {
  id: number; name: string; last: string; hand: 'L' | 'R' | null; teamId: number; headshot: string
  /** true when the box score already lists him as the starter (the lineup card is in); false means the schedule's probable pitcher. Absent in data saved before this existed. */
  confirmed?: boolean
  arsenal: ArsenalPitch[]            // at most 4, most used first, each with 20 or more pitches
  line: PostseasonLine
  tto: TimesThrough
}
export type Tunnel = { a: ArsenalPitch; b: ArsenalPitch; withinInchFt: number | null; apartInches: number; pointY: number }

export type HookPitch = {
  speed: number; code: string; pitcherId: number; pitcherName: string; pitcherLast: string; teamId: number; headshot: string
  inning: number; half: 'top' | 'bot'; gameLabel: string; kicker: string; path: PitchPath
}

export type BeatMove = { id: number; name: string; from: number; to: number }     // bases 0 (home) to 3; to 4 = scored, -1 = out
export type Beat = {
  inning: number; half: 'top' | 'bot'; label: string; text: string
  batterId: number | null; batterName: string; batterHeadshot: string | null; battingSide: Side
  throwerId: number | null; throwerName: string | null
  before: { id: number; name: string; base: number }[]
  moves: BeatMove[]
  throwToBase: number | null; caught: boolean
  awayScore: number; homeScore: number; caughtTotal: number
}
export type Storyline = { id: number; name: string; last: string; count: number; of: number; headline: string }

export type Fielder = { pos: string; id: number; name: string; last: string; oaa: number; mainPos: string; offPosition: boolean; headshot: string }
export type DefenseSide = { side: Side; teamId: number; fielders: Fielder[]; teamOaa: number; lineupConfirmed: boolean; footnotes: string[]; headline: string }

export type BullpenArm = { id: number; name: string; last: string; teamId: number; headshot: string; pitches: number; ip: string }
export type BullpenL3Arm = { id: number; name: string; last: string; teamId: number; headshot: string; p3: number; byDate: number[]; lastDate: string | null; daysRest: number | null; likelyUnavailable: boolean }

export type ScoutRun = {
  side: Side; teamId: number; catcher: string; catcherId: number; headshot: string
  pop: number | null; csPct: number | null; csOf: number | null; attemptsPerGame: number | null
  abs: { challenges: number; overturns: number } | null
}
export type ScoutLate = { side: Side; teamId: number; rows: { label: string; ops: number; pa: number }[]; oneRun: { w: number; l: number } | null }
/** Other parts of the Scout Report, for the optional "Scout Report" slide. An empty list means that desk had no data for this game. */
export type ScoutSlides = { run: ScoutRun[]; late: ScoutLate[] }

export type PreviewData = {
  gamePk: number; slateDate: string; generatedAt: string
  venue?: string | null
  teams: { away: TeamInfo; home: TeamInfo }
  series: { label: string; gameNumber: number | null; summary: string | null; footer: string }
  firstPitch: { londonText: string; etText: string; ptText?: string; londonDay: string; iso: string }
  lastGame: { gamePk: number; label: string; awayScore: number; homeScore: number; winner: Side }
  hook: HookPitch
  hookText: { value: string; unit: string; caption: string }
  beats: Beat[]
  storyline: Storyline
  starters: { away: Starter; home: Starter }
  tunnel: { side: Side; data: Tunnel }
  defense: { away: DefenseSide; home: DefenseSide }
  bullpens: {
    lastGame: { away: BullpenArm[]; home: BullpenArm[]; headline: string; closing: string }
    last3: { away: BullpenL3Arm[]; home: BullpenL3Arm[] }
  }
  scout: ScoutSlides
  headlines: { arsenal: string; tunnel: string; defense: string; bullpen: string; replay: string }
}
