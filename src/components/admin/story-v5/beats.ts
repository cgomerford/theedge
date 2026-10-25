// src/components/admin/story-v5/beats.ts
//
// Pure: StatsAPI play-by-play (game/{pk}/playByPlay, verified against gamePk 849805) -> the key plays of a game as replay beats.
// Key plays = scoring plays plus caught stealings and pickoffs, at most MAX_BEATS, in order. A running base state is simulated across
// the whole game so each beat knows who was on base BEFORE the play and where every mover ends (bases 0 home, 1 to 3, 4 scored, -1 out).

import { headshotUrl } from './teams'
import type { Beat, BeatMove, Storyline } from './types'

export const MAX_BEATS = 7

type Runner = {
  movement: { start: string | null; end: string | null; outBase: string | null; isOut: boolean }
  details: { eventType?: string; runner: { id: number; fullName: string } }
  credits?: { player: { id: number }; position?: { abbreviation?: string }; credit: string }[]
}
export type PbpPlay = {
  about: { halfInning: string; inning: number; captivatingIndex?: number }
  result: { eventType?: string; event?: string; description?: string; awayScore?: number; homeScore?: number }
  matchup?: { batter?: { id: number; fullName: string } }
  runners: Runner[]
}
export type Pbp = { allPlays: PbpPlay[]; scoringPlays: number[] }

const BASE: Record<string, number> = { '1B': 1, '2B': 2, '3B': 3, score: 4 }
const BASE_WORD: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'home' }
const noDash = (s: string) => s.replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim()
/** "Victor Mesa Jr." -> "Mesa Jr."; "Jonathan Aranda" -> "Aranda". */
export function lastName(full: string): string {
  const p = full.trim().split(/\s+/)
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i
  return noDash(p.length > 2 && suffix.test(p[p.length - 1]) ? p.slice(-2).join(' ') : p[p.length - 1] ?? full)
}

