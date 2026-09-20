// src/lib/scout/game-starts.ts
//
// "Who started" for each game on a Scout chart, from ONE schedule call per club
// (hydrate=lineups,probablePitcher — for a completed game these are the actual
// batting order and the pitcher who actually started). Feeds the chart's
// "flag the games where…" control:
//   lineup  → the club's hitters who started ≥ 3 games and sat ≥ 3 (so there is a "without") and
//             the opposing starters it faced (2+ times)
//   ownSp   → the club's own starting pitchers (2+ starts) — for bullpen charts,
//             i.e. "how the pen did behind him"

import type { StartMarker } from './stat-explorer'

const MLB = 'https://statsapi.mlb.com/api/v1'

type SchedGame = {
  gamePk: number
  teams: { away: { team: { id: number }; probablePitcher?: { id: number; fullName: string } }; home: { team: { id: number }; probablePitcher?: { id: number; fullName: string } } }
  lineups?: { homePlayers?: { id: number; fullName: string }[]; awayPlayers?: { id: number; fullName: string }[] }
}

export async function getStartMarkers(teamId: number, pks: number[], dates: string[], mode: 'lineup' | 'ownSp'): Promise<StartMarker[]> {
  if (pks.length === 0) return []
  try {
    const res = await fetch(
      `${MLB}/schedule?sportId=1&teamId=${teamId}&startDate=${dates[0]}&endDate=${dates[dates.length - 1]}&hydrate=lineups,probablePitcher` +
        '&fields=dates,games,gamePk,teams,away,home,team,id,probablePitcher,fullName,lineups,homePlayers,awayPlayers',
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000) },
    )
    if (!res.ok) return []
    const byPk = new Map<number, SchedGame>()
    for (const d of (await res.json()).dates ?? []) for (const g of d.games ?? []) byPk.set(g.gamePk, g)

    const hitters = new Map<number, { name: string; flags: boolean[] }>()
    const opposing = new Map<number, { name: string; flags: boolean[] }>()
    const own = new Map<number, { name: string; flags: boolean[] }>()
    const bump = (m: typeof hitters, id: number, name: string, i: number) => {
      let e = m.get(id)
      if (!e) { e = { name, flags: pks.map(() => false) }; m.set(id, e) }
      e.flags[i] = true
    }

    pks.forEach((pk, i) => {
      const g = byPk.get(pk)
      if (!g) return
      const isHome = g.teams.home.team.id === teamId
      const mine = isHome ? g.teams.home : g.teams.away
      const theirs = isHome ? g.teams.away : g.teams.home
      if (mode === 'lineup') {
        for (const p of (isHome ? g.lineups?.homePlayers : g.lineups?.awayPlayers) ?? []) bump(hitters, p.id, p.fullName, i)
        if (theirs.probablePitcher) bump(opposing, theirs.probablePitcher.id, theirs.probablePitcher.fullName, i)
      } else if (mine.probablePitcher) bump(own, mine.probablePitcher.id, mine.probablePitcher.fullName, i)
    })

    const count = (f: boolean[]) => f.filter(Boolean).length
    const out: StartMarker[] = []
    // A flag is only useful with games on BOTH sides — a player who started every game has nothing to compare against.
    const push = (m: typeof hitters, min: number, group: string, prefix: string) => {
      ;[...m.entries()].filter(([, e]) => count(e.flags) >= min && pks.length - count(e.flags) >= min).sort((a, b) => count(b[1].flags) - count(a[1].flags))
        .forEach(([id, e]) => out.push({ id: `${prefix}${id}`, label: `${e.name} (${count(e.flags)})`, group, flags: e.flags }))
    }
    if (mode === 'lineup') { push(hitters, 3, 'Started in the lineup', 'h'); push(opposing, 2, 'Games vs this starter', 'o') }
    else push(own, 2, 'Games started by', 's')
    return out
  } catch { return [] }
}
