// src/lib/postgame-aggregate.ts
//
// Turns a raw GUMBO live feed (src/lib/mlb-live-feed.ts) into the
// PostgameReport shape (src/types/postgame.ts) that <PostgameReport />,
// the email template, and the doubleheader tab strip all consume.
//
// SIMPLIFYING ASSUMPTIONS — flagged here instead of buried in the code,
// same spirit as the ipToOuts() comment in pregame-stats.ts:
//
//  1. Innings pitched: `matchup.pitcher` on a play reflects whoever threw
//     the pitch that ended that at-bat, even if a substitution happened
//     mid-plate-appearance (see the Palmquist→Littell GIDP case — Littell
//     gets the play). Outs are counted per play by summing runner
//     movements with isOut, which correctly handles multi-out plays
//     (double plays, strikeout+caught-stealing) without needing to track
//     a running `count.outs` cursor.
//  2. Runs allowed / earned runs: taken directly from
//     runners[].details.responsiblePitcher + .earned. If the feed doesn't
//     set responsiblePitcher on a run (rare), it isn't charged to anyone
//     rather than guessed.
//  3. Whiff = a swinging-strike call code ('S'). Foul tips ('T') are
//     contact, not a whiff, and are excluded.
//  4. Zone% = pitch zone code 1–9 (the actual rulebook zone). Codes 11–14
//     are the "just outside" zones MLB uses for shadow-zone pitches and
//     are counted as out-of-zone.
//  5. Pitcher decision (W/L/S/H/BS) is NOT computed — that needs
//     game-level relief context this function doesn't have. Leave it null
//     and set manually if you want it surfaced.
//  6. RBI is attributed to the batter of the play via result.rbi. Runs
//     scored are attributed to whichever runner has isScoringEvent true.

import type {
  BatterGameLine,
  BattedBallMix,
  BattedBallRecord,
  GameSuperlatives,
  InningVeloPoint,
  KeyPitch,
  KeyPlay,
  AtBatSummary,        
  LinescoreRow,
  PitchRecord,
  PitchTypeSplit,
  PitcherGameLine,
  PostgameReport,
  SwingMissProfile,
  TeamGameProfile,
  ZoneCell,
} from '@/types/postgame'
import type { GumboFeed, GumboPlay } from '@/lib/mlb-live-feed'

const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const IN_ZONE_CODES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])
const SWING_CALL_CODES = new Set(['S', 'X', 'D', 'E', 'F', 'L'])
const WHIFF_CALL_CODES = new Set(['S'])

// The feed's precomputed `breaks.breakLength` (total movement) is missing
// on a real chunk of live pitches — looks like it lags the vertical/
// horizontal components rather than being absent entirely, since those two
// are populated far more consistently. Rather than let "Most Break" go
// empty whenever breakLength itself is null, derive the same quantity
// (total break is just the hypotenuse of its vertical and horizontal
// components) from whichever of those two IS present. Still a real,
// physics-based number — not a fabricated one — just computed locally
// instead of trusting the feed's own precomputed field.
function resolveBreakLength(breaks: { breakLength?: number; breakVerticalInduced?: number; breakHorizontal?: number } | undefined): number | null {
  if (breaks?.breakLength != null) return breaks.breakLength
  if (breaks?.breakVerticalInduced != null && breaks?.breakHorizontal != null) {
    return Math.round(Math.sqrt(breaks.breakVerticalInduced ** 2 + breaks.breakHorizontal ** 2) * 10) / 10
  }
  return null
}

