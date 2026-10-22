// src/lib/stats-live.ts
//
// "Is it happening right now?" — checks every MLB game that is in progress against the situation
// the person has set up (same filter definitions as the stacked-filter search: PaParams).
//
//   schedule (ET yesterday + today)  → games whose state is Live
//   v1.1/game/{pk}/feed/live         → inning, half, outs, runners, score, batter / pitcher + hands, count,
//                                       pitches so far in the current plate appearance
//   evaluate(snapshot, filters)      → one tick per condition ("Inning 7+: ✓ it's the 8th") and an overall match
//
// Read-only, MLB Stats API only (free, no auth), throttled, and cached for 15 seconds so a page that
// refreshes every 30 s never hammers MLB.

import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'
import { deepGroupLabel, type PaParams } from '@/lib/stats-query-catalog'

const API = 'https://statsapi.mlb.com/api'

export type LiveSnapshot = {
  gamePk: number; gameType: string; away: string; home: string; awayRuns: number; homeRuns: number
  inning: number; half: 'Top' | 'Bot'; outs: number; baseState: number; scoreDiff: number
  batter: string; pitcher: string; stand: string; throws: string; balls: number; strikes: number; pitches: number
  battingTeam: string
  /** every plate appearance so far, newest first — each with the situation it started in */
  history: Moment[]
  /** the pitches of the plate appearance in progress */
  sequence: { no: number; type: string; speed: number | null; call: string; count: string; ev: number | null }[]
}
/** One plate appearance that has already happened in the game, with the situation it STARTED in. */
export type Moment = {
  atBat: number; inning: number; half: 'Top' | 'Bot'; outs: number; baseState: number; scoreDiff: number
  balls: number; strikes: number; stand: string; throws: string; pitches: number
  batter: string; pitcher: string; event: string
  /** exit velocity (mph) / launch angle of the ball in play, when there was one */
  ev: number | null; la: number | null; dist: number | null; bbType: string | null
}
export type Condition = { label: string; ok: boolean; now: string }
export type LiveGame = LiveSnapshot & { matches: boolean; conditions: Condition[]; runners: string; link: string }
export type LiveResult = { checkedAt: string; inProgress: number; games: LiveGame[]; anyFilter: boolean }

const etDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + offsetDays * 86400_000))

const CACHE = new Map<string, { at: number; value: unknown }>()
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value as T
  const value = await load()
  CACHE.set(key, { at: Date.now(), value })
  if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value as string)
  return value
}

async function getJson(url: string): Promise<any> {
  const res = await throttledMlbFetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`MLB Stats API ${res.status}`)
  return res.json()
}

async function liveGamePks(): Promise<number[]> {
  return cached('live|schedule', 15_000, async () => {
    const j = await getJson(`${API}/v1/schedule?sportId=1&startDate=${etDate(-1)}&endDate=${etDate(0)}`)
    const pks: number[] = []
    for (const d of j.dates ?? []) for (const g of d.games ?? []) if (g.status?.abstractGameState === 'Live') pks.push(Number(g.gamePk))
    return pks
  })
}

