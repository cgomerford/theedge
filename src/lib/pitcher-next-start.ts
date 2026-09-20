// src/lib/pitcher-next-start.ts
//
// "Who's up next, and who's likely to be in the box?" — this pitcher's
// next CONFIRMED start (real MLB probable-pitcher schedule data — most
// starts aren't announced more than ~5 days out, so this is often empty,
// which is shown honestly rather than guessed from a rotation pattern),
// plus the opponent lineup:
//   - confirmed: boxscore battingOrder for that gamePk once MLB has
//     posted the official 9 (verified live: Pre-Game games with posted
//     lineups have 9 IDs; Scheduled games still have []).
//   - projected: the opponent's real starting 9 from their last completed
//     game, used only until that battingOrder lands.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type NextStart = {
  gamePk: number
  date: string
  opponentTeamId: number
  opponentName: string
  isHome: boolean
}

export type LineupBatter = { id: number; name: string; order: number }

export type LineupSource = 'confirmed' | 'projected' | 'unavailable'

export type StartLineup = {
  lineup: LineupBatter[]
  asOfDate: string | null
  source: LineupSource
}

async function getCurrentTeamId(pitcherId: number): Promise<number | null> {
  try {
    const res = await fetch(`${MLB_API}/people/${pitcherId}?hydrate=currentTeam`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = await res.json()
    return json.people?.[0]?.currentTeam?.id ?? null
  } catch {
    return null
  }
}

export async function getNextStart(pitcherId: number): Promise<NextStart | null> {
  const teamId = await getCurrentTeamId(pitcherId)
  if (!teamId) return null

  const today = new Date()
  const start = today.toISOString().slice(0, 10)
  const end = new Date(today.getTime() + 21 * 86400000).toISOString().slice(0, 10)

  try {
    const res = await fetch(
      `${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${start}&endDate=${end}&hydrate=probablePitcher,team`,
      { next: { revalidate: 3600 } },
    )
    if (!res.ok) return null
    const json = await res.json()
    for (const date of json.dates ?? []) {
      for (const g of date.games ?? []) {
        const away = g.teams?.away, home = g.teams?.home
        const awayProbableId = away?.probablePitcher?.id
        const homeProbableId = home?.probablePitcher?.id
        if (awayProbableId === pitcherId || homeProbableId === pitcherId) {
          const isHome = homeProbableId === pitcherId
          const opponent = isHome ? away.team : home.team
          return { gamePk: g.gamePk, date: date.date, opponentTeamId: opponent.id, opponentName: opponent.name, isHome }
        }
      }
    }
    return null
  } catch {
    return null
  }
}

async function resolveNames(ids: number[]): Promise<Record<number, string>> {
  if (ids.length === 0) return {}
  try {
    const res = await fetch(`${MLB_API}/people?personIds=${ids.join(',')}`, { next: { revalidate: 86400 } })
    if (!res.ok) return {}
    const json = await res.json()
    const out: Record<number, string> = {}
    for (const p of json.people ?? []) out[p.id] = p.fullName ?? `#${p.id}`
    return out
  } catch {
    return {}
  }
}

type BoxscoreJson = {
  teams?: {
    home?: { team?: { id?: number }; battingOrder?: number[] }
    away?: { team?: { id?: number }; battingOrder?: number[] }
  }
}

async function lineupFromBoxscore(
  gamePk: number,
  teamId: number,
  cacheSeconds: number,
): Promise<LineupBatter[] | null> {
  try {
    const boxRes = await fetch(`${MLB_API}/game/${gamePk}/boxscore`, { next: { revalidate: cacheSeconds } })
    if (!boxRes.ok) return null
    const boxJson = await boxRes.json() as BoxscoreJson
    for (const side of ['home', 'away'] as const) {
      const team = boxJson.teams?.[side]
      if (team?.team?.id !== teamId) continue
      const order = (team.battingOrder ?? []).filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
      const top9 = order.slice(0, 9)
      if (top9.length === 0) return null
      const names = await resolveNames(top9)
      return top9.map((id, i) => ({ id, name: names[id] ?? `#${id}`, order: i + 1 }))
    }
    return null
  } catch {
    return null
  }
}

// Official 9 for this gamePk, if MLB has posted it on the boxscore.
// Pre-game games with posted lineups have battingOrder length 9; games
// still in Scheduled (or Pre-Game before the card drops) have [].
export async function getConfirmedLineup(gamePk: number, teamId: number): Promise<LineupBatter[] | null> {
  const lineup = await lineupFromBoxscore(gamePk, teamId, 300)
  return lineup && lineup.length === 9 ? lineup : null
}

// Most recent REAL starting lineup (top of the order) for a team, as of
// just before `beforeDate` — used as the projected lineup until the
// official card for the upcoming game is posted.
export async function getRecentLineup(teamId: number, beforeDate: string): Promise<{ lineup: LineupBatter[]; asOfDate: string | null }> {
  const before = new Date(beforeDate)
  const start = new Date(before.getTime() - 14 * 86400000).toISOString().slice(0, 10)
  const end = new Date(before.getTime() - 86400000).toISOString().slice(0, 10)

  try {
    const schedRes = await fetch(`${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${start}&endDate=${end}`, { next: { revalidate: 3600 } })
    if (!schedRes.ok) return { lineup: [], asOfDate: null }
    const schedJson = await schedRes.json() as { dates?: { date?: string; games?: { gamePk?: number; status?: { detailedState?: string } }[] }[] }
    const games: { gamePk: number; date: string }[] = []
    for (const date of schedJson.dates ?? []) {
      for (const g of date.games ?? []) {
        if (g.status?.detailedState === 'Final' && g.gamePk != null && date.date) {
          games.push({ gamePk: g.gamePk, date: date.date })
        }
      }
    }
    if (games.length === 0) return { lineup: [], asOfDate: null }
    games.sort((a, b) => a.date.localeCompare(b.date))
    const last = games[games.length - 1]
    const lineup = await lineupFromBoxscore(last.gamePk, teamId, 3600)
    return { lineup: lineup ?? [], asOfDate: lineup && lineup.length > 0 ? last.date : null }
  } catch {
    return { lineup: [], asOfDate: null }
  }
}

export async function getStartOpponentLineup(nextStart: NextStart): Promise<StartLineup> {
  const confirmed = await getConfirmedLineup(nextStart.gamePk, nextStart.opponentTeamId)
  if (confirmed) {
    return { lineup: confirmed, asOfDate: nextStart.date, source: 'confirmed' }
  }
  const recent = await getRecentLineup(nextStart.opponentTeamId, nextStart.date)
  if (recent.lineup.length > 0) {
    return { lineup: recent.lineup, asOfDate: recent.asOfDate, source: 'projected' }
  }
  return { lineup: [], asOfDate: null, source: 'unavailable' }
}
