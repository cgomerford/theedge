// src/lib/trading-floor-board.ts
//
// Server-side fetcher for "The Board" — folded into the existing /fantasy
// page as a new section (per product decision: fantasy features live as
// a layer inside /fantasy, not as standalone pages — see
// the-edge-master-strategy.md's explicit guidance against splitting
// Fantasy into its own destination).
//
// Pulls everything from a single edge_predictions query; no joins needed
// because bullpen fatigue and park factor already live inside
// components_raw (confirmed against src/app/mlb/[slug]/page.tsx's existing
// read pattern — same nested paths, not a separate team_stats call).

import { createClient } from '@supabase/supabase-js'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type BullpenFatigue = 'fresh' | 'used' | 'taxed' | 'gassed' | 'unknown'

export interface BoardGame {
  game_pk: number
  slug: string
  away_team: string
  home_team: string
  away_abbr: string
  home_abbr: string
  // Raw component scores (the 8-factor object) — used to count aligned
  // factors for display. We never surface the signed edge_score or
  // predicted_winner directly; factor count is directionally neutral.
  components: Record<string, number> | null
  confidence_tier: 'strong' | 'moderate' | 'slight' | 'tossup'
  away_pitcher_fatigue: BullpenFatigue
  home_pitcher_fatigue: BullpenFatigue
  park_hr_factor: number | null
  lineups_confirmed: boolean
  top_driver: string | null
}

function teamSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function getBullpenFatigue(ipYesterday: number | null | undefined): BullpenFatigue {
  if (ipYesterday === null || ipYesterday === undefined) return 'unknown'
  if (ipYesterday >= 5) return 'gassed'
  if (ipYesterday >= 3) return 'taxed'
  if (ipYesterday >= 1) return 'used'
  return 'fresh'
}

// Human-readable label for whichever of the 8 components is driving the
// score most. `components` is the rounded, weighted-display object — not
// components_raw — same shape EdgeIndicator already renders.
const COMPONENT_LABELS: Record<string, string> = {
  starting_pitcher: 'pitcher',
  bullpen: 'bullpen',
  offense: 'offense',
  defense: 'defense',
  matchup: 'matchup',
  park: 'park',
  weather: 'weather',
  rest: 'rest',
}

function getTopDriver(components: Record<string, number> | null): string | null {
  if (!components) return null
  let maxKey: string | null = null
  let maxAbs = 0
  for (const [key, value] of Object.entries(components)) {
    const abs = Math.abs(value)
    if (abs > maxAbs) {
      maxAbs = abs
      maxKey = key
    }
  }
  return maxKey ? COMPONENT_LABELS[maxKey] ?? maxKey : null
}

export async function getBoardSlate(gameDate: string): Promise<BoardGame[]> {
  try {
    const { data, error } = await supa
      .from('edge_predictions')
      .select('game_pk, game_date, home_team, away_team, edge_score, predicted_winner, confidence_tier, components, components_raw, lineups_confirmed')
      .eq('game_date', gameDate)
      .order('edge_score', { ascending: false })

    if (error || !data) {
      console.error('getBoardSlate error:', error?.message)
      return []
    }

    return data.map((row: any): BoardGame => {
      const raw = row.components_raw ?? {}
      const homeTeam = raw.home_team ?? {}
      const awayTeam = raw.away_team ?? {}
      const park = raw.park ?? {}

      return {
        game_pk: row.game_pk,
        slug: String(row.game_pk), // TODO: swap for real slug format once confirmed
        away_team: row.away_team,
        home_team: row.home_team,
        away_abbr: row.away_team?.split(' ').pop() ?? row.away_team,
        home_abbr: row.home_team?.split(' ').pop() ?? row.home_team,
        components: row.components ?? null,
        confidence_tier: row.confidence_tier,
        away_pitcher_fatigue: getBullpenFatigue(awayTeam.bullpen_innings_yesterday),
        home_pitcher_fatigue: getBullpenFatigue(homeTeam.bullpen_innings_yesterday),
        park_hr_factor: park.hr_factor ?? null,
        lineups_confirmed: Boolean(row.lineups_confirmed),
        top_driver: getTopDriver(row.components),
      }
    })
  } catch (err) {
    console.error('getBoardSlate failed:', err)
    return []
  }
}