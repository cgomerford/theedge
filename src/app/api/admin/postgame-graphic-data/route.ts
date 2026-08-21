// src/app/api/admin/postgame-graphic-data/route.ts
//
// Feeds PostGameXCardSection. Runs server-side since it hits the MLB
// live-feed endpoint + does the aggregateGameFeed computation — same
// data layer already used by the real post-game report page, reused
// here rather than duplicated.

import { NextRequest, NextResponse } from 'next/server'
import { getLiveFeed } from '@/lib/mlb-live-feed'
import { aggregateGameFeed } from '@/lib/postgame-aggregate'
import { getPostGameReport } from '@/lib/postgame'
import { getGameBoxScore } from '@/lib/game-boxscore'
import { findTeamByName } from '@/lib/teams'

export async function GET(req: NextRequest) {
  const gamePk = req.nextUrl.searchParams.get('gamePk')
  if (!gamePk) return NextResponse.json({ error: 'gamePk required' }, { status: 400 })

  const pk = Number(gamePk)
  const [box, liveFeed, report] = await Promise.all([
    getGameBoxScore(pk),
    getLiveFeed(pk),
    getPostGameReport(pk).catch(() => null),
  ])

  if (!box) return NextResponse.json({ error: 'Box score unavailable' }, { status: 404 })
  const aggregate = liveFeed ? aggregateGameFeed(liveFeed, `game-${pk}`) : null
  if (!aggregate) return NextResponse.json({ error: 'Pitch data unavailable' }, { status: 404 })

  const awayTeam = findTeamByName(box.away.teamName)
  const homeTeam = findTeamByName(box.home.teamName)

  return NextResponse.json({
    awayAbbr: box.away.abbr,
    homeAbbr: box.home.abbr,
    awayTeamId: box.away.teamId,
    homeTeamId: box.home.teamId,
    awayColor: awayTeam?.primary_color ?? '#FF5722',
    homeColor: homeTeam?.primary_color ?? '#1A1A1A',
    gameInfo: report?.gameInfo ?? { venue: null, weatherCondition: null, tempF: null, wind: null, startTime: null, durationMinutes: null, endTime: null, attendance: null },
    pitchers: aggregate.pitchers,
    pitchLog: aggregate.pitchLog,
    batters: aggregate.batters,
    battedBalls: aggregate.battedBalls,
  })
}