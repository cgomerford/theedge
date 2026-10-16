/**
 * src/lib/nhl/queries.ts
 *
 * Server-only reads for the private /nhl/dev/validation prototype page.
 * createAdminClient() from '@/lib/supabase' is synchronous and built without
 * a Database generic, so every query gets an explicit cast to the row
 * interfaces in types.ts rather than relying on inference that isn't there.
 *
 * PostgREST caps any single .range() request at 1,000 rows -- paginate() below
 * loops until a page comes back short, the same pattern as abs-challenge-log.ts.
 * Results are cached for CACHE_TTL_MS and shared across concurrent requests via
 * an in-flight promise map, same reason abs-challenge-log.ts does it: a 2026-09-24
 * incident took Supabase down when a page re-pulled a whole table on every
 * render with no cache. This page is dev-only and low-traffic, but the pattern
 * is cheap enough to always apply rather than assume "nobody will hit this hard."
 */

import { createAdminClient } from '@/lib/supabase'
import type { NhlIngestValidationRow, NhlPlayerGameRow, NhlGameRow } from './types'

const PAGE_SIZE = 1000
const CACHE_TTL_MS = 60 * 1000

const cache = new Map<string, { at: number; data: unknown }>()
const inFlight = new Map<string, Promise<unknown>>()

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>
  const promise = fn()
    .then((data) => {
      cache.set(key, { at: Date.now(), data })
      return data
    })
    .finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

// Generic, dependency-free pagination loop -- no Supabase import, so
// scripts/test_nhl_queries.ts can drive it with a stub fetchPage and assert
// it actually loops past PostgREST's 1,000-row cap, without a live database.
export async function paginateRange<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  onError: (message: string) => void,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []
  let offset = 0
  while (true) {
    const { data, error } = await fetchPage(offset, pageSize)
    if (error) {
      onError(error.message)
      return rows
    }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    offset += pageSize
  }
  return rows
}

async function paginate<T>(
  table: string,
  select: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no Database generic on this client (see header); see CLAUDE.md
  build: (q: any) => any,
): Promise<T[]> {
  const supa = createAdminClient()
  return paginateRange<T>(
    async (offset, limit) => {
      const base = supa.from(table).select(select)
      const query = build(base) ?? base
      return query.range(offset, offset + limit - 1)
    },
    (message) => console.error(`[nhl/queries] Supabase error reading ${table}:`, message),
  )
}

export async function getRecentValidation(limit = 50): Promise<NhlIngestValidationRow[]> {
  return cached(`validation:${limit}`, async () => {
    const supa = createAdminClient()
    const { data, error } = await supa
      .from('nhl_ingest_validation')
      .select('game_id,players,skaters,toi_fail,strength_fail,strength_unchecked,max_toi_err_s,max_strength_err_s,ref_available,computed_at')
      .order('computed_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('[getRecentValidation] Supabase error:', error.message)
      return []
    }
    return (data ?? []) as NhlIngestValidationRow[]
  })
}

export async function getGamesByIds(gameIds: number[]): Promise<Map<number, NhlGameRow>> {
  if (gameIds.length === 0) return new Map()
  return cached(`games:${gameIds.join(',')}`, async () => {
    const supa = createAdminClient()
    const { data, error } = await supa
      .from('nhl_games')
      .select('game_id,season,game_type,game_date,home_team_id,away_team_id,home_score,away_score,game_state,ingest_status,ingest_error')
      .in('game_id', gameIds)
    if (error) {
      console.error('[getGamesByIds] Supabase error:', error.message)
      return new Map()
    }
    return new Map((data ?? []).map((row) => [row.game_id as number, row as NhlGameRow]))
  })
}

export async function getPlayerGameDrilldown(gameId: number): Promise<NhlPlayerGameRow[]> {
  return cached(`drilldown:${gameId}`, async () => {
    const rows = await paginate<NhlPlayerGameRow>(
      'nhl_player_game',
      'game_id,player_id,team_id,position,sweater_number,toi_s,toi_ev_s,toi_5v5_s,toi_pp_s,toi_sh_s,toi_en_for_s,toi_en_against_s,shifts,avg_shift_s,box_toi_s,box_shifts,ref_ev_s,ref_pp_s,ref_sh_s,toi_check,strength_check,max_toi_err_s,max_strength_err_s',
      (q) => q.eq('game_id', gameId),
    )
    return rows
  })
}
