// src/lib/pregame-takes.ts
//
// Turns the rolling numbers from pregame-stats.ts into the "interesting
// takes" the Data Room surfaces. Pure functions, no fetching — tune
// thresholds here without touching the data layer or the UI.
//
// Detail strings carry a couple of hardcoded <b> tags for emphasis and are
// rendered with dangerouslySetInnerHTML in the client component. That's
// safe ONLY because every string here is built from our own template
// literals — never paste raw external text into `detail` without escaping.

import type { TeamPregameStats, PlayerWatchItem } from './pregame-stats'

export const TAKE_THRESHOLDS = {
  opsHotCold: 0.060,      // ±60 OPS pts vs season → hot/cold
  eraHotCold: 0.50,       // ±0.50 ERA vs season → good/watch
  errorRateWarn: 0.30,    // errors/game over the window ≥ this → watch
  matchupOpsEdge: 0.040,  // split OPS this far from season OPS → matchup take
  playerOpsHot: 0.080,    // player rolling OPS this far above season → hot
  playerEraGood: 0.70,    // pitcher rolling ERA this far below season → good
} as const

export type Take = {
  cls: 'hot' | 'cold' | 'warn' | 'good' | 'match'
  tag: string
  head: string
  detail: string
}

export function buildTeamTakes(_abbr: string, stats: TeamPregameStats): Take[] {
  const takes: Take[] = []
  const T = TAKE_THRESHOLDS

  if (stats.ops) {
    const { current, deltaVsSeason } = stats.ops
    if (deltaVsSeason >= T.opsHotCold) {
      takes.push({
        cls: 'hot', tag: 'Hot · offense', head: 'Bats are locked in',
        detail: `Team OPS <b>${current.toFixed(3)}</b> over the last week — up <b>${Math.round(deltaVsSeason * 1000)} pts</b> on the season mark.`,
      })
    } else if (deltaVsSeason <= -T.opsHotCold) {
      takes.push({
        cls: 'cold', tag: 'Cold · offense', head: 'Bats have gone quiet',
        detail: `Team OPS <b>${current.toFixed(3)}</b> over the last week — down <b>${Math.round(Math.abs(deltaVsSeason) * 1000)} pts</b> from the season mark.`,
      })
    }
  }

  if (stats.era) {
    const { current, deltaVsSeason, seasonBaseline } = stats.era
    if (deltaVsSeason <= -T.eraHotCold) {
      takes.push({
        cls: 'good', tag: 'Strong · pitching', head: 'Arms are dealing',
        detail: `Rolling ERA <b>${current.toFixed(2)}</b> — well below the <b>${seasonBaseline.toFixed(2)}</b> season mark.`,
      })
    } else if (deltaVsSeason >= T.eraHotCold) {
      takes.push({
        cls: 'warn', tag: 'Watch · pitching', head: 'Pitching is wobbling',
        detail: `Rolling ERA <b>${current.toFixed(2)}</b> vs <b>${seasonBaseline.toFixed(2)}</b> season. Recent stretch is a real risk tonight.`,
      })
    }
  }

  if (stats.errorsPerGame?.length) {
    const total = stats.errorsPerGame.reduce((a, b) => a + b, 0)
    const rate = total / stats.errorsPerGame.length
    const recentClean = stats.errorsPerGame.slice(-12).every((e) => e <= 1)
    if (rate >= T.errorRateWarn) {
      takes.push({
        cls: 'warn', tag: 'Watch · defense', head: 'Glove is slipping',
        detail: `<b>${total}</b> errors over the last ${stats.errorsPerGame.length} games. Free-base risk tonight.`,
      })
    } else if (recentClean) {
      takes.push({
        cls: 'good', tag: 'Clean · defense', head: 'Tidy in the field',
        detail: `<b>${total}</b> errors in the last ${stats.errorsPerGame.length} games. Among the steadier stretches in the league right now.`,
      })
    }
  }

  if (stats.splitVsHand && stats.ops) {
    const { ops, hand, sampleAB } = stats.splitVsHand
    const edge = ops - stats.ops.seasonBaseline
    if (Math.abs(edge) >= T.matchupOpsEdge) {
      const handLabel = hand === 'L' ? 'lefties' : 'righties'
      takes.push({
        cls: 'match', tag: `Matchup · vs ${hand}HP`, head: edge > 0 ? 'Built for tonight' : 'Tougher draw',
        detail: `<b>${ops.toFixed(3)}</b> OPS vs ${handLabel} this season (${sampleAB} AB) — ${edge > 0 ? 'an edge' : 'a step down'} against tonight's starter.`,
      })
    }
  }

  return takes
}

export function buildPlayerTakes(items: PlayerWatchItem[]): Take[] {
  const T = TAKE_THRESHOLDS
  const takes: Take[] = []

  for (const p of items) {
    if (p.kind === 'hitter' && p.deltaVsSeason >= T.playerOpsHot) {
      takes.push({
        cls: 'hot', tag: 'Hot · player', head: `${p.name} heating up`,
        detail: `<b>${p.current.toFixed(3)}</b> OPS over the last ${p.rollingSpark.length} games vs season. Worth a fantasy look tonight.`,
      })
    }
    if (p.kind === 'pitcher' && p.deltaVsSeason <= -T.playerEraGood) {
      takes.push({
        cls: 'good', tag: 'Hot · pitcher', head: `${p.name} dealing`,
        detail: `<b>${p.current.toFixed(2)}</b> ERA over the last ${p.rollingSpark.length} starts vs season. Streamer/start candidate.`,
      })
    }
  }

  // TODO: once thresholds are tuned against real data, sort by magnitude
  // of deltaVsSeason rather than roster order, so the strongest take leads.
  return takes
}

export function buildAllTakes(
  home: { abbr: string; stats: TeamPregameStats; watchlist: PlayerWatchItem[] },
  away: { abbr: string; stats: TeamPregameStats; watchlist: PlayerWatchItem[] },
): { home: Take[]; away: Take[] } {
  return {
    home: [...buildTeamTakes(home.abbr, home.stats), ...buildPlayerTakes(home.watchlist)],
    away: [...buildTeamTakes(away.abbr, away.stats), ...buildPlayerTakes(away.watchlist)],
  }
}