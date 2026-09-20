// src/lib/batter-next-series.ts
//
// "Who's he about to face?" — this batter's real team's next series (every
// consecutive real scheduled game against the same opponent, from the real
// MLB schedule), with each game's real confirmed probable starter (most
// aren't announced more than ~5 days out — shown honestly empty otherwise,
// never guessed) plus the opponent's real bullpen arms (every other real
// pitcher on their active roster, i.e. not a confirmed starter for this
// series). Mirrors pitcher-next-start.ts's real-schedule pattern, batter side.

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type SeriesGame = {
  gamePk: number
  date: string
  probablePitcherId: number | null
  probablePitcherName: string | null
}

export type NextSeries = {
  opponentTeamId: number
  opponentName: string
  games: SeriesGame[]
}

export type BullpenArm = { id: number; name: string }

async function getCurrentTeamId(batterId: number): Promise<number | null> {
  try {
    const res = await fetch(`${MLB_API}/people/${batterId}?hydrate=currentTeam`, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    const json = await res.json()
    return json.people?.[0]?.currentTeam?.id ?? null
  } catch {
    return null
  }
}

// The next real series — every consecutive scheduled game against the same
// opponent, starting from the batter's team's next game. Stops as soon as
// the opponent changes (a new series) or the schedule window runs out.
export async function getNextSeries(batterId: number): Promise<NextSeries | null> {
  const teamId = await getCurrentTeamId(batterId)
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

    const allGames: { gamePk: number; date: string; opponentTeamId: number; opponentName: string; probablePitcherId: number | null; probablePitcherName: string | null }[] = []
    for (const date of json.dates ?? []) {
      for (const g of date.games ?? []) {
        const away = g.teams?.away, home = g.teams?.home
        if (!away?.team || !home?.team) continue
        const isHome = home.team.id === teamId
        if (!isHome && away.team.id !== teamId) continue
        const opponent = isHome ? away.team : home.team
        const probablePitcher = isHome ? away.probablePitcher : home.probablePitcher
        allGames.push({
          gamePk: g.gamePk, date: date.date,
          opponentTeamId: opponent.id, opponentName: opponent.name,
          probablePitcherId: probablePitcher?.id ?? null, probablePitcherName: probablePitcher?.fullName ?? null,
        })
      }
    }
    if (allGames.length === 0) return null
    allGames.sort((a, b) => a.date.localeCompare(b.date))

    const opponentTeamId = allGames[0].opponentTeamId
    const opponentName = allGames[0].opponentName
    const games: SeriesGame[] = []
    for (const g of allGames) {
      if (g.opponentTeamId !== opponentTeamId) break
      games.push({ gamePk: g.gamePk, date: g.date, probablePitcherId: g.probablePitcherId, probablePitcherName: g.probablePitcherName })
    }
    return { opponentTeamId, opponentName, games }
  } catch {
    return null
  }
}

// Every other real pitcher on the opponent's active roster — i.e. not one
// of this series' confirmed starters. No role label is attached (MLB's
// roster endpoint doesn't expose starter/reliever role — only position),
// so this is honestly "the rest of the real pitching staff," not a guessed
// bullpen role.
export async function getBullpenArms(opponentTeamId: number, excludeIds: number[]): Promise<BullpenArm[]> {
  try {
    const res = await fetch(`${MLB_API}/teams/${opponentTeamId}/roster?rosterType=active`, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const json = await res.json()
    const exclude = new Set(excludeIds)
    const arms: BullpenArm[] = []
    for (const r of json.roster ?? []) {
      if (r.position?.abbreviation !== 'P') continue
      const id = r.person?.id
      if (id == null || exclude.has(id)) continue
      arms.push({ id, name: r.person?.fullName ?? `#${id}` })
    }
    return arms
  } catch {
    return []
  }
}
