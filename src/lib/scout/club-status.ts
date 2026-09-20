// src/lib/scout/club-status.ts
//
// Scout §1 (Club status desk) — who is Available / Questionable / Out for one
// club tonight, plus the last 7 days of transactions.
//
// Sources, and what each can honestly say:
//   OUT           — MLB 40-man roster status (IL 7/10/15/60-day, suspended,
//                   bereavement, paternity). Reason from team_transactions.
//   QUESTIONABLE  — MLB publishes no day-to-day list, so this is DERIVED and
//                   labelled with its rule:
//                   · hitter back from the IL in the last 5 days
//                   · a regular (started ≥ 5 of the last 7 games) missing from
//                     a CONFIRMED lineup
//                   · an arm that is "taxed" by lib/scout/workload.ts
//   AVAILABLE     — active and none of the above.
//   Last played   — hitters: last appearance in the club's recent boxscores, with
//                   his boxscore line; pitchers: last day with pitches in
//                   pitcher_workload_daily. Out players show when they went out.
//   Rest days     — days off since that last appearance.
// Starters who are not tonight's probable are left out of the grid (they are
// not available tonight by construction) — the count is returned.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { getTeamILList, getTeamTransactions, type TeamTransaction } from '@/lib/team-transactions'
import { getProjectedLineup } from '@/lib/lineups'
import { workloadFlag } from './workload'
import { getRecentActivity } from './recent-games'

const MLB = 'https://statsapi.mlb.com/api/v1'

export type AvailStatus = 'available' | 'questionable' | 'out'

export type ClubPlayer = {
  id: number
  name: string
  pos: string
  group: 'hitter' | 'pitcher'
  tag: 'SP' | 'RP' | null
  status: AvailStatus
  reason: string | null
  /** Days off since last appearance; null = no appearance in the window. */
  restDays: number | null
  /** ISO date of his last game / outing inside the lookback window. */
  lastPlayed: string | null
  /** His line from that game (boxscore summary). */
  lastLine: string | null
  /** For Out players: the date he was placed on the IL, when known. */
  outSince: string | null
}

export type ClubStatus = {
  teamId: number
  players: ClubPlayer[]
  counts: Record<AvailStatus, number>
  omittedStarters: number
  lineupConfirmed: boolean
  /** Every player on the 40-man (any status) — the minors desk flags who is on it. */
  roster40Ids: number[]
  /** Everyone on the active roster tonight (including starters left out of the grid) — the roster makeup counts these. */
  active: { id: number; name: string; group: 'hitter' | 'pitcher' }[]
  transactions: (TeamTransaction & { effect: 'added' | 'removed' | 'other' })[]
}

const OUT_CODES = new Set(['SU', 'BRV', 'PL', 'FME', 'RST'])
const isOutCode = (code: string) => code.startsWith('D') || OUT_CODES.has(code)

const ADD = new Set(['CALLUP', 'ACTIVATION', 'SIGNING'])
const REMOVE = new Set(['OPTION', 'DFA', 'RELEASE', 'IL', 'SUSPENSION', 'OUTRIGHTED'])

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000)
}

type RosterEntry = { id: number; name: string; pos: string; code: string }
const getRoster = cache(async (teamId: number): Promise<RosterEntry[]> => {
  try {
    const res = await fetch(`${MLB}/teams/${teamId}/roster?rosterType=40Man`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.roster ?? []).map((r: { person: { id: number; fullName: string }; position?: { abbreviation?: string }; status?: { code?: string } }) => ({
      id: r.person.id, name: r.person.fullName, pos: r.position?.abbreviation ?? '', code: r.status?.code ?? '',
    }))
  } catch { return [] }
})

