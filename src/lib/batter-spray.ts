/**
 * src/lib/batter-spray.ts
 *
 * Data access for batter_spray (per-batter season balls-in-play coordinates),
 * populated weekly by scripts/fetch_batter_spray.py. One row per batter,
 * `plays` is a JSONB array of every ball in play with its field coordinates
 * and outcome context.
 *
 * Powers the Scout Report's combined-lineup spray density heatmap.
 */
import { createAdminClient } from '@/lib/supabase'

export type SprayPlay = {
  x: number                          // Statcast hc_x — 0..250, ~125 = home plate
  y: number                          // Statcast hc_y — 0..250, ~200 = home plate, lower = deeper
  ev: string | null                  // event: 'single' | 'double' | ... | 'field_out' | ...
  bt: string | null                  // batted-ball type: 'ground_ball' | 'line_drive' | 'fly_ball' | 'popup'
  ls: number | null                  // launch speed (exit velocity, mph)
  la: number | null                  // launch angle (degrees)
  gd: string | null                  // game_date, 'YYYY-MM-DD' — added 2026-08-20 for L30 filtering
  pt: 'L' | 'R' | null                // pitcher throws — added 2026-08-20 for vs-LHP/vs-RHP filtering
}

export type BatterSpray = {
  player_id: number
  season: number
  plays: SprayPlay[]
  total_balls_in_play: number
}

/**
 * Returns spray rows for all the given batters in one query. Only batters
 * with data in the current season come back — callers get an array whose
 * length may be less than playerIds.length, which is the honest signal
 * that some lineup batters haven't been backfilled yet.
 */
export async function getLineupSpray(playerIds: number[]): Promise<BatterSpray[]> {
  if (playerIds.length === 0) return []
  const season = new Date().getFullYear()
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('batter_spray')
    .select('*')
    .eq('season', season)
    .in('player_id', playerIds)

  if (error) {
    console.error('[batter-spray] query failed:', error.message)
    return []
  }
  console.log('[batter-spray] requested', playerIds.length, 'players:', playerIds, '→ got', (data ?? []).length, 'rows back')
  return (data as BatterSpray[]) ?? []
}

// ─── Pull profile ───────────────────────────────────────────────────────────
// Shared by Key Players' spray-vs-defense factor. Mirrors the convention
// SprayChart.tsx's getPullSummary uses (RHB pulls to low hc_x, LHB to high
// hc_x) but over ALL balls in play rather than hits only, since the point
// is "where do his ground balls / flies go," not "where do his hits fall."

export type PullProfile = {
  bip: number
  pullPct: number            // % of all BIP hit to the pull third
  gbCount: number
  gbPct: number              // % of BIP that are ground balls
  pulledGbPct: number        // % of his ground balls that go pull-side
  airCount: number
  pulledAirPct: number       // % of his fly balls / liners / pops that go pull-side
}

const PULL_MARGIN = 25       // hc_x distance from ~125 (plate line) that counts as "pull third"

export function computePullProfile(plays: SprayPlay[], stand: 'L' | 'R', vsHand?: 'L' | 'R' | null): PullProfile | null {
  const usable = plays.filter((p) => typeof p.x === 'number' && typeof p.y === 'number' && p.bt)
  const pool = vsHand ? usable.filter((p) => p.pt === vsHand) : usable
  // Fall back to all-hand data when the vs-hand slice is too thin to trust.
  const rows = pool.length >= 40 ? pool : usable
  if (rows.length < 60) return null

  const isPull = (x: number) => (stand === 'R' ? x < 125 - PULL_MARGIN : x > 125 + PULL_MARGIN)
  const gb = rows.filter((p) => p.bt === 'ground_ball')
  const air = rows.filter((p) => p.bt !== 'ground_ball')
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

  return {
    bip: rows.length,
    pullPct: pct(rows.filter((p) => isPull(p.x)).length, rows.length),
    gbCount: gb.length,
    gbPct: pct(gb.length, rows.length),
    pulledGbPct: pct(gb.filter((p) => isPull(p.x)).length, gb.length),
    airCount: air.length,
    pulledAirPct: pct(air.filter((p) => isPull(p.x)).length, air.length),
  }
}
