import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ParkFactor = {
  venue_name: string
  hr_factor: number
  run_factor: number
  hr_factor_lhb: number | null
  hr_factor_rhb: number | null
  altitude_feet: number
  is_dome: boolean
  field_orientation_degrees: number | null
}

/**
 * Get park factors for a specific venue. Returns neutral factors (1.0) if not found.
 */
export async function getParkFactor(venueName: string, season: number = 2026): Promise<ParkFactor> {
  const { data, error } = await supa
    .from('park_factors')
    .select('*')
    .eq('venue_name', venueName)
    .eq('season', season)
    .single()

  if (error || !data) {
    // Default to neutral
    return {
      venue_name: venueName,
      hr_factor: 1.0,
      run_factor: 1.0,
      hr_factor_lhb: null,
      hr_factor_rhb: null,
      altitude_feet: 0,
      is_dome: false,
      field_orientation_degrees: null,
    }
  }

  return data as ParkFactor
}

/**
 * Quick check: does a park favor offense, pitching, or neutral?
 * Used by the Edge Score park component.
 */
export function parkLeansHitter(park: ParkFactor): boolean {
  return park.run_factor > 1.03
}

export function parkLeansPitcher(park: ParkFactor): boolean {
  return park.run_factor < 0.97
}