import 'server-only'
// src/lib/milb-shape/status-server.ts
//
// Builds PitcherStatus for a list of pitchers: the MLB Stats API people record (age, MLB debut, draft year, current club, transactions: trades and options) and their MLB pitch counts and
// run value from the stored MLB results tables for the last three seasons. People records are fetched 40 at a time with the transactions hydrated, four requests at once, and cached six
// hours per pitcher. A pitcher the API cannot return is left out (his status is unknown, which the filters never treat as "never pitched in MLB"). Nothing is guessed.

import { logOnce } from '@/lib/log'
import { getSeasonPitcherLines } from '@/lib/pitch-shape/overall'
import { MLB_TEAMS } from '@/lib/teams'
import { MILB_TEAMS } from './teams'
import type { PitcherStatus } from './status-math'

const STATS = 'https://statsapi.mlb.com/api/v1'
const TTL = 6 * 60 * 60 * 1000
const cache = new Map<string, { at: number; s: PitcherStatus }>()   // key: `${id}|${season}`

type Tx = { date?: string; typeCode?: string }
type Person = { id: number; birthDate?: string; currentAge?: number; mlbDebutDate?: string; draftYear?: number; currentTeam?: { id?: number }; transactions?: Tx[] }

const mlbIds = new Set(MLB_TEAMS.map(t => t.id))
const parentOf = new Map([...MILB_TEAMS.aaa, ...MILB_TEAMS.fsl].map(t => [t.id, t.parentId]))
/** The MLB club he belongs to: the club itself if he is on an MLB roster, else the parent of his Triple-A or Florida State League club (other minor levels are not mapped). */
export const orgOfTeam = (teamId: number | null | undefined): number | null => (teamId == null ? null : mlbIds.has(teamId) ? teamId : parentOf.get(teamId) ?? null)

async function people(ids: number[]): Promise<Person[]> {
  const res = await fetch(`${STATS}/people?personIds=${ids.join(',')}&hydrate=transactions,currentTeam`, { next: { revalidate: 21600 } })
  if (!res.ok) { logOnce('status.http', 'getPitcherStatuses', 'MLB Stats API HTTP', res.status); return [] }
  return ((await res.json()) as { people?: Person[] }).people ?? []
}

export async function getPitcherStatuses(ids: number[], season: number): Promise<{ statuses: PitcherStatus[]; leagueRuns100: number | null }> {
  const lines = await Promise.all([season - 2, season - 1, season].map(y => getSeasonPitcherLines(y)))
  const league = lines[2]?.leagueRuns100 ?? null
  const now = Date.now()
  const need = ids.filter(id => { const h = cache.get(`${id}|${season}`); return !h || now - h.at > TTL })
  const chunks: number[][] = []
  for (let i = 0; i < need.length; i += 40) chunks.push(need.slice(i, i + 40))
  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++]
      try {
        for (const p of await people(chunk)) {
          const tx = p.transactions ?? []
          const mlbPitches: Record<number, number> = {}
          const mine = [season - 2, season - 1, season]
          mine.forEach((y, k) => { const n = lines[k]?.by.get(p.id)?.pitches; if (n) mlbPitches[y] = n })
          const cur = lines[2]?.by.get(p.id)
          cache.set(`${p.id}|${season}`, { at: Date.now(), s: {
            id: p.id, age: p.currentAge ?? null, debut: p.mlbDebutDate ?? null, draftYear: p.draftYear ?? null, teamId: p.currentTeam?.id ?? null, orgId: orgOfTeam(p.currentTeam?.id),
            trades: tx.filter(t => t.typeCode === 'TR' && t.date).map(t => (t.date as string).slice(0, 10)).sort(),
            optioned: tx.some(t => t.typeCode === 'OPT' && (t.date ?? '').startsWith(String(season))),
            mlbPitches, mlbRuns100: cur && cur.rvN > 0 ? (cur.rv / cur.rvN) * 100 : null, mlbRvPitches: cur?.rvN ?? 0,
          } })
        }
      } catch (e) { logOnce('status.err', 'getPitcherStatuses', 'failed', e instanceof Error ? e.message : String(e)) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, chunks.length) }, worker))
  return { statuses: ids.map(id => cache.get(`${id}|${season}`)?.s).filter((x): x is PitcherStatus => !!x), leagueRuns100: league }
}
