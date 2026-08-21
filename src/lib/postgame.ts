// src/lib/postgame.ts
//
// Data layer for the Post-Game Report. Pulls the full play-by-play from the
// MLB Stats API live feed (same family of endpoint as the rest of the app —
// statsapi.mlb.com, free/undocumented but stable) and derives everything
// the Post-Game Report needs: inning-by-inning pitch counts, top-performer
// leaderboards (EV / launch angle / spin / velocity), the most impactful
// at-bat, pitcher usage, and per-batter/per-game spray + zone data.
//
// IMPORTANT — data source notes:
// - EV, launch angle, distance, hardness come from `hitData` on the play
//   event that ended the at-bat (ball in play). Present whenever Statcast
//   tracked the game (all parks since ~2020).
// - Pitch velocity comes from `pitchData.startSpeed`.
// - Spin rate comes from `pitchData.breaks.spinRate`. This is populated for
//   the large majority of games but is occasionally null for a handful of
//   pitches — those are filtered out of the spin leaderboard rather than
//   defaulting to 0.
// - "Most impactful AB" uses a heuristic leverage score (see
//   computeImpactScore below), NOT a true win-probability-added (WPA) model.
//   A real WPA model needs a run-expectancy-by-base/out matrix; flagging
//   this so it's not read as more precise than it is. Good candidate for a
//   v2 upgrade if you want it.

const MLB_API = 'https://statsapi.mlb.com/api/v1.1'

// ─── Raw MLB API shapes (only the fields we use) ───────────────────────
interface RawPitchData {
  startSpeed?: number
  endSpeed?: number
  zone?: number
  strikeZoneTop?: number
  strikeZoneBottom?: number
  breaks?: { spinRate?: number; breakAngle?: number; breakLength?: number }
  coordinates?: { pX?: number; pZ?: number }
}
interface RawHitData {
  launchSpeed?: number
  launchAngle?: number
  totalDistance?: number
  trajectory?: string
  hardness?: string
  coordinates?: { coordX?: number; coordY?: number }
}
interface RawPlayEvent {
  isPitch?: boolean
  pitchNumber?: number
  details?: { call?: { code?: string; description?: string }; description?: string; type?: { code?: string; description?: string } }
  pitchData?: RawPitchData
  hitData?: RawHitData
  count?: { balls?: number; strikes?: number; outs?: number }
}
interface RawRunnerMovement {
  start: string | null   // e.g. '1B' | '2B' | '3B' | null (null = batter's box or already home)
  end: string | null     // base reached, or null if out/scored
  isOut: boolean
}
interface RawRunner {
  movement: RawRunnerMovement
  details: { runner: { id: number; fullName: string } }
}
interface RawPlay {
  about: { atBatIndex: number; halfInning: 'top' | 'bottom'; inning: number; isComplete: boolean; isScoringPlay: boolean }
  result: { type: string; event?: string; eventType?: string; description?: string; rbi?: number; awayScore?: number; homeScore?: number }
  matchup: {
    batter: { id: number; fullName: string }
    pitcher: { id: number; fullName: string }
    batSide?: { code: string }
    pitchHand?: { code: string }
  }
  playEvents: RawPlayEvent[]
  runners?: RawRunner[]
}

// ── Base-state reconstruction ────────────────────────────────────────
// ⚠ ASSUMPTION, NOT FULLY VERIFIED: built from a single sample play
// (a batter pop-out with no other runners on base, so start/end were
// both null in that case — nothing to confirm the '1B'/'2B'/'3B' string
// format against). If base icons render wrong on a play you know had a
// runner advance, that's this assumption being off — flag it and paste
// a play with actual runner movement (e.g. a stolen base or a single
// with a runner on 2nd) so the real string format can be confirmed.
export type BaseState = { first: boolean; second: boolean; third: boolean }

function computeBaseStateTimeline(plays: RawPlay[]): Map<number, BaseState> {
  const beforeState = new Map<number, BaseState>()
  const occupied: Record<'1B' | '2B' | '3B', number | null> = { '1B': null, '2B': null, '3B': null }

  for (const play of plays) {
    // Snapshot BEFORE this play's runners move — this is "who was on
    // base when this at-bat started."
    beforeState.set(play.about.atBatIndex, {
      first: occupied['1B'] != null,
      second: occupied['2B'] != null,
      third: occupied['3B'] != null,
    })

    for (const r of play.runners ?? []) {
      const { start, end } = r.movement
      if (start === '1B' || start === '2B' || start === '3B') occupied[start] = null
      if (end === '1B' || end === '2B' || end === '3B') occupied[end] = r.details.runner.id
    }
  }

  return beforeState
}
interface RawLiveFeed {
  gameData: {
    teams: { away: { id: number; abbreviation: string }; home: { id: number; abbreviation: string } }
    venue?: { name?: string }
    weather?: { condition?: string; temp?: string; wind?: string }
    datetime?: { dateTime?: string; time?: string; ampm?: string }
  }
  liveData: {
    plays: { allPlays: RawPlay[] }
    boxscore?: {
      info?: { label?: string; value?: string }[]
      officials?: { official?: { id?: number; fullName?: string }; officialType?: string }[]
      teams?: {
        away?: { players?: Record<string, { person?: { id?: number; fullName?: string }; battingOrder?: string }> }
        home?: { players?: Record<string, { person?: { id?: number; fullName?: string }; battingOrder?: string }> }
      }
    }
  }
}