export async function getClubStatus(teamId: number, gameDate: string, gamePk: number, probableStarterId: number | null): Promise<ClubStatus> {
  const supa = createAdminClient()
  const [roster, ilList, txns, recent, lineup, bpRes, wlRes] = await Promise.all([
    getRoster(teamId),
    getTeamILList(teamId),
    getTeamTransactions(teamId, 7, gameDate),
    getRecentActivity(teamId, 1, gameDate, 10, 7),
    getProjectedLineup(teamId, gameDate, gamePk),
    supa.from('bullpen_availability').select('player_id, role').eq('game_date', gameDate).eq('team_id', teamId),
    supa.from('pitcher_workload_daily').select('player_id, game_date, pitches')
      .eq('team_id', teamId).gte('game_date', shiftDays(gameDate, -7)).lte('game_date', shiftDays(gameDate, -1)),
  ])

  const ilReason = new Map(ilList.map((t) => [t.player_id, t.injury_reason ?? (t.il_days ? `${t.il_days}-day IL` : 'Injured list')]))
  const ilSince = new Map(ilList.map((t) => [t.player_id, t.transaction_date]))
  const relieverIds = new Set((bpRes.data ?? []).map((r) => Number(r.player_id)))

  // pitches by pitcher by day, for the 7 days ending yesterday
  const dates = Array.from({ length: 7 }, (_, i) => shiftDays(gameDate, i - 7))
  const pitchByPlayer = new Map<number, Map<string, number>>()
  for (const r of wlRes.data ?? []) {
    const id = Number(r.player_id)
    if (!pitchByPlayer.has(id)) pitchByPlayer.set(id, new Map())
    pitchByPlayer.get(id)!.set(r.game_date, Number(r.pitches))
  }

  const lineupConfirmed = lineup.source === 'confirmed'
  const lineupIds = new Set(lineup.batters.map((b) => b.player_id))
  const recentActivations = new Map(txns.filter((t) => t.category === 'ACTIVATION' && daysBetween(t.transaction_date, gameDate) <= 5).map((t) => [t.player_id, t.transaction_date]))

  let omittedStarters = 0
  const players: ClubPlayer[] = []

  for (const r of roster) {
    const isPitcher = r.pos === 'P'
    const base = { id: r.id, name: r.name, pos: r.pos, group: isPitcher ? 'pitcher' as const : 'hitter' as const }

    if (isOutCode(r.code)) {
      players.push({
        ...base, tag: null, status: 'out', reason: ilReason.get(r.id) ?? (r.code.startsWith('D') ? 'Injured list' : 'Unavailable'),
        restDays: null, lastPlayed: null, lastLine: null, outSince: ilSince.get(r.id) ?? null,
      })
      continue
    }
    if (r.code !== 'A') continue // minors / reassigned — not part of tonight's club

    if (isPitcher) {
      const isProbable = r.id === probableStarterId
      const isReliever = relieverIds.has(r.id)
      if (!isProbable && !isReliever && relieverIds.size > 0) { omittedStarters++; continue }
      const perDay = pitchByPlayer.get(r.id)
      const byDate = dates.map((d) => perDay?.get(d) ?? 0)
      const lastIdx = byDate.map((v, i) => (v > 0 ? i : -1)).reduce((a, b) => Math.max(a, b), -1)
      const restDays = lastIdx === -1 ? null : 6 - lastIdx
      const lastPlayed = lastIdx === -1 ? null : dates[lastIdx]
      const act = recent.byPlayer.get(r.id)
      const lastLine = lastPlayed == null ? null : act && act.lastDate === lastPlayed ? act.lastLine : `${byDate[lastIdx]} pitches`
      const flag = isProbable ? null : workloadFlag(byDate)
      players.push({
        ...base, tag: isProbable ? 'SP' : 'RP',
        status: flag?.taxed ? 'questionable' : 'available',
        reason: flag?.taxed ? flag.reason : isProbable ? 'Probable starter' : null,
        restDays, lastPlayed, lastLine, outSince: null,
      })
      continue
    }

    const app = recent.byPlayer.get(r.id)
    const restDays = app ? Math.max(0, daysBetween(app.lastDate, gameDate) - 1) : null
    let status: AvailStatus = 'available'
    let reason: string | null = null
    if (recentActivations.has(r.id)) {
      status = 'questionable'; reason = `Activated from the IL ${recentActivations.get(r.id)}`
    } else if (lineupConfirmed && !lineupIds.has(r.id) && app && app.started >= 5) {
      status = 'questionable'; reason = `Not in the posted lineup — started ${app.started} of the last ${recent.games}`
    }
    players.push({ ...base, tag: null, status, reason, restDays, lastPlayed: app?.lastDate ?? null, lastLine: app?.lastLine ?? null, outSince: null })
  }

  const counts: Record<AvailStatus, number> = { available: 0, questionable: 0, out: 0 }
  for (const p of players) counts[p.status]++

  const transactions = txns
    // is_milb_move is set on call-ups/options too (one side is a minor-league club) — those change tonight's roster, so keep them.
    .filter((t) => t.category !== 'STATUS' && t.category !== 'OTHER')
    .map((t) => ({ ...t, effect: ADD.has(t.category) ? 'added' as const : REMOVE.has(t.category) ? 'removed' as const : 'other' as const }))

  const active = roster.filter((r) => r.code === 'A').map((r) => ({ id: r.id, name: r.name, group: (r.pos === 'P' ? 'pitcher' : 'hitter') as 'hitter' | 'pitcher' }))
  return { teamId, players, counts, omittedStarters, lineupConfirmed, roster40Ids: roster.map((r) => r.id), active, transactions }
}
