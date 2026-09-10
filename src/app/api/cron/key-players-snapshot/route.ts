// src/app/api/cron/key-players-snapshot/route.ts
//
// Computes and freezes Top 3 Key Players for every game in today's slate,
// both teams per game.
//
// FREEZE SEMANTICS (updated 2026-08):
//   1. Games already Live/Final are skipped — same rule as before.
//   2. NEW: games that already have a logged snapshot are skipped. Once
//      a game is snapshotted, that's the frozen read for the series —
//      later cron runs never overwrite it. Prevents the "last write before
//      first pitch" wobble when lineups keep re-confirming.
//   3. NEW: manual override via ?force=true (single game or whole day) —
//      the ONLY way to recompute a game that's already been logged.
//      Used for backfills or when a probable pitcher change invalidates
//      an earlier snapshot.
//   4. NEW: ?gamePk=<id> scopes the run to one game — useful when you
//      just want to redo one matchup instead of the whole slate.
//
// SCHEDULING: every 30 min through the day (probable pitchers confirm at
// different times). vercel.json:
//   { "path": "/api/cron/key-players-snapshot", "schedule": "*/30 * * * *" }
//
// MANUAL TRIGGER — see README section at bottom of file for the exact
// curl commands, kept next to the code so it doesn't drift.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getScheduleForDate, slugifyGame } from '@/lib/mlb'
import { getSeriesTop3 } from '@/lib/series-matchup'
import { getPitcherSeriesEdge } from '@/lib/pitcher-series-edge'
import { rankKeyPlayers, buildKeyPlayersSnapshotRows, writeKeyPlayersSnapshot } from '@/lib/key-players'
import type { RecentFormContext } from '@/lib/key-players-narrative'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

// ─── Idempotency check ────────────────────────────────────────────────────
//
// Returns the set of (gamePk, teamId) pairs that already have a snapshot
// row for today's date. Called once at the start of the run so we can skip
// them without hitting the compute path at all.
//
// TABLE ASSUMPTION: key_players_snapshots has columns (game_pk, team_id,
// game_date). Adjust the .select() / composite-key builder below if your
// schema differs — those are the only two references in this file, both
// in this one function.
async function fetchLoggedPairs(date: string): Promise<Set<string>> {
  const supa = createAdminClient()
  const { data, error } = await supa
    .from('key_players_snapshots')
    .select('game_pk, team_id')
    .eq('game_date', date)

  if (error) {
    // Fail-open on the check: if we can't read the log, we'd rather
    // recompute (and possibly overwrite) than silently skip every game.
    // A schema mismatch will show up as a full recompute + a loud console
    // error rather than a silent no-op, which is easier to notice.
    console.error('key-players-snapshot cron: idempotency check failed, will recompute all', error)
    return new Set()
  }

  const set = new Set<string>()
  for (const row of data ?? []) {
    set.add(`${row.game_pk}:${row.team_id}`)
  }
  return set
}

async function getFormMapForTeam(teamId: number, teamShortName: string): Promise<Map<number, RecentFormContext>> {
  const supa = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const shortName = teamShortName.split(' ').slice(-1)[0]
  const { data } = await supa
    .from('player_form_signals')
    .select('player_id, signal, metric, current_value')
    .eq('computed_date', today)
    .eq('player_type', 'batter')
    .ilike('team_name', `%${shortName}%`)

  const map = new Map<number, RecentFormContext>()
  for (const row of data ?? []) {
    if (row.signal !== 'heating' && row.signal !== 'cooling') continue
    map.set(row.player_id, { signal: row.signal, metric: `${row.metric} ${row.current_value}` })
  }
  return map
}

