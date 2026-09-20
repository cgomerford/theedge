// src/lib/team-profile/situational.ts
//
// Pro layer for the offense: how the club hits in specific situations, each
// one ranked against the league. ONE league-wide MLB call:
//   /teams/stats?stats=statSplits&group=hitting&sitCodes=<codes>&limit=2000
// Curl-verified 2026-09-20: 630 rows (21 codes × 30 clubs), ~430 KB, 0.7 s.
// Codes that returned nothing at team level (vls, vrs, d7, d30, 1r) are NOT
// requested — no empty rows, no substitutes.
//
// Count splits are MLB's "N-N count" situation: results of plate appearances
// that reached that count. The UI says so.
//
// Read-only. Failure → null + prefixed log; the panel shows an empty state.

import { metricFromValues, fmt, num, type Metric } from './league'

const MLB = 'https://statsapi.mlb.com/api/v1'

const GROUPS: { title: string; items: { code: string; label: string }[] }[] = [
  { title: 'Baserunners', items: [{ code: 'r0', label: 'Bases empty' }, { code: 'ron', label: 'Runners on' }, { code: 'risp2', label: 'RISP, two outs' }, { code: 'lo', label: 'Leading off an inning' }] },
  { title: 'Score state', items: [{ code: 'sah', label: 'Team ahead' }, { code: 'sti', label: 'Score tied' }, { code: 'sbh', label: 'Team behind' }] },
  { title: 'Innings', items: [{ code: 'ig01', label: 'Innings 1–6' }, { code: 'ig07', label: 'Innings 7+' }] },
]
const COUNT_CODES = ['c00', 'c01', 'c02', 'c10', 'c11', 'c12', 'c20', 'c21', 'c22', 'c30', 'c31', 'c32']

export type CountCell = { balls: number; strikes: number; ops: number | null; leagueOps: number | null; pa: number }
export type Situational = { groups: { title: string; metrics: Metric[] }[]; counts: CountCell[] }

export async function getSituational(teamId: number, season: number): Promise<Situational | null> {
  const codes = [...GROUPS.flatMap(g => g.items.map(i => i.code)), ...COUNT_CODES]
  try {
    const url = `${MLB}/teams/stats?stats=statSplits&group=hitting&season=${season}&sportIds=1&limit=2000&sitCodes=${codes.join(',')}`
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) {
      console.error('[getSituational] MLB API error:', res.status)
      return null
    }
    const json = await res.json()
    const rows: { team?: { id?: number }; split?: { code?: string }; stat?: Record<string, unknown> }[] = json?.stats?.[0]?.splits ?? []
    const valuesFor = (code: string) =>
      rows.filter(r => r.split?.code === code && r.team?.id).map(r => ({ id: r.team!.id as number, v: num(r.stat?.ops), pa: Number(r.stat?.plateAppearances ?? 0) }))

    const groups = GROUPS.map(g => ({
      title: g.title,
      metrics: g.items.map(i => metricFromValues(valuesFor(i.code), teamId, { key: i.code, label: i.label, higherIsBetter: true, fmt: fmt.rate3 })),
    }))
    const counts: CountCell[] = COUNT_CODES.map(code => {
      const vals = valuesFor(code)
      const mine = vals.find(v => v.id === teamId)
      const lg = vals.map(v => v.v).filter((x): x is number => x != null)
      return { balls: Number(code[1]), strikes: Number(code[2]), ops: mine?.v ?? null, leagueOps: lg.length ? lg.reduce((a, b) => a + b, 0) / lg.length : null, pa: mine?.pa ?? 0 }
    })
    if (counts.every(c => c.ops == null) && groups.every(g => g.metrics.every(m => m.value == null))) return null
    return { groups, counts }
  } catch (err) {
    console.error('[getSituational]', err instanceof Error ? err.message : err)
    return null
  }
}
