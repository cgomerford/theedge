// src/app/api/cron/fetch-fantasy-ownership/route.ts
//
// Daily cron: pulls ESPN fantasy baseball ownership + eligibility data,
// matches to MLB Stats API player IDs (name-based, cached), writes to
// fantasy_ownership (latest) and fantasy_ownership_history (daily snapshot).
//
// Replaces scripts/fetch_fantasy_ownership.py — same logic, one language,
// normalizeName imported directly instead of duplicated.
//
// Test locally:
//   curl -H "Authorization: Bearer $EDGE_CRON_AUTH" \
//        "http://localhost:3000/api/cron/fetch-fantasy-ownership"
//
// Vercel Cron entry (vercel.json):
//   { "path": "/api/cron/fetch-fantasy-ownership", "schedule": "0 13 * * *" }

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { normalizeName } from '@/lib/fantasy-ownership'

export const maxDuration = 300

const CURRENT_YEAR = new Date().getFullYear()
const ESPN_URL = (year: number) =>
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/${year}/players?view=players_wl`

const BATCH_SIZE = 500
// Increased from 8 to 15 to safely speed up initial DB seeding
const MLB_LOOKUP_CONCURRENCY = 15 

// ─── Auth (same pattern as every other cron route) ────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const validSecrets = [process.env.CRON_SECRET, process.env.EDGE_CRON_AUTH].filter(Boolean)
  return validSecrets.some(secret => authHeader === `Bearer ${secret}`)
}

// ─── ESPN fetch ──────────────────────────────────────────────────────────────

type EspnPlayer = {
  id: number
  fullName: string
  firstName?: string
  lastName?: string
  proTeamId?: number
  defaultPositionId?: number
  eligibleSlots?: number[]
  ownership?: { percentOwned?: number }
}

// ESPN caps the response at 50 players unless you explicitly ask for more
// via this header. limit is set high enough to cover the full MLB player
// pool (~1500-2000 rostered + free agents combined).
const FANTASY_FILTER = JSON.stringify({
  players: {
    limit: 3000,
    sortPercOwned: { sortAsc: false, sortPriority: 1 },
  },
})

async function fetchEspnPlayersForYear(year: number): Promise<EspnPlayer[]> {
  const res = await fetch(ESPN_URL(year), {
    headers: { 'X-Fantasy-Filter': FANTASY_FILTER },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`ESPN ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json)) throw new Error(`ESPN returned non-array: ${typeof json}`)
  return json
}

async function fetchEspnPlayers(): Promise<EspnPlayer[]> {
  console.log(`[fantasy-ownership] Fetching ESPN ownership (${CURRENT_YEAR})...`)

  let players: EspnPlayer[] = []
  try {
    players = await fetchEspnPlayersForYear(CURRENT_YEAR)
  } catch (e) {
    console.error(`[fantasy-ownership] Current year fetch failed:`, e)
  }

  // Fallback to previous year if current is empty (early offseason)
  if (players.length === 0) {
    console.log(`[fantasy-ownership] Empty — falling back to ${CURRENT_YEAR - 1}`)
    players = await fetchEspnPlayersForYear(CURRENT_YEAR - 1)
  }

  // DEFENSIVE FIX: ESPN sometimes ignores the X-Fantasy-Filter limit and dumps 20k+ players.
  // We sort in-memory by ownership and enforce the 3,000 limit so we don't blow up Vercel limits.
  players.sort((a, b) => (b.ownership?.percentOwned ?? 0) - (a.ownership?.percentOwned ?? 0))
  players = players.slice(0, 3000)

  console.log(`[fantasy-ownership] Received ${players.length} players (Enforced limit)`)
  return players
}

// ─── MLB ID lookup ───────────────────────────────────────────────────────────

