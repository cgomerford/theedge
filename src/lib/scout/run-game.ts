// src/lib/scout/run-game.ts
//
// Scout §5 (Run game vs catcher / pitcher) — one OFFENSE running against one
// DEFENSIVE battery (catcher + probable starter). Everything here is a counted or
// measured number with its sample; there are no invented "steal odds".
//
//   Catcher tools  — Savant pop time to 2B on steal attempts, exchange time and
//                    arm strength, each against the qualified-catcher field
//   Catcher record — stolen bases / caught stealing charged to him at catcher
//   Pitcher hold   — stolen bases / caught stealing / pickoffs charged to the
//                    starter (time-to-home is not published, so it is omitted)
//   Offense        — the club's steal attempts per game and success rate vs the
//                    league, and each lineup runner's attempts and sprint speed
//
// SB% is only shown once there are MIN_ATTEMPTS attempts behind it.

import { getProjectedLineup } from '@/lib/lineups'
import { withSavantCache } from '@/lib/savant-cache'

const MLB = 'https://statsapi.mlb.com/api/v1'
const SAVANT = 'https://baseballsavant.mlb.com'
export const MIN_ATTEMPTS = 10
const MIN_POP_ATTEMPTS = 10      // catchers with fewer 2B pop-time attempts are outside the "qualified" field
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export type Strip = {
  label: string; unit: string; value: number | null
  lo: number; hi: number; q1: number; median: number; q3: number
  rank: number | null; of: number
  betterLow: boolean; decimals: number
}

export type Catcher = {
  id: number; name: string
  popAttempts: number
  strips: Strip[]
  /** every qualified catcher (10+ throws to 2B): exchange time vs arm strength, for the scatter */
  field: { id: number; name: string; exchange: number; arm: number }[]
  sb: number; cs: number
}

export type PitcherHold = { id: number; name: string; throws: 'L' | 'R' | null; sb: number; cs: number; pickoffs: number; ip: number; bf: number }

export type Runner = { id: number; name: string; sprint: number | null; sb: number; cs: number }

export type RunGame = {
  offense: {
    sb: number; cs: number; games: number
    attemptsPerGame: number | null; successPct: number | null
    league: { attemptsPerGame: number; successPct: number }
    rank: { attempts: number; of: number }
    runners: Runner[]
  }
  catcher: Catcher | null
  pitcher: PitcherHold | null
  leagueCatcherCsPct: number | null
}

// ─── Savant leaderboards (cached in Supabase, small parsed payloads) ─────

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = '', q = false
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch }
  out.push(cur); return out
}
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const h = splitCsv(lines[0]).map((x) => x.trim())
  return lines.slice(1).map((l) => { const c = splitCsv(l); const o: Record<string, string> = {}; h.forEach((k, i) => { o[k] = (c[i] ?? '').trim() }); return o })
}
const num = (v: string | undefined) => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? null : x }

type PopRow = { id: number; name: string; attempts: number; pop: number | null; exchange: number | null; arm: number | null }

