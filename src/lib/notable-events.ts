// src/lib/notable-events.ts
//
// Three outputs, all derived from the same per-game snapshots:
//   - computeGameKeyStats(): always-on stats for ONE game (fastest pitch,
//     hardest hit, longest at-bat — this game's own numbers, not whether
//     they happen to be the day's best). This is what powers each game's
//     expandable panel.
//   - detectPerGameEvents(): conditional/threshold events for ONE game
//     (no-hitter watch, K milestone, multi-HR, blowout, walk-off, extras).
//     Also panel content, listed under the game they happened in.
//   - computeHeadlineEvents(): cross-game "best of today" — deliberately
//     kept small, just fastest pitch and hardest hit league-wide-so-far —
//     for a thin strip at the top of the page, not the main feed.
//
// Stateless on the server by design — every event gets a deterministic
// `id`, and the CLIENT (LiveTrackerBoard.tsx) remembers which ids it's
// already shown. Reuses aggregateGameFeed() for the per-game snapshot even
// though the game isn't Final — nothing in that function requires Final
// status, it just summarizes whatever's happened in the feed so far.

import type { GumboFeed } from '@/lib/mlb-live-feed'
import { aggregateGameFeed } from '@/lib/postgame-aggregate'
import type { GameKeyStats, NotableEvent } from '@/types/live-tracker'
import type { PostgameReport } from '@/types/postgame'

const K_MILESTONE = 10
const BLOWOUT_MARGIN = 8
const NO_HITTER_MIN_OUTS = 15 // 5 innings

export interface GameSnapshot {
  feed: GumboFeed
  report: PostgameReport
  gameSlug: string | null
  matchup: string
}

export function buildSnapshot(feed: GumboFeed, gameSlug: string | null): GameSnapshot | null {
  const report = aggregateGameFeed(feed, gameSlug ?? `live-${feed.gamePk}`)
  if (!report) return null
  return {
    feed, report, gameSlug,
    matchup: `${report.away.abbreviation} @ ${report.home.abbreviation}`,
  }
}

function currentGameState(feed: GumboFeed): { inning: number; halfInning: 'top' | 'bottom'; outs: number } {
  const plays = feed.liveData.plays.allPlays ?? []
  const last = plays[plays.length - 1]
  const lastPitchEvent = last?.playEvents.filter(e => e.isPitch).slice(-1)[0]
  return {
    inning: last?.about.inning ?? 1,
    halfInning: last?.about.halfInning ?? 'top',
    outs: lastPitchEvent?.count?.outs ?? 0,
  }
}

// ── per-game, always-on ─────────────────────────────────────────────────
// report.superlatives is already scoped to this one game — aggregateGameFeed
// runs once per gamePk, so there's no cross-game leakage to worry about here.

