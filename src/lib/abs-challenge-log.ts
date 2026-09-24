// src/lib/abs-challenge-log.ts
//
// Queries against the per-pitch abs_challenge_log table (schema:
// scripts/sql/create_abs_challenge_log.sql, populated by
// scripts/fetch_abs_challenge_log.py). Real data, live-probed against
// MLB's own feed (reviewDetails.reviewType === "MJ" on a pitch event —
// see that script's header for the confirmed shape).
//
// Both queries pull the raw (game_date, inning) columns and aggregate in
// JS rather than via a Postgres RPC — same approach the rest of this
// codebase uses for Supabase aggregation (see HomeLeaderboards, etc.),
// and avoids needing a DB function that doesn't exist yet. Row volume is
// small (one row per challenge, a few thousand a season), so this is
// cheap. Table may not exist yet / may be empty pending backfill — both
// return [] rather than throwing, same convention as every other lib
// fetcher in this codebase.

import { createClient } from '@supabase/supabase-js'
import { MLB_TEAMS as MLB_TEAMS_BY_ID } from '@/lib/mlb-assets'

// Supabase-js runs on the runtime's global fetch, which Next.js patches
// with its own Data Cache — so a plain createAdminClient() call here would
// inherit page.tsx's `revalidate = 1800` and could serve a snapshot up to
// 30 minutes stale. That's fine for the season-aggregate Savant pulls
// elsewhere, but actively wrong while the per-pitch backfill is running:
// the whole point of the "X of ~Y indexed" progress note is that it's
// live. cache: 'no-store' opts this one query out of that cache.
function createUncachedAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    }
  )
}

export type InningBreakdownRow = { inning: number; label: string; challenges: number }
export type DailyInningTrendRow = { date: string; early: number; mid: number; late: number }
// Per (day, team) row — the client aggregates these into league/division/
// team views for the "Trend by day" filter, rather than us pre-computing
// every possible scope server-side.
export type DailyTeamTrendRow = {
  date: string // 'YYYY-MM-DD'
  teamAbbr: string
  early: number; mid: number; late: number // challenge volume by inning group
  earlyOverturns: number; midOverturns: number; lateOverturns: number // same buckets, overturned subset — lets the UI derive a rate view (overturns/volume) without a second query
}
export type PlayerChallengeRow = {
  playerId: number
  playerName: string
  side: 'batting' | 'fielding' // fielding = catcher/pitcher-initiated
  teamAbbr: string | null
  challenges: number
  overturns: number
  successRate: number
  lateChallenges: number // innings 7+ — the "clutch" slice, same INNING_GROUP('late') cut used in the team trend chart
  lateOverturns: number
  distinctDates: number // number of different game dates this player has challenged in — a spread/reliability signal, distinct from raw volume (5 challenges in 1 game reads very differently from 5 across 5 games)
  // How close each challenged pitch was to the zone edge (see estimateMissInches). Only challenges whose pitch has tracked
  // location count; the rest are left out, never guessed. Null when none of this player's challenges have location.
  located: number // challenges with a usable pitch location
  failedLocated: number // failed (confirmed) challenges with a usable pitch location
  avgMissIn: number | null // mean estimated inches the pitch was from the edge, over FAILED challenges — lower = closer calls
  precision: number | null // mean challenge credit, 0..1 (challengeCredit): overturn = 1, near-miss earns partial credit
}

// ── Miss distance ────────────────────────────────────────────────────────────────────────────────────────────────────
// The ABS zone is the plate's 17-inch width by the batter's zone top/bottom; a pitch is a strike if ANY part of the ball is
// inside it, so a ball's radius is added to the distance. Location comes off the live feed (pX / pZ in feet at the plate,
// strikeZoneTop / Bottom in feet). Validated on 122 challenges (2026-09-08..10): this rule reproduces MLB's final call 84% of
// the time — side-to-side edges 55/57, top/bottom 48/65, because the feed's zone top/bottom is not exactly the ABS zone. So
// treat distances as ESTIMATES: good for telling a near-miss from a wild challenge, not a precise inch count near the
// top/bottom edges. Change the numbers here, not in the UI.
export const BALL_RADIUS_IN = 1.45
export const FAIL_CREDIT_CAP = 0.5 // a failed challenge can never earn more than this, however close
export const FAIL_ZERO_AT_IN = 3 // a failed challenge on a pitch this far (or farther) from the edge earns nothing

export type PitchLocation = { plateX: number; plateZ: number; szTop: number; szBot: number; szWidthIn: number }

/** Inches between the ball's nearest edge and the zone edge: positive = the whole ball missed the zone, negative = it clipped it. */
export function marginInches(l: PitchLocation): number {
  const halfW = l.szWidthIn / 2 / 12
  const dx = Math.abs(l.plateX) - halfW
  const dz = Math.max(l.plateZ - l.szTop, l.szBot - l.plateZ)
  const d = dx < 0 && dz < 0 ? Math.max(dx, dz) : Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
  return d * 12 - BALL_RADIUS_IN
}

