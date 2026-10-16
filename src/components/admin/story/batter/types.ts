// src/components/admin/story/batter/types.ts
//
// Normalized shape of the 9:16 Batter Reel (one hitter, one finished game). Assembled by
// loadBatterReel() from the live feed + box score only. Missing data is null / [].

export type BatterSegmentId = 'br-game' | 'br-pas' | 'br-spray' | 'br-contact' | 'br-zone' | 'br-close'

export const BATTER_SEGMENT_LIST: { id: BatterSegmentId; label: string; blurb: string; pinned?: 'first' | 'last' }[] = [
  { id: 'br-game', label: 'Game & box line', blurb: 'score, H-AB, R, RBI, HR, BB, K, season slash line', pinned: 'first' },
  { id: 'br-pas', label: 'Every plate appearance', blurb: 'who he faced, what happened, pitches seen' },
  { id: 'br-spray', label: 'Spray chart', blurb: 'every ball in play landing on the field, animated' },
  { id: 'br-contact', label: 'Contact quality', blurb: 'exit velo, launch angle, distance on each ball in play' },
  { id: 'br-zone', label: 'Pitches seen', blurb: 'every pitch he saw in the zone, by what he did with it' },
  { id: 'br-close', label: 'Close', blurb: 'end card', pinned: 'last' },
]

export type BrHitKind = '1B' | '2B' | '3B' | 'HR'
export type BrPa = { inning: number; half: 'top' | 'bottom'; pitcher: string; result: string; hit: boolean; pitches: number; count: string | null }
export type BrBall = { x: number; y: number; kind: BrHitKind | 'OUT'; label: string; ev: number | null; la: number | null; dist: number | null; inning: number }
export type BrCall = 'whiff' | 'called' | 'ball' | 'foul' | 'inplay'
export type BrPitch = { x: number; z: number; call: BrCall }

export type BatterReelData = {
  gamePk: number
  slateDate: string
  dateLabel: string
  batter: { id: number; name: string; short: string; pos: string }
  team: { abbr: string; color: string }
  opp: { abbr: string; color: string }
  home: boolean
  score: { team: number; opp: number }
  line: { pa: number; ab: number; h: number; r: number; rbi: number; hr: number; bb: number; k: number; doubles: number; triples: number; sb: number; pitches: number }
  season: { avg: string | null; obp: string | null; ops: string | null } | null
  pas: BrPa[]
  balls: BrBall[]
  contact: { inPlay: number; hardest: number | null; avgEv: number | null; hardHit: number; longest: number | null } | null
  pitchesSeen: BrPitch[]
  notes: string[]
}
