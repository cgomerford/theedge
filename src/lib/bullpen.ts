// src/lib/bullpen.ts
//
// Server-side fetcher for bullpen availability data.
// Called from the game slug page (server component).
// Returns typed BullpenData for home and away teams.

import { createClient } from '@supabase/supabase-js'
import { cache } from 'react'
import type { BullpenArm, BullpenData, PitchDay } from '@/components/BullpenPanel'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const getBullpenData = cache(async (
  homeTeamId: number,
  awayTeamId: number,
  gameDate: string   // 'YYYY-MM-DD'
): Promise<{ home: BullpenData | null; away: BullpenData | null }> => {
  try {
    const { data, error } = await supa
      .from('bullpen_availability')
      .select('*')
      .eq('game_date', gameDate)
      .in('team_id', [homeTeamId, awayTeamId])
      .order('pitches_3d', { ascending: false })

    if (error || !data || data.length === 0) {
      return { home: null, away: null }
    }

    function toTeamData(teamId: number, teamName: string): BullpenData | null {
      if (!data) return null
      const arms = data
        .filter((r: any) => r.team_id === teamId)
        .map((r: any): BullpenArm => {
          // days_json is JSONB — coerce to typed array
          let days: PitchDay[] = []
          try {
            const raw = typeof r.days_json === 'string'
              ? JSON.parse(r.days_json)
              : r.days_json
            days = Array.isArray(raw) ? raw : []
          } catch {
            days = []
          }

          return {
            player_id:     Number(r.player_id),
            name:          r.player_name,
            hand:          r.hand ?? 'R',    // hand not in DB yet — default R, add later
            role:          r.role ?? 'Middle Relief',
            era:           r.era !== null ? Number(r.era) : null,
            days,
            pitches_today: Number(r.pitches_today ?? 0),
          }
        })

      if (arms.length === 0) return null

      return {
        team_name: teamName,
        team_id:   teamId,
        arms,
      }
    }

    // Get team names from the first row of each team
    const homeRow = data.find((r: any) => r.team_id === homeTeamId)
    const awayRow = data.find((r: any) => r.team_id === awayTeamId)

    return {
      home: homeRow ? toTeamData(homeTeamId, homeRow.team_name) : null,
      away: awayRow ? toTeamData(awayTeamId, awayRow.team_name) : null,
    }
  } catch (err) {
    console.error('getBullpenData failed:', err)
    return { home: null, away: null }
  }
})

// Homepage board card just needs one number per team — total pitches the
// whole bullpen (every reliever on the roster) has thrown over the last 3
// calendar days. Sums pitches_3d (already a per-reliever 3-day rolling
// total, see scripts/fetch_bullpen_availability.py) across every reliever
// row for that team/date, rather than fetching full per-arm detail like
// getBullpenData does for the game page's BullpenPanel.
export async function getBullpenPitches3dTotals(gameDate: string): Promise<Map<number, number>> {
  try {
    const { data, error } = await supa
      .from('bullpen_availability')
      .select('team_id, pitches_3d')
      .eq('game_date', gameDate)

    if (error || !data) return new Map()

    const totals = new Map<number, number>()
    for (const row of data as { team_id: number | string; pitches_3d: number | string | null }[]) {
      const teamId = Number(row.team_id)
      totals.set(teamId, (totals.get(teamId) ?? 0) + Number(row.pitches_3d ?? 0))
    }
    return totals
  } catch (err) {
    console.error('getBullpenPitches3dTotals failed:', err)
    return new Map()
  }
}
