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