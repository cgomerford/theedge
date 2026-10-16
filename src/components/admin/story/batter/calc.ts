// src/components/admin/story/batter/calc.ts
//
// Pure helpers for the Batter Reel: no I/O, no React.

import type { AtBatSummary, BattedBallRecord, PitchRecord } from '@/types/postgame'
import { shortName } from '../names'
import { gridToStory, ZONE_FT } from '../pitcher/calc'
import type { BrBall, BrCall, BrPa, BrPitch } from './types'

const HIT_KIND: Record<string, 'single' | 'double' | 'triple' | 'home_run'> = { single: 'single', double: 'double', triple: 'triple', home_run: 'home_run' }
const KIND: Record<string, BrBall['kind']> = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' }
const HIT_LABEL: Record<string, string> = { single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home run' }
const TRAJ_OUT: Record<string, string> = { ground_ball: 'Groundout', fly_ball: 'Flyout', line_drive: 'Lineout', popup: 'Pop out' }

/** MLB event type → short result. Falls back to a title-cased event name, never a guess. */
export function eventLabel(eventType: string): string {
  const map: Record<string, string> = {
    single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home run', walk: 'Walk', intent_walk: 'Intentional walk',
    hit_by_pitch: 'Hit by pitch', strikeout: 'Strikeout', strikeout_double_play: 'Strikeout (DP)', field_out: 'Out in play',
    force_out: 'Force out', grounded_into_double_play: 'Grounded into DP', double_play: 'Double play', sac_fly: 'Sac fly',
    sac_bunt: 'Sac bunt', fielders_choice: "Fielder's choice", fielders_choice_out: "Fielder's choice", field_error: 'Reached on error',
    catcher_interf: 'Catcher interference',
  }
  return map[eventType] ?? eventType.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

export const isHitEvent = (e: string) => e in HIT_KIND

/** Every plate appearance of this batter, in game order, with the pitches seen and the final count. */
export function plateAppearances(atBats: AtBatSummary[], log: PitchRecord[], batterId: number): BrPa[] {
  return atBats
    .filter(a => a.batterId === batterId)
    .sort((a, b) => a.atBatIndex - b.atBatIndex)
    .map(a => {
      const ps = log.filter(p => p.atBatIndex === a.atBatIndex).sort((x, y) => x.pitchNumber - y.pitchNumber)
      const last = ps[ps.length - 1]
      return {
        inning: a.inning, half: a.halfInning, pitcher: shortName(a.pitcherName), result: eventLabel(a.eventType), hit: isHitEvent(a.eventType),
        pitches: ps.length, count: last ? `${last.countAfter.balls}-${last.countAfter.strikes}` : null,
      }
    })
}

/** Balls in play with a landing spot: hits by kind, everything else as an out-type label. */
export function ballsInPlay(balls: BattedBallRecord[], batterId: number): BrBall[] {
  return balls
    .filter(b => b.batterId === batterId && b.coordX != null && b.coordY != null)
    .sort((a, b) => a.atBatIndex - b.atBatIndex)
    .map(b => {
      const ev = b.resultEvent ?? ''
      return {
        ...gridToStory(b.coordX as number, b.coordY as number),
        kind: KIND[ev] ?? 'OUT',
        label: HIT_LABEL[ev] ?? (b.trajectory ? TRAJ_OUT[b.trajectory] ?? 'Out' : 'Out'),
        ev: b.launchSpeed, la: b.launchAngle, dist: b.totalDistance, inning: b.inning,
      }
    })
}

export function contactSummary(balls: BattedBallRecord[], batterId: number) {
  const mine = balls.filter(b => b.batterId === batterId)
  const evs = mine.map(b => b.launchSpeed).filter((v): v is number => v != null)
  const dists = mine.map(b => b.totalDistance).filter((v): v is number => v != null)
  if (mine.length === 0) return null
  return {
    inPlay: mine.length,
    hardest: evs.length ? Math.max(...evs) : null,
    avgEv: evs.length ? evs.reduce((s, v) => s + v, 0) / evs.length : null,
    hardHit: evs.filter(v => v >= 95).length,
    longest: dists.length ? Math.max(...dists) : null,
  }
}

function callOf(p: PitchRecord): BrCall | null {
  switch (p.callCode) {
    case 'S': case 'W': case 'M': case 'Q': return 'whiff'
    case 'C': return 'called'
    case 'B': case '*B': case 'P': case 'I': return 'ball'
    case 'F': case 'L': case 'T': case 'R': return 'foul'
    case 'X': case 'D': case 'E': return 'inplay'
  }
  return p.isInPlay ? 'inplay' : p.isBall ? 'ball' : p.isStrike ? 'called' : null
}

/** Every pitch he saw with a location, z rescaled to his own zone (same convention as the pitcher reel). */
export function pitchesSeen(log: PitchRecord[], batterId: number): BrPitch[] {
  const out: BrPitch[] = []
  for (const p of log.filter(x => x.batterId === batterId).sort((a, b) => a.atBatIndex - b.atBatIndex || a.pitchNumber - b.pitchNumber)) {
    if (p.plateX == null || p.plateZ == null) continue
    const { strikeZoneBottom: bot, strikeZoneTop: top } = p
    if (bot == null || top == null || top <= bot) continue
    const call = callOf(p)
    if (!call) continue
    out.push({ x: p.plateX, z: ((p.plateZ - bot) / (top - bot)) * ZONE_FT, call })
  }
  return out
}
