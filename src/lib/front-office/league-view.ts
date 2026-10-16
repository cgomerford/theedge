// src/lib/front-office/league-view.ts
//
// Reads for the Front Office "MLB at a glance" and "Hidden value" sections. Writes nothing.
//   getLeagueView   one row per club from the cached league tables the team pages already use
//                   (same source, so a number here can never disagree with the team page).
//   getHiddenValue  first pass: players whose expected numbers are better than their results.
//                   Pitchers from `pitcher_stats` (ERA against xERA, 90+ IP); hitters from the
//                   latest `regression_watch` run (xwOBA against AVG). These are expected
//                   stats, not forecasts. `player_projections` is empty and `player_control`
//                   / contracts are not populated, so there is no projection or cost here yet.

import { createAdminClient } from '@/lib/supabase'
import { getLeagueTables } from '@/lib/team-profile/league'

export type ClubRow = {
  id: number
  w: number; l: number
  rsPerG: number; raPerG: number; diff: number
  hrPerG: number | null
  spEra: number | null; rpEra: number | null
}
export type LeagueAverages = { rsPerG: number | null; hrPerG: number | null; kPct: number | null; bbPct: number | null; era: number | null; sbPerG: number | null }
export type LeagueView = { season: number; clubs: ClubRow[]; avg: LeagueAverages }

const ratio = (n: number, d: number) => (d > 0 ? n / d : null)

export async function getLeagueView(season: number): Promise<LeagueView | null> {
  const tables = await getLeagueTables(season)
  if (!tables) {
    console.error('[getLeagueView] league tables unavailable')
    return null
  }
  const t = tables
  const clubs: ClubRow[] = t.rows.filter(r => r.st.gp > 0).map(r => ({
    id: r.id, w: r.st.w, l: r.st.l,
    rsPerG: r.st.rs / r.st.gp, raPerG: r.st.ra / r.st.gp, diff: r.st.diff,
    hrPerG: r.hit?.hrPerG ?? null, spEra: r.sp?.era ?? null, rpEra: r.rp?.era ?? null,
  }))
  const sum = (f: (r: (typeof t.rows)[number]) => number) => t.rows.reduce((a, r) => a + f(r), 0)
  const gp = sum(r => r.st.gp)
  return {
    season, clubs,
    avg: {
      rsPerG: ratio(sum(r => r.st.rs), gp),
      hrPerG: ratio(sum(r => r.hit?.hr ?? 0), gp),
      kPct: ratio(sum(r => r.hit?.so ?? 0), sum(r => r.hit?.pa ?? 0)),
      bbPct: ratio(sum(r => r.hit?.bb ?? 0), sum(r => r.hit?.pa ?? 0)),
      era: ratio(sum(r => (r.pit?.er ?? 0) * 9), sum(r => r.pit?.ip ?? 0)),
      sbPerG: ratio(sum(r => r.hit?.sb ?? 0), gp),
    },
  }
}

export type HiddenValueRow = {
  key: string; name: string; teamId: number | null; teamShort: string | null
  resultLabel: string; expectedLabel: string; gap: number; sample: string | null
}

const n = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export async function getHiddenPitchers(season: number, limit = 5): Promise<HiddenValueRow[]> {
  const { data, error } = await createAdminClient()
    .from('pitcher_stats')
    .select('player_id, player_name, team_id, era, xera, innings_pitched')
    .eq('season', season)
    .gte('innings_pitched', 90)
    .limit(1000)
  if (error) {
    console.error('[getHiddenPitchers] Supabase error:', error.message)
    return []
  }
  return ((data ?? []) as Record<string, unknown>[])
    .map(r => ({ r, era: n(r.era), xera: n(r.xera) }))
    .filter((x): x is { r: Record<string, unknown>; era: number; xera: number } => x.era != null && x.xera != null && x.era - x.xera >= 0.5)
    .sort((a, b) => (b.era - b.xera) - (a.era - a.xera))
    .slice(0, limit)
    .map(({ r, era, xera }) => ({
      key: `p${r.player_id}`, name: String(r.player_name ?? ''), teamId: n(r.team_id), teamShort: null,
      resultLabel: `${era.toFixed(2)} ERA`, expectedLabel: `${xera.toFixed(2)} xERA`, gap: era - xera,
      sample: n(r.innings_pitched) != null ? `${Number(r.innings_pitched).toFixed(0)} IP` : null,
    }))
}

export async function getHiddenHitters(limit = 5): Promise<HiddenValueRow[]> {
  const supa = createAdminClient()
  const latest = await supa.from('regression_watch').select('game_date').eq('player_type', 'batter').order('game_date', { ascending: false }).limit(1)
  if (latest.error) {
    console.error('[getHiddenHitters] Supabase error:', latest.error.message)
    return []
  }
  const date = (latest.data as { game_date?: string }[] | null)?.[0]?.game_date
  if (!date) return []
  const { data, error } = await supa
    .from('regression_watch')
    .select('id, player_name, team_short, surface_label, true_label, gap, rank')
    .eq('player_type', 'batter').eq('direction', 'rise').eq('game_date', date)
    .order('rank', { ascending: true }).limit(limit)
  if (error) {
    console.error('[getHiddenHitters] Supabase error:', error.message)
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    key: `h${r.id}`, name: String(r.player_name ?? ''), teamId: null, teamShort: r.team_short ? String(r.team_short) : null,
    resultLabel: String(r.surface_label ?? ''), expectedLabel: String(r.true_label ?? ''), gap: Math.abs(n(r.gap) ?? 0), sample: null,
  }))
}