export function aggregateGameFeed(feed: GumboFeed, slug: string): PostgameReport | null {
  const { gameData, liveData } = feed
  if (!gameData || !liveData?.plays) return null

  const away = {
    teamId: gameData.teams.away.id,
    name: gameData.teams.away.name,
    abbreviation: gameData.teams.away.abbreviation,
  }
  const home = {
    teamId: gameData.teams.home.id,
    name: gameData.teams.home.name,
    abbreviation: gameData.teams.home.abbreviation,
  }

  const plays = liveData.plays.allPlays ?? []
  const scoringPlaySet = new Set(liveData.plays.scoringPlays ?? [])

  const pitchLog: PitchRecord[] = []
  const battedBalls: BattedBallRecord[] = []
  const keyPlays: KeyPlay[] = []
  const keyPitches: KeyPitch[] = []
    const atBats: AtBatSummary[] = []

  // pitcherId -> running line
  const pitcherLines = new Map<number, PitcherGameLine>()
  // pitcherId -> inning -> typeCode -> speeds[]
  const pitcherInningVelo = new Map<number, Map<number, Map<string, number[]>>>()
  // pitcherId -> typeCode -> pitch stat accumulator
  const pitcherArsenal = new Map<number, Map<string, ArsenalAccumulator>>()
  // pitcherId -> zone (1-9) -> accumulator, for hot-zone grids
  const pitcherZoneStats = new Map<number, Map<number, ZoneAccumulator>>()
  // pitcherId -> overall swing/whiff/chase accumulator
  const pitcherSwingMiss = new Map<number, SwingMissAccumulator>()
  // batterId -> pitches seen this game
  const batterPitchCount = new Map<number, number>()
  // batterId -> running line
  const batterLines = new Map<number, { teamId: number; line: BatterGameLine }>()

  let finalAwayScore = 0
  let finalHomeScore = 0

  for (const play of plays) {
    const { result, about, matchup, runners, playEvents } = play

    finalAwayScore = result.awayScore
    finalHomeScore = result.homeScore

    const battingTeamId = about.halfInning === 'top' ? away.teamId : home.teamId
    const pitchingTeamId = about.halfInning === 'top' ? home.teamId : away.teamId
    // ── every at-bat, for the Illustrator (keyPlays only keeps the top 12) ──
    atBats.push({
      atBatIndex: about.atBatIndex,
      inning: about.inning,
      halfInning: about.halfInning,
      pitcherId: matchup.pitcher.id,
      pitcherName: matchup.pitcher.fullName,
      batterId: matchup.batter.id,
      batterName: matchup.batter.fullName,
      eventType: result.eventType,
      resultDescription: result.description,
      isScoringPlay: scoringPlaySet.has(about.atBatIndex) || about.isScoringPlay,
    })

    // ── key plays ──────────────────────────────────────────────────────
    keyPlays.push({
      atBatIndex: about.atBatIndex,
      inning: about.inning,
      halfInning: about.halfInning,
      description: result.description,
      captivatingIndex: about.captivatingIndex ?? 0,
      isScoringPlay: scoringPlaySet.has(about.atBatIndex) || about.isScoringPlay,
      awayScore: result.awayScore,
      homeScore: result.homeScore,
    })

    // ── pitcher line for this play's pitcher ──────────────────────────
    const pLine = getOrCreatePitcherLine(pitcherLines, matchup.pitcher.id, matchup.pitcher.fullName, pitchingTeamId)
    pLine.battersFaced += 1

    const outsThisPlay = runners.reduce((n, r) => n + (r.movement.isOut ? 1 : 0), 0)
    pLine.outsRecorded += outsThisPlay

    if (result.eventType === 'strikeout') pLine.strikeouts += 1
    if (result.eventType === 'walk') pLine.walks += 1
    if (HIT_EVENTS.has(result.eventType)) pLine.hitsAllowed += 1

    for (const r of runners) {
      if (r.details.isScoringEvent && r.details.responsiblePitcher) {
        const chargedTo = getOrCreatePitcherLine(
          pitcherLines,
          r.details.responsiblePitcher.id,
          matchup.pitcher.fullName, // best-effort; overwritten if that pitcher appears in their own matchup elsewhere
          pitchingTeamId,
        )
        chargedTo.runsAllowed += 1
        if (r.details.earned) chargedTo.earnedRunsAllowed += 1
      }
      if (r.details.isScoringEvent && r.details.runner) {
        creditRun(batterLines, r.details.runner.id, r.details.runner.fullName, battingTeamId)
      }
      if (r.details.eventType?.startsWith('stolen_base') && r.details.runner) {
        const b = getOrCreateBatterLine(batterLines, r.details.runner.id, r.details.runner.fullName, battingTeamId)
        b.stolenBases += 1
      }
    }

    // ── batter line ────────────────────────────────────────────────────
    const bLine = getOrCreateBatterLine(batterLines, matchup.batter.id, matchup.batter.fullName, battingTeamId)
    bLine.plateAppearances += 1
    if (isAtBat(result.eventType)) bLine.atBats += 1
    if (result.eventType === 'single') bLine.hits += 1
    if (result.eventType === 'double') { bLine.hits += 1; bLine.doubles += 1 }
    if (result.eventType === 'triple') { bLine.hits += 1; bLine.triples += 1 }
    if (result.eventType === 'home_run') { bLine.hits += 1; bLine.homeRuns += 1 }
    if (result.eventType === 'walk') bLine.walks += 1
    if (result.eventType === 'strikeout') bLine.strikeouts += 1
    if (result.rbi) bLine.rbi += result.rbi

    // ── pitch-by-pitch + batted balls ─────────────────────────────────
    for (const ev of playEvents) {
      if (!ev.isPitch) continue
      const pd = ev.pitchData

      pitchLog.push({
        atBatIndex: about.atBatIndex,
        pitchNumber: ev.pitchNumber ?? 0,
        inning: about.inning,
        halfInning: about.halfInning,
        pitcherId: matchup.pitcher.id,
        pitcherName: matchup.pitcher.fullName,
        batterId: matchup.batter.id,
        batterName: matchup.batter.fullName,
        typeCode: ev.details.type?.code ?? null,
        typeDescription: ev.details.type?.description ?? null,
        callCode: ev.details.call?.code ?? null,
        callDescription: ev.details.call?.description ?? null,
        startSpeed: pd?.startSpeed ?? null,
        endSpeed: pd?.endSpeed ?? null,
        spinRate: pd?.breaks?.spinRate ?? null,
        breakLength: resolveBreakLength(pd?.breaks),
        breakVerticalInduced: pd?.breaks?.breakVerticalInduced ?? null,
        breakHorizontal: pd?.breaks?.breakHorizontal ?? null,
        zone: pd?.zone ?? null,
        plateX: pd?.coordinates?.pX ?? null,
        plateZ: pd?.coordinates?.pZ ?? null,
        strikeZoneTop: pd?.strikeZoneTop ?? null,
        strikeZoneBottom: pd?.strikeZoneBottom ?? null,
        isStrike: !!ev.details.isStrike,
        isBall: !!ev.details.isBall,
        isInPlay: !!ev.details.isInPlay,
        countAfter: { balls: ev.count?.balls ?? 0, strikes: ev.count?.strikes ?? 0 },
      })

      pLine.pitchesThrown += 1
      if (ev.details.isStrike) pLine.strikesThrown += 1

      const typeCode = ev.details.type?.code ?? 'UN'
      const typeDesc = ev.details.type?.description ?? 'Unknown'
      const callCode = ev.details.call?.code ?? null
      accumulateArsenal(pitcherArsenal, matchup.pitcher.id, typeCode, typeDesc, callCode, pd)
      accumulateInningVelo(pitcherInningVelo, matchup.pitcher.id, about.inning, typeCode, pd?.startSpeed)
      accumulateZone(pitcherZoneStats, matchup.pitcher.id, pd?.zone, callCode)
      accumulateSwingMiss(pitcherSwingMiss, matchup.pitcher.id, pd?.zone, callCode)
      batterPitchCount.set(matchup.batter.id, (batterPitchCount.get(matchup.batter.id) ?? 0) + 1)

      if (ev.hitData) {
        battedBalls.push({
          atBatIndex: about.atBatIndex,
          inning: about.inning,
          halfInning: about.halfInning,
          batterId: matchup.batter.id,
          batterName: matchup.batter.fullName,
          pitcherId: matchup.pitcher.id,
          pitcherName: matchup.pitcher.fullName,
          battingTeamId,
          launchSpeed: ev.hitData.launchSpeed ?? null,
          launchAngle: ev.hitData.launchAngle ?? null,
          totalDistance: ev.hitData.totalDistance ?? null,
          trajectory: ev.hitData.trajectory ?? null,
          hardness: ev.hitData.hardness ?? null,
          coordX: ev.hitData.coordinates?.coordX ?? null,
          coordY: ev.hitData.coordinates?.coordY ?? null,
          zone: pd?.zone ?? null,
          resultEvent: result.eventType,
        })
        accumulateZoneBattedBall(pitcherZoneStats, matchup.pitcher.id, pd?.zone, HIT_EVENTS.has(result.eventType))
      }
    }

    // ── key pitches: the deciding pitch of every strikeout, plus the
    //    ball-in-play pitch on every scoring play ─────────────────────
    const pitchesThisPlay = playEvents.filter(ev => ev.isPitch)
    const lastPitchEv = pitchesThisPlay[pitchesThisPlay.length - 1]
    if (lastPitchEv) {
      const reason: KeyPitch['reason'] | null =
        result.eventType === 'strikeout' ? 'putaway' :
        (scoringPlaySet.has(about.atBatIndex) || about.isScoringPlay) ? 'scoring-play' :
        null
      if (reason) {
        keyPitches.push({
          atBatIndex: about.atBatIndex,
          pitchNumber: lastPitchEv.pitchNumber ?? 0,
          inning: about.inning,
          pitcherName: matchup.pitcher.fullName,
          batterName: matchup.batter.fullName,
          typeDescription: lastPitchEv.details.type?.description ?? 'Unknown',
          velo: lastPitchEv.pitchData?.startSpeed ?? null,
          breakLength: resolveBreakLength(lastPitchEv.pitchData?.breaks),
          countAfter: { balls: lastPitchEv.count?.balls ?? 0, strikes: lastPitchEv.count?.strikes ?? 0 },
          callDescription: lastPitchEv.details.call?.description ?? null,
          reason,
          resultDescription: result.description,
        })
      }
    }
  }

  // ── finalize pitcher arsenal + velocity trend + swing-miss + hot zones ──
  for (const [pitcherId, line] of pitcherLines) {
    line.arsenal = finalizeArsenal(pitcherArsenal.get(pitcherId), line.pitchesThrown)
    line.velocityTrend = finalizeInningVelo(pitcherInningVelo.get(pitcherId))
    line.swingMiss = finalizeSwingMiss(pitcherSwingMiss.get(pitcherId), line.arsenal)
    line.hotZones = finalizeZones(pitcherZoneStats.get(pitcherId))
  }

  // ── finalize batter pitches-seen ────────────────────────────────────
  for (const [batterId, entry] of batterLines) {
    entry.line.pitchesSeen = batterPitchCount.get(batterId) ?? 0
    entry.line.pitchesPerPA = entry.line.plateAppearances > 0
      ? round1(entry.line.pitchesSeen / entry.line.plateAppearances)
      : null
  }

  const superlatives = computeSuperlatives(pitchLog, battedBalls)

  // most patient batter needs batterLines, which computeSuperlatives doesn't
  // have — computed here instead and folded into the same object
  let mostPatientBatter: GameSuperlatives['mostPatientBatter'] = null
  for (const [, entry] of batterLines) {
    if (entry.line.plateAppearances === 0) continue
    if (!mostPatientBatter || entry.line.pitchesSeen > mostPatientBatter.pitchesSeen) {
      mostPatientBatter = {
        batterId: entry.line.batterId, batterName: entry.line.batterName,
        pitchesSeen: entry.line.pitchesSeen, plateAppearances: entry.line.plateAppearances,
      }
    }
  }
  superlatives.mostPatientBatter = mostPatientBatter

  // longest at-bat: group pitchLog by atBatIndex, find the max pitch count
  const pitchesPerAtBat = new Map<number, PitchRecord[]>()
  for (const p of pitchLog) {
    if (!pitchesPerAtBat.has(p.atBatIndex)) pitchesPerAtBat.set(p.atBatIndex, [])
    pitchesPerAtBat.get(p.atBatIndex)!.push(p)
  }
  let longestAtBat: GameSuperlatives['longestAtBat'] = null
  for (const [atBatIndex, pitchesInAtBat] of pitchesPerAtBat) {
    if (!longestAtBat || pitchesInAtBat.length > longestAtBat.pitches) {
      const last = pitchesInAtBat[pitchesInAtBat.length - 1]
      const resultPlay = plays.find(pl => pl.about.atBatIndex === atBatIndex)
  longestAtBat = {
        batterId: last.batterId, batterName: last.batterName, pitcherId: last.pitcherId, pitcherName: last.pitcherName,
        pitches: pitchesInAtBat.length, inning: last.inning,
        resultDescription: resultPlay?.result.description ?? '',
      }
    }
  }
  superlatives.longestAtBat = longestAtBat

  // biggest inning: runs scored in a single half-inning, from the same
  // runners[].isScoringEvent data used for run attribution above
  const runsByHalfInning = new Map<string, { inning: number; halfInning: 'top' | 'bottom'; teamAbbreviation: string; runs: number }>()
  for (const play of plays) {
    const runsThisPlay = play.runners.filter(r => r.details.isScoringEvent).length
    if (runsThisPlay === 0) continue
    const key = `${play.about.inning}-${play.about.halfInning}`
    const teamAbbreviation = play.about.halfInning === 'top' ? away.abbreviation : home.abbreviation
    const existing = runsByHalfInning.get(key)
    if (existing) existing.runs += runsThisPlay
    else runsByHalfInning.set(key, { inning: play.about.inning, halfInning: play.about.halfInning, teamAbbreviation, runs: runsThisPlay })
  }
  superlatives.biggestInning = Array.from(runsByHalfInning.values()).sort((a, b) => b.runs - a.runs)[0] ?? null

  // fold the two superlative-based key pitches in alongside the putaway /
  // scoring-play ones collected during the main loop
  if (superlatives.fastestPitch) {
    const src = pitchLog.find(p => p.startSpeed === superlatives.fastestPitch!.speed && p.pitcherId === superlatives.fastestPitch!.pitcherId)
    if (src) keyPitches.push(toKeyPitch(src, 'fastest'))
  }
  if (superlatives.mostBreak) {
    const src = pitchLog.find(p => p.breakLength === superlatives.mostBreak!.breakLength && p.pitcherId === superlatives.mostBreak!.pitcherId)
    if (src) keyPitches.push(toKeyPitch(src, 'sharpest-break'))
  }

  keyPlays.sort((a, b) => {
    if (a.isScoringPlay !== b.isScoringPlay) return a.isScoringPlay ? -1 : 1
    return b.captivatingIndex - a.captivatingIndex
  })

  const mostImpactfulAtBat = keyPlays.length > 0
    ? [...keyPlays].sort((a, b) => b.captivatingIndex - a.captivatingIndex)[0]
    : null

  const dedupedKeyPitches = dedupeKeyPitches(keyPitches).sort((a, b) => a.inning - b.inning).slice(0, 10)

return {
    gamePk: feed.gamePk,
    gameDate: gameData.datetime.officialDate,
    slug,
    gameNumber: gameData.game.gameNumber ?? 1,
    away,
    home,
    finalAwayScore,
    finalHomeScore,
    linescore: buildLinescore(feed),
    pitchers: Array.from(pitcherLines.values()),
    batters: {
      away: Array.from(batterLines.values()).filter(b => b.teamId === away.teamId).map(b => b.line),
      home: Array.from(batterLines.values()).filter(b => b.teamId === home.teamId).map(b => b.line),
    },
    keyPlays: keyPlays.slice(0, 12),
    superlatives,
    pitchLog,
    atBats,                  // ADD THIS LINE
    battedBalls,
    keyPitches: dedupedKeyPitches,
    battedBallMix: {
      away: computeBattedBallMix(battedBalls, away.teamId),
      home: computeBattedBallMix(battedBalls, home.teamId),
    },
    teamProfiles: {
      away: computeTeamProfile(away.teamId, Array.from(batterLines.values()).filter(b => b.teamId === away.teamId).map(b => b.line), battedBalls),
      home: computeTeamProfile(home.teamId, Array.from(batterLines.values()).filter(b => b.teamId === home.teamId).map(b => b.line), battedBalls),
    },
    mostImpactfulAtBat,
    battingZoneMix: {
      away: computeBattingZoneMix(battedBalls, away.teamId),
      home: computeBattingZoneMix(battedBalls, home.teamId),
    },
    winProbability: [],      // ADD THIS LINE — filled in by attachWinProbability() at the call site
    generatedAt: new Date().toISOString(),
  }
}

