/**
 * src/lib/nhl/availability.ts
 *
 * Reads nhl_availability_desk (written by scripts/nhl/rollups.py). DERIVED
 * ONLY -- there is no injury feed for NHL, by design (N2 lock). Copy must
 * never say "injured", "out" or "day-to-day"; it states only what's directly
 * observable: whether the player dressed, was scratched, or the roster
 * changed. toAvailabilityCopy() is the pure half (unit-tested in
 * scripts/test_nhl_availability.ts); getAvailabilityDesk() reads Supabase.
 */

import { createAdminClient } from '@/lib/supabase'

const PAGE_SIZE = 1000

export interface NhlAvailabilityRow {
  season: number
  team_id: number
  player_id: number
  status: 'dressed' | 'scratched' | 'not_listed'
  last_game_id: number | null
  dressed_last10: number | null
  team_games_last10: number | null
  consecutive_missed: number | null
  on_current_roster: boolean | null
  roster_change: 'added' | 'removed' | null
  roster_change_date: string | null
}

export interface AvailabilityEntry {
  playerId: number
  name: string
  position: string | null
  copy: string
  roosterChangeCopy: string | null
}

const FORBIDDEN_WORDS = ['injured', 'injury', 'out', 'day-to-day', 'day to day', 'questionable', 'doubtful']

interface PlayerLookup {
  full_name: string
  position_code: string | null
}

export function toAvailabilityCopy(row: NhlAvailabilityRow, player?: PlayerLookup): AvailabilityEntry {
  const dressedLast10 = row.dressed_last10 ?? 0
  // Literal spec rule: "dressed in >= 7 of the team's last 10". Early season,
  // team_games_last10 can be well under 10, which makes this naturally harder
  // to clear -- that's intentional, not a bug (a player can't be "regularly in
  // the lineup" off 2 games either way).
  const regularlyDressed = dressedLast10 >= 7

  let copy: string
  if (row.status === 'scratched') {
    copy = 'Scratched'
  } else if (row.status === 'dressed') {
    copy = 'Dressed last game'
  } else if (regularlyDressed) {
    copy = 'Not in the last lineup'
  } else {
    copy = 'Not regularly in the lineup'
  }

  let roosterChangeCopy: string | null = null
  if (row.roster_change === 'added' && row.roster_change_date) {
    roosterChangeCopy = `Added to roster ${formatShortDate(row.roster_change_date)}`
  } else if (row.roster_change === 'removed' && row.roster_change_date) {
    roosterChangeCopy = `Removed from roster ${formatShortDate(row.roster_change_date)}`
  }

  const combined = `${copy} ${roosterChangeCopy ?? ''}`.toLowerCase()
  for (const word of FORBIDDEN_WORDS) {
    if (combined.includes(word)) {
      // Defensive guard, not expected to trigger -- availability copy is
      // built entirely from fixed strings above, never free text.
      console.error(`[toAvailabilityCopy] forbidden word "${word}" in generated copy for player ${row.player_id}`)
    }
  }

  return {
    playerId: row.player_id,
    name: player?.full_name ?? `Player ${row.player_id}`,
    position: player?.position_code ?? null,
    copy,
    roosterChangeCopy,
  }
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export async function getAvailabilityDesk(teamId: number, season: number): Promise<AvailabilityEntry[]> {
  const supa = createAdminClient()
  const rows: NhlAvailabilityRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supa
      .from('nhl_availability_desk')
      .select('season,team_id,player_id,status,last_game_id,dressed_last10,team_games_last10,consecutive_missed,on_current_roster,roster_change,roster_change_date')
      .eq('team_id', teamId)
      .eq('season', season)
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) {
      console.error('[getAvailabilityDesk] Supabase error:', error.message)
      break
    }
    rows.push(...((data ?? []) as NhlAvailabilityRow[]))
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  const current = rows.filter((r) => r.on_current_roster)
  if (current.length === 0) return []

  const { data: playerRows, error: playerError } = await supa
    .from('nhl_players')
    .select('player_id,full_name,position_code')
    .in('player_id', current.map((r) => r.player_id))
  if (playerError) {
    console.error('[getAvailabilityDesk] Supabase error reading nhl_players:', playerError.message)
  }
  const players = new Map<number, PlayerLookup>((playerRows ?? []).map((p) => [p.player_id as number, p as PlayerLookup]))

  return current.map((row) => toAvailabilityCopy(row, players.get(row.player_id)))
}
