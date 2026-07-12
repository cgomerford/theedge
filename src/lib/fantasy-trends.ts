// src/lib/fantasy-trends.ts
//
// Pitching Trends: pitcher_stats already carries l3_era / l3_k_per_9 /
// l3_innings / l3_strikeouts / l3_walks (confirmed from the real column
// check earlier in this project) — "ERA improved over last 3 starts" is
// just era - l3_era on data that's already there. One Supabase query,
// no new fetching.
//
// Batting Trends: no equivalent rolling column exists for batters, so this
// reuses getBatterGameLog + aggregateBatting from stats-gamelog.ts (already
// built for /stats/player/[id]), scoped to the last 3 games, run across
// ultimate_team_players (the existing curated pool used by Regression
// Watch) rather than the full league — bounded to ~200-300 players instead
// of 750+ individual MLB API calls.

import { createAdminClient } from '@/lib/supabase'
import { getBatterGameLog, aggregateBatting } from '@/lib/stats-gamelog'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

// id -> abbreviation (same map used in stats-data.ts — worth hoisting into
// teams.ts as a shared export next time either file changes, this is now
// the third copy of the same 30 rows)
const TEAM_ID_TO_ABBREV: Record<number, string> = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE',
  115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM',
  133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA', 137: 'SF', 138: 'STL', 139: 'TB',
  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS', 146: 'MIA',
  147: 'NYY', 158: 'MIL',
}

export type PitchingTrendRow = {
  playerId: number
  playerName: string
  team: string
  era: number; l3Era: number; eraDelta: number
  k9: number; l3K9: number; k9Delta: number
  direction: 'improving' | 'declining'
}

export async function getPitchingTrends(minL3Innings = 3): Promise<{ improving: PitchingTrendRow[]; declining: PitchingTrendRow[] }> {
  const supa = createAdminClient()
  const season = new Date().getFullYear()

  const { data, error } = await supa
    .from('pitcher_stats')
    .select('player_id, player_name, team_id, era, l3_era, k_per_9, l3_k_per_9, l3_innings')
    .eq('season', season)
    .not('l3_era', 'is', null)
    .not('era', 'is', null)

  if (error || !data) {
    console.error('[fantasy-trends] pitcher_stats query failed:', error)
    return { improving: [], declining: [] }
  }

  const rows: PitchingTrendRow[] = data
    .filter((r: any) => (r.l3_innings ?? 0) >= minL3Innings) // small-sample guard, same reasoning as minIp in stats-data.ts
    .map((r: any) => {
      const era = Number(r.era), l3Era = Number(r.l3_era)
      const k9 = Number(r.k_per_9 ?? 0), l3K9 = Number(r.l3_k_per_9 ?? 0)
      return {
        playerId: r.player_id,
        playerName: r.player_name,
        team: TEAM_ID_TO_ABBREV[r.team_id] ?? '—',
        era, l3Era, eraDelta: era - l3Era, // positive = ERA improving (l3 lower than season)
        k9, l3K9, k9Delta: l3K9 - k9,       // positive = K/9 improving (l3 higher than season)
        direction: (era - l3Era) > 0 ? 'improving' as const : 'declining' as const,
      }
    })

  const improving = rows.filter(r => r.eraDelta > 0.3).sort((a, b) => b.eraDelta - a.eraDelta).slice(0, 15)
  const declining = rows.filter(r => r.eraDelta < -0.3).sort((a, b) => a.eraDelta - b.eraDelta).slice(0, 15)
  return { improving, declining }
}

export type BattingTrendRow = {
  playerId: number
  playerName: string
  team: string
  seasonOps: number; l3Ops: number; opsDelta: number
  direction: 'improving' | 'declining'
}

export async function getBattingTrends(): Promise<{ improving: BattingTrendRow[]; declining: BattingTrendRow[] }> {
  const supa = createAdminClient()

  const { data, error } = await supa
    .from('ultimate_team_players')
    .select('player_id, full_name, team_short, ops, player_type, games_played')
    .eq('player_type', 'hitter')
    .gte('games_played', 15) // small-sample guard for the season side of the comparison

  if (error || !data) {
    console.error('[fantasy-trends] ultimate_team_players query failed:', error)
    return { improving: [], declining: [] }
  }

  const season = new Date().getFullYear()
  const results = await Promise.all(
    data.map(async (p: any) => {
      const games = await getBatterGameLog(p.player_id, season)
      if (games.length < 3) return null
      const last3 = aggregateBatting(games.slice(-3))
      const seasonOps = Number(p.ops)
      if (last3.ops === null || isNaN(seasonOps)) return null
      return {
        playerId: p.player_id,
        playerName: p.full_name,
        team: p.team_short ?? '—',
        seasonOps, l3Ops: last3.ops, opsDelta: last3.ops - seasonOps,
        direction: (last3.ops - seasonOps) > 0 ? 'improving' as const : 'declining' as const,
      } as BattingTrendRow
    })
  )

  const rows = results.filter((r): r is BattingTrendRow => r !== null)
  const improving = rows.filter(r => r.opsDelta > 0.08).sort((a, b) => b.opsDelta - a.opsDelta).slice(0, 15)
  const declining = rows.filter(r => r.opsDelta < -0.08).sort((a, b) => a.opsDelta - b.opsDelta).slice(0, 15)
  return { improving, declining }
}