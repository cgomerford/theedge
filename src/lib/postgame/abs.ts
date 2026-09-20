// src/lib/postgame/abs.ts
//
// Postgame §8 ABS & challenges — the automated ball-strike challenges used in this game.
// Source is the live feed, confirmed on game 824225: a challenged pitch event carries
// `reviewDetails { reviewType: "MJ", challengeTeamId, isOverturned, player }` (the same field
// scripts/fetch_abs_challenge_log.py keys on), and gameData.absChallenges gives each club's
// usedSuccessful / usedFailed / remaining. The pitch event's call is the FINAL call, so for an
// overturned challenge the original call was the opposite one.
// Who challenged: the challenging club batting → the batter; otherwise the pitcher if the named
// player is the pitcher in the plate appearance, else the catcher (ABS challenges come only from
// batter, pitcher or catcher). Not every challenge is tagged on its pitch — see the note in buildAbs.

import type { PostData, PFPlay, PFEvent } from './data'
import type { Side } from './recap'

export type Challenge = {
  n: number
  inning: number; top: boolean
  side: Side                       // club that challenged
  who: { id: number; name: string; role: 'Batter' | 'Catcher' | 'Pitcher' }
  batter: string; pitcher: string
  overturned: boolean | null
  pitchType: string
  originalCall: 'Ball' | 'Called strike'
  finalCall: 'Ball' | 'Called strike'
  count: string                    // count before the challenged pitch
  wpIndex: number | null           // position in the win-probability series, for the timeline marker
}
export type AbsSide = { side: Side; used: number; successful: number; failed: number; remaining: number | null }
export type AbsNight = { challenges: Challenge[]; sides: AbsSide[] }

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

export function buildAbs(d: PostData): AbsNight {
  const gd = d.feed.gameData
  const sideOfTeam = (id?: number): Side | null => (id === gd.teams.away.id ? 'away' : id === gd.teams.home.id ? 'home' : null)
  const challenges: Challenge[] = []

  const add = (play: PFPlay, e: PFEvent, side: Side, who: Challenge['who'], overturned: boolean | null) => {
    const code = e.details?.call?.code
    if (code !== 'C' && code !== 'B') return                    // only ball/called-strike takes can be challenged
    const finalCall = code === 'C' ? 'Called strike' : 'Ball'
    const opposite = finalCall === 'Ball' ? 'Called strike' : 'Ball'
    // e.count is the count AFTER this pitch, so take the pitch back out to get the count it was thrown in
    const balls = n(e.count?.balls) - (code === 'B' ? 1 : 0)
    const strikes = n(e.count?.strikes) - (code === 'C' ? 1 : 0)
    const wpIndex = d.wp.findIndex((w) => w.atBatIndex === play.about.atBatIndex)
    challenges.push({
      n: 0, inning: play.about.inning, top: play.about.isTopInning, side, who,
      batter: play.matchup.batter.fullName, pitcher: play.matchup.pitcher.fullName,
      overturned,
      pitchType: e.details?.type?.description ?? 'Pitch',
      originalCall: overturned ? opposite : finalCall, finalCall,
      count: `${Math.max(0, balls)}-${Math.max(0, strikes)}`,
      wpIndex: wpIndex >= 0 ? wpIndex : null,
    })
  }

  for (const play of d.feed.liveData.plays.allPlays) {
    const battingSide: Side = play.about.isTopInning ? 'away' : 'home'
    const events = play.playEvents ?? []
    // 1) challenges the feed tags on the pitch itself
    for (const e of events) {
      const rv = e.reviewDetails
      if (!e.isPitch || !rv || rv.reviewType !== 'MJ') continue
      const side = sideOfTeam(rv.challengeTeamId)
      if (!side) continue
      const pid = rv.player?.id
      const role = side === battingSide ? 'Batter' : pid === play.matchup.pitcher.id ? 'Pitcher' : 'Catcher'
      add(play, e, side, { id: pid ?? 0, name: rv.player?.fullName ?? 'Unknown', role }, typeof rv.isOverturned === 'boolean' ? rv.isOverturned : null)
    }
    // 2) a challenge on the pitch that ENDS the plate appearance (ball four / strike three) is not tagged
    //    on the pitch; the play's description carries it: "<Name> challenged (pitch result), call on the
    //    field was overturned|confirmed: …". Unioned with (1), the two sources matched MLB's official
    //    per-club challenge totals in all 14 finals checked (2026-09-14..18).
    const m = (play.result.description ?? '').match(/^(.+?) challenged \(pitch result\), call on the field was (\w+)/)
    const last = [...events].reverse().find((e) => e.isPitch)
    if (m && last && !last.reviewDetails) {
      const name = m[1]
      const role: Challenge['who']['role'] = name === play.matchup.batter.fullName ? 'Batter' : name === play.matchup.pitcher.fullName ? 'Pitcher' : 'Catcher'
      const side: Side = role === 'Batter' ? battingSide : battingSide === 'away' ? 'home' : 'away'
      add(play, last, side, { id: role === 'Batter' ? play.matchup.batter.id : role === 'Pitcher' ? play.matchup.pitcher.id : 0, name, role }, m[2] === 'overturned' ? true : m[2] === 'confirmed' ? false : null)
    }
  }
  challenges.forEach((c, i) => { c.n = i + 1 })

  const abs = gd.absChallenges
  const sides: AbsSide[] = (['away', 'home'] as Side[]).flatMap((side) => {
    const s = abs?.[side]
    if (!s) return []
    const successful = n(s.usedSuccessful), failed = n(s.usedFailed)
    return [{ side, used: successful + failed, successful, failed, remaining: s.remaining != null ? n(s.remaining) : null }]
  })
  return { challenges, sides }
}
