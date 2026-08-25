// src/lib/pitcher-workload.ts
//
// Powers the "Last 7 Days" pitcher workload report on the team home page:
// a grid of every pitcher who's thrown for the team in the last 7
// calendar days, with their pitch count for each specific day. This is
// deliberately NOT scoped to just relievers (unlike bullpen-usage.ts) —
// the point here is full-staff recent workload, starters included, so
// you can see who's had heavy days and who's had rest.
//
// Uses `officialDate` from the MLB schedule response (the game's real
// local calendar date) rather than parsing the UTC `gameDate` timestamp
// ourselves, which can land on the wrong day depending on game start
// time and timezone.

const MLB_API = 'https://statsapi.mlb.com/api/v1.1'
const MLB_API_V1 = 'https://statsapi.mlb.com/api/v1'
const CONCURRENCY = 8

import { createAdminClient } from '@/lib/supabase'
export type PitcherWorkloadRow = {
  playerId: number
  playerName: string
  byDate: Record<string, number> // date (YYYY-MM-DD) -> pitches thrown that day
  totalPitches: number
}

export type Last7DaysWorkload = {
  dates: string[] // 7 dates, oldest to newest, YYYY-MM-DD
  pitchers: PitcherWorkloadRow[] // sorted by totalPitches descending
}

interface RawPlayEvent { isPitch?: boolean }
interface RawPlay {
  about: { halfInning: 'top' | 'bottom' }
  matchup: { pitcher: { id: number; fullName: string } }
  playEvents: RawPlayEvent[]
}
interface RawLiveFeed {
  gameData: { teams: { away: { id: number }; home: { id: number } } }
  liveData: { plays: { allPlays: RawPlay[] } }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function last7Dates(anchorDate?: string): string[] {
  const dates: string[] = []
  const anchor = anchorDate ? new Date(`${anchorDate}T12:00:00`) : new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(anchor)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

export async function getLast7DaysPitcherWorkload(
  teamId: number,
  currentRosterIds?: Set<number>,
  anchorDate?: string, // 'YYYY-MM-DD' — defaults to today if omitted, existing callers unaffected
 // optional — pass to only show players still on the active roster
): Promise<Last7DaysWorkload> {
  const dates = last7Dates(anchorDate)
  const startDate = dates[0]
  const endDate = dates[dates.length - 1]

  const schedRes = await fetch(
    `${MLB_API_V1}/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`,
    { next: { revalidate: 1800 } }, // 30min — this is a "recent activity" view, refresh more often than season-long data
  )
  if (!schedRes.ok) return { dates, pitchers: [] }
  const schedData = await schedRes.json()

  const games: { gamePk: number; officialDate: string }[] = []
  for (const dateEntry of schedData.dates ?? []) {
    for (const game of dateEntry.games ?? []) {
      if (game.status?.abstractGameState === 'Final' && game.officialDate) {
        games.push({ gamePk: game.gamePk, officialDate: game.officialDate })
      }
    }
  }

  const feeds = await mapWithConcurrency(games, CONCURRENCY, async (g) => {
    try {
      const res = await fetch(`${MLB_API}/game/${g.gamePk}/feed/live`, { next: { revalidate: 1800 } })
      if (!res.ok) return null
      return (await res.json()) as RawLiveFeed
    } catch {
      return null
    }
  })

  // playerId -> date -> pitch count
  const pitchMap = new Map<number, Map<string, number>>()
  const nameMap = new Map<number, string>()

  games.forEach((g, idx) => {
    const data = feeds[idx]
    if (!data) return
    const isTeamHome = data.gameData.teams.home.id === teamId
    const isTeamAway = data.gameData.teams.away.id === teamId
    if (!isTeamHome && !isTeamAway) return

    for (const play of data.liveData.plays.allPlays) {
      const teamIsPitching = (play.about.halfInning === 'top' && isTeamHome) || (play.about.halfInning === 'bottom' && isTeamAway)
      if (!teamIsPitching) continue

      const pitchCount = play.playEvents.filter(e => e.isPitch).length
      if (pitchCount === 0) continue

      const pid = play.matchup.pitcher.id
      nameMap.set(pid, play.matchup.pitcher.fullName)
      if (!pitchMap.has(pid)) pitchMap.set(pid, new Map())
      const dayMap = pitchMap.get(pid)!
      dayMap.set(g.officialDate, (dayMap.get(g.officialDate) ?? 0) + pitchCount)
    }
  })

  let pitchers: PitcherWorkloadRow[] = [...pitchMap.entries()].map(([playerId, dayMap]) => {
    const byDate: Record<string, number> = {}
    let total = 0
    for (const date of dates) {
      const v = dayMap.get(date) ?? 0
      byDate[date] = v
      total += v
    }
    return { playerId, playerName: nameMap.get(playerId) ?? `Player ${playerId}`, byDate, totalPitches: total }
  })

  if (currentRosterIds) {
    pitchers = pitchers.filter(p => currentRosterIds.has(p.playerId))
  }

  pitchers.sort((a, b) => b.totalPitches - a.totalPitches)

  return { dates, pitchers }
}


export async function getLast7DaysPitcherWorkloadFromDB(
  teamId: number,
  currentRosterIds?: Set<number>,
  anchorDate?: string,
): Promise<Last7DaysWorkload> {
  const dates = last7Dates(anchorDate)
  const supa = createAdminClient()
  const season = new Date().getFullYear()

  const { data: rows } = await supa
    .from('pitcher_workload_daily')
    .select('*')
    .eq('team_id', teamId)
    .eq('season', season)
    .in('game_date', dates)

  const pitchMap = new Map<number, Map<string, number>>()
  const nameMap = new Map<number, string>()

  for (const row of rows ?? []) {
    const pid = Number(row.player_id)
    nameMap.set(pid, row.player_name)
    if (!pitchMap.has(pid)) pitchMap.set(pid, new Map())
    pitchMap.get(pid)!.set(row.game_date, Number(row.pitches))
  }

  let pitchers: PitcherWorkloadRow[] = [...pitchMap.entries()].map(([playerId, dayMap]) => {
    const byDate: Record<string, number> = {}
    let total = 0
    for (const date of dates) {
      const v = dayMap.get(date) ?? 0
      byDate[date] = v
      total += v
    }
    return { playerId, playerName: nameMap.get(playerId) ?? `Player ${playerId}`, byDate, totalPitches: total }
  })

  if (currentRosterIds) {
    pitchers = pitchers.filter(p => currentRosterIds.has(p.playerId))
  }

  pitchers.sort((a, b) => b.totalPitches - a.totalPitches)

  return { dates, pitchers }
}