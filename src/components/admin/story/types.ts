// src/components/admin/story/types.ts
//
// Normalized shapes for the 9:16 admin story. buildStory() turns the loosely
// typed GameWithReport (the scout bundle) into a StoryGame once; every
// segment renders from StoryGame only, so segments never touch raw bundle data.

export type SegmentId =
  | 'hook' | 'part-hook' | 'sp' | 'sp-arsenal' | 'sp-tto' | 'lineup-away' | 'lineup-home'
  | 'bullpen-avail' | 'late' | 'run-game' | 'abs' | 'club-status'
  | 'defense-away' | 'defense-home' | 'streaks' | 'form' | 'close'

/** A slide of either the Game Preview story or the Pitcher Reel; both play through the same timeline/player. */
export type AnySegmentId = SegmentId | ReelSegmentId | PostgameSegmentId | BatterSegmentId

/** Every picker slide in canonical order. Hook/close are pinned; `defaultOn` is the starting selection. */
export const SEGMENT_LIST: { id: SegmentId; label: string; blurb: string; defaultOn: boolean; pinned?: 'first' | 'last' }[] = [
  { id: 'hook', label: 'Hook', blurb: 'matchup headline + one scout note', defaultOn: true, pinned: 'first' },
  { id: 'sp', label: 'Probable pitchers', blurb: 'ERA, FIP, WHIP, K/9, BB/9, K–BB, last 3 starts', defaultOn: true },
  { id: 'sp-arsenal', label: 'SP arsenals', blurb: "each starter's pitch mix: usage, velocity, whiff %, hard-hit %", defaultOn: false },
  { id: 'sp-tto', label: 'The order flips', blurb: 'wOBA and AVG allowed, 1st vs 2nd vs 3rd time', defaultOn: false },
  { id: 'lineup-away', label: 'Away batting order', blurb: 'batting order with AVG / OPS / RBI', defaultOn: false },
  { id: 'lineup-home', label: 'Home batting order', blurb: 'batting order with AVG / OPS / RBI', defaultOn: false },
  { id: 'bullpen-avail', label: "Who's available", blurb: 'each reliever, last 4 days: pitches, back-to-back and rested flags', defaultOn: true },
  { id: 'late', label: 'Late & close', blurb: 'late-and-close, RISP and 7th+ OPS, one-run record', defaultOn: false },
  { id: 'run-game', label: 'Behind the plate', blurb: 'catcher framing, blocking, throwing, pop time; the run game', defaultOn: false },
  { id: 'abs', label: 'ABS', blurb: 'ABS challenges: overturn rate, who challenges, where the pitches were', defaultOn: false },
  { id: 'club-status', label: 'Who is out', blurb: 'who is out or questionable, recent moves', defaultOn: false },
  { id: 'defense-away', label: 'Away defense (OAA)', blurb: 'alignment diamond with Outs Above Average', defaultOn: true },
  { id: 'defense-home', label: 'Home defense (OAA)', blurb: 'alignment diamond with Outs Above Average', defaultOn: true },
  { id: 'streaks', label: 'Streak watch', blurb: 'longest on-base, hit and scoreless streaks', defaultOn: true },
  { id: 'form', label: 'Form', blurb: 'heating up / cooling off, last 15 games', defaultOn: true },
  { id: 'close', label: 'Close', blurb: 'end card with the report link', defaultOn: true, pinned: 'last' },
]
export const DEFAULT_ON: SegmentId[] = SEGMENT_LIST.filter(s => s.defaultOn).map(s => s.id)

/** The game as the story sees it: the scout bundle without any lean / prediction fields. */
export type StoryInputGame = Omit<GameWithReport, 'lean_team' | 'factor_count' | 'dominant_factor' | 'near_split'>

import type { ReelSegmentId } from './pitcher/types'
import type { PostgameSegmentId } from './postgame/types'
import type { BatterSegmentId } from './batter/types'
import type { GameWithReport } from '@/components/admin/AllGamesStorySlideshow'
import type { PenTeam } from './bullpenModel'

export type Segment = {
  id: AnySegmentId
  /** Seconds, INCLUDING the 250ms push that brings the segment in. */
  duration: number
  /** Fraction of `duration` spent building; the rest is a still hold. */
  buildFrac: number
}