const VERB: Record<string, string> = {
  single: 'singles', double: 'doubles', triple: 'triples', home_run: 'homers', walk: 'walks', intent_walk: 'is walked',
  hit_by_pitch: 'is hit by a pitch', sac_fly: 'hits a sacrifice fly', sac_bunt: 'bunts a run in', field_error: 'reaches on an error',
  fielders_choice: 'reaches on a fielder\'s choice', force_out: 'grounds into a force out', grounded_into_double_play: 'grounds into a double play',
}
function verbFor(p: PbpPlay): string {
  const t = p.result.eventType ?? ''
  if (VERB[t]) return VERB[t]
  if (t === 'field_out' || t === 'double_play') {
    const d = p.result.description ?? ''
    for (const [re, v] of [[/grounds out|grounds sharply|grounds softly/, 'grounds out'], [/flies out/, 'flies out'], [/lines out|lines into/, 'lines out'], [/pops out/, 'pops out']] as const) if (re.test(d)) return v
  }
  return noDash((p.result.event ?? 'is on base').toLowerCase())
}
const joinNames = (n: string[]) => (n.length <= 1 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`)

type Bases = Map<number, { name: string; base: number }>

function applyPlay(p: PbpPlay, bases: Bases): { before: Beat['before']; moves: BeatMove[] } {
  const before = [...bases].map(([id, v]) => ({ id, name: v.name, base: v.base })).sort((a, b) => a.base - b.base)
  const moves = new Map<number, BeatMove>()
  for (const r of p.runners) {
    const id = r.details.runner.id, name = r.details.runner.fullName
    const cur = bases.get(id)
    const from = r.movement.start ? BASE[r.movement.start] ?? 0 : cur?.base ?? 0
    const to = r.movement.isOut ? -1 : r.movement.end ? BASE[r.movement.end] ?? -1 : -1
    const prev = moves.get(id)
    moves.set(id, { id, name, from: prev ? prev.from : from, to })
    if (to >= 1 && to <= 3) bases.set(id, { name, base: to }); else bases.delete(id)
  }
  return { before, moves: [...moves.values()].filter(m => m.from !== m.to || m.to === 4) }
}

/** `swap`: the game was played with the clubs the other way round to the game being previewed, so scores and batting side are mirrored. */
export function buildBeats(pbp: Pbp, nameOf: (id: number) => string | null, max = MAX_BEATS, swap = false): { beats: Beat[]; battingTeamOf: (half: 'top' | 'bot') => 'away' | 'home' } {
  const plays = pbp.allPlays
  const scoring = new Set(pbp.scoringPlays)
  const sim: { before: Beat['before']; moves: BeatMove[] }[] = []
  let bases: Bases = new Map(), key = ''
  for (const p of plays) {
    const k = `${p.about.inning}${p.about.halfInning}`
    if (k !== key) { bases = new Map(); key = k }
    sim.push(applyPlay(p, bases))
  }
  const isCs = (p: PbpPlay) => p.runners.some(r => /caught_stealing|pickoff/.test(r.details.eventType ?? ''))
  let cand = plays.map((p, i) => i).filter(i => scoring.has(i) || isCs(plays[i]))
  if (cand.length > max) {
    const sc = cand.filter(i => scoring.has(i))
    const rest = cand.filter(i => !scoring.has(i)).sort((a, b) => (plays[b].about.captivatingIndex ?? 0) - (plays[a].about.captivatingIndex ?? 0))
    cand = (sc.length >= max ? sc.slice(-max) : [...sc, ...rest.slice(0, max - sc.length)]).sort((a, b) => a - b)
  }
  let caughtTotal = 0
  const beats: Beat[] = cand.map(i => {
    const p = plays[i], { before, moves } = sim[i]
    const half: 'top' | 'bot' = p.about.halfInning === 'top' ? 'top' : 'bot'
    const batter = p.matchup?.batter
    const cs = p.runners.find(r => /caught_stealing|pickoff/.test(r.details.eventType ?? ''))
    let text: string, throwTo: number | null = null, throwerId: number | null = null
    if (cs && !scoring.has(i)) {
      const out = cs.movement.outBase ? BASE[cs.movement.outBase] ?? null : null
      const catcher = cs.credits?.find(c => c.credit === 'f_assist' && c.position?.abbreviation === 'C')
      const catcherName = catcher ? nameOf(catcher.player.id) : null
      throwerId = catcher && catcherName ? catcher.player.id : null
      const isPick = /pickoff/.test(cs.details.eventType ?? '') && !/caught_stealing/.test(cs.details.eventType ?? '')
      throwTo = !isPick && out ? out : null
      text = isPick ? `${lastName(cs.details.runner.fullName)} is picked off ${out ? BASE_WORD[out] : ''}`.trim()
        : `${catcherName ? `${lastName(catcherName)} throws out ${lastName(cs.details.runner.fullName)}` : `${lastName(cs.details.runner.fullName)} is caught stealing`}${out ? ` at ${BASE_WORD[out]}` : ''}`
    } else {
      const scorers = moves.filter(m => m.to === 4 && m.id !== batter?.id).map(m => lastName(m.name))
      const who = batter ? lastName(batter.fullName) : 'Batter'
      text = `${who} ${verbFor(p)}${scorers.length ? `, ${joinNames(scorers)} ${scorers.length === 1 ? 'scores' : 'score'}` : ''}`
      if (cs) { const out = cs.movement.outBase ? BASE[cs.movement.outBase] : null; throwTo = out ?? null }
    }
    const caught = !!cs
    if (caught) caughtTotal++
    return {
      inning: p.about.inning, half, label: `${half === 'top' ? 'T' : 'B'}${p.about.inning}`, text: noDash(text),
      batterId: batter?.id ?? null, batterName: batter ? lastName(batter.fullName) : '', batterHeadshot: batter ? headshotUrl(batter.id) : null, throwerId, throwerName: throwerId ? nameOf(throwerId) : null,
      battingSide: (half === 'top') !== swap ? 'away' : 'home', before, moves, throwToBase: throwTo, caught,
      awayScore: (swap ? p.result.homeScore : p.result.awayScore) ?? 0, homeScore: (swap ? p.result.awayScore : p.result.homeScore) ?? 0, caughtTotal,
    }
  })
  return { beats, battingTeamOf: h => (h === 'top' ? 'away' : 'home') }
}

/** The player who appears in the most beats (batter, mover or thrower) and a plain headline. Ties go to the earliest. */
export function storyline(beats: Beat[]): Storyline | null {
  const count = new Map<number, { name: string; n: number }>()
  for (const b of beats) {
    const ids = new Map<number, string>()
    if (b.batterId) ids.set(b.batterId, b.batterName)
    for (const m of b.moves) ids.set(m.id, m.name)
    if (b.throwerId && b.throwerName) ids.set(b.throwerId, b.throwerName)
    for (const [id, name] of ids) count.set(id, { name, n: (count.get(id)?.n ?? 0) + 1 })
  }
  const top = [...count].sort((a, b) => b[1].n - a[1].n)[0]
  if (!top) return null
  const last = lastName(top[1].name)
  return { id: top[0], name: top[1].name, last, count: top[1].n, of: beats.length, headline: `${last} was in ${top[1].n} of ${beats.length} key plays.` }
}
