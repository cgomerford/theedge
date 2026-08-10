// src/types/postgame.ts
//
// Data model for the postgame report feature. This is the shape produced by
// `aggregateGameFeed()` (src/lib/postgame-aggregate.ts) from the raw MLB
// Stats API live feed (GUMBO), and consumed by:
//   - <PostgameReport /> on the game page, once a game is Final
//   - the postgame email template
//   - <LiveSuperlatives /> during a live game (a subset — see LiveSuperlatives)
//
// Everything here is derived from public MLB Stats API fields. No Edge Score,
// no model grading — this is boxscore-and-pitch-log territory, safe to be
// fully public.

export type PitchCall =
  | 'B' | '*B' // ball / ball in dirt
  | 'C'        // called strike
  | 'S'        // swinging strike
  | 'F'        // foul
  | 'L'        // foul bunt
  | 'T'        // foul tip
  | 'X' | 'D' | 'E' // in play (out / no-out / run-scoring — MLB uses several in-play codes)


  export interface AtBatSummary {
  atBatIndex: number
  inning: number
  halfInning: 'top' | 'bottom'
  pitcherId: number
  pitcherName: string
  batterId: number
  batterName: string
  eventType: string
  resultDescription: string
  isScoringPlay: boolean
}

export interface WinProbabilityPoint {
  atBatIndex: number
  inning: number
  halfInning: 'top' | 'bottom'
  homeWinPct: number   // 0-100
  awayWinPct: number   // 0-100
}
export interface PitchRecord {
  atBatIndex: number
  pitchNumber: number
  inning: number
  halfInning: 'top' | 'bottom'
  pitcherId: number
  pitcherName: string
  batterId: number
  batterName: string
  typeCode: string | null          // e.g. 'SI', 'FF', 'ST', 'CH'
  typeDescription: string | null   // e.g. 'Sinker'
  callCode: string | null
  callDescription: string | null
  startSpeed: number | null
  endSpeed: number | null
  spinRate: number | null
  breakLength: number | null           // total physical break, inches
  breakVerticalInduced: number | null  // induced vertical break ("rise"), inches
  breakHorizontal: number | null
  zone: number | null              // MLB zone code, 1-9 in zone / 11-14 out of zone
  plateX: number | null            // pX — horizontal plate location, feet
  plateZ: number | null            // pZ — vertical plate location, feet
  strikeZoneTop: number | null
  strikeZoneBottom: number | null
  isStrike: boolean
  isBall: boolean
  isInPlay: boolean
  /** The count AS OF AFTER this pitch — this is what MLB's feed actually
   *  reports (verified against the sample data: a 3-pitch strikeout's
   *  final pitch carries strikes:3, the terminal value). It already
   *  correctly does NOT advance past 2 strikes for a foul ball — that's
   *  real baseball rules, not something this code needs to enforce.
   *  Never re-derive a count by summing isStrike flags across pitches in
   *  a plate appearance — foul balls after strike two are still flagged
   *  isStrike:true (they ARE strikes, just non-advancing ones), so a naive
   *  sum overcounts. Always read this field, or finalCountOfPlay() below. */
  countAfter: { balls: number; strikes: number }
}

/** The correct final count for a plate appearance — the countAfter of its
 *  last pitch. Use this instead of counting isStrike flags. */
export function finalCountOfPlay(pitches: PitchRecord[]): { balls: number; strikes: number } | null {
  if (pitches.length === 0) return null
  return pitches[pitches.length - 1].countAfter
}

export interface BattedBallRecord {
  atBatIndex: number
  inning: number
  halfInning: 'top' | 'bottom'
  batterId: number
  batterName: string
  pitcherId: number
  pitcherName: string
  battingTeamId: number
  launchSpeed: number | null
  launchAngle: number | null
  totalDistance: number | null
  trajectory: string | null   // 'line_drive' | 'fly_ball' | 'ground_ball' | 'popup'
  hardness: string | null
  coordX: number | null       // Savant-style spray coordinates
  coordY: number | null
  zone: number | null         // the pitch zone that produced this batted ball
  resultEvent: string | null  // 'single' | 'double' | 'home_run' | 'field_out' | ...
}