// ── live-only variant: superlatives without building the full report ──────
// Cheap enough to call on every poll tick during a live game.
export function computeLiveSuperlatives(feed: GumboFeed): GameSuperlatives {
  const pitchLog: PitchRecord[] = []
  const battedBalls: BattedBallRecord[] = []
  for (const play of feed.liveData.plays.allPlays ?? []) {
    for (const ev of play.playEvents) {
      if (!ev.isPitch) continue
      pitchLog.push({
        atBatIndex: play.about.atBatIndex, pitchNumber: ev.pitchNumber ?? 0,
        inning: play.about.inning, halfInning: play.about.halfInning,
        pitcherId: play.matchup.pitcher.id, pitcherName: play.matchup.pitcher.fullName,
        batterId: play.matchup.batter.id, batterName: play.matchup.batter.fullName,
        typeCode: ev.details.type?.code ?? null, typeDescription: ev.details.type?.description ?? null,
        callCode: ev.details.call?.code ?? null, callDescription: ev.details.call?.description ?? null,
        startSpeed: ev.pitchData?.startSpeed ?? null, endSpeed: ev.pitchData?.endSpeed ?? null,
        spinRate: ev.pitchData?.breaks?.spinRate ?? null, breakLength: resolveBreakLength(ev.pitchData?.breaks),
        breakVerticalInduced: ev.pitchData?.breaks?.breakVerticalInduced ?? null,
        breakHorizontal: ev.pitchData?.breaks?.breakHorizontal ?? null, zone: ev.pitchData?.zone ?? null,
        plateX: ev.pitchData?.coordinates?.pX ?? null, plateZ: ev.pitchData?.coordinates?.pZ ?? null,
        strikeZoneTop: ev.pitchData?.strikeZoneTop ?? null, strikeZoneBottom: ev.pitchData?.strikeZoneBottom ?? null,
        isStrike: !!ev.details.isStrike, isBall: !!ev.details.isBall, isInPlay: !!ev.details.isInPlay,
        countAfter: { balls: ev.count?.balls ?? 0, strikes: ev.count?.strikes ?? 0 },
      })
     if (ev.hitData) {
        const battingTeamId = play.about.halfInning === 'top' ? feed.gameData.teams.away.id : feed.gameData.teams.home.id
        battedBalls.push({
          atBatIndex: play.about.atBatIndex, inning: play.about.inning, halfInning: play.about.halfInning,
          batterId: play.matchup.batter.id, batterName: play.matchup.batter.fullName,
          pitcherId: play.matchup.pitcher.id, pitcherName: play.matchup.pitcher.fullName,
          battingTeamId,
          launchSpeed: ev.hitData.launchSpeed ?? null, launchAngle: ev.hitData.launchAngle ?? null,
          totalDistance: ev.hitData.totalDistance ?? null, trajectory: ev.hitData.trajectory ?? null,
          hardness: ev.hitData.hardness ?? null, coordX: ev.hitData.coordinates?.coordX ?? null,
          coordY: ev.hitData.coordinates?.coordY ?? null,
          zone: ev.pitchData?.zone ?? null,
          resultEvent: play.result.eventType,
        })
      }
    }
  }
  return computeSuperlatives(pitchLog, battedBalls)
}

