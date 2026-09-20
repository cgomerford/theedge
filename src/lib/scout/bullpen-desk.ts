// src/lib/scout/bullpen-desk.ts
//
// Scout §3 (Bullpen intelligence) — one club's relievers with:
//   · pitches per day for the last 7 days (pitcher_workload_daily) → L3 / L7
//   · role (bullpen_availability: Closer / Setup / Middle Relief, shown as
//     Closer / High-leverage / Bridge) and where they actually pitch
//     (bullpen_inning_reports: appearances by inning)
//   · L7 results from the MLB Stats API byDateRange (ERA, IP, BF) — gated on a
//     minimum sample before a Sharp / Shaky flag is issued
//   · throwing hand, for the left-arm vs opposing-bench block
// plus the OPPONENT's bench bats with their season OPS vs left-handed pitching.
//
// The flag rules are printed on the page (see FLAG_RULES) — nothing here is a
// hidden model. "Recent run value" is not sourced anywhere in the app, so L7
// ERA with its IP/BF is used instead and labelled as such.

import { createAdminClient } from '@/lib/supabase'
import { getActiveRosterIds } from '@/lib/active-roster'
import { getProjectedLineup } from '@/lib/lineups'
import { getLast7DaysPitcherWorkloadFromDB } from '@/lib/pitcher-workload'
import { getBullpenReportFromDB } from '@/lib/bullpen-usage'
import { workloadFlag } from './workload'

const MLB = 'https://statsapi.mlb.com/api/v1'

export const FLAG_RULES = {
  minBf: 12,        // L7 batters faced before Sharp / Shaky is called
  sharpEra: 2.5,
  shakyEra: 6.0,
  minBenchPa: 30,   // season PA vs LHP before a bench bat's split is treated as real
  threatOps: 0.8,
} as const

export type ArmFlag = 'overworked' | 'sharp' | 'shaky' | 'rested' | 'steady'
export type ArmRole = 'Closer' | 'High-leverage' | 'Bridge'

export type BullpenArm = {
  id: number
  name: string
  role: ArmRole
  hand: 'L' | 'R' | null
  byDate: number[]              // 7 days, oldest → newest, ending yesterday
  p3: number
  p7: number
  apps7: number
  seasonEra: number | null
  l7: { ip: string; era: number | null; bf: number } | null
  flag: ArmFlag
  flagReason: string
  innings: Record<number, number> // inning (9 = 9th+) → season appearances
}

export type BenchBat = {
  id: number
  name: string
  bats: 'L' | 'R' | 'S' | null
  opsVsL: number | null
  paVsL: number
}

export type BullpenDesk = {
  teamId: number
  dates: string[]
  arms: BullpenArm[]
}

const ROLE_LABEL: Record<string, ArmRole> = { Closer: 'Closer', Setup: 'High-leverage' }

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type PersonStats = { hand: 'L' | 'R' | null; l7: BullpenArm['l7'] }
async function fetchPitcherPeople(ids: number[], from: string, to: string, season: string): Promise<Map<number, PersonStats>> {
  const out = new Map<number, PersonStats>()
  if (ids.length === 0) return out
  try {
    const res = await fetch(
      `${MLB}/people?personIds=${ids.join(',')}&hydrate=stats(group=[pitching],type=[byDateRange],startDate=${from},endDate=${to},season=${season})`,
      { next: { revalidate: 1800 }, signal: AbortSignal.timeout(10000) },
    )
    if (!res.ok) return out
    const data = await res.json()
    for (const p of data.people ?? []) {
      const stat = p.stats?.find((s: { type?: { displayName?: string } }) => s.type?.displayName === 'byDateRange')?.splits?.[0]?.stat
      const era = stat?.era != null && stat.era !== '-.--' ? Number(stat.era) : null
      out.set(p.id, {
        hand: p.pitchHand?.code === 'L' ? 'L' : p.pitchHand?.code === 'R' ? 'R' : null,
        l7: stat ? { ip: String(stat.inningsPitched ?? '0.0'), era: Number.isFinite(era) ? era : null, bf: Number(stat.battersFaced ?? 0) } : null,
      })
    }
  } catch { /* leave empty — flags fall back to workload-only */ }
  return out
}