// ─── Delete existing snapshot for a (gamePk, teamId) — used only when
// ?force=true is passed. Same table assumption as fetchLoggedPairs above.
async function deleteLoggedPair(gamePk: number, teamId: number, date: string) {
  const supa = createAdminClient()
  const { error } = await supa
    .from('key_players_snapshots')
    .delete()
    .eq('game_pk', gamePk)
    .eq('team_id', teamId)
    .eq('game_date', date)
  if (error) console.error(`key-players-snapshot: force-delete failed for ${gamePk}/${teamId}`, error)
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === 'true'
  const targetGamePk = url.searchParams.get('gamePk')
    ? Number(url.searchParams.get('gamePk'))
    : null
  const targetDate = url.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  let games: Awaited<ReturnType<typeof getScheduleForDate>> = []
  try {
    games = await getScheduleForDate(targetDate)
  } catch (e) {
    console.error('key-players-snapshot cron: schedule fetch failed', e)
    return NextResponse.json({ error: 'schedule fetch failed' }, { status: 500 })
  }

  // Scope to one game if ?gamePk= was passed.
  if (targetGamePk) {
    games = games.filter(g => g.gamePk === targetGamePk)
    if (games.length === 0) {
      return NextResponse.json({ error: `game ${targetGamePk} not on ${targetDate} slate` }, { status: 404 })
    }
  }

  // One round-trip to find what's already logged. Skipped when force is
  // on — the whole point of force is to bypass this check.
  const loggedPairs = force ? new Set<string>() : await fetchLoggedPairs(targetDate)

  let written = 0
  let failed = 0
  let skippedLiveOrFinal = 0
  let skippedAlreadyLogged = 0
  let forceOverwrote = 0

  for (const game of games) {
    const abstractState = (game as any).status?.abstractGameState
    if (abstractState === 'Live' || abstractState === 'Final') {
      // Live/Final always skipped — force does NOT override this. If a
      // game is already in progress, the snapshot IS the historical
      // record we want to preserve. Force is for pregame recomputes only.
      skippedLiveOrFinal++
      continue
    }

    const homeId = game.teams.home.team.id
    const awayId = game.teams.away.team.id
    const slug = slugifyGame(game)
    const gameDateApi = game.gameDate?.split('T')[0] ?? targetDate
    const homePitcher = (game.teams.home as any).probablePitcher
    const awayPitcher = (game.teams.away as any).probablePitcher

    for (const [teamId, opposingTeamId, pitcher, teamName] of [
      [homeId, awayId, homePitcher, game.teams.home.team.name],
      [awayId, homeId, awayPitcher, game.teams.away.team.name],
    ] as const) {
      const pairKey = `${game.gamePk}:${teamId}`

      // Idempotency gate — already logged and not forcing. Skip without
      // touching the compute path.
      if (!force && loggedPairs.has(pairKey)) {
        skippedAlreadyLogged++
        continue
      }

      // Force path — delete first, then let the write below repopulate.
      // Two-step rather than an upsert so a compute failure after the
      // delete leaves the row absent rather than half-written; the next
      // regular cron run (without force) will then fill it in cleanly.
      if (force && loggedPairs.has(pairKey)) {
        await deleteLoggedPair(game.gamePk, teamId, gameDateApi)
        forceOverwrote++
      }

      try {
        const seriesResult = await getSeriesTop3(teamId, opposingTeamId, gameDateApi, game.gamePk)
        const pitcherEdge = pitcher?.id
          ? await getPitcherSeriesEdge(pitcher.id, pitcher.fullName ?? 'TBD', opposingTeamId, gameDateApi, game.gamePk)
          : null

        const ranked = rankKeyPlayers(seriesResult.batters, pitcherEdge)
        if (ranked.length === 0) continue

        const formMap = await getFormMapForTeam(teamId, teamName as string)
        const rows = buildKeyPlayersSnapshotRows(game.gamePk, slug, gameDateApi, teamId, opposingTeamId, ranked, formMap)
        const result = await writeKeyPlayersSnapshot(rows)
        written += result.written
        failed += result.failed
      } catch (e) {
        console.error(`key-players-snapshot cron: failed for team ${teamId}, game ${game.gamePk}`, e)
        failed++
      }
    }
  }

  return NextResponse.json({
    date: targetDate,
    games: games.length,
    force,
    targetGamePk,
    skippedLiveOrFinal,
    skippedAlreadyLogged,
    forceOverwrote,
    written,
    failed,
  })
}

/*
 * ─── MANUAL TRIGGER CHEATSHEET ─────────────────────────────────────────
 *
 * Set BASE=https://your-site.com (or http://localhost:3000 for local).
 * Set SECRET=$CRON_SECRET (the same value in Vercel env vars).
 *
 * 1. Standard run — only computes games not yet logged, respecting freeze:
 *      curl -H "Authorization: Bearer $SECRET" $BASE/api/cron/key-players-snapshot
 *
 * 2. Recompute for a specific date (no force — still skips already-logged):
 *      curl -H "Authorization: Bearer $SECRET" \
 *           "$BASE/api/cron/key-players-snapshot?date=2026-08-24"
 *
 * 3. Force recompute the WHOLE slate for today — overwrites logged
 *    snapshots. Live/Final games still skipped:
 *      curl -H "Authorization: Bearer $SECRET" \
 *           "$BASE/api/cron/key-players-snapshot?force=true"
 *
 * 4. Force recompute ONE game only (by gamePk from the schedule):
 *      curl -H "Authorization: Bearer $SECRET" \
 *           "$BASE/api/cron/key-players-snapshot?force=true&gamePk=778291"
 *
 * 5. Force recompute one game on a specific date:
 *      curl -H "Authorization: Bearer $SECRET" \
 *           "$BASE/api/cron/key-players-snapshot?force=true&gamePk=778291&date=2026-08-24"
 *
 * Response JSON includes counters so you can eyeball what happened:
 *   written              — rows successfully upserted
 *   failed               — compute or write failures (see server logs)
 *   skippedAlreadyLogged — the normal freeze-in-effect count
 *   skippedLiveOrFinal   — games already underway (never touched)
 *   forceOverwrote       — snapshots deleted before recompute (force only)
 */