// ── helpers ─────────────────────────────────────────────────────────────

function toKeyPitch(p: PitchRecord, reason: KeyPitch['reason']): KeyPitch {
  return {
    atBatIndex: p.atBatIndex,
    pitchNumber: p.pitchNumber,
    inning: p.inning,
    pitcherName: p.pitcherName,
    batterName: p.batterName,
    typeDescription: p.typeDescription ?? 'Unknown',
    velo: p.startSpeed,
    breakLength: p.breakLength,
    countAfter: p.countAfter,
    callDescription: p.callDescription,
    reason,
    resultDescription: reason === 'fastest' ? 'Fastest pitch of the game' : 'Sharpest break of the game',
  }
}

function dedupeKeyPitches(pitches: KeyPitch[]): KeyPitch[] {
  const seen = new Set<string>()
  const out: KeyPitch[] = []
  for (const p of pitches) {
    const key = `${p.atBatIndex}-${p.pitchNumber}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

const HARD_HIT_MPH = 95

function computeBattedBallMix(battedBalls: BattedBallRecord[], teamId: number): BattedBallMix {
  const balls = battedBalls.filter(b => b.battingTeamId === teamId && b.trajectory)
  const n = balls.length
  if (n === 0) {
    return { teamId, ballsInPlay: 0, groundBallPct: 0, flyBallPct: 0, lineDrivePct: 0, popUpPct: 0, hardHitPct: 0 }
  }
  const count = (t: string) => balls.filter(b => b.trajectory === t).length
  const hardHit = balls.filter(b => (b.launchSpeed ?? 0) >= HARD_HIT_MPH).length
  return {
    teamId,
    ballsInPlay: n,
    groundBallPct: round1((count('ground_ball') / n) * 100),
    flyBallPct: round1((count('fly_ball') / n) * 100),
    lineDrivePct: round1((count('line_drive') / n) * 100),
    popUpPct: round1((count('popup') / n) * 100),
    hardHitPct: round1((hardHit / n) * 100),
  }
}

function computeTeamProfile(teamId: number, batters: BatterGameLine[], battedBalls: BattedBallRecord[]): TeamGameProfile {
  const pa = batters.reduce((s, b) => s + b.plateAppearances, 0) || 1
  const xbh = batters.reduce((s, b) => s + b.doubles + b.triples + b.homeRuns, 0)
  const bb = batters.reduce((s, b) => s + b.walks, 0)
  const k = batters.reduce((s, b) => s + b.strikeouts, 0)
  const sb = batters.reduce((s, b) => s + b.stolenBases, 0)
  const teamBalls = battedBalls.filter(b => b.battingTeamId === teamId)
  const hardHit = teamBalls.filter(b => (b.launchSpeed ?? 0) >= HARD_HIT_MPH).length

  // Single-game descriptive scaling only — see TeamGameProfile doc comment.
  return {
    teamId,
    power: Math.min(100, round1((xbh / pa) * 100 * 6)),
    discipline: Math.min(100, round1((bb / pa) * 100 * 3)),
    contact: Math.max(0, Math.min(100, round1(100 - (k / pa) * 100))),
    hardContact: teamBalls.length > 0 ? round1((hardHit / teamBalls.length) * 100) : 0,
    speed: Math.min(100, sb * 25),
  }
}

function isAtBat(eventType: string): boolean {
  const NON_AB = new Set([
    'walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt',
    'catcher_interf', 'batter_interference', 'fan_interference',
  ])
  return !NON_AB.has(eventType)
}

function getOrCreatePitcherLine(
  map: Map<number, PitcherGameLine>, id: number, name: string, teamId: number,
): PitcherGameLine {
  let line = map.get(id)
  if (!line) {
    line = {
      pitcherId: id, pitcherName: name, teamId,
      outsRecorded: 0, battersFaced: 0, pitchesThrown: 0, strikesThrown: 0,
      strikeouts: 0, walks: 0, hitsAllowed: 0, runsAllowed: 0, earnedRunsAllowed: 0,
      arsenal: [], velocityTrend: [], decision: null,
      swingMiss: { totalPitches: 0, swings: 0, whiffs: 0, swStrPct: 0, chaseSwings: 0, chasePitches: 0, chaseRatePct: null, bestWhiffPitch: null },
      hotZones: [],
    }
    map.set(id, line)
  }
  return line
}

function getOrCreateBatterLine(
  map: Map<number, { teamId: number; line: BatterGameLine }>, id: number, name: string, teamId: number,
): BatterGameLine {
  let entry = map.get(id)
  if (!entry) {
    entry = {
      teamId,
      line: {
        batterId: id, batterName: name, teamId,
        plateAppearances: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0,
        walks: 0, strikeouts: 0, runsScored: 0, rbi: 0, stolenBases: 0,
        pitchesSeen: 0, pitchesPerPA: null,
      },
    }
    map.set(id, entry)
  }
  return entry.line
}

function creditRun(
  map: Map<number, { teamId: number; line: BatterGameLine }>, id: number, name: string, teamId: number,
) {
  const line = getOrCreateBatterLine(map, id, name, teamId)
  line.runsScored += 1
}

interface ArsenalAccumulator {
  typeDescription: string
  count: number
  veloSum: number; veloN: number; maxVelo: number
  spinSum: number; spinN: number
  breakSum: number; breakN: number
  swings: number; whiffs: number; inZone: number
}

function accumulateArsenal(
  map: Map<number, Map<string, ArsenalAccumulator>>,
  pitcherId: number, typeCode: string, typeDesc: string,
  callCode: string | null,
  pd: { startSpeed?: number; breaks?: { spinRate?: number; breakVerticalInduced?: number }; zone?: number } | undefined,
) {
  if (!map.has(pitcherId)) map.set(pitcherId, new Map())
  const byType = map.get(pitcherId)!
  if (!byType.has(typeCode)) {
    byType.set(typeCode, {
      typeDescription: typeDesc, count: 0,
      veloSum: 0, veloN: 0, maxVelo: 0, spinSum: 0, spinN: 0, breakSum: 0, breakN: 0,
      swings: 0, whiffs: 0, inZone: 0,
    })
  }
  const acc = byType.get(typeCode)!
  acc.count += 1
  if (pd?.startSpeed != null) {
    acc.veloSum += pd.startSpeed; acc.veloN += 1
    acc.maxVelo = Math.max(acc.maxVelo, pd.startSpeed)
  }
  if (pd?.breaks?.spinRate != null) { acc.spinSum += pd.breaks.spinRate; acc.spinN += 1 }
  if (pd?.breaks?.breakVerticalInduced != null) { acc.breakSum += Math.abs(pd.breaks.breakVerticalInduced); acc.breakN += 1 }
  if (pd?.zone != null && IN_ZONE_CODES.has(pd.zone)) acc.inZone += 1
  if (callCode && SWING_CALL_CODES.has(callCode)) acc.swings += 1
  if (callCode && WHIFF_CALL_CODES.has(callCode)) acc.whiffs += 1
}

function finalizeArsenal(byType: Map<string, ArsenalAccumulator> | undefined, totalPitches: number): PitchTypeSplit[] {
  if (!byType) return []
  const out: PitchTypeSplit[] = []
  for (const [typeCode, acc] of byType) {
    out.push({
      typeCode,
      typeDescription: acc.typeDescription,
      count: acc.count,
      usagePct: totalPitches > 0 ? round1((acc.count / totalPitches) * 100) : 0,
      avgVelo: acc.veloN > 0 ? round1(acc.veloSum / acc.veloN) : null,
      maxVelo: acc.veloN > 0 ? round1(acc.maxVelo) : null,
      avgSpin: acc.spinN > 0 ? Math.round(acc.spinSum / acc.spinN) : null,
      avgInducedBreak: acc.breakN > 0 ? round1(acc.breakSum / acc.breakN) : null,
      swings: acc.swings,
      whiffs: acc.whiffs,
      whiffPct: acc.swings > 0 ? round1((acc.whiffs / acc.swings) * 100) : null,
      zonePct: acc.count > 0 ? round1((acc.inZone / acc.count) * 100) : null,
    })
  }
  return out.sort((a, b) => b.count - a.count)
}

interface ZoneAccumulator {
  pitches: number
  whiffs: number
  battedBalls: number
  hits: number
}

interface SwingMissAccumulator {
  totalPitches: number
  swings: number
  whiffs: number
  chaseSwings: number
  chasePitches: number
}

function accumulateZone(
  map: Map<number, Map<number, ZoneAccumulator>>, pitcherId: number, zone: number | undefined, callCode: string | null,
) {
  if (zone == null || !IN_ZONE_CODES.has(zone)) return // hot-zone grid is the 3x3 rulebook zone only
  if (!map.has(pitcherId)) map.set(pitcherId, new Map())
  const byZone = map.get(pitcherId)!
  if (!byZone.has(zone)) byZone.set(zone, { pitches: 0, whiffs: 0, battedBalls: 0, hits: 0 })
  const acc = byZone.get(zone)!
  acc.pitches += 1
  if (callCode && WHIFF_CALL_CODES.has(callCode)) acc.whiffs += 1
}

function accumulateZoneBattedBall(
  map: Map<number, Map<number, ZoneAccumulator>>, pitcherId: number, zone: number | undefined, isHit: boolean,
) {
  if (zone == null || !IN_ZONE_CODES.has(zone)) return
  if (!map.has(pitcherId)) map.set(pitcherId, new Map())
  const byZone = map.get(pitcherId)!
  if (!byZone.has(zone)) byZone.set(zone, { pitches: 0, whiffs: 0, battedBalls: 0, hits: 0 })
  const acc = byZone.get(zone)!
  acc.battedBalls += 1
  if (isHit) acc.hits += 1
}

function finalizeZones(byZone: Map<number, ZoneAccumulator> | undefined): ZoneCell[] {
  const cells: ZoneCell[] = []
  for (let zone = 1; zone <= 9; zone++) {
    const acc = byZone?.get(zone)
    cells.push({
      zone,
      pitches: acc?.pitches ?? 0,
      whiffs: acc?.whiffs ?? 0,
      whiffPct: acc && acc.pitches > 0 ? round1((acc.whiffs / acc.pitches) * 100) : null,
      battedBalls: acc?.battedBalls ?? 0,
      hits: acc?.hits ?? 0,
      hitPct: acc && acc.battedBalls > 0 ? round1((acc.hits / acc.battedBalls) * 100) : null,
    })
  }
  return cells
}

function accumulateSwingMiss(
  map: Map<number, SwingMissAccumulator>, pitcherId: number, zone: number | undefined, callCode: string | null,
) {
  if (!map.has(pitcherId)) map.set(pitcherId, { totalPitches: 0, swings: 0, whiffs: 0, chaseSwings: 0, chasePitches: 0 })
  const acc = map.get(pitcherId)!
  acc.totalPitches += 1
  const isSwing = !!callCode && SWING_CALL_CODES.has(callCode)
  const isWhiff = !!callCode && WHIFF_CALL_CODES.has(callCode)
  if (isSwing) acc.swings += 1
  if (isWhiff) acc.whiffs += 1
  if (zone != null && !IN_ZONE_CODES.has(zone)) {
    acc.chasePitches += 1
    if (isSwing) acc.chaseSwings += 1
  }
}

function finalizeSwingMiss(acc: SwingMissAccumulator | undefined, arsenal: PitchTypeSplit[]): SwingMissProfile {
  const bestWhiff = arsenal
    .filter(a => a.swings >= 3 && a.whiffPct != null)
    .sort((a, b) => (b.whiffPct ?? 0) - (a.whiffPct ?? 0))[0]

  if (!acc) {
    return { totalPitches: 0, swings: 0, whiffs: 0, swStrPct: 0, chaseSwings: 0, chasePitches: 0, chaseRatePct: null, bestWhiffPitch: null }
  }
  return {
    totalPitches: acc.totalPitches,
    swings: acc.swings,
    whiffs: acc.whiffs,
    swStrPct: acc.totalPitches > 0 ? round1((acc.whiffs / acc.totalPitches) * 100) : 0,
    chaseSwings: acc.chaseSwings,
    chasePitches: acc.chasePitches,
    chaseRatePct: acc.chasePitches > 0 ? round1((acc.chaseSwings / acc.chasePitches) * 100) : null,
    bestWhiffPitch: bestWhiff ? { typeDescription: bestWhiff.typeDescription, whiffPct: bestWhiff.whiffPct ?? 0, count: bestWhiff.count } : null,
  }
}

function computeBattingZoneMix(battedBalls: BattedBallRecord[], teamId: number): ZoneCell[] {
  const acc = new Map<number, ZoneAccumulator>()
  for (const b of battedBalls) {
    if (b.battingTeamId !== teamId || b.zone == null || !IN_ZONE_CODES.has(b.zone)) continue
    if (!acc.has(b.zone)) acc.set(b.zone, { pitches: 0, whiffs: 0, battedBalls: 0, hits: 0 })
    const cell = acc.get(b.zone)!
    cell.battedBalls += 1
    if (b.resultEvent && HIT_EVENTS.has(b.resultEvent)) cell.hits += 1
  }
  return finalizeZones(acc)
}

function accumulateInningVelo(
  map: Map<number, Map<number, Map<string, number[]>>>,
  pitcherId: number, inning: number, typeCode: string, speed: number | undefined,
) {
  if (speed == null) return
  if (!map.has(pitcherId)) map.set(pitcherId, new Map())
  const byInning = map.get(pitcherId)!
  if (!byInning.has(inning)) byInning.set(inning, new Map())
  const byType = byInning.get(inning)!
  if (!byType.has(typeCode)) byType.set(typeCode, [])
  byType.get(typeCode)!.push(speed)
}

function finalizeInningVelo(byInning: Map<number, Map<string, number[]>> | undefined): InningVeloPoint[] {
  if (!byInning) return []
  const out: InningVeloPoint[] = []
  for (const [inning, byType] of byInning) {
    for (const [typeCode, speeds] of byType) {
      out.push({ inning, typeCode, avgVelo: round1(speeds.reduce((a, b) => a + b, 0) / speeds.length) })
    }
  }
  return out.sort((a, b) => a.inning - b.inning)
}

function computeSuperlatives(pitchLog: PitchRecord[], battedBalls: BattedBallRecord[]): GameSuperlatives {
  let fastest: GameSuperlatives['fastestPitch'] = null
  let slowest: GameSuperlatives['slowestPitch'] = null
  let mostBreak: GameSuperlatives['mostBreak'] = null
  let highestSpin: GameSuperlatives['highestSpin'] = null

  for (const p of pitchLog) {
    if (p.startSpeed != null && (!fastest || p.startSpeed > fastest.speed)) {
      fastest = {
        pitcherId: p.pitcherId, pitcherName: p.pitcherName, speed: p.startSpeed,
        typeDescription: p.typeDescription ?? 'Unknown', inning: p.inning,
      }
    }
    if (p.startSpeed != null && (!slowest || p.startSpeed < slowest.speed)) {
      slowest = {
        pitcherId: p.pitcherId, pitcherName: p.pitcherName, speed: p.startSpeed,
        typeDescription: p.typeDescription ?? 'Unknown', inning: p.inning,
      }
    }
    if (p.breakLength != null && (!mostBreak || p.breakLength > mostBreak.breakLength)) {
      mostBreak = {
        pitcherId: p.pitcherId, pitcherName: p.pitcherName, breakLength: p.breakLength,
        typeDescription: p.typeDescription ?? 'Unknown', inning: p.inning,
      }
    }
    if (p.spinRate != null && (!highestSpin || p.spinRate > highestSpin.spinRate)) {
      highestSpin = {
        pitcherId: p.pitcherId, pitcherName: p.pitcherName, spinRate: p.spinRate,
        typeDescription: p.typeDescription ?? 'Unknown', inning: p.inning,
      }
    }
  }

  let hardestHit: GameSuperlatives['hardestHit'] = null
  let longestHit: GameSuperlatives['longestHit'] = null
  for (const b of battedBalls) {
    if (b.launchSpeed != null && (!hardestHit || b.launchSpeed > hardestHit.exitVelo)) {
      hardestHit = {
        batterId: b.batterId, batterName: b.batterName, exitVelo: b.launchSpeed,
        resultEvent: b.resultEvent ?? 'in_play', inning: b.inning,
      }
    }
    if (b.totalDistance != null && (!longestHit || b.totalDistance > longestHit.distance)) {
      longestHit = {
        batterId: b.batterId, batterName: b.batterName, distance: b.totalDistance,
        resultEvent: b.resultEvent ?? 'in_play', inning: b.inning,
      }
    }
  }

  return { fastestPitch: fastest, slowestPitch: slowest, mostBreak, highestSpin, hardestHit, longestHit, mostPatientBatter: null, longestAtBat: null, biggestInning: null }
}


function buildLinescore(feed: GumboFeed): LinescoreRow[] {
  const ls = feed.liveData.linescore
  const away = feed.gameData.teams.away
  const home = feed.gameData.teams.home
  const innings = ls?.innings ?? []
  const awayRuns = innings.map(i => i.away?.runs ?? null)
  const homeRuns = innings.map(i => i.home?.runs ?? null)
  return [
    {
      teamId: away.id, abbreviation: away.abbreviation, runsByInning: awayRuns,
      runs: ls?.teams.away.runs ?? 0, hits: ls?.teams.away.hits ?? 0, errors: ls?.teams.away.errors ?? 0,
    },
    {
      teamId: home.id, abbreviation: home.abbreviation, runsByInning: homeRuns,
      runs: ls?.teams.home.runs ?? 0, hits: ls?.teams.home.hits ?? 0, errors: ls?.teams.home.errors ?? 0,
    },
  ]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}