export type Side = 'away' | 'home'

export type StoryTeam = {
  abbr: string
  name: string
  nickname: string
  color: string
}

export type SpStats = {
  era: number | null
  fip: number | null
  whip: number | null
  k9: number | null
  bb9: number | null
  kbb9: number | null      // K/9 − BB/9, derived
  l3Era: number | null
}

export type StorySp = {
  id: number | null
  name: string          // full name, or 'TBD'
  short: string         // "F. Lastname"
  stats: SpStats | null
}

export type BullpenArm = { id: number; name: string; short: string; pitches: number }
export type BullpenTeam = {
  abbr: string
  color: string
  arms: BullpenArm[]          // up to 5, heaviest first
  total: number               // pitches across ALL relievers in the window (for the hook)
  rested: string[]            // shortNames of zero-pitch relievers, up to 4
  restedMore: number          // how many more beyond `rested`
}
export type StoryBullpen = {
  dateRange: string           // "Oct 4–6"
  away: BullpenTeam | null
  home: BullpenTeam | null
}

export type Fielder = {
  position: string
  playerId: number | null
  name: string
  short: string
  oaa: number | null
}
export type StoryDefense = {
  team: StoryTeam
  fielders: Fielder[]         // exactly 8, in POSITION_ORDER; empty spots have name ''
  teamOaa: number | null
  teamRank: number | null
  teamOf: number
  footer: string
}

export type StreakKind = 'on_base' | 'hit' | 'scoreless'
export type SeasonRow = { avg: number | null; slg: number | null; ops: number | null; rbi: number | null }
export type StreakCard = {
  playerId: number
  name: string
  short: string
  position: string
  team: StoryTeam
  kind: StreakKind
  n: number                   // games, or innings for scoreless
  label: string               // "On base in 12 straight"
  season: SeasonRow | null
}

export type FormMetric = 'ops' | 'avg' | 'slg'
export type FormRow = {
  player_id: number
  player_name: string
  signal: 'heating' | 'cooling'
  signal_quality?: 'validated' | 'trending'
  metric?: string
  current_value: number
  extreme_value: number
  magnitude: number
  recentGameLog?: number[]
  games?: number
}
export type FormPick = {
  playerId: number
  name: string
  short: string
  team: StoryTeam
  signal: 'heating' | 'cooling'
  quality: 'validated' | 'trending'
  metric: FormMetric
  metricLabel: string         // "Rolling 15-game OPS"
  current: number
  extreme: number
  games: number | null
  trend: number[]             // last 8 rolling windows
  sentence: string
}

export type HookNote = { text: string; rule: 'p' | 'a' | 'b' | 'c' | 'd' }

