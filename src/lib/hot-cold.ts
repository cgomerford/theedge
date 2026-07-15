// Hot/cold streak ranking across both lineups' batters — last 7-day OPS
// vs season OPS, sorted by biggest swing in either direction. Reuses
// getBatterSplits exactly as BatterDetailView's Form tab already does,
// just run across a whole lineup instead of one player on click.
//
// SCOPE: batters only. No pitcher-trend function exists anywhere in this
// codebase to reuse — would be new, unverified data, not reuse. Lineup
// batters + starters only, not full 26-man roster (2026-07-13 decision).

import { getBatterSplits } from './batter-stats'
import type { LineupBatter } from './lineups'

export type StreakRow = {
  playerId: number
  name: string
  teamAbbr: string
  position: string
  seasonOps: number // never null by the time a row is returned — see the guard clause below
  last7Ops: number  // same
  delta: number
  pa: number
}

const MIN_PA = 10 // last-7-day sample floor — small enough to catch real streaks, not so small a single 3-for-4 game skews it

export async function getHotColdStreaks(
  awayBatters: LineupBatter[], homeBatters: LineupBatter[],
  awayAbbr: string, homeAbbr: string,
): Promise<StreakRow[]> {
  const all = [
    ...awayBatters.map(b => ({ b, teamAbbr: awayAbbr })),
    ...homeBatters.map(b => ({ b, teamAbbr: homeAbbr })),
  ]
const results: (StreakRow | null)[] = await Promise.all(
    all.map(async ({ b, teamAbbr }): Promise<StreakRow | null> => {
      const splits = await getBatterSplits(b.player_id)
      const last7 = splits?.last_7
      if (!last7) return null
      const pa = Number(last7.pa ?? 0)
      if (pa < MIN_PA) return null
      const last7Ops = parseFloat(last7.ops)
      const seasonOps = b.season_ops
      if (isNaN(last7Ops) || seasonOps === null || seasonOps === undefined) return null
      return {
        playerId: b.player_id,
        name: b.player_name,
        teamAbbr,
        position: b.position,
        seasonOps,
        last7Ops,
        delta: Math.round((last7Ops - seasonOps) * 1000) / 1000,
        pa,
      }
    })
  )
const filtered: StreakRow[] = results.filter((r): r is StreakRow => r !== null)

  // Top 5 PER TEAM, not top 5 combined — otherwise one team having several
  // extreme performers could crowd the other team out entirely.
  const byTeam = new Map<string, StreakRow[]>()
  for (const r of filtered) {
    if (!byTeam.has(r.teamAbbr)) byTeam.set(r.teamAbbr, [])
    byTeam.get(r.teamAbbr)!.push(r)
  }
  for (const rows of byTeam.values()) {
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  }

  return [...byTeam.entries()].flatMap(([, rows]) => rows.slice(0, 5))}