// src/lib/team-profile/precomputed.ts
//
// Reads of the already-precomputed team tables (the CLAUDE.md pattern:
// cron → Python/route → Supabase → page reads cached rows). Read-only here.
//
// Tables and their single writers:
//   team_stats          — window-mixed. ONLY the columns whose window is
//                         explicit or owned by a known live writer are used:
//                           gb/fb/ld/popup_percent_batting  (scripts/fetch_team_batted_ball.py)
//                           sprint_speed                    (Savant sprint speed, season)
//                           *_l30 / *_l14 columns           (refresh-team-stats route; window is in the name)
//                         Columns whose writer is an ARCHIVED script (chase_rate,
//                         hard_hit_pct, barrel_pct, …) are deliberately NOT used:
//                         their window can't be verified, and a mislabeled window
//                         would be a fabricated claim.
//   team_defense        — OAA total / infield / outfield / LF·CF·RF (scripts/fetch_team_defense.py)
//   team_platoon_splits — pull% for LHB / RHB (scripts/fetch_team_pull_tendency.py)
//
// All three return ~30 rows a season (well under PostgREST's 1,000-row cap).
// numeric columns can arrive as strings → every value goes through Number().

import { createAdminClient } from '@/lib/supabase'
import { num } from './league'

export type TeamStatsRow = {
  id: number
  gbPct: number | null; fbPct: number | null; ldPct: number | null; popupPct: number | null
  sprintSpeed: number | null
  opsL30: number | null; xwobaL30: number | null; runsPerGameL30: number | null; hrPerGameL30: number | null
  avgL30: number | null; obpL30: number | null; slgL30: number | null
  bullpenEraL14: number | null; bullpenWhipL14: number | null; savesL30: number | null; blownSavesL30: number | null
  updatedAt: string | null
}
export type DefenseRow = {
  id: number; oaa: number | null; infield: number | null; outfield: number | null
  lf: number | null; cf: number | null; rf: number | null; updatedAt: string | null
}
export type PullRow = { id: number; pullLhb: number | null; pullRhb: number | null }

export type Precomputed = { stats: TeamStatsRow[]; defense: DefenseRow[]; pull: PullRow[] }

export async function getPrecomputed(season: number): Promise<Precomputed> {
  const supa = createAdminClient()
  const [s, d, p] = await Promise.all([
    supa.from('team_stats').select('*').eq('season', season),
    supa.from('team_defense').select('*').eq('season', season),
    supa.from('team_platoon_splits').select('team_id, pull_pct_lhb, pull_pct_rhb').eq('season', season),
  ])
  if (s.error) console.error('[getPrecomputed] team_stats Supabase error:', s.error.message)
  if (d.error) console.error('[getPrecomputed] team_defense Supabase error:', d.error.message)
  if (p.error) console.error('[getPrecomputed] team_platoon_splits Supabase error:', p.error.message)

  const stats: TeamStatsRow[] = ((s.data ?? []) as Record<string, unknown>[]).map(r => ({
    id: Number(r.team_id),
    gbPct: num(r.gb_percent_batting), fbPct: num(r.fb_percent_batting), ldPct: num(r.ld_percent_batting), popupPct: num(r.popup_percent_batting),
    sprintSpeed: num(r.sprint_speed),
    opsL30: num(r.ops_l30), xwobaL30: num(r.xwoba_l30), runsPerGameL30: num(r.runs_per_game_l30), hrPerGameL30: num(r.hr_per_game_l30),
    avgL30: num(r.avg_l30), obpL30: num(r.obp_l30), slgL30: num(r.slg_l30),
    bullpenEraL14: num(r.bullpen_era_l14), bullpenWhipL14: num(r.bullpen_whip_l14), savesL30: num(r.saves_l30), blownSavesL30: num(r.blown_saves_l30),
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
  }))
  const defense: DefenseRow[] = ((d.data ?? []) as Record<string, unknown>[]).map(r => ({
    id: Number(r.team_id), oaa: num(r.oaa), infield: num(r.infield_oaa), outfield: num(r.outfield_oaa),
    lf: num(r.oaa_lf), cf: num(r.oaa_cf), rf: num(r.oaa_rf), updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
  }))
  const pull: PullRow[] = ((p.data ?? []) as Record<string, unknown>[]).map(r => ({
    id: Number(r.team_id), pullLhb: num(r.pull_pct_lhb), pullRhb: num(r.pull_pct_rhb),
  }))
  return { stats, defense, pull }
}
