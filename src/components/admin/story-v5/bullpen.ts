// src/components/admin/story-v5/bullpen.ts
//
// Pure: box scores -> bullpen rows. Two views: the previous game's pitch counts, and the last 3 days with days of rest.
// Days of rest come from the real last appearance DATE found in box scores (never from a stored counter: the old site showed 31 and 32).
// Verified fields (gamePk 849805): game/{pk}/boxscore -> teams.{away,home}.{team.id, pitchers[], players['ID<id>'].{person, stats.pitching.{numberOfPitches, inningsPitched}}}.

import { headshotUrl } from './teams'
import { lastName } from './beats'
import type { BullpenArm, BullpenL3Arm } from './types'

type BoxPlayer = { person: { id: number; fullName: string }; stats?: { pitching?: { numberOfPitches?: number; inningsPitched?: string } } }
export type BoxSide = { team: { id: number }; pitchers: number[]; players: Record<string, BoxPlayer> }
export type Box = { teams: { away: BoxSide; home: BoxSide } }

const pitching = (s: BoxSide, id: number) => s.players[`ID${id}`]
const pitchesOf = (s: BoxSide, id: number) => Number(pitching(s, id)?.stats?.pitching?.numberOfPitches) || 0

/** Relievers of one side (everyone after the starter) who threw at least one pitch, most pitches first. */
export function lastGameArms(box: Box, side: 'away' | 'home'): BullpenArm[] {
  const s = box.teams[side]
  return s.pitchers.slice(1).flatMap(id => {
    const p = pitching(s, id), n = pitchesOf(s, id)
    return p && n > 0 ? [{ id, name: p.person.fullName, last: lastName(p.person.fullName), teamId: s.team.id, headshot: headshotUrl(id), pitches: n, ip: p.stats?.pitching?.inningsPitched ?? '' }] : []
  }).sort((a, b) => b.pitches - a.pitches)
}

export function bullpenLines(away: BullpenArm[], home: BullpenArm[]): { headline: string; closing: string } {
  const all = [...away, ...home].sort((a, b) => b.pitches - a.pitches)
  const [top, second] = all
  if (!top) return { headline: '', closing: '' }
  const carried = !second || top.pitches >= second.pitches * 1.5
  return {
    headline: carried ? 'One arm carried the load.' : 'The work was shared around.',
    closing: carried && second ? `${top.last}: ${top.pitches} pitches over ${top.ip} innings. Nobody else threw more than ${second.pitches}.` : `${top.last} threw the most, ${top.pitches} pitches.`,
  }
}

const dayMs = 86_400_000
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / dayMs)

/** Window of finished games for one club (dates are the game dates). Arms must be on the active roster. */
export function last3Arms(games: { date: string; box: Box }[], teamId: number, slateDate: string, rosterIds: Set<number>): BullpenL3Arm[] {
  const acc = new Map<number, { name: string; byDate: number[]; lastDate: string | null }>()
  const starters = new Set<number>()                              // a bullpen view is relievers only
  for (const g of games) {
    const side = g.box.teams.away.team.id === teamId ? g.box.teams.away : g.box.teams.home.team.id === teamId ? g.box.teams.home : null
    if (!side) continue
    const ago = diffDays(slateDate, g.date)                       // 1 = yesterday
    if (side.pitchers[0] != null) starters.add(side.pitchers[0])
    for (const id of side.pitchers) {
      const n = pitchesOf(side, id)
      if (!(n > 0) || !rosterIds.has(id)) continue
      const e = acc.get(id) ?? { name: pitching(side, id)!.person.fullName, byDate: [0, 0, 0], lastDate: null }
      if (ago >= 1 && ago <= 3) e.byDate[3 - ago] += n
      if (!e.lastDate || g.date > e.lastDate) e.lastDate = g.date
      acc.set(id, e)
    }
  }
  return [...acc].filter(([id]) => !starters.has(id)).map(([id, e]) => {
    const p3 = e.byDate.reduce((a, b) => a + b, 0)
    return {
      id, name: e.name, last: lastName(e.name), teamId, headshot: headshotUrl(id), p3, byDate: e.byDate, lastDate: e.lastDate,
      daysRest: e.lastDate ? Math.max(0, diffDays(slateDate, e.lastDate) - 1) : null,
      likelyUnavailable: p3 >= 50 || e.byDate.every(x => x > 0),
    }
  }).sort((a, b) => b.p3 - a.p3)
}
