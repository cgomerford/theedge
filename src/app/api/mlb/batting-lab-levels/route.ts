// src/app/api/mlb/batting-lab-levels/route.ts
//
// Which levels a hitter played at this season, for the Batting Lab's level selector: MLB, Triple-A and the Florida State League, each with his games and plate appearances
// (`pitches` carries the plate appearances) from the MLB Stats API game log. A level he did not play at is left out, so the selector never offers an empty view. Public: it is a count.
//   ?playerId=<MLBAM id>[&season=2026]

import { NextRequest, NextResponse } from 'next/server'
import { getHitterLevelUse } from '@/lib/milb-shape/game-log'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const id = Number(sp.get('playerId')), season = Number(sp.get('season') ?? new Date().getFullYear())
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(season) || season < 2021 || season > new Date().getFullYear() + 1) return NextResponse.json({ error: 'Bad playerId or season' }, { status: 400 })
  return NextResponse.json({ playerId: id, season, levels: await getHitterLevelUse(id, season) })
}