async function findMlbId(fullName: string): Promise<number | null> {
  try {
    const url = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(fullName)}&sportIds=1`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const data = await res.json()
    const people: Array<{ id: number; fullName?: string }> = data.people ?? []

    if (people.length === 0) return null
    if (people.length === 1) return people[0].id

    // Multiple hits — require exact normalized match to disambiguate
    const target = normalizeName(fullName)
    const exact = people.filter(p => normalizeName(p.fullName ?? '') === target)
    return exact.length === 1 ? exact[0].id : null
  } catch {
    return null
  }
}

/** Run lookups in concurrency-limited batches to stay under Vercel timeout */
async function batchLookup(
  names: Array<{ espnId: number; fullName: string }>
): Promise<Map<number, number | null>> {
  const results = new Map<number, number | null>()

  for (let i = 0; i < names.length; i += MLB_LOOKUP_CONCURRENCY) {
    const batch = names.slice(i, i + MLB_LOOKUP_CONCURRENCY)
    const settled = await Promise.all(
      batch.map(async ({ espnId, fullName }) => {
        const mlbId = await findMlbId(fullName)
        return { espnId, mlbId }
      })
    )
    for (const { espnId, mlbId } of settled) {
      results.set(espnId, mlbId)
    }
  }

  return results
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const supa = createAdminClient()

  // 1. Fetch ESPN data
  const players = await fetchEspnPlayers()

  // 2. Load existing ESPN→MLB mappings (avoid re-looking up known IDs)
  console.log('[fantasy-ownership] Loading existing ESPN→MLB mappings...')
  const { data: existingRows } = await supa
    .from('fantasy_ownership')
    .select('espn_player_id, mlb_player_id')

  const known = new Map<number, number | null>()
  for (const row of existingRows ?? []) {
    known.set(row.espn_player_id, row.mlb_player_id)
  }
  console.log(`[fantasy-ownership] ${known.size} existing mappings`)

  // 3. Find players that need new MLB lookups
  const needsLookup: Array<{ espnId: number; fullName: string }> = []
  for (const p of players) {
    if (p.id != null && !known.has(p.id)) {
      needsLookup.push({ espnId: p.id, fullName: p.fullName })
    }
  }

  console.log(`[fantasy-ownership] ${needsLookup.length} new lookups needed`)
  const newMatches = needsLookup.length > 0 ? await batchLookup(needsLookup) : new Map()

  // 4. Build upsert + history arrays
  const today = new Date().toISOString().split('T')[0]
  const upserts: Array<Record<string, unknown>> = []
  const history: Array<Record<string, unknown>> = []

  for (const p of players) {
    if (p.id == null) continue

    const mlbId = known.has(p.id) ? known.get(p.id) ?? null : newMatches.get(p.id) ?? null
    const pct = p.ownership?.percentOwned ?? null

    upserts.push({
      espn_player_id:      p.id,
      mlb_player_id:       mlbId,
      full_name:           p.fullName,
      first_name:          p.firstName ?? null,
      last_name:           p.lastName ?? null,
      espn_pro_team_id:    p.proTeamId ?? null,
      default_position_id: p.defaultPositionId ?? null,
      eligible_slots:      p.eligibleSlots ?? [],
      percent_owned:       pct,
    })

    if (pct !== null) {
      history.push({ espn_player_id: p.id, snapshot_date: today, percent_owned: pct })
    }
  }

  // 5. Write to Supabase in batches
  console.log(`[fantasy-ownership] Writing ${upserts.length} ownership rows...`)
  for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
    const { error } = await supa
      .from('fantasy_ownership')
      .upsert(upserts.slice(i, i + BATCH_SIZE), { onConflict: 'espn_player_id' })
    if (error) console.error('[fantasy-ownership] upsert error:', error.message)
  }

  console.log(`[fantasy-ownership] Writing ${history.length} history rows for ${today}...`)
  for (let i = 0; i < history.length; i += BATCH_SIZE) {
    const { error } = await supa
      .from('fantasy_ownership_history')
      .upsert(history.slice(i, i + BATCH_SIZE), { onConflict: 'espn_player_id,snapshot_date' })
    if (error) console.error('[fantasy-ownership] history upsert error:', error.message)
  }

  const elapsedMs = Date.now() - startedAt
  console.log(`[fantasy-ownership] Done in ${elapsedMs}ms — ${upserts.length} rows, ${newMatches.size} new lookups`)

  return NextResponse.json({
    ok: true,
    playersProcessed: upserts.length,
    newMlbLookups: newMatches.size,
    historyRowsWritten: history.length,
    elapsedMs,
  })
}