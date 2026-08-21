// src/lib/fielding-alignment.ts
//
// Joins tonight's confirmed/projected lineup (from getProjectedLineup,
// lib/lineups.ts) against player_fielding_run_value (season FRV,
// scripts/fetch_fielding_run_value.py) by player_id, to build the
// FielderAlignmentEntry[] that FieldingAlignmentDiamond.tsx renders.
//
// Position mapping: LineupBatter.position comes back as MLB Stats API
// boxscore abbreviations — confirmed via lib/lineups.ts (player.position
// ?.abbreviation). Only the 8 real diamond positions map through; DH,
// pinch-hit/run slots, and anything else get filtered out entirely rather
// than guessed at, since a DH or PH has no fielding position to badge.
//
// A player in the lineup with no matching FRV row (rookie, insufficient
// innings, name/ID mismatch) still gets an entry — with totalRuns: null —
// so the diamond shows their headshot with an honest "no data" badge
// rather than silently dropping them from the field.

import { createAdminClient } from '@/lib/supabase'
import type { LineupBatter } from '@/lib/lineups'
import type { FielderPosition, FielderAlignmentEntry } from '@/components/FieldingAlignmentDiamond'

const POSITION_MAP: Record<string, FielderPosition> = {
  'C': 'C',
  '1B': '1B',
  '2B': '2B',
  '3B': '3B',
  'SS': 'SS',
  'LF': 'LF',
  'CF': 'CF',
  'RF': 'RF',
  // Deliberately NOT mapped — not diamond positions, filtered out below:
  // 'DH', 'P', 'PH', 'PR', 'O' (generic outfield, ambiguous which of LF/CF/RF)
}

function toFielderPosition(raw: string): FielderPosition | null {
  return POSITION_MAP[raw] ?? null
}

export async function getFieldingAlignment(
  batters: LineupBatter[],
  season: number,
): Promise<FielderAlignmentEntry[]> {
  // Filter to real fielding positions first — no point querying FRV for
  // a DH or a pinch-hit slot.
  const fielders = batters
    .map(b => ({ batter: b, position: toFielderPosition(b.position) }))
    .filter((x): x is { batter: LineupBatter; position: FielderPosition } => x.position !== null)

  if (fielders.length === 0) return []

  const playerIds = fielders.map(f => f.batter.player_id)

  const supa = createAdminClient()
  const { data, error } = await supa
    .from('player_fielding_run_value')
    .select('player_id, total_runs')
    .in('player_id', playerIds)
    .eq('season', season)

  if (error) {
    console.error('getFieldingAlignment: player_fielding_run_value query failed:', error)
  }

  // Supabase numeric columns return as strings — explicit Number()
  // coercion, same rule as everywhere else in this codebase.
  const frvByPlayer = new Map<number, number | null>()
  for (const row of data ?? []) {
    frvByPlayer.set(row.player_id, row.total_runs != null ? Number(row.total_runs) : null)
  }

  return fielders.map(({ batter, position }) => ({
    position,
    playerId: batter.player_id,
    playerName: batter.player_name,
    totalRuns: frvByPlayer.has(batter.player_id) ? (frvByPlayer.get(batter.player_id) ?? null) : null,
  }))
}