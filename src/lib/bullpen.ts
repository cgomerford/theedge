// src/lib/bullpen.ts
//
// Server-side fetcher for bullpen availability data.
// Called from the game slug page (server component).
// Returns typed BullpenData for home and away teams.

import { createClient } from '@supabase/supabase-js'
import type { BullpenArm, BullpenData, PitchDay } from '@/components/BullpenPanel'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getBullpenData(
  homeTeamId: number,
  awayTeamId: number,
  gameDate: string   // 'YYYY-MM-DD'
): Promise<{ home: BullpenData | null; away: BullpenData | null }> {
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
}
