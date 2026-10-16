/**
 * src/lib/nhl/types.ts
 *
 * Row shapes matching scripts/sql/create_nhl_core.sql column-for-column.
 * Supabase numeric columns return as strings over the JS client with no
 * Database generic (see queries.ts header) -- anything `numeric` in SQL is
 * typed `string | null` here and coerced with Number() at the point of use.
 */

export interface NhlIngestValidationRow {
  game_id: number
  players: number | null
  skaters: number | null
  toi_fail: number | null
  strength_fail: number | null
  strength_unchecked: number | null
  max_toi_err_s: number | null
  max_strength_err_s: number | null
  ref_available: boolean | null
  computed_at: string
}

export interface NhlPlayerGameRow {
  game_id: number
  player_id: number
  team_id: number | null
  position: string | null
  sweater_number: number | null
  toi_s: number | null
  toi_ev_s: number | null
  toi_5v5_s: number | null
  toi_pp_s: number | null
  toi_sh_s: number | null
  toi_en_for_s: number | null
  toi_en_against_s: number | null
  shifts: number | null
  avg_shift_s: string | null
  box_toi_s: number | null
  box_shifts: number | null
  ref_ev_s: number | null
  ref_pp_s: number | null
  ref_sh_s: number | null
  toi_check: 'pass' | 'fail' | null
  strength_check: 'pass' | 'fail' | 'unchecked' | null
  max_toi_err_s: number | null
  max_strength_err_s: number | null
}

export interface NhlGameRow {
  game_id: number
  season: number
  game_type: number
  game_date: string
  home_team_id: number | null
  away_team_id: number | null
  home_score: number | null
  away_score: number | null
  game_state: string | null
  ingest_status: 'pending' | 'ingested' | 'failed' | 'skipped'
  ingest_error: string | null
}

export interface NhlTeamRow {
  team_id: number
  abbrev: string
  place_name: string | null
  common_name: string | null
  color_hex: string | null
  text_on_hex: string | null
}