// ─── Public types consumed by components ───────────────────────────────
export type InningPitchCount = {
  inning: number
  awayPitches: number
  homePitches: number
}

export type TopPerformerEntry = {
  playerId: number
  playerName: string
  teamAbbr: string
  value: number
  displayValue: string // pre-formatted, e.g. "108.4 mph"
  context: string // e.g. "3rd inning, off Wheeler"
}

export type TopPerformersBoardData = {
  fastestExitVelo: TopPerformerEntry[]   // full sorted list — component slices for "top 5" / "show all"
  highestSpinRate: TopPerformerEntry[]
  bestLaunchAngle: TopPerformerEntry[]
  slowestPitch: TopPerformerEntry[]
  fastestPitch: TopPerformerEntry[]
  hardestHitBall: TopPerformerEntry[]
  longestHit: TopPerformerEntry[]
}

export type ImpactfulAtBat = {
  atBatIndex: number
  inning: number
  half: 'top' | 'bottom'
  batterName: string
  pitcherName: string
  description: string
  rbi: number
  scoreAfter: { away: number; home: number }
  impactScore: number
}

export type PitcherUsageEntry = {
  playerId: number
  playerName: string
  teamAbbr: string
  battersFaced: number
  pitchCount: number
  inningsAppeared: number[] // e.g. [1,2,3]
}

export type BatterZonePitch = {
  zone: number | null
  pX: number | null
  pZ: number | null
  outcome: string // 'ball' | 'called_strike' | 'swinging_strike' | 'foul' | 'in_play_out' | 'in_play_hit'
}

export type BatterGameZones = {
  playerId: number
  playerName: string
  teamAbbr: string
  pitches: BatterZonePitch[]
}

export type SprayHit = {
  playerId: number
  playerName: string
  teamAbbr: string
  coordX: number
  coordY: number
  outcome: string
  launchSpeed: number | null
  inning: number
}

export type GameInfo = {
  venue: string | null
  weatherCondition: string | null
  tempF: number | null
  wind: string | null
  startTime: string | null // formatted local time, e.g. "7:08 PM"
  durationMinutes: number | null
  endTime: string | null // derived: startTime + durationMinutes
  attendance: number | null
}

// ─── Win probability ──────────────────────────────────────────────────
// APPROXIMATION, not an official/licensed win-probability model. Uses a
// normal-distribution approximation: given the current run differential
// and how much of the game remains, what's the probability the home team
// finishes ahead? Standard deviation of final-score differential scales
// with the square root of innings remaining (variance is additive across
// independent innings), calibrated to a league-average ~3.4-run single
// game standard deviation. A small home-field-advantage offset (~2%) is
// baked in. This will track real win probability directional swings
// correctly (walk-off homers spike it, boring innings flatten it) but
// treat the exact percentages as illustrative, not authoritative.
export type WinProbabilityPoint = {
  atBatIndex: number
  inning: number
  half: 'top' | 'bottom'
  awayScore: number
  homeScore: number
  homeWinProb: number // 0-1
  description: string
}

// ─── Umpire report ─────────────────────────────────────────────────────
// Missed-call detection compares each take (ball/called-strike) to the
// batter-specific strike zone MLB's own tracking already computed for
// that pitch (pitchData.strikeZoneTop/Bottom + the plate's real width) —
// the same approach sites like Umpire Scorecard use. Zone half-width uses
// 0.83ft (17in plate + a ball's radius, the conventional umpire-accuracy
// convention) rather than the bare 0.71ft plate half-width, since the
// rulebook zone that's actually enforced blurs slightly at the edges.
//
// ABS CHALLENGE DATA: 2026 introduced the real Automated Ball-Strike
// challenge system, and in principle actual challenge outcomes (who
// challenged, overturned or not) would be a better source than inferring
// missed calls ourselves. I looked for a `reviewDetails`-style field on
// playEvents for this, but I don't have a confirmed, verified field name
// for how ABS challenges surface on this specific live-feed endpoint —
// it's a very new addition and I don't want to guess at a schema and
// have it silently fail. challengeEvents below is wired up to read
// `details.reviewDetails` IF present (the pre-existing replay-review
// field this may well reuse), but treat it as best-effort: if it comes
// back empty on a game you know had a challenge, that's a sign the real
// field name differs and I'll need you to paste a raw playEvents entry
// from a challenged pitch so I can fix the mapping.
export type MissedCall = {
  inning: number
  half: 'top' | 'bottom'
  batterName: string
  pitcherName: string
  call: 'ball' | 'called_strike'
  distanceInches: number // how far outside (if called strike) or inside (if called ball) the zone, in inches
  pX: number // horizontal pitch location, feet from center of plate
  pZ: number // vertical pitch location, feet off the ground
}

