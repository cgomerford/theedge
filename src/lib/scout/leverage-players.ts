// src/lib/scout/leverage-players.ts
//
// Scout Report → Leverage tab: per-player situational lines, read from the MLB Stats API (free, no auth) the same way the club lines in leverage.ts are.
// One request per player returns the season line plus the four situations, all regular season:
//   lc     Late & close  (7th inning or later, tied, ahead by one, or the tying run on deck)
//   risp   runners in scoring position
//   risp2  runners in scoring position with two outs
//   ig07   the 7th inning or later
// Verified live 2026-10-27: sit codes hilev / medlev / lolev / 2Orisp return NO rows for 2026, so they are not used here (true leverage-index splits are
// not published). A pitcher's rows come back split by batter side plus a total, so the row with the most plate appearances is the total.
// Read-only, cached an hour, at most 6 requests in flight (throttledMlbFetch). Nothing is written to a table.

import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'

const MLB = 'https://statsapi.mlb.com/api/v1'
export const CODES = ['lc', 'risp', 'risp2', 'ig07'] as const
export type SitCode = (typeof CODES)[number]

export type SitLine = { pa: number; avg: number | null; ops: number | null; hr: number; k: number; bb: number }
export type PlayerSits = { season: SitLine } & Record<SitCode, SitLine>

const num = (v: unknown): number | null => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? null : x }
const EMPTY: SitLine = { pa: 0, avg: null, ops: null, hr: 0, k: 0, bb: 0 }

function line(st: Record<string, unknown> | undefined): SitLine {
  if (!st) return EMPTY
  return { pa: Number(st.plateAppearances ?? st.battersFaced ?? 0), avg: num(st.avg), ops: num(st.ops), hr: Number(st.homeRuns ?? 0), k: Number(st.strikeOuts ?? 0), bb: Number(st.baseOnBalls ?? 0) }
}

/** Season line and the four situations for one player; null when the request fails (the caller shows an empty state, never a stand-in). */
export async function getPlayerSits(playerId: number, group: 'hitting' | 'pitching', season: string): Promise<PlayerSits | null> {
  try {
    const res = await throttledMlbFetch(`${MLB}/people/${playerId}/stats?stats=season,statSplits&group=${group}&season=${season}&sitCodes=${CODES.join(',')}&gameType=R`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) { console.error('[getPlayerSits] HTTP', res.status, playerId); return null }
    const blocks = ((await res.json()).stats ?? []) as { type?: { displayName?: string }; splits?: { split?: { code?: string }; stat?: Record<string, unknown> }[] }[]
    const out: PlayerSits = { season: EMPTY, lc: EMPTY, risp: EMPTY, risp2: EMPTY, ig07: EMPTY }
    const best = (rows: { stat?: Record<string, unknown> }[]) => rows.map((r) => line(r.stat)).sort((a, b) => b.pa - a.pa)[0] ?? EMPTY
    out.season = best(blocks.find((b) => b.type?.displayName === 'season')?.splits ?? [])
    const sp = blocks.find((b) => b.type?.displayName === 'statSplits')?.splits ?? []
    for (const c of CODES) out[c] = best(sp.filter((s) => s.split?.code === c))
    return out
  } catch (err) {
    console.error('[getPlayerSits] failed:', playerId, err instanceof Error ? err.message : err)
    return null
  }
}

/** Many players at once, keyed by id. Players whose request failed are left out. */
export async function getManySits(ids: number[], group: 'hitting' | 'pitching', season: string): Promise<Record<number, PlayerSits>> {
  const rows = await Promise.all(ids.map(async (id) => [id, await getPlayerSits(id, group, season)] as const))
  const out: Record<number, PlayerSits> = {}
  for (const [id, s] of rows) if (s) out[id] = s
  return out
}
