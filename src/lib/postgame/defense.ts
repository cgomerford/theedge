// src/lib/postgame/defense.ts
//
// Postgame §10 Defense & run game — from the live feed's per-play `runners[]` entries, confirmed
// across 14 finals (2026-09-14..18):
//   errors        a runner entry whose credits[] carry credit "f_fielding_error" / "f_throwing_error"
//                 (fielder + position on the credit); runs scoring on that play carry teamUnearned
//   double plays  play eventType double_play / grounded_into_double_play / strikeout_double_play / triple_play
//   OF assists    a runner out credited "f_assist_of"
//   steals        runner event "Stolen Base 2B|3B|Home" and "Caught Stealing 2B|3B|Home" (a catcher's
//                 f_assist on the credit marks who threw him out)
//   pickoffs      runner event starting "Pickoff" (an out) — "Pickoff Error …" is counted as an error
//   pitch-level   Wild Pitch / Passed Ball / Balk entries
// "Errors" belong to the fielding club: the batting side is the one the play happened to.

import type { PostData, PFPlay } from './data'
import type { Side } from './recap'

export type DefEvent = {
  kind: 'error' | 'dp' | 'of-assist' | 'steal' | 'caught' | 'pickoff' | 'wp' | 'pb' | 'balk'
  inning: number; top: boolean
  fielding: Side                 // the club whose defense / pitcher-catcher battery was on the field
  text: string
  unearnedRuns: number           // errors only: runs that scored on the play flagged team-unearned
}
export type DefenseNight = { events: DefEvent[]; teamErrors: Record<Side, number>; runs: { unearned: Record<Side, number> } }

const DP_TYPES = new Set(['double_play', 'grounded_into_double_play', 'strikeout_double_play', 'triple_play'])

/** first sentence of the feed's own description, e.g. "…reaches on a fielding error by shortstop X." */
function errorText(p: PFPlay, pos: string | undefined, throwing: boolean): string {
  const desc = p.result.description ?? ''
  const m = desc.match(/[^.]*\b(?:fielding|throwing|catching) error by[^.]*\./i)
  return m ? m[0].trim() : `${throwing ? 'Throwing' : 'Fielding'} error${pos ? ` (${pos})` : ''}`
}

export function buildDefense(d: PostData): DefenseNight {
  const events: DefEvent[] = []
  const teamErrors: Record<Side, number> = { away: 0, home: 0 }
  const unearned: Record<Side, number> = { away: 0, home: 0 }
  for (const play of d.feed.liveData.plays.allPlays) {
    const top = play.about.isTopInning
    const fielding: Side = top ? 'home' : 'away'
    const base = { inning: play.about.inning, top, fielding }
    const runners = play.runners ?? []

    // errors — one line per play, however many runners moved on it
    const errCredits = runners.flatMap((r) => (r.credits ?? []).filter((c) => /error/.test(c.credit ?? '')).map((c) => ({ r, c })))
    if (errCredits.length > 0) {
      const { c } = errCredits[0]
      const scored = runners.filter((r) => r.details.isScoringEvent && r.details.teamUnearned).length
      teamErrors[fielding] += errCredits.length
      unearned[fielding] += scored
      events.push({ kind: 'error', ...base, text: errorText(play, c.position?.abbreviation, /throwing/.test(c.credit ?? '')), unearnedRuns: scored })
    }
    if (DP_TYPES.has(play.result.eventType ?? '')) {
      const desc = (play.result.description ?? '').split('.').slice(0, 1).join('.')
      events.push({ kind: 'dp', ...base, text: `${play.result.eventType === 'triple_play' ? 'Triple play' : 'Double play'}: ${desc}.`, unearnedRuns: 0 })
    }
    for (const r of runners) {
      const ev = r.details.event ?? ''
      const who = r.details.runner.fullName
      if ((r.credits ?? []).some((c) => c.credit === 'f_assist_of') && r.movement.isOut) {
        const of = r.credits?.find((c) => c.credit === 'f_assist_of')
        const sentence = (play.result.description ?? '').split('. ').find((x) => /out at|thrown out/i.test(x))?.trim().replace(/\.$/, '')
        events.push({ kind: 'of-assist', ...base, text: `${sentence ?? `${who} thrown out by ${of?.position?.abbreviation ?? 'an outfielder'}`}.`, unearnedRuns: 0 })
      }
      if (/^Stolen Base/.test(ev)) events.push({ kind: 'steal', ...base, text: `${who} stole ${ev.replace('Stolen Base ', '')} off ${play.matchup.pitcher.fullName}.`, unearnedRuns: 0 })
      else if (/^Caught Stealing/.test(ev)) {
        const c = (r.credits ?? []).find((x) => x.credit === 'f_assist' && x.position?.abbreviation === 'C')
        events.push({ kind: 'caught', ...base, text: `${who} caught stealing ${ev.replace('Caught Stealing ', '')}${c ? ' (thrown out by the catcher)' : ''}.`, unearnedRuns: 0 })
      } else if (/^Pickoff/.test(ev) && !/Error/.test(ev) && r.movement.isOut) events.push({ kind: 'pickoff', ...base, text: `${who} picked off (${ev.replace('Pickoff ', '')}).`, unearnedRuns: 0 })
      else if (ev === 'Wild Pitch') events.push({ kind: 'wp', ...base, text: `Wild pitch by ${play.matchup.pitcher.fullName}: ${who} advances.`, unearnedRuns: 0 })
      else if (ev === 'Passed Ball') events.push({ kind: 'pb', ...base, text: `Passed ball: ${who} advances.`, unearnedRuns: 0 })
      else if (ev === 'Balk') events.push({ kind: 'balk', ...base, text: `Balk by ${play.matchup.pitcher.fullName}.`, unearnedRuns: 0 })
    }
  }
  return { events, teamErrors, runs: { unearned } }
}
