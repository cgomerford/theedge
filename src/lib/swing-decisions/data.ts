// src/lib/swing-decisions/data.ts
//
// SERVER-ONLY reader for the Swing Lab. Pages read cached rows; nothing here fetches Baseball Savant.
//
//   swing_decision_league          league run value of a swing / a take per count group × family × hand × cell
//   swing_decision_league_count    league swing rate per exact count (the ladder's baseline)
//   batter_swing_decisions         one packed row per batter per window ('season', 'l30')
// All three are written by scripts/build_swing_decisions.py (.github/workflows/swing-decisions.yml); migration
// 20261020220000_swing_decisions.sql. Returns null when the batter has no season row (empty state, no guess).

import { createAdminClient } from '@/lib/supabase'
import {
  COORD_ERA, GATE, SEASON, expandCells, expandCounts, leagueIndex,
  type CountGroup, type Family, type Hand, type LeaderRow, type LeagueCell, type LeagueCountRow, type SwingLabData, type SwingLeaders,
} from './model'

type LeagueDbRow = {
  count_group: CountGroup; family: Family; p_throws: Hand; zone_r: number; zone_c: number
  n: number; swing_rate: string | number; rv_swing_mean: string | number | null; rv_take_mean: string | number | null
}
type CountDbRow = { balls: number; strikes: number; family: Family; p_throws: Hand; n: number; n_swing: number }
type BatterDbRow = { win: string; n_pitches: number; cells: number[]; counts: number[] }

// League rows change weekly, so keep them in this server's memory for an hour. Per-process: a cold server re-reads.
const TTL_MS = 60 * 60 * 1000
let leagueCache: { at: number; league: LeagueCell[]; counts: LeagueCountRow[] } | null = null

async function getLeague(): Promise<{ league: LeagueCell[]; counts: LeagueCountRow[] } | null> {
  if (leagueCache && Date.now() - leagueCache.at < TTL_MS) return leagueCache
  const supa = createAdminClient()
  const [lg, ct] = await Promise.all([
    supa.from('swing_decision_league')
      .select('count_group,family,p_throws,zone_r,zone_c,n,swing_rate,rv_swing_mean,rv_take_mean')
      .eq('coord_era', COORD_ERA).limit(1000),
    supa.from('swing_decision_league_count')
      .select('balls,strikes,family,p_throws,n,n_swing')
      .eq('coord_era', COORD_ERA).limit(1000),
  ])
  if (lg.error) { console.error('[getSwingLeague] Supabase error (swing_decision_league):', lg.error.message); return null }
  if (ct.error) { console.error('[getSwingLeague] Supabase error (swing_decision_league_count):', ct.error.message); return null }
  const league: LeagueCell[] = ((lg.data ?? []) as unknown as LeagueDbRow[]).map(r => ({
    count_group: r.count_group, family: r.family, p_throws: r.p_throws, zone_r: r.zone_r, zone_c: r.zone_c, n: r.n,
    swing_rate: Number(r.swing_rate),  // numeric columns come back as strings
    rv_swing_mean: r.rv_swing_mean == null ? null : Number(r.rv_swing_mean),
    rv_take_mean: r.rv_take_mean == null ? null : Number(r.rv_take_mean),
  }))
  const counts: LeagueCountRow[] = ((ct.data ?? []) as unknown as CountDbRow[]).map(r => ({
    balls: r.balls, strikes: r.strikes, family: r.family, p_throws: r.p_throws, n: r.n, swing_rate: r.n ? r.n_swing / r.n : 0,
  }))
  if (league.length === 0) return null  // table not built yet
  leagueCache = { at: Date.now(), league, counts }
  return leagueCache
}

/** Everything the Decisions tab needs for one batter, or null when the league table or his season row is missing. */
export async function getSwingLabData(batterId: number): Promise<SwingLabData | null> {
  if (!Number.isFinite(batterId) || batterId <= 0) return null
  const base = await getLeague()
  if (!base) return null

  const { data, error } = await createAdminClient()
    .from('batter_swing_decisions')
    .select('win,n_pitches,cells,counts')
    .eq('batter_id', batterId).eq('season', SEASON).eq('coord_era', COORD_ERA)
  if (error) { console.error('[getSwingLabData] Supabase error:', error.message); return null }
  const rows = (data ?? []) as unknown as BatterDbRow[]
  const season = rows.find(r => r.win === 'season')
  if (!season) return null
  const l30 = rows.find(r => r.win === 'l30')

  const idx = leagueIndex(base.league)
  return {
    batterId, season: SEASON,
    nSeason: season.n_pitches, nL30: l30?.n_pitches ?? 0,
    rows: expandCells(season.cells, batterId, SEASON, idx),
    l30Rows: l30 ? expandCells(l30.cells, batterId, SEASON, idx) : [],
    ladder: expandCounts(season.counts),
    league: base.league, leagueCounts: base.counts,
  }
}

type LeaderDbRow = {
  batter_id: number; win: string; name: string | null; team: string | null; n_pitches: number
  selection: string | number | null; aggression: string | number | null; decision_runs_per100: string | number | null
}
const num = (v: string | number | null) => (v == null ? null : Number(v)) // numeric columns come back as strings

/** League page data: every hitter at or over the season gate (300 pitches) for each window, from the light columns only
 *  (never the packed cells). Rows the builder could not name are left out. null on a read error. */
export async function getSwingLeaders(): Promise<{ leaders: SwingLeaders; league: LeagueCell[] } | null> {
  const base = await getLeague()
  if (!base) return null
  const { data, error } = await createAdminClient()
    .from('batter_swing_decisions')
    .select('batter_id,win,name,team,n_pitches,selection,aggression,decision_runs_per100')
    .eq('season', SEASON).eq('coord_era', COORD_ERA).gte('n_pitches', GATE.season).not('name', 'is', null)
    .limit(1000) // one season has ~500 + ~200 qualified rows; PostgREST caps a response at 1,000
  if (error) { console.error('[getSwingLeaders] Supabase error:', error.message); return null }
  const rows = ((data ?? []) as unknown as LeaderDbRow[]).map(r => ({
    win: r.win,
    row: {
      batter_id: r.batter_id, name: r.name as string, team: r.team, n_pitches: r.n_pitches,
      selection: num(r.selection), aggression: num(r.aggression), decision_runs_per100: num(r.decision_runs_per100),
    } satisfies LeaderRow,
  }))
  return {
    leaders: { season: rows.filter(r => r.win === 'season').map(r => r.row), l30: rows.filter(r => r.win === 'l30').map(r => r.row) },
    league: base.league,
  }
}