export interface ZoneCell {
  zone: number              // rulebook zone 1-9, arranged catcher's-eye-view
  pitches: number
  whiffs: number
  whiffPct: number | null
  battedBalls: number
  hits: number
  hitPct: number | null
}

export interface SwingMissProfile {
  totalPitches: number
  swings: number
  whiffs: number
  swStrPct: number              // whiffs / totalPitches — "swinging strike %"
  chaseSwings: number           // swings on pitches outside the zone
  chasePitches: number          // total pitches outside the zone
  chaseRatePct: number | null
  bestWhiffPitch: { typeDescription: string; whiffPct: number; count: number } | null
}

export interface PitchTypeSplit {
  typeCode: string
  typeDescription: string
  count: number
  usagePct: number
  avgVelo: number | null
  maxVelo: number | null
  avgSpin: number | null
  avgInducedBreak: number | null
  swings: number
  whiffs: number
  whiffPct: number | null
  zonePct: number | null   // % of pitches with zone 1-9 (in the rulebook zone)
}

export interface InningVeloPoint {
  inning: number
  typeCode: string
  avgVelo: number
}

export interface PitcherGameLine {
  pitcherId: number
  pitcherName: string
  teamId: number
  outsRecorded: number          // divide by 3 for IP, remainder is the ".1"/".2"
  battersFaced: number
  pitchesThrown: number
  strikesThrown: number
  strikeouts: number
  walks: number
  hitsAllowed: number
  runsAllowed: number
  earnedRunsAllowed: number
  arsenal: PitchTypeSplit[]
  velocityTrend: InningVeloPoint[]
  swingMiss: SwingMissProfile
  hotZones: ZoneCell[]           // 9 cells, zone 1-9
  /**
   * Not computed automatically — win/loss/save logic needs game-level
   * relief-appearance context this aggregator doesn't attempt to resolve.
   * Set manually in /admin if you want it surfaced, otherwise leave null
   * and the UI omits the decision badge.
   */
  decision: 'W' | 'L' | 'S' | 'H' | 'BS' | null
}

export interface BatterGameLine {
  batterId: number
  batterName: string
  teamId: number
  plateAppearances: number
  atBats: number
  hits: number
  doubles: number
  triples: number
  homeRuns: number
  walks: number
  strikeouts: number
  runsScored: number
  rbi: number
  stolenBases: number
  pitchesSeen: number
  pitchesPerPA: number | null
}

export interface KeyPlay {
  atBatIndex: number
  inning: number
  halfInning: 'top' | 'bottom'
  description: string
  captivatingIndex: number
  isScoringPlay: boolean
  awayScore: number
  homeScore: number
}

export interface GameSuperlatives {
  fastestPitch: {
    pitcherId: number; pitcherName: string; speed: number
    typeDescription: string; inning: number
  } | null
  mostBreak: {
    pitcherId: number; pitcherName: string; breakLength: number
    typeDescription: string; inning: number
  } | null
  highestSpin: {
    pitcherId: number; pitcherName: string; spinRate: number
    typeDescription: string; inning: number
  } | null
  hardestHit: {
    batterId: number; batterName: string; exitVelo: number
    resultEvent: string; inning: number
  } | null
  longestHit: {
    batterId: number; batterName: string; distance: number
    resultEvent: string; inning: number
  } | null
  slowestPitch: {
    pitcherId: number; pitcherName: string; speed: number
    typeDescription: string; inning: number
  } | null
  mostPatientBatter: {
    batterId: number; batterName: string; pitchesSeen: number; plateAppearances: number
  } | null
longestAtBat: {
    batterId: number; batterName: string; pitcherId: number; pitcherName: string; pitches: number
    inning: number; resultDescription: string
  } | null
  biggestInning: {
    inning: number; halfInning: 'top' | 'bottom'; teamAbbreviation: string; runs: number
  } | null
}

