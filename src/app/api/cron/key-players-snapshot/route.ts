// src/app/api/cron/key-players-snapshot/route.ts
//
// Computes and freezes Top 3 Key Players for every game in today's slate,
// both teams per game. FREEZE-AT-FIRST-PITCH: skips any game already
// Live/Final, so the last write before first pitch is what sticks — the
// game-page tab reads this snapshot once live scoring naturally empties
// out post-game.
//
// SCHEDULING: every 30 min through the day (probable pitchers confirm at
// different times). vercel.json:
//   { "path": "/api/cron/key-players-snapshot", "schedule": "*/30 * * * *" }
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getScheduleForDate, slugifyGame } from '@/lib/mlb'
import { getSeriesTop3 } from '@/lib/series-matchup'
import { getPitcherSeriesEdge } from '@/lib/pitcher-series-edge'
import { rankKeyPlayers, buildKeyPlayersSnapshotRows, writeKeyPlayersSnapshot } from '@/lib/key-players'
import type { RecentFormContext } from '@/lib/key-players-narrative'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]
  let games: Awaited<ReturnType<typeof getScheduleForDate>> = []
  try {
    games = await getScheduleForDate(today)
  } catch (e) {
    console.error('key-players-snapshot cron: schedule fetch failed', e)
    return NextResponse.json({ error: 'schedule fetch failed' }, { status: 500 })
  }

  let written = 0, failed = 0, skippedLiveOrFinal = 0

  for (const game of games) {
    const abstractState = (game as any).status?.abstractGameState
    if (abstractState === 'Live' || abstractState === 'Final') { skippedLiveOrFinal++; continue }

    const homeId = game.teams.home.team.id
    const awayId = game.teams.away.team.id
    const slug = slugifyGame(game)
    const gameDateApi = game.gameDate?.split('T')[0] ?? today
    const homePitcher = (game.teams.home as any).probablePitcher
    const awayPitcher = (game.teams.away as any).probablePitcher

    for (const [teamId, opposingTeamId, pitcher, teamName] of [
      [homeId, awayId, homePitcher, game.teams.home.team.name],
      [awayId, homeId, awayPitcher, game.teams.away.team.name],
    ] as const) {
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

  return NextResponse.json({ date: today, games: games.length, skippedLiveOrFinal, written, failed })
}