export async function getBullpenDesk(teamId: number, gameDate: string): Promise<BullpenDesk> {
  const supa = createAdminClient()
  const yesterday = shiftDays(gameDate, -1)
  const season = Number(gameDate.slice(0, 4))

  const [avail, activeIds, workload, report] = await Promise.all([
    supa.from('bullpen_availability').select('player_id, player_name, role, era').eq('game_date', gameDate).eq('team_id', teamId),
    getActiveRosterIds(teamId),
    getLast7DaysPitcherWorkloadFromDB(teamId, undefined, yesterday),
    getBullpenReportFromDB(teamId, season),
  ])

  const rows = (avail.data ?? []).filter((r) => activeIds.size === 0 || activeIds.has(Number(r.player_id)))
  const ids = rows.map((r) => Number(r.player_id))
  const people = await fetchPitcherPeople(ids, shiftDays(gameDate, -7), yesterday, String(season))

  const workByPlayer = new Map(workload.pitchers.map((p) => [p.playerId, p]))
  const profileById = new Map(report.relievers.map((r) => [r.playerId, r]))

  const arms: BullpenArm[] = rows.map((r) => {
    const id = Number(r.player_id)
    const w = workByPlayer.get(id)
    const byDate = workload.dates.map((d) => w?.byDate[d] ?? 0)
    const load = workloadFlag(byDate)
    const person = people.get(id)
    const l7 = person?.l7 ?? null
    const seasonEra = r.era != null ? Number(r.era) : null

    let flag: ArmFlag = 'steady'
    let flagReason = 'No standout signal'
    if (load.taxed) { flag = 'overworked'; flagReason = load.reason as string }
    else if (l7 && l7.bf >= FLAG_RULES.minBf && l7.era != null && l7.era <= FLAG_RULES.sharpEra) { flag = 'sharp'; flagReason = `L7 ERA ${l7.era.toFixed(2)} over ${l7.ip} IP (${l7.bf} BF)` }
    else if (l7 && l7.bf >= FLAG_RULES.minBf && l7.era != null && l7.era >= FLAG_RULES.shakyEra) { flag = 'shaky'; flagReason = `L7 ERA ${l7.era.toFixed(2)} over ${l7.ip} IP (${l7.bf} BF)` }
    else if (load.p3 === 0) { flag = 'rested'; flagReason = load.apps7 === 0 ? 'No work in the last 7 days' : 'No pitches in the last 3 days' }
    else if (l7 && l7.bf > 0 && l7.bf < FLAG_RULES.minBf) flagReason = `L7 sample too small to grade (${l7.bf} BF)`

    const innings: Record<number, number> = {}
    for (const line of profileById.get(id)?.lines ?? []) {
      const key = Math.min(9, line.inning)
      innings[key] = (innings[key] ?? 0) + line.appearancesInInning
    }

    return {
      id, name: r.player_name, role: ROLE_LABEL[r.role] ?? 'Bridge', hand: person?.hand ?? null,
      byDate, p3: load.p3, p7: load.p7, apps7: load.apps7, seasonEra, l7, flag, flagReason, innings,
    }
  })

  const order: Record<ArmRole, number> = { Closer: 0, 'High-leverage': 1, Bridge: 2 }
  arms.sort((a, b) => order[a.role] - order[b.role] || b.p7 - a.p7)
  return { teamId, dates: workload.dates, arms }
}

// Opponent bench bats: active hitters NOT in the (confirmed or projected)
// lineup, with season OPS against left-handed pitching.
export async function getBenchBatsVsLefties(teamId: number, gameDate: string, gamePk: number): Promise<BenchBat[]> {
  try {
    const [rosterRes, lineup] = await Promise.all([
      fetch(`${MLB}/teams/${teamId}/roster?rosterType=active`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)),
      getProjectedLineup(teamId, gameDate, gamePk),
    ])
    const inLineup = new Set(lineup.batters.map((b) => b.player_id))
    const bench = (rosterRes?.roster ?? []).filter((r: { person: { id: number }; position?: { abbreviation?: string } }) =>
      r.position?.abbreviation !== 'P' && !inLineup.has(r.person.id)) as { person: { id: number; fullName: string } }[]
    if (bench.length === 0 || lineup.batters.length === 0) return []

    const season = gameDate.slice(0, 4)
    const res = await fetch(
      `${MLB}/people?personIds=${bench.map((b) => b.person.id).join(',')}&hydrate=stats(group=[hitting],type=[statSplits],sitCodes=[vl],season=${season})`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) },
    )
    const data = res.ok ? await res.json() : { people: [] }
    const bats: BenchBat[] = (data.people ?? []).map((p: { id: number; fullName: string; batSide?: { code?: string }; stats?: { splits?: { stat?: { ops?: string; plateAppearances?: number } }[] }[] }) => {
      const stat = p.stats?.[0]?.splits?.[0]?.stat
      const ops = stat?.ops != null ? Number(stat.ops) : null
      return {
        id: p.id, name: p.fullName,
        bats: (p.batSide?.code === 'L' || p.batSide?.code === 'R' || p.batSide?.code === 'S') ? p.batSide.code : null,
        opsVsL: ops != null && Number.isFinite(ops) ? ops : null,
        paVsL: Number(stat?.plateAppearances ?? 0),
      } as BenchBat
    })
    return bats.sort((a, b) => (b.opsVsL ?? -1) - (a.opsVsL ?? -1))
  } catch { return [] }
}
