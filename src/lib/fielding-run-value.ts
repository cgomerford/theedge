/**
 * src/lib/fielding-run-value.ts
 *
 * Data access for the Defensive Alignment diamond on the Scout Report.
 * Joins tonight's PROJECTED lineup (getProjectedLineup — confirmed if
 * available, else falls back to the last completed game's lineup, same
 * as everywhere else lineups are used) against `player_fielding_run_value`
 * (season-blended FRV, populated weekly by
 * scripts/fetch_fielding_run_value.py) by player_id.
 *
 * Runs on the PROJECTED lineup deliberately, not gated on
 * lineupsConfirmed — the diamond should show something the moment a
 * previous game's lineup gives us a reasonable projection, same logic
 * LineupCard/BattingTabContent already rely on. If getProjectedLineup
 * itself comes back 'unavailable', batters is [] and this correctly
 * returns [] too — that's the "Lineup not yet confirmed" empty state in
 * FieldingAlignmentDiamond, not a bug.
 *
 * A batter whose position isn't one of the 8 defensive spots (DH, or an
 * unrecognized/blank position string) is dropped rather than guessed at.
 */

import { createAdminClient } from '@/lib/supabase'
import type { LineupBatter } from '@/lib/lineups'
import type { FielderAlignmentEntry, FielderPosition } from '@/components/FieldingAlignmentDiamond'

const VALID_POSITIONS = new Set<FielderPosition>(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'])

function isFielderPosition(pos: string): pos is FielderPosition {
  return VALID_POSITIONS.has(pos as FielderPosition)
}

/**
 * Build the diamond's fielders array for one team from its projected lineup.
 * Safe to call with an empty/undefined batters list — returns [].
 */
export async function getFieldingAlignment(
  batters: LineupBatter[] | null | undefined,
): Promise<FielderAlignmentEntry[]> {
  if (!batters || batters.length === 0) return []

  const fielders = batters.filter(b => isFielderPosition(b.position))
  if (fielders.length === 0) return []

  const season = new Date().getFullYear()
  const supa = createAdminClient()
  const playerIds = fielders.map(f => f.player_id)

  const { data, error } = await supa
    .from('player_fielding_run_value')
    .select('player_id, total_runs')
    .eq('season', season)
    .in('player_id', playerIds)

  const frvByPlayer = new Map<number, number | null>()
  if (!error && data) {
    for (const row of data) {
      // numeric columns come back as strings from Supabase — coerce explicitly
      frvByPlayer.set(row.player_id, row.total_runs != null ? Number(row.total_runs) : null)
    }
  }

  return fielders.map(f => ({
    position: f.position as FielderPosition,
    playerId: f.player_id,
    playerName: f.player_name,
    totalRuns: frvByPlayer.get(f.player_id) ?? null,
  }))
}

/**
 * Convenience wrapper for the common case: both teams at once, in parallel.
 */
export async function getGameFieldingAlignment(
  awayBatters: LineupBatter[] | null | undefined,
  homeBatters: LineupBatter[] | null | undefined,
): Promise<{ away: FielderAlignmentEntry[]; home: FielderAlignmentEntry[] }> {
  const [away, home] = await Promise.all([
    getFieldingAlignment(awayBatters),
    getFieldingAlignment(homeBatters),
  ])
  return { away, home }
}