/** How far the challenger was off: the pitch's distance from the edge, either side. Small = a close, reasonable challenge. */
export function estimateMissInches(l: PitchLocation): number { return Math.abs(marginInches(l)) }

/** Overturned = 1. Failed = partial credit that shrinks with the miss: 0.1 in off earns ~0.48, 2 in off earns ~0.17, 3+ in earns 0. */
export function challengeCredit(overturned: boolean, missIn: number): number {
  if (overturned) return 1
  return FAIL_CREDIT_CAP * Math.max(0, 1 - missIn / FAIL_ZERO_AT_IN)
}

const INNING_GROUP = (inning: number): 'early' | 'mid' | 'late' =>
  inning <= 3 ? 'early' : inning <= 6 ? 'mid' : 'late'

export const MIN_PLAYER_SAMPLE = 5 // below this, a "success rate" is mostly noise — exported so the UI can state the same cutoff it's actually filtering on

type RawRow = {
  game_date: string
  inning: number
  challenging_team_id: number
  challenge_side: 'batting' | 'fielding'
  challenger_player_id: number | null
  challenger_player_name: string | null
  is_overturned: boolean
  // only selected by the player query; numeric columns can arrive as strings, so always Number() them
  plate_x?: number | string | null; plate_z?: number | string | null; sz_top?: number | string | null; sz_bot?: number | string | null; sz_width_in?: number | string | null
}

const PAGE_SIZE = 1000 // PostgREST's own default max-rows cap — a single
// .range() request larger than this is silently truncated server-side
// regardless of what range you ask for, so this has to page in a loop
// rather than trusting one big .range(0, N) call to return everything.
// (Confirmed the hard way: the UI's "indexed so far" count was stuck at
// exactly 1,000 while the real table kept growing past 4,600+ rows.)

// One shared pull per server instance, reused for ROWS_TTL_MS. Before this, the homepage and /mlb/abs each
// called this three times per render (inning / daily trend / players), paging the whole table every time —
// ~33 queries per render at ~10k rows. Under load that stampede took the database down (2026-09-24).
// In-flight requests share the same promise, so concurrent renders don't each start their own pull.
// Failed or partial pulls are not cached.
const ROWS_TTL_MS = 10 * 60 * 1000
let rowsCache: { at: number; rows: RawRow[] } | null = null
let rowsInFlight: Promise<RawRow[]> | null = null

async function fetchAllChallengeRows(): Promise<RawRow[]> {
  if (rowsCache && Date.now() - rowsCache.at < ROWS_TTL_MS) return rowsCache.rows
  if (!rowsInFlight) {
    rowsInFlight = pullAllChallengeRows()
      .then(({ rows, complete }) => {
        if (complete && rows.length > 0) rowsCache = { at: Date.now(), rows }
        return rows
      })
      .finally(() => { rowsInFlight = null })
  }
  return rowsInFlight
}

async function pullAllChallengeRows(): Promise<{ rows: RawRow[]; complete: boolean }> {
  const supa = createUncachedAdminClient()
  const rows: RawRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supa
      .from('abs_challenge_log')
      .select('game_date, inning, challenging_team_id, challenge_side, challenger_player_id, challenger_player_name, is_overturned, plate_x, plate_z, sz_top, sz_bot, sz_width_in')
      .order('play_id') // stable order, or offset paging can skip/repeat rows
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      // PGRST205 = "table not found" — expected until create_abs_challenge_log.sql
      // has been run and the backfill has populated it. Warn, don't error: a
      // console.error triggers Next's full-screen dev overlay for a state this
      // function already handles gracefully (falls through to []). Anything
      // else is a real, unexpected failure and stays loud.
      if (error.code === 'PGRST205') {
        console.warn('abs_challenge_log: table not created yet (run scripts/sql/create_abs_challenge_log.sql) — showing empty state.')
      } else {
        console.error('[pullAllChallengeRows] Supabase error:', error.message)
      }
      return { rows, complete: false } // partial on a mid-pull failure — shown, but not cached
    }

    rows.push(...((data ?? []) as unknown as RawRow[])) // select string is built dynamically, so supabase-js can't infer the row type
    if (!data || data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return { rows, complete: true }
}

