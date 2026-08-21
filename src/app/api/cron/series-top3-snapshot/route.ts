// src/app/api/cron/series-top3-snapshot/route.ts
//
// Vercel cron target — computes getSeriesTop3 for every team in today's
// slate and writes a stripped-down summary to series_top3_snapshot for
// the MLB homepage to read (see series-top3-snapshot.ts for why this is
// cron-backed rather than live-computed on the homepage).
//
// SCHEDULING NOTE: probable pitchers get announced/confirmed at different
// times through the day, so running this once in the morning means later
// confirmations won't show up until the next run. Worth scheduling this
// 2-3x/day (e.g. 9am, 1pm, 5pm ET) rather than once, same way other
// probable-pitcher-dependent data on this site refreshes. Add to
// vercel.json:
//
//   { "path": "/api/cron/series-top3-snapshot", "schedule": "0 13,17,21 * * *" }
//
// AUTH: uses the standard Vercel cron secret header check. If your other
// cron routes use a different convention, match that instead — this is a
// reasonable default, not a confirmed match to your existing pattern
// (I don't have visibility into any other cron route in this codebase).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getScheduleForDate, slugifyGame } from '@/lib/mlb'
import { getSeriesTop3 } from '@/lib/series-matchup'
import { buildSnapshotRow } from '@/lib/series-top3-snapshot'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]
  const supa = createAdminClient()

  let games: Awaited<ReturnType<typeof getScheduleForDate>> = []
  try {
    games = await getScheduleForDate(today)
  } catch (e) {
    console.error('series-top3-snapshot cron: schedule fetch failed', e)
    return NextResponse.json({ error: 'schedule fetch failed' }, { status: 500 })
  }

  let written = 0
  let failed = 0

  for (const game of games) {
    const homeId = game.teams.home.team.id
    const awayId = game.teams.away.team.id
    const slug = slugifyGame(game)
    const gameDateApi = game.gameDate?.split('T')[0] ?? today

    for (const [teamId, opposingTeamId] of [[homeId, awayId], [awayId, homeId]] as const) {
      try {
        const result = await getSeriesTop3(teamId, opposingTeamId, gameDateApi, game.gamePk)
        const row = buildSnapshotRow(teamId, opposingTeamId, slug, result)

        const { error } = await supa.from('series_top3_snapshot').upsert(
          {
            game_date: today,
            team_id: row.team_id,
            opposing_team_id: row.opposing_team_id,
            game_slug: row.game_slug,
            edge_count: row.edge_count,
            top3_summary: row.top3_summary,
            computed_at: new Date().toISOString(),
          },
          { onConflict: 'game_date,team_id' },
        )
        if (error) {
          console.error(`series-top3-snapshot cron: upsert failed for team ${teamId}`, error)
          failed++
        } else {
          written++
        }
      } catch (e) {
        console.error(`series-top3-snapshot cron: getSeriesTop3 failed for team ${teamId}`, e)
        failed++
      }
    }
  }

  return NextResponse.json({ date: today, games: games.length, written, failed })
}