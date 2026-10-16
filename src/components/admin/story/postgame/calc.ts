// src/components/admin/story/postgame/calc.ts
//
// Pure helpers for the Postgame Reel: no I/O, no React.

import type { BatterGameLine, BattedBallRecord, KeyPlay, LinescoreRow, WinProbabilityPoint } from '@/types/postgame'
import type { BoxScoreBatter } from '@/lib/game-boxscore'
import { gridToStory } from '../pitcher/calc'
import type { PgHit, PgHitter, PgPlay, PgSide } from './types'

const HIT_KIND: Record<string, PgHit['kind']> = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' }

/** "2-for-4" */
export const forLine = (h: number, ab: number) => `${h}-for-${ab}`

/**
 * Best bats of one club, picked by a private ordering of the counting stats (never shown):
 * hits and homers first, then RBI, runs and walks. Batters with no plate appearance are skipped.
 */
export function topHitters(side: PgSide, box: BoxScoreBatter[], lines: BatterGameLine[], max = 3): PgHitter[] {
  const byId = new Map(lines.map(l => [l.batterId, l]))
  return box
    .filter(b => b.ab + b.bb > 0)
    .map(b => ({ b, rank: b.h * 2 + b.hr * 3 + b.rbi * 1.5 + b.r * 0.5 + b.bb * 0.5, l: byId.get(b.id) }))
    .filter(x => x.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, max)
    .map(({ b, l }) => {
      const extras = [
        b.hr > 0 ? (b.hr === 1 ? 'HR' : `${b.hr} HR`) : null,
        l && l.doubles > 0 ? (l.doubles === 1 ? '2B' : `${l.doubles} 2B`) : null,
        l && l.triples > 0 ? '3B' : null,
        b.rbi > 0 ? `${b.rbi} RBI` : null,
        b.r > 0 ? `${b.r} R` : null,
        b.bb > 0 ? `${b.bb} BB` : null,
        l && l.stolenBases > 0 ? `${l.stolenBases} SB` : null,
      ].filter(Boolean).join(' · ')
      return { side, id: b.id, name: b.name, short: b.name, pos: b.position, line: forLine(b.h, b.ab), extras }
    })
}

/** Plays that moved the game: the 5 most significant of the top-12 key plays, back in game order. */
export function keyPlaysInOrder(plays: KeyPlay[], max = 5): PgPlay[] {
  return [...plays]
    .sort((a, b) => (a.isScoringPlay !== b.isScoringPlay ? (a.isScoringPlay ? -1 : 1) : b.captivatingIndex - a.captivatingIndex))
    .slice(0, max)
    .sort((a, b) => a.atBatIndex - b.atBatIndex)
    .map(p => ({ inning: p.inning, half: p.halfInning, text: p.description, away: p.awayScore, home: p.homeScore, scoring: p.isScoringPlay }))
}

/** Every hit with a landing spot, tagged with the club that hit it (battingTeamId). */
export function hitsOnField(balls: BattedBallRecord[], awayTeamId: number): PgHit[] {
  return balls
    .filter(b => b.resultEvent != null && HIT_KIND[b.resultEvent] && b.coordX != null && b.coordY != null)
    .sort((a, b) => a.atBatIndex - b.atBatIndex)
    .map(b => ({
      side: b.battingTeamId === awayTeamId ? 'away' as const : 'home' as const,
      kind: HIT_KIND[b.resultEvent as string],
      ...gridToStory(b.coordX as number, b.coordY as number),
      batter: b.batterName, inning: b.inning, exitVelo: b.launchSpeed,
    }))
}

/** Win-probability points as the chart wants them; empty when the feed had none. */
export function flowPoints(pts: WinProbabilityPoint[]) {
  return pts.map(p => ({ inning: p.inning, half: p.halfInning, home: p.homeWinPct }))
}

/** Linescore rows in away, home order, padded to at least 9 innings. */
export function linescoreRows(rows: LinescoreRow[], awayTeamId: number) {
  const mk = (side: PgSide, r: LinescoreRow | undefined) => r ? { side, abbr: r.abbreviation, runs: r.runsByInning } : null
  const away = mk('away', rows.find(r => r.teamId === awayTeamId))
  const home = mk('home', rows.find(r => r.teamId !== awayTeamId))
  return [away, home].filter(Boolean) as { side: PgSide; abbr: string; runs: (number | null)[] }[]
}

/** The two points of the game-flow line that are furthest apart between neighbours: the biggest swing. */
export function biggestSwing(pts: { inning: number; half: 'top' | 'bottom'; home: number }[]): { i: number; inning: number; half: 'top' | 'bottom' } | null {
  let best = -1, at = 0
  for (let i = 1; i < pts.length; i++) {
    const d = Math.abs(pts[i].home - pts[i - 1].home)
    if (d > best) { best = d; at = i }
  }
  return best > 0 ? { i: at, inning: pts[at].inning, half: pts[at].half } : null
}
