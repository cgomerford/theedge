// src/lib/lab/team-players.server-fetch-allowed.ts
//
// Roster + every hitter's game log for one club, and batter-vs-pitcher
// career lines. MLB Stats API only (free, no key). One call hydrates the whole
// active roster's game logs; the parsed result is small, so it is cached in the
// existing savant_fetch_cache table for an hour. Nothing here runs in a page
// render; it is reached through /api/admin/lab/* from the browser.

import { withSavantCache } from '@/lib/savant-cache'
import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'
import type { GameLine, H2HLine, History, PitcherRef, PlayerLog, TeamPlayers } from '@/lib/lab/player-streaks'

const MLB = 'https://statsapi.mlb.com/api/v1'
const n = (v: unknown) => Number(v) || 0

type RawSplit = { date?: string; gameType?: string; opponent?: { id?: number }; isHome?: boolean; stat?: Record<string, unknown> }

function toLine(s: RawSplit): GameLine | null {
  if (!s.date || !s.stat) return null
  const t = s.stat
  return {
    d: s.date, o: s.opponent?.id ?? 0, home: !!s.isHome,
    pa: n(t.plateAppearances), ab: n(t.atBats), h: n(t.hits), d2: n(t.doubles), d3: n(t.triples), hr: n(t.homeRuns),
    r: n(t.runs), rbi: n(t.rbi), bb: n(t.baseOnBalls), hbp: n(t.hitByPitch), k: n(t.strikeOuts), sb: n(t.stolenBases),
    ...(s.gameType && s.gameType !== 'R' ? { ps: true } : {}),
  }
}

type RosterJson = { roster?: { person?: Record<string, unknown> & { id?: number; stats?: { group?: { displayName?: string }; splits?: RawSplit[] }[] } }[] }

/** Postseason game logs (wild card through World Series) for the same roster, keyed by player id. */
async function postseasonLogs(teamId: number, rosterSeason: number, year: number): Promise<Record<number, GameLine[]>> {
  const url = `${MLB}/teams/${teamId}/roster?rosterType=active&season=${rosterSeason}&hydrate=person(stats(type=gameLog,group=hitting,season=${year},gameType=P))`
  const out: Record<number, GameLine[]> = {}
  try {
    const res = await throttledMlbFetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' })
    if (!res.ok) { console.error('[postseasonLogs] MLB API status', res.status); return out }
    for (const r of ((await res.json()) as RosterJson).roster ?? []) {
      const p = r.person
      if (!p?.id) continue
      const splits = p.stats?.find(x => x.group?.displayName === 'hitting')?.splits ?? []
      out[p.id] = splits.map(toLine).filter((g): g is GameLine => g !== null).map(g => ({ ...g, ps: true }))
    }
  } catch (e) {
    console.error('[postseasonLogs] fetch failed:', (e as Error).message)
  }
  return out
}

async function pullTeam(teamId: number, season: number): Promise<TeamPlayers | null> {
  const url = `${MLB}/teams/${teamId}/roster?rosterType=active&season=${season}&hydrate=person(stats(type=gameLog,group=hitting,season=${season}))`
  try {
    const res = await throttledMlbFetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' })
    if (!res.ok) { console.error('[getTeamPlayers] MLB API status', res.status); return null }
    const data = await res.json()
    const hitters: PlayerLog[] = []
    const pitchers: PitcherRef[] = []
    for (const r of data.roster ?? []) {
      const p = r.person ?? {}
      const pos = r.position?.abbreviation ?? ''
      if (pos === 'P') {
        pitchers.push({ id: p.id, name: p.fullName, hand: p.pitchHand?.code ?? '' })
        continue
      }
      const splits: RawSplit[] = p.stats?.find((s: { group?: { displayName?: string } }) => s.group?.displayName === 'hitting')?.splits ?? []
      const games = splits.map(toLine).filter((g): g is GameLine => g !== null)
      hitters.push({ id: p.id, name: p.fullName, pos, bats: p.batSide?.code ?? '', games })
    }
    const post = await postseasonLogs(teamId, season, season)
    for (const h of hitters) h.games = [...h.games, ...(post[h.id] ?? [])]
    return { teamId, season, hitters, pitchers }
  } catch (e) {
    console.error('[getTeamPlayers] fetch failed:', (e as Error).message)
    return null
  }
}

export function getTeamPlayers(teamId: number, season: number): Promise<TeamPlayers | null> {
  return withSavantCache(`lab:team-players:v2:${season}:${teamId}`, 60 * 60, () => pullTeam(teamId, season))
}

/** Career line for each batter against one pitcher (null = never faced). */
export async function getH2H(pitcherId: number, batterIds: number[]): Promise<Record<number, H2HLine | null>> {
  const out: Record<number, H2HLine | null> = {}
  const queue = [...batterIds]
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        const res = await throttledMlbFetch(`${MLB}/people/${id}/stats?stats=vsPlayerTotal&group=hitting&opposingPlayerId=${pitcherId}`, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
        if (!res.ok) { out[id] = null; continue }
        const s = (await res.json()).stats?.[0]?.splits?.[0]?.stat
        out[id] = s && n(s.plateAppearances) > 0
          ? { pa: n(s.plateAppearances), ab: n(s.atBats), h: n(s.hits), hr: n(s.homeRuns), rbi: n(s.rbi), bb: n(s.baseOnBalls), k: n(s.strikeOuts), avg: String(s.avg ?? ''), ops: String(s.ops ?? '') }
          : null
      } catch (e) {
        console.error('[getH2H] fetch failed:', (e as Error).message)
        out[id] = null
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return out
}

/** The same active-roster hitters' game logs for an earlier season ("on this day" across years). */
async function pullHistory(teamId: number, currentSeason: number, year: number): Promise<History | null> {
  const url = `${MLB}/teams/${teamId}/roster?rosterType=active&season=${currentSeason}&hydrate=person(stats(type=gameLog,group=hitting,season=${year}))`
  try {
    const res = await throttledMlbFetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' })
    if (!res.ok) { console.error('[getTeamHistory] MLB API status', res.status); return null }
    const out: History = {}
    for (const r of (await res.json()).roster ?? []) {
      const p = r.person ?? {}
      const splits: RawSplit[] = p.stats?.find((s: { group?: { displayName?: string } }) => s.group?.displayName === 'hitting')?.splits ?? []
      out[p.id] = splits.map(toLine).filter((g): g is GameLine => g !== null)
    }
    const post = await postseasonLogs(teamId, currentSeason, year)
    for (const id of Object.keys(out)) out[Number(id)] = [...out[Number(id)], ...(post[Number(id)] ?? [])]
    return out
  } catch (e) {
    console.error('[getTeamHistory] fetch failed:', (e as Error).message)
    return null
  }
}

export function getTeamHistory(teamId: number, currentSeason: number, year: number): Promise<History | null> {
  // Past seasons never change, so cache for a day.
  return withSavantCache(`lab:team-history:v2:${currentSeason}:${teamId}:${year}`, 24 * 60 * 60, () => pullHistory(teamId, currentSeason, year))
}