async function getPopRows(season: string): Promise<PopRow[]> {
  return withSavantCache<PopRow[]>(`scout-poptime:${season}`, 12 * 3600, async () => {
    try {
      const res = await fetch(`${SAVANT}/leaderboard/poptime?year=${season}&team=&min2b=1&min3b=0&pos=&sort=2&sortDir=asc&csv=true`, { cache: 'no-store', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) return []
      return parseCsv(await res.text()).map((r) => ({
        id: Number(r.entity_id), name: r.entity_name, attempts: Number(r.pop_2b_sba_count) || 0,
        pop: num(r.pop_2b_sba), exchange: num(r.exchange_2b_3b_sba), arm: num(r.maxeff_arm_2b_3b_sba),
      }))
    } catch { return [] }
  })
}

async function getSprintMap(season: string): Promise<Record<string, number>> {
  return withSavantCache<Record<string, number>>(`scout-sprint:${season}`, 12 * 3600, async () => {
    try {
      const res = await fetch(`${SAVANT}/leaderboard/sprint_speed?year=${season}&position=&team=&csv=true`, { cache: 'no-store', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) return {}
      const out: Record<string, number> = {}
      for (const r of parseCsv(await res.text())) { const s = num(r.sprint_speed); if (s != null) out[r.player_id] = s }
      return out
    } catch { return {} }
  })
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function buildStrip(rows: PopRow[], c: PopRow, pick: (r: PopRow) => number | null, label: string, unit: string, betterLow: boolean, decimals: number): Strip {
  const field = rows.filter((r) => r.attempts >= MIN_POP_ATTEMPTS && pick(r) != null).map((r) => pick(r) as number).sort((a, b) => a - b)
  const value = pick(c)
  const better = value == null ? null : field.filter((v) => (betterLow ? v < value : v > value)).length + 1
  return {
    label, unit, value, betterLow, decimals,
    lo: field[0] ?? 0, hi: field[field.length - 1] ?? 0,
    q1: field.length ? quantile(field, 0.25) : 0, median: field.length ? quantile(field, 0.5) : 0, q3: field.length ? quantile(field, 0.75) : 0,
    rank: better, of: field.length,
  }
}

// ─── MLB Stats API ───────────────────────────────────────────────────────

type SplitStat = Record<string, string | number | undefined>
async function fetchPerson(id: number, group: 'fielding' | 'pitching' | 'hitting', season: string) {
  try {
    const res = await fetch(`${MLB}/people?personIds=${id}&hydrate=stats(group=[${group}],type=[season],season=${season})`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) })
    return res.ok ? ((await res.json()).people?.[0] ?? null) : null
  } catch { return null }
}

async function getLeagueTeamRunning(season: string) {
  try {
    const res = await fetch(`${MLB}/teams/stats?stats=season&group=hitting&season=${season}&sportIds=1`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    return ((await res.json()).stats?.[0]?.splits ?? []).map((s: { team: { id: number }; stat: SplitStat }) => ({
      id: s.team.id, sb: Number(s.stat.stolenBases ?? 0), cs: Number(s.stat.caughtStealing ?? 0), games: Number(s.stat.gamesPlayed ?? 0),
    })) as { id: number; sb: number; cs: number; games: number }[]
  } catch { return [] }
}

// ─── Entry point ─────────────────────────────────────────────────────────

export async function getRunGame(offenseId: number, defenseId: number, gameDate: string, gamePk: number, defenseProbableId: number | null): Promise<RunGame | null> {
  const season = gameDate.slice(0, 4)
  const [teams, popRows, sprint, offLineup, defLineup] = await Promise.all([
    getLeagueTeamRunning(season), getPopRows(season), getSprintMap(season),
    getProjectedLineup(offenseId, gameDate, gamePk), getProjectedLineup(defenseId, gameDate, gamePk),
  ])
  const me = teams.find((t) => t.id === offenseId)
  if (!me) return null

  const lgSb = teams.reduce((a, t) => a + t.sb, 0), lgCs = teams.reduce((a, t) => a + t.cs, 0), lgGames = teams.reduce((a, t) => a + t.games, 0)
  const rate = (t: { sb: number; cs: number; games: number }) => (t.games > 0 ? (t.sb + t.cs) / t.games : 0)
  const ranked = [...teams].sort((a, b) => rate(b) - rate(a))

  // runners: the offense's lineup
  const hitIds = offLineup.batters.map((b) => b.player_id)
  const runnerPeople = await Promise.all(hitIds.map((id) => fetchPerson(id, 'hitting', season)))
  const runners: Runner[] = offLineup.batters.map((b, i) => {
    const st: SplitStat | undefined = runnerPeople[i]?.stats?.find((s: { group?: { displayName?: string } }) => s.group?.displayName === 'hitting')?.splits?.[0]?.stat
    return { id: b.player_id, name: b.player_name, sprint: sprint[String(b.player_id)] ?? null, sb: Number(st?.stolenBases ?? 0), cs: Number(st?.caughtStealing ?? 0) }
  }).sort((a, b) => (b.sb + b.cs) - (a.sb + a.cs) || (b.sprint ?? 0) - (a.sprint ?? 0))

  // the defensive catcher: the one in the lineup at C
  const cb = defLineup.batters.find((b) => b.position === 'C')
  let catcher: Catcher | null = null
  if (cb) {
    const person = await fetchPerson(cb.player_id, 'fielding', season)
    const c = person?.stats?.find((s: { group?: { displayName?: string } }) => s.group?.displayName === 'fielding')?.splits?.find((sp: { position?: { abbreviation?: string } }) => sp.position?.abbreviation === 'C')?.stat
    const pop = popRows.find((r) => r.id === cb.player_id)
    catcher = {
      id: cb.player_id, name: cb.player_name, popAttempts: pop?.attempts ?? 0,
      strips: pop ? [
        buildStrip(popRows, pop, (r) => r.pop, 'Pop time to 2B', 's', true, 2),
        buildStrip(popRows, pop, (r) => r.exchange, 'Exchange (glove to release)', 's', true, 2),
        buildStrip(popRows, pop, (r) => r.arm, 'Arm strength', 'mph', false, 1),
      ] : [],
      field: popRows.filter((r) => r.attempts >= MIN_POP_ATTEMPTS && r.exchange != null && r.arm != null).map((r) => ({ id: r.id, name: r.name, exchange: r.exchange as number, arm: r.arm as number })),
      sb: Number(c?.stolenBases ?? 0), cs: Number(c?.caughtStealing ?? 0),
    }
  }

  let pitcher: PitcherHold | null = null
  if (defenseProbableId) {
    const p = await fetchPerson(defenseProbableId, 'pitching', season)
    const st: SplitStat | undefined = p?.stats?.find((s: { group?: { displayName?: string } }) => s.group?.displayName === 'pitching')?.splits?.[0]?.stat
    if (p) pitcher = {
      id: p.id, name: p.fullName, throws: p.pitchHand?.code === 'L' ? 'L' : p.pitchHand?.code === 'R' ? 'R' : null,
      sb: Number(st?.stolenBases ?? 0), cs: Number(st?.caughtStealing ?? 0), pickoffs: Number(st?.pickoffs ?? 0),
      ip: Number(String(st?.inningsPitched ?? '0').split('.')[0]) + (Number(String(st?.inningsPitched ?? '0').split('.')[1] ?? 0) / 3), bf: Number(st?.battersFaced ?? 0),
    }
  }

  return {
    offense: {
      sb: me.sb, cs: me.cs, games: me.games,
      attemptsPerGame: me.games > 0 ? (me.sb + me.cs) / me.games : null,
      successPct: me.sb + me.cs > 0 ? (me.sb / (me.sb + me.cs)) * 100 : null,
      league: { attemptsPerGame: lgGames > 0 ? (lgSb + lgCs) / lgGames : 0, successPct: lgSb + lgCs > 0 ? (lgSb / (lgSb + lgCs)) * 100 : 0 },
      rank: { attempts: ranked.findIndex((t) => t.id === offenseId) + 1, of: ranked.length },
      runners,
    },
    catcher, pitcher,
    leagueCatcherCsPct: lgSb + lgCs > 0 ? (lgCs / (lgSb + lgCs)) * 100 : null,
  }
}
