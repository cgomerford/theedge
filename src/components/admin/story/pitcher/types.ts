// src/components/admin/story/pitcher/types.ts
//
// Normalized shape of the 9:16 Pitcher Reel. loadPitcherReel() (server action)
// assembles it from the finished game's live feed + box score, Savant arm angle,
// the season tables and the schedule; every segment renders from this only.
// Anything unavailable is null / [] and the segment drops out: no fabricated data.

export type ReelSegmentId =
  | 'pr-game' | 'pr-arsenal' | 'pr-counts' | 'pr-arm' | 'pr-hits' | 'pr-tto' | 'pr-season' | 'pr-next' | 'pr-close'

export const REEL_SEGMENT_LIST: { id: ReelSegmentId; label: string; blurb: string; pinned?: 'first' | 'last' }[] = [
  { id: 'pr-game', label: 'Game & box score', blurb: 'final score, IP / H / R / ER / BB / K, pitches', pinned: 'first' },
  { id: 'pr-arsenal', label: 'Arsenal', blurb: 'every pitch and the % thrown, bars filling in' },
  { id: 'pr-counts', label: 'Pitches by count', blurb: 'every pitch landing in a mini strike zone for each count', },
  { id: 'pr-arm', label: 'Arm angle', blurb: 'the arm slot as a sweeping graphic, by pitch type' },
  { id: 'pr-hits', label: 'Hits allowed', blurb: 'each hit landing on the field, animated' },
  { id: 'pr-tto', label: 'Through the order', blurb: '1st / 2nd / 3rd time through: AVG, K, BB' },
  { id: 'pr-season', label: 'vs season line', blurb: 'this start against his season numbers' },
  { id: 'pr-next', label: 'Next start', blurb: 'announced start, or earliest turn on normal rest' },
  { id: 'pr-close', label: 'Close', blurb: 'end card', pinned: 'last' },
]

export type ReelPitch = {
  code: string
  name: string
  color: string
  count: number
  usagePct: number
  avgVelo: number | null
  maxVelo: number | null
  whiffPct: number | null
  /** season usage % from pitch_arsenals; null when the pitcher has no season row for this pitch */
  seasonUsagePct: number | null
  seasonVelo: number | null
}

/** One pitch, located in feet in catcher's view with the zone normalised to a fixed 0..1.83 ft height. */
export type ReelPitchDot = { code: string; color: string; x: number; z: number; balls: number; strikes: number }

export type ReelHit = {
  /** position in the 1000-unit diamond space (diamondGeo.ts), already clamped inside it */
  x: number
  y: number
  kind: '1B' | '2B' | '3B' | 'HR'
  inning: number
  batter: string
  exitVelo: number | null
}

export type ReelTto = { label: string; pa: number; ab: number; h: number; k: number; bb: number; avg: number | null; seasonAvg: number | null }

export type ReelSeasonRow = { label: string; game: number | null; season: number | null; decimals: number; lowerBetter: boolean }

export type ReelNext = {
  kind: 'announced' | 'earliest'
  date: string          // YYYY-MM-DD
  oppAbbr: string
  home: boolean
}

export type PitcherReelData = {
  gamePk: number
  slateDate: string
  dateLabel: string
  pitcher: { id: number; name: string; short: string; throws: 'L' | 'R' | null }
  team: { abbr: string; color: string }
  opp: { abbr: string; color: string }
  home: boolean
  score: { team: number; opp: number }
  decision: 'W' | 'L' | 'S' | null
  line: { ip: string; h: number; r: number; er: number; bb: number; k: number; hr: number; pitches: number; strikes: number; bf: number }
  arsenal: ReelPitch[]
  arm: { overall: number | null; byType: { code: string; name: string; deg: number; count: number; color: string }[]; source: 'this-game' | 'season' | 'none' } | null
  pitchDots: ReelPitchDot[]
  hits: ReelHit[]
  tto: ReelTto[]
  season: ReelSeasonRow[]
  next: ReelNext | null
  /** short human note when a section's data was missing, shown in the picker (never on the video) */
  notes: string[]
}