async function snapshot(gamePk: number): Promise<LiveSnapshot | null> {
  return cached(`live|feed|${gamePk}`, 15_000, async () => {
    const d = await getJson(`${API}/v1.1/game/${gamePk}/feed/live`)
    const ls = d?.liveData?.linescore, cp = d?.liveData?.plays?.currentPlay
    if (!ls || !cp) return null
    const top = !!ls.isTopInning
    const off = ls.offense ?? {}
    const baseState = (off.first ? 1 : 0) | (off.second ? 2 : 0) | (off.third ? 4 : 0)
    const awayRuns = Number(ls.teams?.away?.runs ?? 0), homeRuns = Number(ls.teams?.home?.runs ?? 0)
    const away = String(d.gameData?.teams?.away?.abbreviation ?? ''), home = String(d.gameData?.teams?.home?.abbreviation ?? '')
    return {
      gamePk, gameType: String(d.gameData?.game?.type ?? 'R'), away, home, awayRuns, homeRuns,
      inning: Number(ls.currentInning ?? 0), half: top ? 'Top' : 'Bot', outs: Number(ls.outs ?? 0), baseState,
      scoreDiff: top ? awayRuns - homeRuns : homeRuns - awayRuns,
      batter: String(cp.matchup?.batter?.fullName ?? ''), pitcher: String(cp.matchup?.pitcher?.fullName ?? ''),
      stand: String(cp.matchup?.batSide?.code ?? ''), throws: String(cp.matchup?.pitchHand?.code ?? ''),
      balls: Number(ls.balls ?? cp.count?.balls ?? 0), strikes: Number(ls.strikes ?? cp.count?.strikes ?? 0),
      pitches: (cp.playEvents ?? []).filter((e: any) => e.isPitch).length,
      battingTeam: top ? away : home,
      history: momentsFromPlays(d.liveData?.plays?.allPlays ?? []),
      sequence: (cp.playEvents ?? []).filter((e: any) => e.isPitch).map((e: any, i: number) => ({
        no: i + 1, type: String(e.details?.type?.description ?? '—'), speed: typeof e.pitchData?.startSpeed === 'number' ? e.pitchData.startSpeed : null,
        call: String(e.details?.description ?? ''), count: `${e.count?.balls ?? 0}-${e.count?.strikes ?? 0}`,
        ev: typeof e.hitData?.launchSpeed === 'number' ? e.hitData.launchSpeed : null,
      })),
    } as LiveSnapshot
  })
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every(x => b.includes(x))
function baseLabel(states: number[]): string {
  if (states.length === 1) return deepGroupLabel('base_state', String(states[0]))
  if (sameSet(states, [2, 3, 6, 7])) return 'Runners in scoring position'
  if (sameSet(states, [1, 2, 3, 4, 5, 6, 7])) return 'Runners on base'
  return 'Runners in these spots'
}

/**
 * The situation each plate appearance STARTED in. MLB gives outs / runners / score as they stood AFTER each
 * play, so the start of a plate appearance is the previous play's "after" (or a clean slate at the top of a
 * half-inning). Verified against Baseball Savant's own per-pitch situations for a finished game.
 */
export function momentsFromPlays(plays: any[]): Moment[] {
  const out: Moment[] = []
  let prev: any = null
  for (const p of plays) {
    const sameHalf = prev && prev.about?.inning === p.about?.inning && !!prev.about?.isTopInning === !!p.about?.isTopInning
    const outs = sameHalf ? Number(prev.count?.outs ?? 0) : 0
    const mp = prev?.matchup ?? {}
    const baseState = sameHalf ? ((mp.postOnFirst ? 1 : 0) | (mp.postOnSecond ? 2 : 0) | (mp.postOnThird ? 4 : 0)) : 0
    const away = Number(prev?.result?.awayScore ?? 0), home = Number(prev?.result?.homeScore ?? 0)
    const top = !!p.about?.isTopInning
    if (p.about?.isComplete && p.result?.type === 'atBat') {
      out.push({
        atBat: Number(p.atBatIndex) + 1, inning: Number(p.about.inning), half: top ? 'Top' : 'Bot', outs: Math.min(2, outs), baseState,
        scoreDiff: top ? away - home : home - away,
        balls: Number(p.count?.balls ?? 0), strikes: Number(p.count?.strikes ?? 0),
        stand: String(p.matchup?.batSide?.code ?? ''), throws: String(p.matchup?.pitchHand?.code ?? ''),
        pitches: (p.playEvents ?? []).filter((e: any) => e.isPitch).length,
        batter: String(p.matchup?.batter?.fullName ?? ''), pitcher: String(p.matchup?.pitcher?.fullName ?? ''), event: String(p.result?.event ?? ''),
        ...(() => {
          const hit = [...(p.playEvents ?? [])].reverse().find((e: any) => e.isPitch && e.hitData?.launchSpeed != null)?.hitData
          return {
            ev: typeof hit?.launchSpeed === 'number' ? hit.launchSpeed : null, la: typeof hit?.launchAngle === 'number' ? hit.launchAngle : null,
            dist: typeof hit?.totalDistance === 'number' ? hit.totalDistance : null, bbType: typeof hit?.trajectory === 'string' ? hit.trajectory : null,
          }
        })(),
      })
    }
    prev = p
  }
  return out.reverse()
}

const ord = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)

