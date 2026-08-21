// src/lib/mlb-buckets.ts
//
// Data layer for the "range leaderboard" buckets on /mlb/leaders.
//
// All three aggregate via Postgres RPC functions (see
// supabase/schema/bucket_rpcs.sql), NOT client-side row pulls. An earlier
// version pulled raw pitch_events/batted_ball_events rows with a
// .limit(20000) and grouped in JS — that had no ORDER BY, so as the season
// accumulated more qualifying events the cap silently favored older games
// over recent ones. Aggregating in the database avoids the row-cap problem
// entirely since the result set is just ~30-150 grouped rows either way.
//
// era_by_velo   → "AVG allowed on Nmph+ pitches" (ERA isn't computable
//                 per-pitch — see mlb-leaders.ts history). wOBA is a
//                 fast-follow, needs year-specific linear weights.
// ev_hit_count  → count of batted balls with launch_speed >= threshold.
// hr_distance   → count of home runs with hit_distance_sc >= threshold.

import { createAdminClient } from '@/lib/supabase'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type BucketRow = {
  rank: number
  personId: number
  name: string
  teamAbbr: string
  headshot: string
  value: string
  count?: number
}

export type BucketResult =
  | { available: true; rows: BucketRow[] }
  | { available: false; reason: string }

async function resolvePlayerInfo(personIds: number[]): Promise<Record<number, { name: string; teamAbbr: string }>> {
  if (personIds.length === 0) return {}
  const idsParam = personIds.join(',')
  const url = `${MLB_API}/people?personIds=${idsParam}&hydrate=currentTeam`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return {}
    const data = await res.json()
    const out: Record<number, { name: string; teamAbbr: string }> = {}
    for (const p of data.people ?? []) {
      out[p.id] = {
        name: p.fullName ?? '—',
        teamAbbr: p.currentTeam?.abbreviation ?? '—',
      }
    }
    return out
  } catch (e) {
    console.error('resolvePlayerInfo error:', e)
    return {}
  }
}

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

// ─── AVG allowed on Nmph+ pitches ───────────────────────────────────────────

const MIN_AB_FOR_VELO_BOARD = 20

async function getAvgAllowedByVelo(threshold: number, limit: number): Promise<BucketResult> {
  const supa = createAdminClient()

  const { data, error } = await supa.rpc('avg_allowed_by_velo', {
    min_velo: threshold,
    min_ab: MIN_AB_FOR_VELO_BOARD,
  })

  if (error) {
    console.error('avg_allowed_by_velo RPC error:', error)
    return { available: false, reason: 'Database query failed.' }
  }
  if (!data || data.length === 0) {
    return { available: false, reason: `No pitcher has ${MIN_AB_FOR_VELO_BOARD}+ qualifying at-bats at ${threshold}mph+ yet.` }
  }

  const ranked = (data as { pitcher_id: number; hits: number; abs: number }[])
    .map(r => ({ personId: r.pitcher_id, avg: r.abs > 0 ? r.hits / r.abs : 1, abs: r.abs }))
    .sort((a, b) => a.avg - b.avg) // lower AVG allowed = better
    .slice(0, limit)

  const info = await resolvePlayerInfo(ranked.map(r => r.personId))

  const rows: BucketRow[] = ranked.map((r, i) => ({
    rank: i + 1,
    personId: r.personId,
    name: info[r.personId]?.name ?? '—',
    teamAbbr: info[r.personId]?.teamAbbr ?? '—',
    headshot: headshotUrl(r.personId),
    value: r.avg.toFixed(3).replace(/^0\./, '.'),
    count: r.abs,
  }))

  return { available: true, rows }
}

// ─── Hardest-hit balls (count) ──────────────────────────────────────────────

async function getHardestHitCount(threshold: number, limit: number): Promise<BucketResult> {
  const supa = createAdminClient()

  const { data, error } = await supa.rpc('hardest_hit_count', { min_ev: threshold })

  if (error) {
    console.error('hardest_hit_count RPC error:', error)
    return { available: false, reason: 'Database query failed.' }
  }
  if (!data || data.length === 0) {
    return { available: false, reason: `No batted balls at ${threshold}mph+ EV recorded yet.` }
  }

  const ranked = (data as { batter_id: number; hit_count: number }[])
    .map(r => ({ personId: r.batter_id, count: r.hit_count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)

  const info = await resolvePlayerInfo(ranked.map(r => r.personId))

  const rows: BucketRow[] = ranked.map((r, i) => ({
    rank: i + 1,
    personId: r.personId,
    name: info[r.personId]?.name ?? '—',
    teamAbbr: info[r.personId]?.teamAbbr ?? '—',
    headshot: headshotUrl(r.personId),
    value: String(r.count),
    count: r.count,
  }))

  return { available: true, rows }
}

// ─── Home runs by distance (count) ──────────────────────────────────────────

async function getHrDistanceCount(threshold: number, limit: number): Promise<BucketResult> {
  const supa = createAdminClient()

  const { data, error } = await supa.rpc('hr_count_by_distance', { min_distance: threshold })

  if (error) {
    console.error('hr_count_by_distance RPC error:', error)
    return { available: false, reason: 'Database query failed.' }
  }
  if (!data || data.length === 0) {
    return { available: false, reason: `No home runs at ${threshold}ft+ recorded yet.` }
  }

  const ranked = (data as { batter_id: number; hr_count: number }[])
    .map(r => ({ personId: r.batter_id, count: r.hr_count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)

  const info = await resolvePlayerInfo(ranked.map(r => r.personId))

  const rows: BucketRow[] = ranked.map((r, i) => ({
    rank: i + 1,
    personId: r.personId,
    name: info[r.personId]?.name ?? '—',
    teamAbbr: info[r.personId]?.teamAbbr ?? '—',
    headshot: headshotUrl(r.personId),
    value: String(r.count),
    count: r.count,
  }))

  return { available: true, rows }
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function getBucketLeaders(bucketSlug: string, threshold: number, limit = 15): Promise<BucketResult> {
  if (bucketSlug === 'era_by_velo') return getAvgAllowedByVelo(threshold, limit)
  if (bucketSlug === 'ev_hit_count') return getHardestHitCount(threshold, limit)
  if (bucketSlug === 'hr_distance') return getHrDistanceCount(threshold, limit)
  return { available: false, reason: 'Unknown bucket.' }
}