// ── Optional scout-desk data (server action → compact, display-ready) ──────
export type StripLine = { label: string; unit: string; value: number; rank: number | null; of: number; median: number; betterLow: boolean; decimals: number }
export type PctBar = { value: number; rank: number; of: number; pct: number }
export type CatcherBars = {
  framing: PctBar | null; blocking: PctBar | null; throwing: PctBar | null; pop: PctBar | null
  inn: number | null
  thru: string | null            // 'YYYY-MM-DD' of player_fielding_run_value.updated_at
  stale: boolean                 // older than 7 days before the slate
  abs: { n: number; w: number; pct: number; rank: number | null; of: number } | null
}
export type RunCard = {
  offense: string; defense: string
  catcher: { id: number; name: string; short: string; attempts: number; strips: StripLine[]; sb: number; cs: number; bars?: CatcherBars | null } | null
  pitcher: { short: string; sb: number; cs: number; pickoffs: number } | null
  attemptsPerGame: number | null; leagueAttemptsPerGame: number
  successPct: number | null; leagueSuccessPct: number
  rank: number; of: number
  runners: { short: string; sprint: number | null; sb: number; cs: number }[]
}
export type ZonePt = { x: number; z: number; ov: boolean }      // x inches from plate centre; z 0 = zone bottom, 1 = zone top
export type AbsCard = {
  abbr: string; games: number; challenges: number; overturns: number
  overturnPct: number | null; leagueOverturnPct: number | null
  perGame: number | null; leaguePerGame: number | null
  split: { batter: number; catcher: number; pitcher: number }
  top: { short: string; w: number; l: number; side: 'batting' | 'fielding' }[]
  zone: ZonePt[]
  zoneH: number                  // median rule-book zone height, inches
  regN: number                   // regular-season challenges counted
  postN: number                  // rows after the regular season, not counted
}
export type ClubLine = { short: string; pos: string; reason: string }
export type ClubCard = {
  abbr: string; out: ClubLine[]; outMore: number; questionable: ClubLine[]; questionableMore: number
  moves: string[]
}
export type SplitStat = { label: string; pa: number; ops: number | null; avg: number | null }
export type InningDiff = { label: string; scored: number; allowed: number; diff: number }
export type LateCard = {
  abbr: string
  hitting: SplitStat[]                 // late & close, RISP, 7th+
  oneRun: { w: number; l: number } | null
  innings: InningDiff[]                // run differential in the 7th, 8th, 9th (regular season, schedule linescores)
  games: number                        // regular-season games behind the innings
}
export type DefDeskCard = {
  abbr: string; oaa: number | null; rank: number | null; of: number
  /** every lineup fielder's OAA by player id (null OAA omitted) */
  oaaById: Record<number, number>
  best: { short: string; pos: string; oaa: number }[]
  worst: { short: string; pos: string; oaa: number }[]
}
export type Pitch = { name: string; code: string; usagePct: number | null; velo: number | null; whiffPct: number | null; hardHitPct: number | null; putAwayPct: number | null; n: number }
/** A pitch in the arsenal slide: the stats row plus where it lands (usage share per zone 1–9, catcher's view). */
export type PitchProfile = Pitch & { color: string; zones: number[] | null }
export type Pair<T> = { away: T | null; home: T | null }
export type ScoutExtras = {
  series?: SeriesState | null
  arsenal: Pair<Pitch[]>
  run: Pair<RunCard>; abs: Pair<AbsCard>; club: Pair<ClubCard>; late: Pair<LateCard>; defdesk: Pair<DefDeskCard>
}
export type SpTto = { label: string; away: number | null; home: number | null; awayAvg: number | null; homeAvg: number | null; awayPa: number | null; homePa: number | null }
export type LineupRow = { order: number; short: string; name: string; id: number; pos: string; avg: number | null; ops: number | null; rbi: number | null }

/** Which postseason series this game belongs to (null for the regular season). */
export type SeriesInfo = { label: string; game: number; of: number }
/** Series score from the schedule's seriesStatus (loaded with the desk data). */
export type SeriesState = { leaderId: number | null; wins: number; losses: number; tied: boolean; over: boolean }

export type StoryExtras = {
  series?: SeriesInfo | null
  ids?: { gamePk: number; awayTeamId: number; homeTeamId: number; awayPitcherId: number | null; homePitcherId: number | null } | null
  slug: string | null
  venueName: string
  firstPitch: string
  lineupsConfirmed: boolean
}

export type StoryGame = {
  gamePk: number
  slateDate: string
  dateLabel: string           // "Oct 7"
  away: StoryTeam
  home: StoryTeam
  venue: string
  firstPitch: string
  slug: string | null
  seasonLabel: string
  spLabel: string
  lineupsConfirmed: boolean
  sp: { away: StorySp; home: StorySp }
  bullpen: StoryBullpen | null
  defense: { away: StoryDefense | null; home: StoryDefense | null }
  streakPool: StreakCard[]    // everything that qualifies (hook reads this)
  streaks: StreakCard[]       // top 3 by length
  form: FormPick[]
  formTitle: string | null
  hook: HookNote
  series: SeriesInfo | null
  seriesState: SeriesState | null
  tto: SpTto[]
  arsenal: { away: PitchProfile[] | null; home: PitchProfile[] | null }
  ttoOk: { away: boolean; home: boolean }
  penGrid: { away: PenTeam | null; home: PenTeam | null } | null
  lineups: { away: LineupRow[]; home: LineupRow[] }
  scout: ScoutExtras | null
}