export type ChallengeEvent = {
  inning: number
  batterName: string
  pitcherName: string
  challengingTeam: string | null
  overturned: boolean | null
  description: string | null
  pX: number | null   // plate coordinates, for plotting on a strike-zone box
  pZ: number | null
}

export type UmpireReport = {
  officials: { role: string; name: string }[]
  missedCalls: MissedCall[] // top 15 by distance, for the written list
  missedCallsChartData: MissedCall[] // ALL missed calls (uncapped), for the scatter chart
  totalTakes: number // every ball/called-strike pitch that had trackable location data
  totalMissed: number // full missed-call count, before the top-15 slice above
  accuracyPct: number // 0-100, (totalTakes - totalMissed) / totalTakes
  challengeEvents: ChallengeEvent[] // best-effort, see note above — may be empty even in games with real challenges
}

// ─── Manager decisions ──────────────────────────────────────────────────
export type PinchHitResult = {
  playerName: string
  battingOrderSlot: number
  inning: number
  description: string
  impact: 'positive' | 'negative' | 'neutral'
  basesState: BaseState
}
export type PitchingDecisionResult = {
  pitcherName: string
  inning: number
  enteredLead: number // our team's lead when they entered
  outcome: 'held' | 'blown'
  description: string
  impact: 'positive' | 'negative'
  basesState: BaseState
}

export type TeamManagerDecisions = {
  teamAbbr: string
  managerName: string | null // best-effort — see note in computeManagerDecisions
  pinchHitResults: PinchHitResult[]
  pitchingDecisions: PitchingDecisionResult[]
}

export type ManagerDecisions = {
  away: TeamManagerDecisions
  home: TeamManagerDecisions
}

export type PatientBatterEntry = TopPerformerEntry // reused shape: value = total pitches seen this game

export type LongestAtBat = {
  atBatIndex: number
  inning: number
  half: 'top' | 'bottom'
  batterName: string
  pitcherName: string
  pitchCount: number
  outcome: string
}

export type PlateDiscipline = {
  mostPatientBatters: PatientBatterEntry[] // top 5 by total pitches seen this game
  longestAtBat: LongestAtBat | null
}

export type PostGameReport = {
  gamePk: number
  awayAbbr: string
  homeAbbr: string
  inningPitchCounts: InningPitchCount[]
  topPerformers: TopPerformersBoardData
  mostImpactfulAB: ImpactfulAtBat | null
  pitcherUsage: PitcherUsageEntry[]
  batterZones: BatterGameZones[]
  sprayHits: SprayHit[]
  gameInfo: GameInfo
  winProbability: WinProbabilityPoint[]
  umpireReport: UmpireReport
  managerDecisions: ManagerDecisions
  plateDiscipline: PlateDiscipline
}

// ─── Helpers ─────────────────────────────────────────────────────────
function outcomeFromEvent(ev: RawPlayEvent): string {
  const callCode = ev.details?.call?.code
  const typeCode = ev.details?.type?.code
  if (callCode === 'B') return 'ball'
  if (callCode === 'C') return 'called_strike'
  if (callCode === 'S' || typeCode === 'S') return 'swinging_strike'
  if (callCode === 'F') return 'foul'
  if (ev.hitData) return 'in_play'
  return 'other'
}

function top<T>(arr: T[], key: (t: T) => number, n: number): T[] {
  return [...arr].sort((a, b) => key(b) - key(a)).slice(0, n)
}

