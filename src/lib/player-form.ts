// src/lib/player-form.ts
//
// Reads player_form_signals — populated once a day by fetch_player_form.py
// using a real, backtested peak/trough detector (54% of 221 rolling-OPS
// peaks regressed in the validating backtest, mean -0.028 OPS). This file
// does NO computation of its own — the hard part already happened in the
// cron. This is a straight Supabase select + shape-for-display.
//
// Replaces an earlier version of this file (fantasy-trends.ts) that
// recomputed a cruder "last 3 games vs season" signal from scratch,
// duplicating this already-validated system with something worse. Deleted
// rather than kept alongside this.
//
// team_name here is a short display name ("Yankees"), not a 3-letter
// abbreviation like "NYY" — short_name() in fetch_player_form.py takes the
// last word of the full team name. That means it won't key into the
// TEAM_COLORS map used elsewhere (which is keyed by abbreviation), so
// headshots on this page use a neutral color rather than a team tint,
// rather than guess at a name-to-abbreviation mapping that might not exist.

import { createAdminClient } from '@/lib/supabase'

export type FormSignalRow = {
  playerId: number
  playerName: string
  teamName: string | null
  playerType: 'batter' | 'pitcher' | 'milb_batter'
  signal: 'heating' | 'cooling'
  currentValue: number
  extremeValue: number
  magnitude: number
  trend: number[]
}

function todayUTC(): string {
  return new Date().toISOString().split('T')[0]
}

async function fetchSignals(playerType: 'batter' | 'pitcher' | 'milb_batter'): Promise<FormSignalRow[]> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('player_form_signals')
    .select('player_id, player_name, team_name, player_type, signal, current_value, extreme_value, magnitude, trend')
    .eq('computed_date', todayUTC())
    .eq('player_type', playerType)
    .order('magnitude', { ascending: false })

  if (error || !data) {
    console.error(`[player-form] query failed for ${playerType}:`, error)
    return []
  }

  return data.map((r: any): FormSignalRow => ({
    playerId: r.player_id,
    playerName: r.player_name,
    teamName: r.team_name,
    playerType: r.player_type,
    signal: r.signal,
    currentValue: Number(r.current_value),
    extremeValue: Number(r.extreme_value),
    magnitude: Number(r.magnitude),
    trend: Array.isArray(r.trend) ? r.trend.map(Number) : [],
  }))
}

export async function getBatterFormSignals(): Promise<{ heating: FormSignalRow[]; cooling: FormSignalRow[] }> {
  const rows = await fetchSignals('batter')
  return {
    heating: rows.filter(r => r.signal === 'heating'),
    cooling: rows.filter(r => r.signal === 'cooling'),
  }
}

export async function getPitcherFormSignals(): Promise<{ heating: FormSignalRow[]; cooling: FormSignalRow[] }> {
  const rows = await fetchSignals('pitcher')
  return {
    heating: rows.filter(r => r.signal === 'heating'),
    cooling: rows.filter(r => r.signal === 'cooling'),
  }
}

// milb_batter rows are heating-only by design (fetch_player_form.py never
// persists cooling AAA rows — see that file's docstring on why).
export async function getMilbFormSignals(): Promise<FormSignalRow[]> {
  return fetchSignals('milb_batter')
}