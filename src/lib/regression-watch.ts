// src/lib/regression-watch.ts
//
// Server-side fetcher for Regression Watch data.
// Reads from the `regression_watch` table, populated daily by
// scripts/compute_regression_watch.py.
//
// Pattern matches src/lib/bullpen.ts: typed return, null on no-data,
// caught errors never throw to the calling page.

import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type RegressionDirection = 'rise' | 'drop'
export type RegressionPlayerType = 'pitcher' | 'batter'


export interface RegressionWatchRow {
  player_id: number | null
  player_name: string
  team_short: string | null
  position: string | null
  surface_label: string
  true_label: string
  gap: number
  direction: RegressionDirection
  detail: string
}

export interface RegressionWatchData {
  pitchers: { rise: RegressionWatchRow[]; drop: RegressionWatchRow[] }
  batters: { rise: RegressionWatchRow[]; drop: RegressionWatchRow[] }
}

export async function getRegressionWatch(
  gameDate: string // 'YYYY-MM-DD'
): Promise<RegressionWatchData | null> {
  try {
    const { data, error } = await supa
      .from('regression_watch')
      .select('*')
      .eq('game_date', gameDate)
      .order('player_type', { ascending: true })
      .order('direction', { ascending: true })
      .order('rank', { ascending: true })

    if (error || !data || data.length === 0) {
      return null
    }

    const empty = (): RegressionWatchData => ({
      pitchers: { rise: [], drop: [] },
      batters: { rise: [], drop: [] },
    })

    const result = empty()

    for (const r of data as any[]) {
      const row: RegressionWatchRow = {
        player_id: r.player_id ?? null,
        player_name: r.player_name,
        team_short: r.team_short ?? null,
        position: r.position ?? null,
        surface_label: r.surface_label,
        true_label: r.true_label,
        gap: Number(r.gap),
        direction: r.direction as RegressionDirection,
        detail: r.detail,
      }

      const bucket = r.player_type === 'pitcher' ? result.pitchers : result.batters
      const direction: RegressionDirection = r.direction
      bucket[direction].push(row)
    }

    const isEmpty =
      result.pitchers.rise.length === 0 &&
      result.pitchers.drop.length === 0 &&
      result.batters.rise.length === 0 &&
      result.batters.drop.length === 0

    return isEmpty ? null : result
  } catch (err) {
    console.error('getRegressionWatch failed:', err)
    return null
  }
}