export interface KeyPitch {
  atBatIndex: number
  pitchNumber: number
  inning: number
  pitcherName: string
  batterName: string
  typeDescription: string
  velo: number | null
  breakLength: number | null
  countAfter: { balls: number; strikes: number }
  callDescription: string | null
  reason: 'putaway' | 'fastest' | 'sharpest-break' | 'scoring-play'
  resultDescription: string   // the play's own result.description, for context
}

export interface BattedBallMix {
  teamId: number
  ballsInPlay: number
  groundBallPct: number
  flyBallPct: number
  lineDrivePct: number
  popUpPct: number
  hardHitPct: number   // share with launchSpeed >= 95mph
}

/**
 * Radar-chart-friendly reshaping of the box score — 0-100 scaled for a
 * single game, NOT a rating or grade. Every axis is a literal counting
 * stat (XBH, BB, K, hard-hit%, SB) rescaled only so five very different
 * units fit on one chart.
 *
 * FLAG FOR REVIEW: a 5-axis radar next to team names can visually read
 * like a scouting/rating chart even though nothing here is a model output.
 * Worth a quick gut-check against the "no score, just factors" rule before
 * this ships publicly — if it feels too close to that line, swap the axes
 * back to raw counting stats (H, BB, K, XBH, SB) with no 0-100 rescaling
 * and it stops looking like a rating.
 */
export interface TeamGameProfile {
  teamId: number
  power: number
  discipline: number
  contact: number
  hardContact: number
  speed: number
}

export interface TeamSummary {
  teamId: number
  name: string
  abbreviation: string
}

export interface LinescoreRow {
  teamId: number
  abbreviation: string
  runsByInning: (number | null)[]  // null = inning not played (e.g. home team last inning)
  runs: number
  hits: number
  errors: number
}

// MODIFY the PostgameReport interface — add these two fields:

export interface PostgameReport {
  gamePk: number
  gameDate: string
  slug: string
  gameNumber: number
  away: TeamSummary
  home: TeamSummary
  finalAwayScore: number
  finalHomeScore: number
  linescore: LinescoreRow[]
  pitchers: PitcherGameLine[]
  batters: { away: BatterGameLine[]; home: BatterGameLine[] }
  keyPlays: KeyPlay[]
  superlatives: GameSuperlatives
  pitchLog: PitchRecord[]
  atBats: AtBatSummary[]                    // NEW — every plate appearance, for the Illustrator
  battedBalls: BattedBallRecord[]
  keyPitches: KeyPitch[]
  battedBallMix: { away: BattedBallMix; home: BattedBallMix }
  teamProfiles: { away: TeamGameProfile; home: TeamGameProfile }
  mostImpactfulAtBat: KeyPlay | null
  battingZoneMix: { away: ZoneCell[]; home: ZoneCell[] }
  winProbability: WinProbabilityPoint[]     // NEW — [] if the endpoint is unavailable, never fabricated
  generatedAt: string
}

/** Slimmer payload for the live (in-progress game) superlatives widget —
 *  intentionally excludes the full pitch/batted-ball log so the polling
 *  endpoint stays small. */
export type LiveSuperlativesPayload = GameSuperlatives & {
  gamePk: number
  asOfInning: number
  isFinal: boolean
}

/** One entry in the Game 1 / Game 2 / Game 3 tab strip — used for BOTH a
 *  same-date doubleheader and a multi-date series. `date` is required for
 *  series tabs (each game is a different day, so the slug depends on it);
 *  it's the same date repeated for every entry in a doubleheader. */
export interface GameTabEntry {
  gameNumber: number
  gamePk: number
  slug: string
  date: string
  status: 'Preview' | 'Live' | 'Final'
  label: string   // "Game 1", "Game 2"
}