export function computeGameKeyStats(snapshot: GameSnapshot): GameKeyStats {
  const { report } = snapshot
  const s = report.superlatives

  // a few new ones not already in `superlatives` — computed here since
  // they're specific to the live-tracker use case, not the postgame report
  const pitchersWithSample = report.pitchers.filter(p => p.pitchesThrown >= 15)
  const topSwingMiss = [...pitchersWithSample].sort((a, b) => b.swingMiss.swStrPct - a.swingMiss.swStrPct)[0]

  const allBatters = [...report.batters.away, ...report.batters.home]
  const rbiLeader = [...allBatters].sort((a, b) => b.rbi - a.rbi)[0]
  const runsLeaderBatter = [...allBatters].sort((a, b) => b.runsScored - a.runsScored)[0]
  const sbLeader = [...allBatters].sort((a, b) => b.stolenBases - a.stolenBases)[0]

  return {
    gamePk: report.gamePk,
    fastestPitch: s.fastestPitch ? { speed: s.fastestPitch.speed, pitcherId: s.fastestPitch.pitcherId, pitcherName: s.fastestPitch.pitcherName, inning: s.fastestPitch.inning } : null,
    slowestPitch: s.slowestPitch ? { speed: s.slowestPitch.speed, pitcherId: s.slowestPitch.pitcherId, pitcherName: s.slowestPitch.pitcherName, typeDescription: s.slowestPitch.typeDescription, inning: s.slowestPitch.inning } : null,
    mostBreak: s.mostBreak ? { breakLength: s.mostBreak.breakLength, pitcherId: s.mostBreak.pitcherId, pitcherName: s.mostBreak.pitcherName, typeDescription: s.mostBreak.typeDescription, inning: s.mostBreak.inning } : null,
    highestSpin: s.highestSpin ? { spinRate: s.highestSpin.spinRate, pitcherId: s.highestSpin.pitcherId, pitcherName: s.highestSpin.pitcherName, inning: s.highestSpin.inning } : null,
    hardestHit: s.hardestHit ? { exitVelo: s.hardestHit.exitVelo, batterId: s.hardestHit.batterId, batterName: s.hardestHit.batterName, inning: s.hardestHit.inning } : null,
    longestHit: s.longestHit ? { distance: s.longestHit.distance, batterId: s.longestHit.batterId, batterName: s.longestHit.batterName, inning: s.longestHit.inning } : null,
longestAtBat: s.longestAtBat ? { pitches: s.longestAtBat.pitches, batterId: s.longestAtBat.batterId, batterName: s.longestAtBat.batterName, pitcherId: s.longestAtBat.pitcherId, pitcherName: s.longestAtBat.pitcherName, inning: s.longestAtBat.inning } : null,
    mostPatientBatter: s.mostPatientBatter ? { batterId: s.mostPatientBatter.batterId, batterName: s.mostPatientBatter.batterName, pitchesSeen: s.mostPatientBatter.pitchesSeen, plateAppearances: s.mostPatientBatter.plateAppearances } : null,
    biggestInning: s.biggestInning ? { teamAbbreviation: s.biggestInning.teamAbbreviation, runs: s.biggestInning.runs, inning: s.biggestInning.inning } : null,
    topSwingAndMiss: topSwingMiss && topSwingMiss.swingMiss.swStrPct > 0
      ? { pitcherId: topSwingMiss.pitcherId, pitcherName: topSwingMiss.pitcherName, swStrPct: topSwingMiss.swingMiss.swStrPct, pitchesThrown: topSwingMiss.pitchesThrown }
      : null,
    rbiLeader: rbiLeader && rbiLeader.rbi > 0 ? { batterId: rbiLeader.batterId, batterName: rbiLeader.batterName, rbi: rbiLeader.rbi } : null,
    runsLeader: runsLeaderBatter && runsLeaderBatter.runsScored > 0 ? { batterId: runsLeaderBatter.batterId, batterName: runsLeaderBatter.batterName, runs: runsLeaderBatter.runsScored } : null,
    stolenBaseLeader: sbLeader && sbLeader.stolenBases > 0 ? { batterId: sbLeader.batterId, batterName: sbLeader.batterName, stolenBases: sbLeader.stolenBases } : null,
    hardHitRate: {
      awayAbbr: report.away.abbreviation, awayPct: report.battedBallMix.away.hardHitPct,
      homeAbbr: report.home.abbreviation, homePct: report.battedBallMix.home.hardHitPct,
    },
  }
}

// ── per-game, conditional/threshold ─────────────────────────────────────

export function detectPerGameEvents(snapshot: GameSnapshot): NotableEvent[] {
  const { report, matchup, gameSlug, feed } = snapshot
  const now = new Date().toISOString()
  const state = currentGameState(feed)
  const isFinal = feed.gameData.status.abstractGameState === 'Final'
  const events: NotableEvent[] = []

  // no-hitter / perfect game watch — starter only (most outs recorded)
  const starter = [...report.pitchers].sort((a, b) => b.outsRecorded - a.outsRecorded)[0]
  if (starter && !isFinal && starter.outsRecorded >= NO_HITTER_MIN_OUTS && starter.hitsAllowed === 0) {
    const isPerfect = starter.walks === 0
    events.push({
      id: `${isPerfect ? 'perfect-game-watch' : 'no-hitter-watch'}-${report.gamePk}`,
      category: isPerfect ? 'perfect-game-watch' : 'no-hitter-watch',
      gamePk: report.gamePk, gameSlug, matchup,
      inning: state.inning, halfInning: state.halfInning,
      headline: `${starter.pitcherName} ${isPerfect ? 'has a perfect game going' : 'has a no-hitter going'} through ${Math.floor(starter.outsRecorded / 3)}`,
      detail: `${starter.strikeouts} K, ${starter.walks} BB`,
      detectedAt: now,
    })
  }

  // strikeout milestone, any pitcher
  for (const p of report.pitchers) {
    if (p.strikeouts >= K_MILESTONE) {
      events.push({
        id: `k-milestone-${report.gamePk}-${p.pitcherId}-${p.strikeouts}`,
        category: 'strikeout-milestone',
        gamePk: report.gamePk, gameSlug, matchup,
        inning: state.inning, halfInning: state.halfInning,
        headline: `${p.pitcherName} is up to ${p.strikeouts} strikeouts`,
        detail: `${Math.floor(p.outsRecorded / 3)}.${p.outsRecorded % 3} IP`,
        detectedAt: now,
      })
    }
  }

  // multi-HR + cycle watch
  for (const b of [...report.batters.away, ...report.batters.home]) {
    if (b.homeRuns >= 2) {
      events.push({
        id: `multi-hr-${report.gamePk}-${b.batterId}-${b.homeRuns}`,
        category: 'multi-hr',
        gamePk: report.gamePk, gameSlug, matchup,
        inning: state.inning, halfInning: state.halfInning,
        headline: `${b.batterName} has ${b.homeRuns} home runs today`,
        detail: matchup,
        detectedAt: now,
      })
    }
    if (b.hits - b.doubles - b.triples - b.homeRuns >= 1 && b.doubles >= 1 && b.triples >= 1 && b.homeRuns === 0) {
      events.push({
        id: `cycle-watch-${report.gamePk}-${b.batterId}`,
        category: 'cycle-watch',
        gamePk: report.gamePk, gameSlug, matchup,
        inning: state.inning, halfInning: state.halfInning,
        headline: `${b.batterName} is a home run away from the cycle`,
        detail: matchup,
        detectedAt: now,
      })
    }
  }

  // blowout
  const margin = Math.abs(report.finalAwayScore - report.finalHomeScore)
  if (margin >= BLOWOUT_MARGIN) {
    const leader = report.finalHomeScore > report.finalAwayScore ? report.home.abbreviation : report.away.abbreviation
    events.push({
      id: `blowout-${report.gamePk}`,
      category: 'blowout',
      gamePk: report.gamePk, gameSlug, matchup,
      inning: state.inning, halfInning: state.halfInning,
      headline: `${leader} is up by ${margin} in ${matchup}`,
      detail: `${report.finalAwayScore}-${report.finalHomeScore}`,
      detectedAt: now,
    })
  }

  // walk-off watch — bottom 9th or later, game within 2 runs
  if (!isFinal && state.halfInning === 'bottom' && state.inning >= 9 && margin <= 2) {
    events.push({
      id: `walkoff-watch-${report.gamePk}-${state.inning}`,
      category: 'walk-off-watch',
      gamePk: report.gamePk, gameSlug, matchup,
      inning: state.inning, halfInning: state.halfInning,
      headline: `Walk-off watch: ${matchup}, ${report.finalAwayScore}-${report.finalHomeScore}, bottom ${state.inning}`,
      detail: `${state.outs} out(s)`,
      detectedAt: now,
    })
  }

  // extra innings
  if (state.inning > 9) {
    events.push({
      id: `extras-${report.gamePk}`,
      category: 'extra-innings',
      gamePk: report.gamePk, gameSlug, matchup,
      inning: state.inning, halfInning: state.halfInning,
      headline: `${matchup} is in extras — inning ${state.inning}`,
      detail: `${report.finalAwayScore}-${report.finalHomeScore}`,
      detectedAt: now,
    })
  }

  return events.sort((a, b) => a.inning - b.inning)
}

