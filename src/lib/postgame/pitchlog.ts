// src/lib/postgame/pitchlog.ts
//
// One normalised pitch-by-pitch log derived from the live feed, shared by the Pro plan-vs-execution
// sections (sequencing, count spots, zone clash, arsenal night, chase/whiff, bullpen pitch types).
// Every field was confirmed on real feeds: playEvents[].details.type.code / call.code, pitchData.zone /
// coordinates.{pX,pZ} / startSpeed, play.matchup.{batSide,pitchHand}.code. e.count is the count AFTER the
// pitch, so the count a pitch was thrown in is tracked from the previous pitch of the plate appearance.

import type { PostData } from './data'
import type { Side } from './recap'

export type PitchRec = {
  atBat: number; inning: number; top: boolean
  fielding: Side                    // the club whose pitcher threw it
  pitcherId: number; batterId: number; batterName: string
  batSide: 'L' | 'R' | null         // side the batter hit from in this plate appearance
  seq: number                       // 1 = first pitch of the plate appearance
  prevType: string | null           // previous pitch type in the same plate appearance
  tto: number                       // nth time this batter faced this pitcher (1, 2, 3…)
  type: string; typeName: string
  balls: number; strikes: number    // count when thrown
  zone: number | null               // Statcast zone: 1–9 in the strike zone, 11–14 outside
  x: number | null; z: number | null
  velo: number | null
  swing: boolean; whiff: boolean; inPlay: boolean
  call: string
  ev: number | null
  result: string                    // how the plate appearance ended (result event), on every pitch of it
  hit: boolean
  pitcher: string                   // pitcher's name
  bases: Bases                      // runners on 1B / 2B / 3B when the pitch was thrown
  outs: number
  resultType: string                // the plate appearance's eventType (single, strikeout…)
  rx: number | null; rz: number | null   // release point, feet (pitchData.coordinates.x0 / z0)
  callText: string                  // what the pitch itself was: "Called Strike", "Swinging Strike", "In play, out(s)"…
}

export type Bases = [boolean, boolean, boolean]
export type PitchCtx = { bases: Bases; outs: number }

// The feed labels a two-seamer FT; the season tables file it under SI.
const CANON: Record<string, string> = { FT: 'SI' }
const SKIP = new Set(['PO', 'IN', 'AB', 'UN', 'FO', ''])          // pitchouts, intentional balls, automatic balls, unknown
const SWING = new Set(['S', 'W', 'T', 'F', 'L', 'M', 'Q', 'X', 'D', 'E'])
const WHIFF = new Set(['S', 'W', 'T', 'M', 'Q'])
const HIT = new Set(['single', 'double', 'triple', 'home_run'])
const SHORT: Record<string, string> = { 'Four-Seam Fastball': '4-seam', 'Two-Seam Fastball': 'Sinker', 'Knuckle Curve': 'Knuckle-curve' }

export const FAMILY: Record<string, 'Fastball' | 'Breaking' | 'Offspeed'> = {
  FF: 'Fastball', SI: 'Fastball', FC: 'Fastball', FA: 'Fastball',
  SL: 'Breaking', ST: 'Breaking', CU: 'Breaking', KC: 'Breaking', SV: 'Breaking', CS: 'Breaking', GY: 'Breaking',
  CH: 'Offspeed', FS: 'Offspeed', FO: 'Offspeed', SC: 'Offspeed', EP: 'Offspeed',
}

/**
 * Runners on base and outs at every pitch, keyed `${atBatIndex}:${eventIndex}`. The feed only lists runners that MOVE, so
 * occupancy is simulated: bases clear each half-inning; runner entries are applied in order (an entry's details.playIndex is
 * the event it belongs to, so a steal mid-plate-appearance is applied before the next pitch, and the plate appearance's own
 * result after its last pitch). A runner whose first entry starts from a base we hadn't marked (the extra-innings runner on
 * second) is assumed to have been there from the start of the plate appearance.
 */
export function pitchContexts(d: PostData): Map<string, PitchCtx> { return simulate(d).ctx }

/** runners left on base at the end of each club's half-innings, from the same simulation (used to check it against the official linescore) */
export function simulatedLob(d: PostData): { away: number; home: number } { return simulate(d).lob }

