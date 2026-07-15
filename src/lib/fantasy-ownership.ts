// src/lib/fantasy-ownership.ts
//
// Shared utilities for fantasy ownership data.
// normalizeName is the single source of truth — used by the cron route
// and the name-based fallback lookup below. No Python duplicate.

import { createAdminClient } from '@/lib/supabase'

/**
 * Normalize a player name for fuzzy matching:
 * strip diacritics, lowercase, remove suffixes (Jr, Sr, II, III),
 * collapse whitespace.
 */
export function normalizeName(name: string): string {
  let n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
  n = n.toLowerCase()
  n = n.replace(/\b(jr|sr|ii|iii)\.?\b/g, '')                  // strip suffixes
  n = n.replace(/[^a-z0-9\s]/g, '')                             // strip punctuation
  n = n.replace(/\s+/g, ' ').trim()                             // collapse whitespace
  return n
}

export type OwnershipRow = {
  percent_owned: number | null
}

export type OwnershipChange = {
  espn_player_id: number
  full_name:       string
  mlb_player_id:   number | null
  current:         number
  previous:        number
  delta:           number
}

/**
 * Look up ownership for picks that already have an mlb_player_id.
 * Direct indexed match — cheap, exact.
 */
export async function getOwnershipByMlbIds(
  mlbIds: number[]
): Promise<Map<number, OwnershipRow>> {
  const result = new Map<number, OwnershipRow>()
  if (mlbIds.length === 0) return result

  const supa = createAdminClient()
  const { data, error } = await supa
    .from('fantasy_ownership')
    .select('mlb_player_id, percent_owned')
    .in('mlb_player_id', mlbIds)

  if (error) {
    console.error('[fantasy-ownership] getOwnershipByMlbIds error:', error.message)
    return result
  }

  for (const row of data ?? []) {
    if (row.mlb_player_id != null) {
      result.set(row.mlb_player_id, { percent_owned: row.percent_owned })
    }
  }
  return result
}

/**
 * Fallback lookup for picks with no mlb_player_id (e.g. MiLB prospects,
 * or a pick_type whose source data never carried the ID through).
 * Matches on normalizeName(full_name) rather than exact string equality,
 * since ESPN and MLB naming conventions occasionally diverge (suffixes,
 * accents, etc).
 *
 * Pulls the full ownership table once and matches in memory — simpler and
 * more reliable than N individual ilike queries, and cheap at this table
 * size (~1500-2000 rows).
 */
export async function getOwnershipByNames(
  names: string[]
): Promise<Map<string, OwnershipRow>> {
  const result = new Map<string, OwnershipRow>()
  if (names.length === 0) return result

  const supa = createAdminClient()
  const { data, error } = await supa
    .from('fantasy_ownership')
    .select('full_name, percent_owned')

  if (error) {
    console.error('[fantasy-ownership] getOwnershipByNames error:', error.message)
    return result
  }

  const byNormalized = new Map<string, number | null>()
  for (const row of data ?? []) {
    byNormalized.set(normalizeName(row.full_name), row.percent_owned)
  }

  for (const name of names) {
    const norm = normalizeName(name)
    if (byNormalized.has(norm)) {
      result.set(name, { percent_owned: byNormalized.get(norm) ?? null })
    }
  }
  return result
}

/**
 * Compute week-over-week ownership change (risers/fallers) by diffing
 * today's fantasy_ownership snapshot against a fantasy_ownership_history
 * row from `daysAgo` days back.
 *
 * Filters out noise: both current AND previous ownership must be ≥1%,
 * and the absolute delta must clear `minDelta` percentage points.
 *
 * Note: this reads from fantasy_ownership_history, so it returns nothing
 * useful until the cron has been running for at least `daysAgo` days —
 * expected empty state early on, not a bug.
 */
export async function getOwnershipTrend(opts: {
  daysAgo?: number
  minDelta?: number
  limit?: number
} = {}): Promise<{ risers: OwnershipChange[]; fallers: OwnershipChange[] }> {
  const { daysAgo = 7, minDelta = 2, limit = 50 } = opts
  const supa = createAdminClient()

  const past = new Date()
  past.setUTCDate(past.getUTCDate() - daysAgo)
  const pastStr = past.toISOString().split('T')[0]

  const [{ data: current }, { data: pastData }] = await Promise.all([
    supa
      .from('fantasy_ownership')
      .select('espn_player_id, mlb_player_id, full_name, percent_owned')
      .not('percent_owned', 'is', null),
    supa
      .from('fantasy_ownership_history')
      .select('espn_player_id, percent_owned')
      .eq('snapshot_date', pastStr),
  ])

  const pastMap = new Map<number, number>()
  for (const r of pastData ?? []) {
    pastMap.set(r.espn_player_id, Number(r.percent_owned))
  }

  const changes: OwnershipChange[] = []
  for (const r of current ?? []) {
    const prev = pastMap.get(r.espn_player_id)
    if (prev == null) continue
    const curr = Number(r.percent_owned)
    if (curr < 1 && prev < 1) continue
    const delta = curr - prev
    if (Math.abs(delta) < minDelta) continue
    changes.push({
      espn_player_id: r.espn_player_id,
      full_name:      r.full_name,
      mlb_player_id:  r.mlb_player_id,
      current:        curr,
      previous:       prev,
      delta,
    })
  }

  changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return {
    risers:  changes.filter(c => c.delta > 0).slice(0, limit),
    fallers: changes.filter(c => c.delta < 0).slice(0, limit),
  }
}