export async function getAbsInningBreakdown(): Promise<InningBreakdownRow[]> {
  const rows = await fetchAllChallengeRows()
  if (rows.length === 0) return []

  const counts = new Map<number, number>()
  for (const r of rows) {
    const inning = r.inning >= 9 ? 9 : r.inning // 9 bucket = "9+"
    counts.set(inning, (counts.get(inning) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([inning, challenges]) => ({ inning, label: inning === 9 ? '9+' : String(inning), challenges }))
}

export async function getAbsDailyTrendByTeam(): Promise<DailyTeamTrendRow[]> {
  const rows = await fetchAllChallengeRows()
  if (rows.length === 0) return []

  const byKey = new Map<string, { date: string; teamAbbr: string; early: number; mid: number; late: number; earlyOverturns: number; midOverturns: number; lateOverturns: number }>()
  for (const r of rows) {
    const teamAbbr = MLB_TEAMS_BY_ID[r.challenging_team_id]?.abbr
    if (!teamAbbr) continue // unrecognized team id — skip rather than mislabel
    const date = r.game_date
    const key = `${date}|${teamAbbr}`
    const bucket = byKey.get(key) ?? { date, teamAbbr, early: 0, mid: 0, late: 0, earlyOverturns: 0, midOverturns: 0, lateOverturns: 0 }
    const group = INNING_GROUP(r.inning)
    bucket[group]++
    if (r.is_overturned) bucket[`${group}Overturns`]++
    byKey.set(key, bucket)
  }

  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.teamAbbr.localeCompare(b.teamAbbr))
}

// Every location field must be present and finite — a missing one means the feed had no tracking for that pitch, and 0 would
// read as "dead centre", so the challenge is simply left out of the distance stats.
function toLocation(r: RawRow): PitchLocation | null {
  const v = [r.plate_x, r.plate_z, r.sz_top, r.sz_bot, r.sz_width_in].map(x => (x == null || x === '' ? NaN : Number(x)))
  if (v.some(n => !Number.isFinite(n))) return null
  const [plateX, plateZ, szTop, szBot, szWidthIn] = v
  return { plateX, plateZ, szTop, szBot, szWidthIn }
}

// Per-player challenge record — who actually calls for the review (a
// catcher/pitcher on challenge_side 'fielding', or the batter himself on
// 'batting'), and how often they're right. challenger_player_id/name come
// straight off MLB's live-feed reviewDetails.player — the real person, not
// an inferred position (see fetch_abs_challenge_log.py's header).
//
// Returns EVERY player with at least one challenge — no MIN_PLAYER_SAMPLE
// cut here. The UI applies that threshold itself, and applies it
// differently depending on context: the min-5 bar stays on for the
// league-wide view (otherwise one-off small samples flood the "most
// efficient" leaderboard with noise), but drops to 0 once a single team is
// selected in the scatter, so a team's full roster — including players
// with just 1-4 challenges — is visible for "spread across the team."
export async function getPlayerChallengeEfficiency(): Promise<PlayerChallengeRow[]> {
  const rows = await fetchAllChallengeRows()
  if (rows.length === 0) return []

  // challenge_side is per-row, but the SIDE that CHALLENGES is the one the
  // player themselves is on (challenging_team_id) — a player's own team_id
  // is the natural key to resolve their team abbr from, same lookup used
  // everywhere else in this file. Mid-season trades mean this can flip; we
  // just keep the most recent occurrence rather than trying to track history.
  const byPlayer = new Map<number, { playerName: string; side: 'batting' | 'fielding'; teamId: number; challenges: number; overturns: number; lateChallenges: number; lateOverturns: number; dates: Set<string>; located: number; failedLocated: number; missSum: number; creditSum: number }>()
  for (const r of rows) {
    if (r.challenger_player_id === null || !r.challenger_player_name) continue
    const bucket = byPlayer.get(r.challenger_player_id) ?? { playerName: r.challenger_player_name, side: r.challenge_side, teamId: r.challenging_team_id, challenges: 0, overturns: 0, lateChallenges: 0, lateOverturns: 0, dates: new Set<string>(), located: 0, failedLocated: 0, missSum: 0, creditSum: 0 }
    bucket.challenges++
    if (r.is_overturned) bucket.overturns++
    if (INNING_GROUP(r.inning) === 'late') {
      bucket.lateChallenges++
      if (r.is_overturned) bucket.lateOverturns++
    }
    bucket.dates.add(r.game_date)
    const loc = toLocation(r)
    if (loc) {
      const miss = estimateMissInches(loc)
      bucket.located++
      bucket.creditSum += challengeCredit(r.is_overturned, miss)
      if (!r.is_overturned) { bucket.failedLocated++; bucket.missSum += miss }
    }
    bucket.teamId = r.challenging_team_id // last-seen wins
    byPlayer.set(r.challenger_player_id, bucket)
  }

  return [...byPlayer.entries()]
    .map(([playerId, b]) => ({
      playerId,
      playerName: b.playerName,
      side: b.side,
      teamAbbr: MLB_TEAMS_BY_ID[b.teamId]?.abbr ?? null,
      challenges: b.challenges,
      overturns: b.overturns,
      successRate: Math.round((b.overturns / b.challenges) * 1000) / 1000,
      lateChallenges: b.lateChallenges,
      lateOverturns: b.lateOverturns,
      distinctDates: b.dates.size,
      located: b.located,
      failedLocated: b.failedLocated,
      avgMissIn: b.failedLocated > 0 ? Math.round((b.missSum / b.failedLocated) * 10) / 10 : null,
      precision: b.located > 0 ? Math.round((b.creditSum / b.located) * 1000) / 1000 : null,
    }))
    .sort((a, b) => b.successRate - a.successRate)
}
