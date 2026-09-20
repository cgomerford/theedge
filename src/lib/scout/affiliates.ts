// src/lib/scout/affiliates.ts
//
// Scout §1, minor-league desk — the same Available / Questionable / Out read on
// a club's Triple-A and Double-A affiliates, because a GM is looking at the
// whole organisation, not just the 26. Per affiliate:
//   · roster + status from MLB's fullRoster (IL, development list, temporarily
//     inactive = Out; an MLB player on a rehab assignment = Questionable)
//   · last game played + his boxscore line, from the affiliate's last 7 games
//   · a pitcher whose pitch counts trip the shared workload rule = Questionable
//   · season line at that level (hitters AVG/OPS, pitchers ERA/IP)
//   · whether he is on the parent club's 40-man roster

import { cache } from 'react'
import { getRecentActivity } from './recent-games'
import { workloadFlag } from './workload'
import type { AvailStatus, ClubPlayer } from './club-status'

const MLB = 'https://statsapi.mlb.com/api/v1'

export const MINOR_LEVELS = [
  { sportId: 11, label: 'Triple-A' },
  { sportId: 12, label: 'Double-A' },
] as const

export type MinorPlayer = ClubPlayer & { on40Man: boolean; seasonLine: string | null }

export type AffiliateStatus = {
  teamId: number
  name: string
  level: string
  players: MinorPlayer[]
  counts: Record<AvailStatus, number>
  lastGameDate: string | null
  games: number
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const getAffiliates = cache(async (parentId: number): Promise<{ id: number; name: string; sportId: number }[]> => {
  try {
    const res = await fetch(`${MLB}/teams/${parentId}/affiliates`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    return ((await res.json()).teams ?? []).map((t: { id: number; name: string; sport?: { id: number } }) => ({ id: t.id, name: t.name, sportId: t.sport?.id ?? 0 }))
  } catch { return [] }
})

type Stat = Record<string, string | number | undefined>

async function fetchSeasonLines(ids: number[], sportId: number, season: string): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (ids.length === 0) return out
  try {
    const res = await fetch(
      `${MLB}/people?personIds=${ids.join(',')}&hydrate=stats(group=[hitting,pitching],type=[season],season=${season},sportId=${sportId})`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000) },
    )
    if (!res.ok) return out
    for (const p of (await res.json()).people ?? []) {
      for (const s of p.stats ?? []) {
        const st: Stat | undefined = s.splits?.[0]?.stat
        if (!st) continue
        if (s.group?.displayName === 'pitching' && Number(st.inningsPitched) > 0) out.set(p.id, `${st.era} ERA · ${st.inningsPitched} IP`)
        else if (s.group?.displayName === 'hitting' && Number(st.plateAppearances) > 0 && !out.has(p.id)) out.set(p.id, `${st.avg} AVG · ${st.ops} OPS`)
      }
    }
  } catch { /* season lines are decoration — tiles still render */ }
  return out
}

export async function getAffiliateStatus(parentId: number, sportId: number, gameDate: string, on40Ids: Set<number>): Promise<AffiliateStatus | null> {
  const aff = (await getAffiliates(parentId)).find((a) => a.sportId === sportId)
  if (!aff) return null
  const season = gameDate.slice(0, 4)

  const [rosterRes, activity] = await Promise.all([
    fetch(`${MLB}/teams/${aff.id}/roster?rosterType=fullRoster`, { next: { revalidate: 600 }, signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    getRecentActivity(aff.id, sportId, gameDate, 10, 7),
  ])
  const roster: { person: { id: number; fullName: string }; position?: { abbreviation?: string }; status?: { code?: string; description?: string } }[] = rosterRes?.roster ?? []
  if (roster.length === 0) return null
  const seasonLines = await fetchSeasonLines(roster.map((r) => r.person.id), sportId, season)

  const dates = Array.from({ length: 7 }, (_, i) => shiftDays(gameDate, i - 7))
  const players: MinorPlayer[] = roster.map((r) => {
    const code = r.status?.code ?? ''
    const isPitcher = r.position?.abbreviation === 'P'
    const act = activity.byPlayer.get(r.person.id)
    const restDays = act ? Math.max(0, Math.round((new Date(`${gameDate}T12:00:00Z`).getTime() - new Date(`${act.lastDate}T12:00:00Z`).getTime()) / 86400000) - 1) : null

    let status: AvailStatus = 'available'
    let reason: string | null = null
    if (code.startsWith('D') && code !== 'DEV' || code.startsWith('IL')) { status = 'out'; reason = r.status?.description ?? 'Injured list' }
    else if (code === 'DEV') { status = 'out'; reason = 'Development list' }
    else if (code === 'TI') { status = 'out'; reason = 'Temporarily inactive' }
    else if (code === 'RA') { status = 'questionable'; reason = 'On an MLB rehab assignment' }
    else if (code !== 'A') { status = 'out'; reason = r.status?.description ?? 'Not active' }
    else if (isPitcher && act) {
      const flag = workloadFlag(dates.map((d) => act.pitchesByDate[d] ?? 0))
      if (flag.taxed) { status = 'questionable'; reason = flag.reason }
    }

    return {
      id: r.person.id, name: r.person.fullName, pos: r.position?.abbreviation ?? '',
      group: isPitcher ? 'pitcher' : 'hitter', tag: null, status, reason,
      restDays, lastPlayed: act?.lastDate ?? null, lastLine: act?.lastLine ?? null, outSince: null,
      on40Man: on40Ids.has(r.person.id), seasonLine: seasonLines.get(r.person.id) ?? null,
    }
  })

  const counts: Record<AvailStatus, number> = { available: 0, questionable: 0, out: 0 }
  for (const p of players) counts[p.status]++
  return { teamId: aff.id, name: aff.name, level: MINOR_LEVELS.find((l) => l.sportId === sportId)?.label ?? '', players, counts, lastGameDate: activity.lastGameDate, games: activity.games }
}
