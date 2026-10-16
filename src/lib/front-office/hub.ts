// src/lib/front-office/hub.ts
//
// Reads for the Front Office hub that are not the Blueprint itself.
//   (getFinalFour lives in postseason.server-fetch-allowed.ts)
//   getTeamDna    six side-by-side facts for one club, ranked among the clubs that
//                 have the number. Reads `team_stats` (written by its own cron); this
//                 file writes nothing. No composite score — each axis stands alone.

import { createAdminClient } from '@/lib/supabase'
import { metricFromValues, num } from '@/lib/team-profile/league'

export type DnaAxis = {
  key: string; label: string; display: string; leagueDisplay: string
  rank: number | null; of: number
  pct: number            // rank → 0-100 (100 = best of the clubs that have the number)
}

const pctFromRank = (rank: number | null, of: number) => (rank == null || of < 2 ? 0 : Math.round(((of - rank) / (of - 1)) * 100))

const DEFS = [
  { key: 'contact', label: 'Contact', col: 'k_pct', higher: false, fmt: (v: number) => `${(v * 100).toFixed(1)}% K` },
  { key: 'power', label: 'Power', col: 'iso', higher: true, fmt: (v: number) => `.${Math.round(v * 1000)} ISO` },
  { key: 'speed', label: 'Speed', col: 'sprint_speed', higher: true, fmt: (v: number) => `${v.toFixed(1)} ft/s` },
  { key: 'defence', label: 'Defence', col: 'oaa', higher: true, fmt: (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)} OAA` },
  { key: 'chase', label: 'Chase', col: 'chase_rate', higher: false, fmt: (v: number) => `${v.toFixed(1)}%` },
  { key: 'bullpen', label: 'Bullpen', col: 'bullpen_era', higher: false, fmt: (v: number) => `${v.toFixed(2)} ERA` },
] as const

export async function getTeamDna(teamId: number, season: number): Promise<DnaAxis[] | null> {
  const { data, error } = await createAdminClient()
    .from('team_stats')
    .select('team_id, k_pct, iso, sprint_speed, oaa, chase_rate, bullpen_era')
    .eq('season', season)
  if (error) {
    console.error('[getTeamDna] Supabase error:', error.message)
    return null
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  if (!rows.some(r => Number(r.team_id) === teamId)) return null
  return DEFS.map(d => {
    const m = metricFromValues(rows.map(r => ({ id: Number(r.team_id), v: num(r[d.col]) })), teamId, { key: d.key, label: d.label, higherIsBetter: d.higher, fmt: d.fmt })
    return { key: d.key, label: d.label, display: m.display, leagueDisplay: m.leagueDisplay, rank: m.rank, of: m.of, pct: pctFromRank(m.rank, m.of) }
  })
}