function formatTrajectory(traj: string | undefined): string {
  // MLB's raw trajectory values are snake_case ("fly_ball", "line_drive") — display-format them.
  if (!traj) return ''
  return traj.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Ascending version — smallest key value first (used for "closest to ideal").
function bottom<T>(arr: T[], key: (t: T) => number, n: number): T[] {
  return [...arr].sort((a, b) => key(a) - key(b)).slice(0, n)
}

// Heuristic leverage score for "most impactful AB" — not true WPA.
// Weights: RBI count, how late the inning is, how many outs were on
// (fewer outs when the AB started = more runners likely on = higher
// leverage), and whether it was a scoring play at all.
function computeImpactScore(play: RawPlay, outsBeforeAB: number): number {
  const rbi = play.result.rbi ?? 0
  const inningLateness = Math.min(play.about.inning, 9) / 9 // 0.11 .. 1.0
  const outsFactor = (3 - Math.min(outsBeforeAB, 2)) / 3 // fewer outs -> higher
  const scoringBonus = play.about.isScoringPlay ? 1.5 : 1
  return (rbi + 0.5) * inningLateness * (1 + outsFactor) * scoringBonus
}

// ─── Game info: weather, start/end time, attendance ────────────────
// NOTE ON DATA SOURCE: attendance and game duration aren't in a single
// clean top-level field on this endpoint — they typically show up in
// `liveData.boxscore.info` as an array of {label, value} pairs (e.g.
// {label: "Attendance", value: "42,731"}, {label: "T", value: "3:15"}).
// This label-matching approach is a bit defensive/best-effort since I
// haven't been able to verify the exact label strings against your live
// data — if any of these come back null on a real game, check the raw
// `liveData.boxscore.info` array in that response and let me know the
// actual label text so I can tighten the match.
function findInfoValue(info: { label?: string; value?: string }[], labelSubstring: string): string | null {
  const match = info.find(i => i.label?.toLowerCase().includes(labelSubstring.toLowerCase()))
  return match?.value ?? null
}

function parseAttendance(raw: string | null): number | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

function parseDurationMinutes(raw: string | null): number | null {
  // Expects something like "3:15" (hours:minutes)
  if (!raw) return null
  const match = raw.match(/(\d+):(\d+)/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function addMinutes(isoOrTime: string | null, minutes: number | null): string | null {
  if (!isoOrTime || minutes == null) return null
  const d = new Date(isoOrTime)
  if (isNaN(d.getTime())) return null
  d.setMinutes(d.getMinutes() + minutes)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

function parseGameInfo(data: RawLiveFeed): GameInfo {
  const boxInfo = data.liveData.boxscore?.info ?? []
  const weatherRaw = findInfoValue(boxInfo, 'weather')
  const windRaw = findInfoValue(boxInfo, 'wind')
  const attendanceRaw = findInfoValue(boxInfo, 'attendance')
  const durationRaw = findInfoValue(boxInfo, 'T:') ?? findInfoValue(boxInfo, 'time of game') ?? findInfoValue(boxInfo, 'game time')

  // weather.condition/temp from gameData.weather when present (more
  // structured than parsing the boxscore info string), fall back to the
  // boxscore info string otherwise.
  const tempF = data.gameData.weather?.temp ? Number(data.gameData.weather.temp) : null
  const weatherCondition = data.gameData.weather?.condition ?? (weatherRaw ? weatherRaw.replace(/\d+\s*degrees?,?\s*/i, '').trim() : null)
  const wind = data.gameData.weather?.wind ?? windRaw

  const startIso = data.gameData.datetime?.dateTime ?? null
  const startTime = startIso
    ? new Date(startIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    : null

  const durationMinutes = parseDurationMinutes(durationRaw)
  const endTime = addMinutes(startIso, durationMinutes)

  return {
    venue: data.gameData.venue?.name ?? null,
    weatherCondition,
    tempF: tempF && !isNaN(tempF) ? tempF : null,
    wind,
    startTime,
    durationMinutes,
    endTime,
    attendance: parseAttendance(attendanceRaw),
  }
}

// ─── Win probability ──────────────────────────────────────────────────
// Standard normal CDF via the Abramowitz-Stegun approximation — good to
// ~7 decimal places, plenty for this use.
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  if (z > 0) p = 1 - p
  return p
}

const FULL_GAME_RUN_STDDEV = 3.4 // approx league-average single-game final-score-differential std dev
const HOME_FIELD_EDGE = 0.02 // small constant home-field win-prob offset

function computeWinProbability(plays: RawPlay[]): WinProbabilityPoint[] {
  const points: WinProbabilityPoint[] = []
  let awayScore = 0
  let homeScore = 0
  const totalOuts = 54 // 9 innings x 3 outs x 2 halves, extended below for extra innings

  for (const play of plays) {
    if (!play.about.isComplete) continue
    awayScore = play.result.awayScore ?? awayScore
    homeScore = play.result.homeScore ?? homeScore

    const halfInningsCompleted = (play.about.inning - 1) * 2 + (play.about.halfInning === 'bottom' ? 1 : 0)
    const gameLengthHalfInnings = Math.max(18, halfInningsCompleted + 1) // extends naturally into extras
    const fractionRemaining = Math.max(0.02, 1 - halfInningsCompleted / gameLengthHalfInnings)

    const sigma = FULL_GAME_RUN_STDDEV * Math.sqrt(fractionRemaining)
    const diff = homeScore - awayScore
    const z = diff / sigma
    const rawWinProb = normalCdf(z)
    const homeWinProb = Math.min(0.99, Math.max(0.01, rawWinProb + HOME_FIELD_EDGE * fractionRemaining))

    points.push({
      atBatIndex: play.about.atBatIndex,
      inning: play.about.inning,
      half: play.about.halfInning,
      awayScore, homeScore,
      homeWinProb: Number(homeWinProb.toFixed(3)),
      description: play.result.description ?? play.result.event ?? '',
    })
  }
  return points
}

// ─── Umpire report ─────────────────────────────────────────────────────
const ZONE_HALF_WIDTH_FT = 0.83 // plate width (17in) + ball radius, conventional umpire-accuracy zone width
const CALL_GRACE_FT = 0.5 / 12 // ~0.5 inch grace on the zone edge before a take counts as a genuine miss —
// pitch-tracking has real measurement noise at this precision, and a pitch "on the line" shouldn't be flagged
// as clearly wrong the way one a foot off the plate should be

function computeUmpireReport(data: RawLiveFeed, plays: RawPlay[]): UmpireReport {
    const awayTeamId = data.gameData.teams.away.id
  const homeTeamId = data.gameData.teams.home.id
  const awayAbbr = data.gameData.teams.away.abbreviation
  const homeAbbr = data.gameData.teams.home.abbreviation
  function resolveTeamAbbr(teamId: number | undefined): string | null {
    if (teamId === awayTeamId) return awayAbbr
    if (teamId === homeTeamId) return homeAbbr
    return null
  }
  const officials = (data.liveData.boxscore?.officials ?? [])
    .filter(o => o.official?.fullName)
    .map(o => ({ role: o.officialType ?? 'Umpire', name: o.official!.fullName! }))

  const missedCallsAll: MissedCall[] = []
  const challengeEvents: ChallengeEvent[] = []
  let totalTakes = 0

  for (const play of plays) {
    for (const ev of play.playEvents) {
      if (!ev.isPitch) continue
      const code = ev.details?.call?.code
      const isBall = code === 'B'
      const isCalledStrike = code === 'C'
      if (!isBall && !isCalledStrike) continue // only judging umpire takes, not swings

      // Count every real take toward the total FIRST — this is an objective
      // count and shouldn't depend on whether we also have zone geometry to
      // grade it. Only the miss-classification below needs the pitch-location
      // data; a take missing that data still counts as a take, just one we
      // can't grade (it's excluded from missed-call detection, not from the total).
      totalTakes += 1
      const pX = ev.pitchData?.coordinates?.pX
      const top = ev.pitchData?.strikeZoneTop
      const bottom = ev.pitchData?.strikeZoneBottom
      const pZ = ev.pitchData?.coordinates?.pZ

      // ABS challenge read — runs independent of our own missed-call
      // geometry classification below. A challenged pitch is by
      // definition borderline, so our clearlyInside/clearlyOutside
      // grace-margin check often won't flag it as "clearly" wrong even
      // when MLB's ABS system did overturn it — nesting this under that
      // classifier (the original placement) silently dropped every real
      // challenge that wasn't ALSO a clear geometric miss by our own math.
      const review = (ev as any).reviewDetails
      if (review) {
        challengeEvents.push({
          inning: play.about.inning,
          batterName: play.matchup.batter.fullName,
          pitcherName: play.matchup.pitcher.fullName,
          challengingTeam: resolveTeamAbbr(review.challengeTeamId),
          overturned: typeof review.isOverturned === 'boolean' ? review.isOverturned : null,
          description: `Challenged by ${review.player?.fullName ?? 'unknown player'} · ${review.reviewType ?? 'review'}`,
          pX: pX ?? null,
          pZ: pZ ?? null,
        })
      }

      if (pX == null || top == null || bottom == null || pZ == null) continue // can't grade this one, but it's already counted above
      // A take only counts as a genuine miss if it's clearly on the wrong side of the zone, not just on the
      // line — pitch-tracking has real measurement noise at this precision, so both checks below give a
      // small grace margin rather than flagging every pixel-perfect edge case.
      const clearlyOutsideZone = Math.abs(pX) > ZONE_HALF_WIDTH_FT + CALL_GRACE_FT || pZ < bottom - CALL_GRACE_FT || pZ > top + CALL_GRACE_FT
      const clearlyInsideZone = Math.abs(pX) <= ZONE_HALF_WIDTH_FT - CALL_GRACE_FT && pZ >= bottom + CALL_GRACE_FT && pZ <= top - CALL_GRACE_FT
      const missedAsStrike = isCalledStrike && clearlyOutsideZone
      const missedAsBall = isBall && clearlyInsideZone
      if (!missedAsStrike && !missedAsBall) continue

      // distance from the nearest zone edge, in inches
      const dx = Math.max(0, Math.abs(pX) - ZONE_HALF_WIDTH_FT)
      const dz = pZ < bottom ? bottom - pZ : pZ > top ? pZ - top : 0
      const distanceFt = Math.max(dx, dz)

           missedCallsAll.push({
        inning: play.about.inning,
        half: play.about.halfInning,
        batterName: play.matchup.batter.fullName,
        pitcherName: play.matchup.pitcher.fullName,
        call: isCalledStrike ? 'called_strike' : 'ball',
        distanceInches: Number((distanceFt * 12).toFixed(1)),
        pX, pZ,
      })
    } // closes: for (const ev of play.playEvents)
  } // closes: for (const play of plays)

  const sorted = [...missedCallsAll].sort((a, b) => b.distanceInches - a.distanceInches)
  const accuracyPct = totalTakes > 0 ? Number((((totalTakes - missedCallsAll.length) / totalTakes) * 100).toFixed(1)) : 0

  return {
    officials,
    missedCalls: sorted.slice(0, 15),
    missedCallsChartData: missedCallsAll,
    totalTakes,
    totalMissed: missedCallsAll.length,
    accuracyPct,
    challengeEvents,
  }
}

// ─── Manager decisions ──────────────────────────────────────────────────
function classifyPinchHitImpact(pa: RawPlay): 'positive' | 'negative' | 'neutral' {
  const eventType = pa.result.eventType ?? ''
  const hasRBI = (pa.result.rbi ?? 0) > 0
  const isHitOrWalk = ['single', 'double', 'triple', 'home_run', 'walk', 'hit_by_pitch'].includes(eventType)
  if (isHitOrWalk || hasRBI) return 'positive'
  const isBadOut = ['strikeout', 'strikeout_double_play', 'grounded_into_double_play', 'triple_play', 'field_error'].includes(eventType)
  if (isBadOut) return 'negative'
  return 'neutral' // routine out, no runners impacted either way
}

function computeManagerDecisions(data: RawLiveFeed, plays: RawPlay[], awayAbbr: string, homeAbbr: string): ManagerDecisions {
  const baseStateByAtBat = computeBaseStateTimeline(plays)
  const emptyBases: BaseState = { first: false, second: false, third: false }

  function buildForSide(side: 'away' | 'home'): TeamManagerDecisions {
    const teamAbbr = side === 'away' ? awayAbbr : homeAbbr
    const pinchHitResults: PinchHitResult[] = []

    // Manager name — BEST EFFORT. I don't have a verified field for this on
    // the live feed; some historical API shapes expose it at
    // gameData.teams.{side}.manager, but I haven't confirmed that against
    // your actual response. If this comes back null, check the raw
    // gameData.teams object for the real field and tell me — easy fix once
    // I know the actual shape.
    const managerName = (data.gameData.teams as any)?.[side]?.manager?.fullName ?? null

    const players = data.liveData.boxscore?.teams?.[side]?.players ?? {}
    for (const key of Object.keys(players)) {
      const p = players[key]
      const orderRaw = p.battingOrder
      const playerId = p.person?.id
      if (!orderRaw || !playerId) continue
      const orderNum = Number(orderRaw)
      const isSubstitute = orderNum % 100 !== 0 // e.g. "301" = 1st sub into slot 3; "300" = the starter
      if (!isSubstitute) continue

      const firstPA = plays.find(pl => pl.matchup.batter.id === playerId && pl.about.isComplete)
      if (!firstPA) continue

      pinchHitResults.push({
        playerName: p.person?.fullName ?? `Player ${playerId}`,
        battingOrderSlot: Math.floor(orderNum / 100),
        inning: firstPA.about.inning,
        description: firstPA.result.description ?? firstPA.result.event ?? '',
        impact: classifyPinchHitImpact(firstPA),
        basesState: baseStateByAtBat.get(firstPA.about.atBatIndex) ?? emptyBases,
      })
    }

    return { teamAbbr, managerName, pinchHitResults, pitchingDecisions: [] }
  }

  const away = buildForSide('away')
  const home = buildForSide('home')

  // Pitching decisions: reuse the same lead-tracking approach as the
  // season-long bullpen module (lib/bullpen-usage.ts), scoped to just
  // this one game. "Held" = entered with a lead and left with it intact
  // or better; "blown" = entered with a lead and left tied or behind.
  const stintByPitcherInning = new Map<string, { pitcherName: string; inning: number; entered: number; current: number; lastPlay: RawPlay; pitchingIsHome: boolean }>()
  let prevAway = 0
  let prevHome = 0

  for (const play of plays) {
    if (!play.about.isComplete) { continue }
    const awayScore = play.result.awayScore ?? prevAway
    const homeScore = play.result.homeScore ?? prevHome
    prevAway = awayScore
    prevHome = homeScore

    // whichever team is PITCHING this half-inning is who "our lead" is measured for
    const pitchingIsHomeTeam = play.about.halfInning === 'top'
    const lead = pitchingIsHomeTeam ? (homeScore - awayScore) : (awayScore - homeScore)

    const key = `${play.matchup.pitcher.id}:${play.about.inning}:${play.about.halfInning}`
    if (!stintByPitcherInning.has(key)) {
      stintByPitcherInning.set(key, { pitcherName: play.matchup.pitcher.fullName, inning: play.about.inning, entered: lead, current: lead, lastPlay: play, pitchingIsHome: pitchingIsHomeTeam })
    } else {
      const stint = stintByPitcherInning.get(key)!
      stint.current = lead
      stint.lastPlay = play
    }
  }

  for (const stint of stintByPitcherInning.values()) {
    if (stint.entered <= 0) continue // only judging pitchers who entered protecting a lead
    const blown = stint.current <= 0
    const target = stint.pitchingIsHome ? home : away
    target.pitchingDecisions.push({
      pitcherName: stint.pitcherName,
      inning: stint.inning,
      enteredLead: stint.entered,
      outcome: blown ? 'blown' : 'held',
      description: stint.lastPlay.result.description ?? '',
      impact: blown ? 'negative' : 'positive',
      basesState: baseStateByAtBat.get(stint.lastPlay.about.atBatIndex) ?? emptyBases,
    })
  }

  return { away, home }
}

// ─── Main fetch + compute ───────────────────────────────────────────────
export async function getPostGameReport(gamePk: number): Promise<PostGameReport> {
  const res = await fetch(`${MLB_API}/game/${gamePk}/feed/live`, { next: { revalidate: 300 } })
  if (!res.ok) throw new Error(`Failed to fetch live feed for game ${gamePk}: ${res.status}`)
  const data: RawLiveFeed = await res.json()

  const awayAbbr = data.gameData.teams.away.abbreviation
  const homeAbbr = data.gameData.teams.home.abbreviation
  const plays = data.liveData.plays.allPlays

  // ── Inning-by-inning pitch counts ──
  const inningMap = new Map<number, { away: number; home: number }>()
  for (const play of plays) {
    const inn = play.about.inning
    if (!inningMap.has(inn)) inningMap.set(inn, { away: 0, home: 0 })
    const bucket = inningMap.get(inn)!
    const pitchCount = play.playEvents.filter(e => e.isPitch).length
    // top half = away team batting = home pitcher throwing; bottom = away pitching
    if (play.about.halfInning === 'top') bucket.home += pitchCount
    else bucket.away += pitchCount
  }
  const inningPitchCounts: InningPitchCount[] = [...inningMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([inning, { away, home }]) => ({ inning, awayPitches: home, homePitches: away }))
  // NOTE: awayPitches above = pitches thrown BY the away pitcher (i.e. while
  // home team bats), matching the "who's on the mound" framing used
  // elsewhere in the app (see ScoutReportTab pitcher-name conventions).
  // If you want it framed as "pitches seen by each team's batters" instead,
  // swap the away/home assignment above — flag it and I'll flip it.

  // ── Leaderboards ──
  const evEntries: TopPerformerEntry[] = []
  const spinEntries: TopPerformerEntry[] = []
  const launchEntries: TopPerformerEntry[] = []
  const slowPitchEntries: TopPerformerEntry[] = []
  const fastPitchEntries: TopPerformerEntry[] = []
  const hardHitEntries: TopPerformerEntry[] = []
  const longestHitEntries: TopPerformerEntry[] = []
  // ── Pitcher usage ──
  const usageMap = new Map<number, PitcherUsageEntry>()

  // ── Batter zones (pitches seen, for heatmaps) ──
  const zonesMap = new Map<number, BatterGameZones>()

  // ── Spray hits ──
  const sprayHits: SprayHit[] = []

  // ── Impact tracking ──
  let bestImpact: ImpactfulAtBat | null = null
  let longestAtBat: LongestAtBat | null = null
  const outsRunning = { count: 0 }

  for (const play of plays) {
    const { batter, pitcher } = play.matchup
    const battingTeamAbbr = play.about.halfInning === 'top' ? awayAbbr : homeAbbr
    const pitchingTeamAbbr = play.about.halfInning === 'top' ? homeAbbr : awayAbbr

    const outsBeforeAB = outsRunning.count % 3

    // longest at-bat by pitch count — each `play` here IS one full at-bat
    const pitchesInThisAB = play.playEvents.filter(e => e.isPitch).length
    if (!longestAtBat || pitchesInThisAB > longestAtBat.pitchCount) {
      longestAtBat = {
        atBatIndex: play.about.atBatIndex,
        inning: play.about.inning,
        half: play.about.halfInning,
        batterName: batter.fullName,
        pitcherName: pitcher.fullName,
        pitchCount: pitchesInThisAB,
        outcome: play.result.description ?? play.result.event ?? '',
      }
    }

    // pitcher usage
    if (!usageMap.has(pitcher.id)) {
      usageMap.set(pitcher.id, {
        playerId: pitcher.id, playerName: pitcher.fullName, teamAbbr: pitchingTeamAbbr,
        battersFaced: 0, pitchCount: 0, inningsAppeared: [],
      })
    }
    const usage = usageMap.get(pitcher.id)!
    usage.battersFaced += 1
    if (!usage.inningsAppeared.includes(play.about.inning)) usage.inningsAppeared.push(play.about.inning)

    // batter zones
    if (!zonesMap.has(batter.id)) {
      zonesMap.set(batter.id, { playerId: batter.id, playerName: batter.fullName, teamAbbr: battingTeamAbbr, pitches: [] })
    }
    const zoneBucket = zonesMap.get(batter.id)!

    for (const ev of play.playEvents) {
      if (!ev.isPitch) continue
      usage.pitchCount += 1
      const outcome = outcomeFromEvent(ev)
      zoneBucket.pitches.push({
        zone: ev.pitchData?.zone ?? null,
        pX: ev.pitchData?.coordinates?.pX ?? null,
        pZ: ev.pitchData?.coordinates?.pZ ?? null,
        outcome,
      })

      const speed = ev.pitchData?.startSpeed
      if (typeof speed === 'number') {
        const entry: TopPerformerEntry = {
          playerId: pitcher.id, playerName: pitcher.fullName, teamAbbr: pitchingTeamAbbr,
          value: speed, displayValue: `${speed.toFixed(1)} mph`,
          context: `${play.about.inning}${play.about.halfInning === 'top' ? '▲' : '▼'} vs ${batter.fullName}`,
        }
        slowPitchEntries.push(entry)
        fastPitchEntries.push(entry)
      }
      const spin = ev.pitchData?.breaks?.spinRate
      if (typeof spin === 'number') {
        spinEntries.push({
          playerId: pitcher.id, playerName: pitcher.fullName, teamAbbr: pitchingTeamAbbr,
          value: spin, displayValue: `${Math.round(spin)} rpm`,
          context: `${play.about.inning}${play.about.halfInning === 'top' ? '▲' : '▼'} vs ${batter.fullName}`,
        })
      }

      const hit = ev.hitData
      if (hit) {
        if (typeof hit.launchSpeed === 'number') {
          evEntries.push({
            playerId: batter.id, playerName: batter.fullName, teamAbbr: battingTeamAbbr,
            value: hit.launchSpeed, displayValue: `${hit.launchSpeed.toFixed(1)} mph`,
            context: `${play.about.inning}${play.about.halfInning === 'top' ? '▲' : '▼'} off ${pitcher.fullName}`,
          })
          hardHitEntries.push({
            playerId: batter.id, playerName: batter.fullName, teamAbbr: battingTeamAbbr,
            value: hit.launchSpeed, displayValue: `${hit.launchSpeed.toFixed(1)} mph · ${formatTrajectory(hit.trajectory)}`,
            context: play.result.event ?? '',
          })
        }
        if (typeof hit.totalDistance === 'number' && hit.totalDistance > 0) {
          longestHitEntries.push({
            playerId: batter.id, playerName: batter.fullName, teamAbbr: battingTeamAbbr,
            value: hit.totalDistance, displayValue: `${Math.round(hit.totalDistance)} ft`,
            context: `${formatTrajectory(hit.trajectory)} · ${play.result.event ?? ''}`,
          })
        }
        if (typeof hit.launchAngle === 'number') {
          launchEntries.push({
            playerId: batter.id, playerName: batter.fullName, teamAbbr: battingTeamAbbr,
            value: hit.launchAngle, displayValue: `${hit.launchAngle.toFixed(0)}°`,
            context: play.result.event ?? '',
          })
        }
        if (hit.coordinates?.coordX != null && hit.coordinates?.coordY != null) {
          sprayHits.push({
            playerId: batter.id, playerName: batter.fullName, teamAbbr: battingTeamAbbr,
            coordX: hit.coordinates.coordX, coordY: hit.coordinates.coordY,
            outcome: play.result.event ?? outcome, launchSpeed: hit.launchSpeed ?? null,
            inning: play.about.inning,
          })
        }
      }
    }

    // most impactful AB (only once the play is complete / has a result)
    if (play.about.isComplete) {
      const score = computeImpactScore(play, outsBeforeAB)
      if (!bestImpact || score > bestImpact.impactScore) {
        bestImpact = {
          atBatIndex: play.about.atBatIndex,
          inning: play.about.inning,
          half: play.about.halfInning,
          batterName: batter.fullName,
          pitcherName: pitcher.fullName,
          description: play.result.description ?? play.result.event ?? '',
          rbi: play.result.rbi ?? 0,
          scoreAfter: { away: play.result.awayScore ?? 0, home: play.result.homeScore ?? 0 },
          impactScore: score,
        }
      }
      // advance running out count using last recorded outs on the play
      const lastOuts = play.playEvents[play.playEvents.length - 1]?.count?.outs
      if (typeof lastOuts === 'number') outsRunning.count = lastOuts
    }
  }

  // No cap here anymore — return the FULL sorted list, the component
  // decides how many to show (top 5 default, expand for all). top()/
  // bottom() with a length equal to the array's own length just sorts.
  const topPerformers: TopPerformersBoardData = {
    fastestExitVelo: top(evEntries, e => e.value, evEntries.length),
    highestSpinRate: top(spinEntries, e => e.value, spinEntries.length),
    bestLaunchAngle: bottom(launchEntries, e => Math.abs(e.value - 27), launchEntries.length),
    slowestPitch: top(slowPitchEntries, e => -e.value, slowPitchEntries.length),
    fastestPitch: top(fastPitchEntries, e => e.value, fastPitchEntries.length),
    hardestHitBall: top(hardHitEntries, e => e.value, hardHitEntries.length),
    longestHit: top(longestHitEntries, e => e.value, longestHitEntries.length),
  }

  const mostPatientBatters: PatientBatterEntry[] = top(
    [...zonesMap.values()],
    b => b.pitches.length,
    5,
  ).map(b => ({
    playerId: b.playerId,
    playerName: b.playerName,
    teamAbbr: b.teamAbbr,
    value: b.pitches.length,
    displayValue: `${b.pitches.length} pitches`,
    context: `${b.teamAbbr} · this game`,
  }))

  return {
    gamePk,
    awayAbbr,
    homeAbbr,
    inningPitchCounts,
    topPerformers,
    mostImpactfulAB: bestImpact,
    pitcherUsage: [...usageMap.values()],
    batterZones: [...zonesMap.values()],
    sprayHits,
    gameInfo: parseGameInfo(data),
    winProbability: computeWinProbability(plays),
    umpireReport: computeUmpireReport(data, plays),
    managerDecisions: computeManagerDecisions(data, plays, awayAbbr, homeAbbr),
    plateDiscipline: { mostPatientBatters, longestAtBat },
  }
}