function simulate(d: PostData): { ctx: Map<string, PitchCtx>; lob: { away: number; home: number } } {
  const out = new Map<string, PitchCtx>()
  const lob = { away: 0, home: 0 }
  let bases: Bases = [false, false, false]
  let inn = 0, half: boolean | null = null
  const idx = (b?: string | null): number => (b === '1B' ? 0 : b === '2B' ? 1 : b === '3B' ? 2 : -1)
  for (const play of d.feed.liveData.plays.allPlays) {
    if (play.about.inning !== inn || play.about.isTopInning !== half) { bases = [false, false, false]; inn = play.about.inning; half = play.about.isTopInning }
    const moves = [...(play.runners ?? [])].sort((a, b) => (a.details.playIndex ?? 0) - (b.details.playIndex ?? 0))
    const shadow = [...bases]
    for (const m of moves) {
      const from = idx(m.movement.start), to = idx(m.movement.end)
      if (from >= 0 && !shadow[from]) { bases[from] = true; shadow[from] = true }   // was already on base at the start of the plate appearance
      if (from >= 0) shadow[from] = false
      if (to >= 0 && !m.movement.isOut) shadow[to] = true
    }
    // entries for the same event are listed in no base order (a runner moving up to 3B can precede the one leaving it),
    // so each event's movements are applied in two phases: clear every base someone leaves, then fill every base reached
    let next = 0
    const apply = (upTo: number) => {
      while (next < moves.length && (moves[next].details.playIndex ?? 0) < upTo) {
        const at = moves[next].details.playIndex ?? 0
        const group: typeof moves = []
        while (next < moves.length && (moves[next].details.playIndex ?? 0) === at) group.push(moves[next++])
        // one runner can appear several times in one event (steals second, then takes third on the throw): net it out to
        // where he started and where he finished
        const net = new Map<number, { from: number; to: number; out: boolean }>()
        for (const m of group) {
          const cur = net.get(m.details.runner.id)
          if (cur) { cur.to = idx(m.movement.end); cur.out = cur.out || !!m.movement.isOut } else net.set(m.details.runner.id, { from: idx(m.movement.start), to: idx(m.movement.end), out: !!m.movement.isOut })
        }
        for (const r of net.values()) if (r.from >= 0) bases[r.from] = false
        for (const r of net.values()) if (r.to >= 0 && !r.out) bases[r.to] = true
      }
    }
    for (const e of play.playEvents ?? []) {
      if (!e.isPitch || e.index == null) continue
      apply(e.index)
      out.set(`${play.about.atBatIndex}:${e.index}`, { bases: [...bases] as Bases, outs: e.count?.outs ?? play.count.outs })
    }
    apply(Infinity)
    // a plate appearance that ends the half-inning leaves nothing on base
    if (play.count.outs >= 3) { lob[play.about.isTopInning ? 'away' : 'home'] += bases.filter(Boolean).length; bases = [false, false, false] }
  }
  return { ctx: out, lob }
}

export function buildPitchLog(d: PostData): PitchRec[] {
  const ctxs = pitchContexts(d)
  const out: PitchRec[] = []
  const faced = new Map<string, number>()          // pitcherId|batterId → plate appearances so far
  for (const play of d.feed.liveData.plays.allPlays) {
    const key = `${play.matchup.pitcher.id}|${play.matchup.batter.id}`
    const tto = (faced.get(key) ?? 0) + 1
    faced.set(key, tto)
    const side = play.matchup.batSide?.code
    const eventType = play.result.eventType ?? ''
    let balls = 0, strikes = 0, seq = 0, prev: string | null = null
    for (const e of play.playEvents ?? []) {
      if (!e.isPitch) continue
      const raw = e.details?.type?.code ?? ''
      const call = e.details?.call?.code ?? ''
      const pre = { balls, strikes }
      balls = e.count?.balls ?? balls; strikes = e.count?.strikes ?? strikes
      seq += 1
      if (SKIP.has(raw)) continue
      const type = CANON[raw] ?? raw
      const desc = e.details?.type?.description ?? type
      const ctx = ctxs.get(`${play.about.atBatIndex}:${e.index}`)
      out.push({
        resultType: eventType, rx: e.pitchData?.coordinates?.x0 ?? null, rz: e.pitchData?.coordinates?.z0 ?? null,
        pitcher: play.matchup.pitcher.fullName, bases: ctx?.bases ?? [false, false, false], outs: ctx?.outs ?? 0, callText: e.details?.call?.description ?? '',
        atBat: play.about.atBatIndex, inning: play.about.inning, top: play.about.isTopInning,
        fielding: play.about.isTopInning ? 'home' : 'away',
        pitcherId: play.matchup.pitcher.id, batterId: play.matchup.batter.id, batterName: play.matchup.batter.fullName,
        batSide: side === 'L' || side === 'R' ? side : null,
        seq, prevType: prev, tto, type, typeName: SHORT[desc] ?? desc,
        balls: pre.balls, strikes: pre.strikes,
        zone: e.pitchData?.zone ?? null,
        x: e.pitchData?.coordinates?.pX ?? null, z: e.pitchData?.coordinates?.pZ ?? null,
        velo: e.pitchData?.startSpeed ?? null,
        swing: SWING.has(call), whiff: WHIFF.has(call), inPlay: call === 'X' || call === 'D' || call === 'E',
        call, ev: e.hitData?.launchSpeed ?? null,
        result: play.result.event ?? eventType, hit: HIT.has(eventType) && (call === 'X' || call === 'D' || call === 'E'),
      })
      prev = type
    }
  }
  return out
}

/** the starter (first pitcher used) for each club */
export function startersOf(d: PostData): { side: Side; id: number; name: string }[] {
  const box = d.feed.liveData.boxscore.teams
  return (['away', 'home'] as Side[]).flatMap((side) => {
    const id = box[side].pitchers?.[0]
    const p = id != null ? box[side].players[`ID${id}`] : undefined
    return id != null && p ? [{ side, id, name: p.person.fullName }] : []
  })
}

export const countGroup = (b: number, s: number): 'First pitch' | 'Ahead' | 'Even' | 'Behind' | 'Two strikes' =>
  b === 0 && s === 0 ? 'First pitch' : s === 2 ? 'Two strikes' : s > b ? 'Ahead' : s === b ? 'Even' : 'Behind'
export const COUNT_GROUPS = ['First pitch', 'Ahead', 'Even', 'Behind', 'Two strikes'] as const