/** One tick per condition in the filter set, judged against the game's moment right now. */
export function evaluate(s: LiveSnapshot, p: PaParams): Condition[] {
  const c: Condition[] = []
  if (p.inning_from != null || p.inning_to != null) {
    const lo = p.inning_from ?? 1, hi = p.inning_to
    c.push({ label: hi == null ? `Inning ${lo}+` : lo === hi ? `Inning ${lo}` : `Innings ${lo}–${hi}`, ok: s.inning >= lo && (hi == null || s.inning <= hi), now: `${s.half === 'Top' ? 'Top' : 'Bottom'} ${ord(s.inning)}` })
  }
  if (p.half) c.push({ label: p.half === 'Top' ? 'Top of the inning' : 'Bottom of the inning', ok: s.half === p.half, now: s.half === 'Top' ? 'Top' : 'Bottom' })
  if (p.outs) c.push({ label: `${p.outs.join(' or ')} out${p.outs.length === 1 && p.outs[0] === 1 ? '' : 's'}`, ok: p.outs.includes(s.outs), now: `${s.outs} out` })
  if (p.base_states) c.push({ label: baseLabel(p.base_states), ok: p.base_states.includes(s.baseState), now: deepGroupLabel('base_state', String(s.baseState)) })
  if (p.score_diff_min != null || p.score_diff_max != null) {
    const lo = p.score_diff_min ?? -99, hi = p.score_diff_max ?? 99
    c.push({ label: `Score margin ${p.score_diff_min ?? '−∞'} to ${p.score_diff_max ?? '+∞'} (batting team)`, ok: s.scoreDiff >= lo && s.scoreDiff <= hi, now: s.scoreDiff === 0 ? 'tied' : s.scoreDiff > 0 ? `batting team up ${s.scoreDiff}` : `batting team down ${-s.scoreDiff}` })
  }
  if (p.stand) c.push({ label: `${p.stand === 'L' ? 'Left' : 'Right'}-handed batter`, ok: s.stand === p.stand, now: `${s.stand === 'L' ? 'Left' : 'Right'}-handed` })
  if (p.p_throws) c.push({ label: `${p.p_throws === 'L' ? 'Left' : 'Right'}-handed pitcher`, ok: s.throws === p.p_throws, now: `${s.throws === 'L' ? 'Left' : 'Right'}-handed` })
  if (p.last_balls != null || p.last_strikes != null) {
    const want = `${p.last_balls ?? '?'}-${p.last_strikes ?? '?'}`
    c.push({ label: `${want} count`, ok: (p.last_balls == null || s.balls === p.last_balls) && (p.last_strikes == null || s.strikes === p.last_strikes), now: `${s.balls}-${s.strikes}` })
  }
  if (p.pitches_min != null || p.pitches_max != null) {
    const lo = p.pitches_min ?? 0, hi = p.pitches_max
    c.push({ label: hi == null ? `${lo}+ pitch at-bat` : lo === hi ? `${lo}-pitch at-bat` : `${lo}–${hi} pitch at-bat`, ok: s.pitches >= lo && (hi == null || s.pitches <= hi), now: `${s.pitches} pitches so far` })
  }
  return c
}

export async function checkLive(p: PaParams): Promise<LiveResult> {
  const pks = await liveGamePks()
  const snaps = (await Promise.all(pks.map(pk => snapshot(pk).catch(e => { console.error('[checkLive] feed failed:', pk, (e as Error).message); return null })))).filter((s): s is LiveSnapshot => !!s)
  const games: LiveGame[] = snaps.map(s => {
    const conditions = evaluate(s, p)
    return {
      ...s, conditions, matches: conditions.length > 0 && conditions.every(x => x.ok),
      runners: deepGroupLabel('base_state', String(s.baseState)), link: `https://www.mlb.com/gameday/${s.gamePk}`,
    }
  })
  // matches first, then the games that are closest (most conditions met)
  games.sort((a, b) => Number(b.matches) - Number(a.matches) || b.conditions.filter(x => x.ok).length - a.conditions.filter(x => x.ok).length)
  return { checkedAt: new Date().toISOString(), inProgress: pks.length, games, anyFilter: Object.keys(p).length > 0 }
}
