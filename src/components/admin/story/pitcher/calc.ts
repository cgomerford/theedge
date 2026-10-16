// src/components/admin/story/pitcher/calc.ts
//
// Pure helpers for the Pitcher Reel: no I/O, no React. The server action feeds
// these the finished game's rows; tests cover them directly.

import type { AtBatSummary, BattedBallRecord, PitchRecord } from '@/types/postgame'
import { pitchColor } from '../pitchColors'
import { HOME } from '../diamondGeo'
import type { ReelHit, ReelNext, ReelPitchDot, ReelTto } from './types'

const HIT_KIND: Record<string, ReelHit['kind']> = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' }
const NOT_AB = new Set(['walk', 'intent_walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'sac_fly_double_play', 'sac_bunt_double_play', 'catcher_interf'])
const K_EVENTS = new Set(['strikeout', 'strikeout_double_play'])
const BB_EVENTS = new Set(['walk', 'intent_walk'])

/**
 * Gameday's 250x250 field grid → the story's 1000-unit diamond. Home plate is (125, 205) on the
 * Gameday grid (same constants as PostGameSprayChart) and 80 grid units reach second base, which sits
 * 424 units above home in diamondGeo, so 1 grid unit = 5.3 story units. Clamped to stay inside the box.
 */
export const GRID_TO_STORY = 5.3
export function gridToStory(coordX: number, coordY: number): { x: number; y: number } {
  const clamp = (v: number) => Math.min(980, Math.max(20, v))
  return { x: clamp(HOME.x + (coordX - 125) * GRID_TO_STORY), y: clamp(HOME.y + (coordY - 205) * GRID_TO_STORY) }
}

/** Hits this pitcher allowed that have a landing spot, in the order they happened. */
export function hitsAllowed(balls: BattedBallRecord[], pitcherId: number): ReelHit[] {
  return balls
    .filter(b => b.pitcherId === pitcherId && b.resultEvent != null && HIT_KIND[b.resultEvent] && b.coordX != null && b.coordY != null)
    .sort((a, b) => a.atBatIndex - b.atBatIndex)
    .map(b => ({
      ...gridToStory(b.coordX as number, b.coordY as number),
      kind: HIT_KIND[b.resultEvent as string],
      inning: b.inning,
      batter: b.batterName,
      exitVelo: b.launchSpeed,
    }))
}

const TTO_LABEL = ['1st time', '2nd time', '3rd time']

/**
 * Times through the order, from this game's plate appearances: a batter's Nth PA against this
 * pitcher is "time N" (3rd and later share the last bucket). Buckets with no PA are dropped.
 */
export function throughTheOrder(atBats: AtBatSummary[], pitcherId: number, seasonAvg: (number | null)[]): ReelTto[] {
  const seen = new Map<number, number>()
  const acc = TTO_LABEL.map(() => ({ pa: 0, ab: 0, h: 0, k: 0, bb: 0 }))
  for (const ab of [...atBats].filter(a => a.pitcherId === pitcherId).sort((a, b) => a.atBatIndex - b.atBatIndex)) {
    const n = seen.get(ab.batterId) ?? 0
    seen.set(ab.batterId, n + 1)
    const b = acc[Math.min(n, 2)]
    b.pa += 1
    if (!NOT_AB.has(ab.eventType)) b.ab += 1
    if (HIT_KIND[ab.eventType]) b.h += 1
    if (K_EVENTS.has(ab.eventType)) b.k += 1
    if (BB_EVENTS.has(ab.eventType)) b.bb += 1
  }
  return acc
    .map((b, i) => ({ label: i === 2 ? '3rd time +' : TTO_LABEL[i], ...b, avg: b.ab > 0 ? b.h / b.ab : null, seasonAvg: seasonAvg[i] ?? null }))
    .filter(r => r.pa > 0)
}

/** "6.1" → 19 outs; the box score prints innings as whole.thirds. */
export function ipToOuts(ip: string): number {
  const [w, f] = ip.split('.')
  return (Number(w) || 0) * 3 + (Number(f) || 0)
}

/** Rate per 9 innings from outs recorded; null when no outs (so a 0-out start shows "—", not a fake 0.00). */
export function per9(count: number, outs: number): number | null {
  return outs > 0 ? (count * 27) / outs : null
}

export function whip(h: number, bb: number, outs: number): number | null {
  return outs > 0 ? ((h + bb) * 3) / outs : null
}

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export type FutureGame = { date: string; oppAbbr: string; home: boolean; probablePitcherId: number | null }

/**
 * Next start: the first scheduled game where he is the announced probable pitcher; otherwise the
 * first game on or after the 5th day after this start (4 days' rest), labelled "earliest", never
 * presented as announced.
 */
export function nextStart(startDate: string, pitcherId: number, games: FutureGame[]): ReelNext | null {
  const future = games.filter(g => g.date > startDate).sort((a, b) => a.date.localeCompare(b.date))
  const announced = future.find(g => g.probablePitcherId === pitcherId)
  if (announced) return { kind: 'announced', date: announced.date, oppAbbr: announced.oppAbbr, home: announced.home }
  const earliest = future.find(g => g.date >= addDays(startDate, 5))
  return earliest ? { kind: 'earliest', date: earliest.date, oppAbbr: earliest.oppAbbr, home: earliest.home } : null
}

/** Reference zone height (22 in) every pitch is rescaled to, so batters of different heights share one box. */
export const ZONE_FT = 1.83

/**
 * This pitcher's located pitches in game order, each tagged with the count BEFORE it was thrown
 * (the previous pitch's count-after within the same plate appearance, 0-0 for the first).
 * z is rescaled between that batter's own zone bottom/top; pitches with no location are skipped.
 */
export function pitchDots(log: PitchRecord[], pitcherId: number): ReelPitchDot[] {
  const mine = log.filter(p => p.pitcherId === pitcherId).sort((a, b) => a.atBatIndex - b.atBatIndex || a.pitchNumber - b.pitchNumber)
  const out: ReelPitchDot[] = []
  let prev: PitchRecord | null = null
  for (const p of mine) {
    const before = prev && prev.atBatIndex === p.atBatIndex ? prev.countAfter : { balls: 0, strikes: 0 }
    prev = p
    if (p.plateX == null || p.plateZ == null || !p.typeCode) continue
    const { strikeZoneBottom: bot, strikeZoneTop: top } = p
    if (bot == null || top == null || top <= bot) continue
    out.push({
      code: p.typeCode, color: pitchColor(p.typeCode), x: p.plateX, z: ((p.plateZ - bot) / (top - bot)) * ZONE_FT,
      balls: Math.min(3, before.balls), strikes: Math.min(2, before.strikes),
    })
  }
  return out
}
