// src/components/admin/story/postgame/types.ts
//
// Normalized shape of the 9:16 Postgame Reel. loadPostgameReel() assembles it from the
// finished game's live feed + box score only (no DB); every segment renders from this.
// Anything unavailable is null / [] and the slide drops out: no fabricated data.

export type PostgameSegmentId = 'pg-final' | 'pg-flow' | 'pg-plays' | 'pg-hitters' | 'pg-pitching' | 'pg-spray' | 'pg-close'

export const POSTGAME_SEGMENT_LIST: { id: PostgameSegmentId; label: string; blurb: string; pinned?: 'first' | 'last' }[] = [
  { id: 'pg-final', label: 'Final & linescore', blurb: 'score, inning-by-inning runs, W / L / S', pinned: 'first' },
  { id: 'pg-flow', label: 'Game flow', blurb: 'win-probability line, drawn inning by inning' },
  { id: 'pg-plays', label: 'Key plays', blurb: 'the plays that moved the game, with the score after' },
  { id: 'pg-hitters', label: 'Top hitters', blurb: "each club's best bats: line, HR, RBI" },
  { id: 'pg-pitching', label: 'Pitching lines', blurb: 'starters and the decision pitchers' },
  { id: 'pg-spray', label: 'Hits on the field', blurb: 'every hit landing, both clubs, animated' },
  { id: 'pg-close', label: 'Close', blurb: 'end card', pinned: 'last' },
]

export type PgSide = 'away' | 'home'
export type PgTeam = { abbr: string; name: string; color: string; score: number; hits: number; errors: number }
export type PgHitter = { side: PgSide; id: number; name: string; short: string; pos: string; line: string; extras: string }
export type PgPitcher = { side: PgSide; id: number; name: string; ip: string; h: number; er: number; bb: number; k: number; tag: 'W' | 'L' | 'S' | null; starter: boolean }
export type PgPlay = { inning: number; half: 'top' | 'bottom'; text: string; away: number; home: number; scoring: boolean }
export type PgHit = { side: PgSide; kind: '1B' | '2B' | '3B' | 'HR'; x: number; y: number; batter: string; inning: number; exitVelo: number | null }

export type PostgameReelData = {
  gamePk: number
  slateDate: string
  dateLabel: string
  away: PgTeam
  home: PgTeam
  winner: PgSide | null
  /** one row per club in away, home order; runs null = inning not played */
  linescore: { side: PgSide; abbr: string; runs: (number | null)[] }[]
  decisions: { w: string | null; l: string | null; s: string | null }
  /** home win % (0–100) after each plate appearance; [] when the feed has none */
  flow: { inning: number; half: 'top' | 'bottom'; home: number }[]
  plays: PgPlay[]
  hitters: PgHitter[]
  pitching: PgPitcher[]
  hits: PgHit[]
  notes: string[]
}
