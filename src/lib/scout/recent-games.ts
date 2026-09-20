// src/lib/scout/recent-games.ts
//
// Who actually played in a club's last few games, at any level (MLB sportId 1,
// Triple-A 11, Double-A 12 …), read from the completed boxscores. Powers "when
// did he last play" and his last line on the Scout club-status tiles.
//   · a hitter "played" = he had a batting-order slot; "started" = the slot is a
//     starter's (…00)
//   · a pitcher's pitch count by day comes from stats.pitching.numberOfPitches
//   · lastLine is MLB's own boxscore summary ("2-4 | HR, RBI" / "1.2 IP, 0 ER…")

import { cache } from 'react'

const MLB = 'https://statsapi.mlb.com/api/v1'

export type PlayerActivity = {
  lastDate: string
  lastLine: string | null
  played: number
  started: number
  /** pitches thrown per date (only dates he pitched) */
  pitchesByDate: Record<string, number>
}

export type RecentActivity = {
  games: number
  lastGameDate: string | null
  byPlayer: Map<number, PlayerActivity>
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const getRecentActivity = cache(async (teamId: number, sportId: number, gameDate: string, days = 10, maxGames = 7): Promise<RecentActivity> => {
  const byPlayer = new Map<number, PlayerActivity>()
  try {
    const sched = await fetch(
      `${MLB}/schedule?sportId=${sportId}&teamId=${teamId}&startDate=${shiftDays(gameDate, -days)}&endDate=${shiftDays(gameDate, -1)}`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) },
    ).then((r) => (r.ok ? r.json() : null))
    const finals: { pk: number; date: string }[] = []
    for (const d of sched?.dates ?? []) for (const g of d.games ?? []) {
      if (g.status?.abstractGameState === 'Final') finals.push({ pk: g.gamePk, date: g.officialDate ?? d.date })
    }
    const recent = finals.sort((a, b) => a.date.localeCompare(b.date) || a.pk - b.pk).slice(-maxGames)
    const boxes = await Promise.all(recent.map((g) =>
      fetch(`${MLB}/game/${g.pk}/boxscore`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ))
    boxes.forEach((box, i) => {
      if (!box) return
      const side = box.teams?.home?.team?.id === teamId ? box.teams.home : box.teams?.away?.team?.id === teamId ? box.teams.away : null
      if (!side) return
      const date = recent[i].date
      const touch = (id: number): PlayerActivity => {
        let p = byPlayer.get(id)
        if (!p) { p = { lastDate: date, lastLine: null, played: 0, started: 0, pitchesByDate: {} }; byPlayer.set(id, p) }
        return p
      }
      for (const [key, pl] of Object.entries<{ person?: { id: number }; battingOrder?: string; stats?: { batting?: { summary?: string; atBats?: number }; pitching?: { summary?: string; numberOfPitches?: number } } }>(side.players ?? {})) {
        const id = pl.person?.id ?? Number(key.replace('ID', ''))
        if (pl.battingOrder) {
          const p = touch(id)
          p.played += 1
          if (String(pl.battingOrder).endsWith('00')) p.started += 1
          if (date >= p.lastDate) { p.lastDate = date; p.lastLine = pl.stats?.batting?.summary || null }
        }
        const pitches = pl.stats?.pitching?.numberOfPitches
        if (pitches) {
          const p = touch(id)
          p.pitchesByDate[date] = (p.pitchesByDate[date] ?? 0) + pitches
          if (date >= p.lastDate) { p.lastDate = date; p.lastLine = `${pl.stats?.pitching?.summary ?? ''}${pl.stats?.pitching?.summary ? ' · ' : ''}${pitches} pitches` }
        }
      }
    })
    return { games: recent.length, lastGameDate: recent.at(-1)?.date ?? null, byPlayer }
  } catch {
    return { games: 0, lastGameDate: null, byPlayer }
  }
})