// ── cross-game, headline strip only ─────────────────────────────────────

export function computeHeadlineEvents(snapshots: GameSnapshot[]): NotableEvent[] {
  const now = new Date().toISOString()
  const events: NotableEvent[] = []

  let todaysFastest: { speed: number; snapshot: GameSnapshot; pitcherName: string } | null = null
  let todaysHardestHit: { exitVelo: number; snapshot: GameSnapshot; batterName: string } | null = null
  for (const s of snapshots) {
    const fp = s.report.superlatives.fastestPitch
    if (fp && (!todaysFastest || fp.speed > todaysFastest.speed)) {
      todaysFastest = { speed: fp.speed, snapshot: s, pitcherName: fp.pitcherName }
    }
    const hh = s.report.superlatives.hardestHit
    if (hh && (!todaysHardestHit || hh.exitVelo > todaysHardestHit.exitVelo)) {
      todaysHardestHit = { exitVelo: hh.exitVelo, snapshot: s, batterName: hh.batterName }
    }
  }
  if (todaysFastest) {
    const state = currentGameState(todaysFastest.snapshot.feed)
    events.push({
      id: `todays-fastest-pitch-${todaysFastest.speed}`,
      category: 'todays-fastest-pitch',
      gamePk: todaysFastest.snapshot.report.gamePk,
      gameSlug: todaysFastest.snapshot.gameSlug,
      matchup: todaysFastest.snapshot.matchup,
      inning: state.inning, halfInning: state.halfInning,
      headline: `Fastest pitch of the day: ${todaysFastest.speed} mph`,
      detail: `${todaysFastest.pitcherName}, ${todaysFastest.snapshot.matchup}`,
      detectedAt: now,
    })
  }
  if (todaysHardestHit) {
    const state = currentGameState(todaysHardestHit.snapshot.feed)
    events.push({
      id: `todays-hardest-hit-${todaysHardestHit.exitVelo}`,
      category: 'todays-hardest-hit',
      gamePk: todaysHardestHit.snapshot.report.gamePk,
      gameSlug: todaysHardestHit.snapshot.gameSlug,
      matchup: todaysHardestHit.snapshot.matchup,
      inning: state.inning, halfInning: state.halfInning,
      headline: `Hardest-hit ball of the day: ${todaysHardestHit.exitVelo} mph`,
      detail: `${todaysHardestHit.batterName}, ${todaysHardestHit.snapshot.matchup}`,
      detectedAt: now,
    })
  }

  return events
}