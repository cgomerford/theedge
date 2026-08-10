// Hot/cold streak ranking across both lineups' batters — last 7-day OPS
// vs season OPS, sorted by biggest swing in either direction. Reuses
// getBatterSplits exactly as BatterDetailView's Form tab already does,
// just run across a whole lineup instead of one player on click.
//
// SCOPE: batters only. No pitcher-trend function exists anywhere in this
// codebase to reuse — would be new, unverified data, not reuse. Lineup
// batters + starters only, not full 26-man roster (2026-07-13 decision).
//
// 2026-08-09 changes:
//   1. StreakRow now carries AVG, runs, RBI, walks, games alongside OPS —
//      getBatterSplits' underlying fetchDateRange already pulls this from
//      the MLB API response, it just wasn't being read out before. Ranking
//      logic (OPS delta vs season) is unchanged; these are added context,
//      not a new hot/cold signal.
//   2. Guaranteed-minimum-4-per-team fallback: MIN_PA=10 on a 7-day window
//      alone was leaving entire teams empty on quiet weeks (confirmed on
//      NYM, 2026-08-09) — not a bug, just a real small-sample gap. Any
//      batter who doesn't clear the L7 floor is now retried against L14
//      with a higher PA floor before being dropped, and is tagged
//      window: 'L14' so the UI can be honest about which window a given
//      row's numbers came from. Real teams can still legitimately return
//      fewer than 4 if not enough lineup batters clear even L14 — this
//      widens the net, it does not fabricate a floor.

import { getBatterSplits } from './batter-stats'
import type { LineupBatter } from './lineups'

export type StreakWindow = 'L7' | 'L14'

export type StreakRow = {
  playerId: number
  name: string
  teamAbbr: string
  position: string
  window: StreakWindow // which split this row's numbers came from — always show this in the UI
  seasonOps: number     // never null by the time a row is returned — see the guard clause below
  windowOps: number     // same
  delta: number         // windowOps - seasonOps — this is what ranking/hot-cold is based on
  pa: number
  avg: string            // batting average over `window`, MLB's own formatted string (e.g. ".312")
  runs: number
  rbi: number
  walks: number
  games: number
  runsPerGame: number | null // runs / games over `window` — null if games is 0
}

const MIN_PA_L7 = 10   // last-7-day sample floor — small enough to catch real streaks, not so small a single 3-for-4 game skews it
const MIN_PA_L14 = 18  // fallback floor for the wider window — proportionally similar bar, adjusted for the longer period
const MIN_TARGET_PER_TEAM = 4

type SplitStat = { avg: string; obp: string; slg: string; ops: string; pa: number; runs: number; rbi: number; walks: number; games: number }

function buildRow(
  b: LineupBatter,
  teamAbbr: string,
  stat: SplitStat,
  window: StreakWindow,
): StreakRow | null {
  const windowOps = parseFloat(stat.ops)
  const seasonOps = b.season_ops
  if (isNaN(windowOps) || seasonOps === null || seasonOps === undefined) return null

  return {
    playerId: b.player_id,
    name: b.player_name,
    teamAbbr,
    position: b.position,
    window,
    seasonOps,
    windowOps,
    delta: Math.round((windowOps - seasonOps) * 1000) / 1000,
    pa: stat.pa,
    avg: stat.avg,
    runs: stat.runs,
    rbi: stat.rbi,
    walks: stat.walks,
    games: stat.games,
    runsPerGame: stat.games > 0 ? Math.round((stat.runs / stat.games) * 100) / 100 : null,
  }
}

export async function getHotColdStreaks(
  awayBatters: LineupBatter[], homeBatters: LineupBatter[],
  awayAbbr: string, homeAbbr: string,
): Promise<StreakRow[]> {
  const all = [
    ...awayBatters.map(b => ({ b, teamAbbr: awayAbbr })),
    ...homeBatters.map(b => ({ b, teamAbbr: homeAbbr })),
  ]

  // One splits fetch per batter gets us last_7 AND last_14 in the same
  // call — getBatterSplits already fetches both, so the L14 fallback
  // below costs zero extra API calls.
  const withSplits = await Promise.all(
    all.map(async ({ b, teamAbbr }) => ({
      b,
      teamAbbr,
      splits: await getBatterSplits(b.player_id),
    }))
  )

  // ── Pass 1: L7 ──────────────────────────────────────────────────────
  const l7Rows: StreakRow[] = []
  const needsFallback: typeof withSplits = []

  for (const entry of withSplits) {
    const last7 = entry.splits?.last_7
    if (last7 && last7.pa >= MIN_PA_L7) {
      const row = buildRow(entry.b, entry.teamAbbr, last7, 'L7')
      if (row) { l7Rows.push(row); continue }
    }
    needsFallback.push(entry)
  }

  // ── Pass 2: L14 fallback, only for batters that missed the L7 floor ──
  const l14Rows: StreakRow[] = []
  for (const entry of needsFallback) {
    const last14 = entry.splits?.last_14
    if (last14 && last14.pa >= MIN_PA_L14) {
      const row = buildRow(entry.b, entry.teamAbbr, last14, 'L14')
      if (row) l14Rows.push(row)
    }
  }

  // ── Group by team, L7 rows preferred over L14 fallback rows ─────────
  const byTeam = new Map<string, { primary: StreakRow[]; fallback: StreakRow[] }>()
  for (const r of l7Rows) {
    if (!byTeam.has(r.teamAbbr)) byTeam.set(r.teamAbbr, { primary: [], fallback: [] })
    byTeam.get(r.teamAbbr)!.primary.push(r)
  }
  for (const r of l14Rows) {
    if (!byTeam.has(r.teamAbbr)) byTeam.set(r.teamAbbr, { primary: [], fallback: [] })
    byTeam.get(r.teamAbbr)!.fallback.push(r)
  }

  const result: StreakRow[] = []
  for (const [, { primary, fallback }] of byTeam) {
    primary.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    fallback.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

    const rows = [...primary]
    // Top up to the target with L14 fallback rows only if L7 alone fell short.
    if (rows.length < MIN_TARGET_PER_TEAM) {
      rows.push(...fallback.slice(0, MIN_TARGET_PER_TEAM - rows.length))
    }
    // Cap at 5 total, same ceiling as before.
    result.push(...rows.slice(0, 5))
  }

  return result
}