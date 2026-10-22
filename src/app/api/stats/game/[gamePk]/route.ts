// src/app/api/stats/game/[gamePk]/route.ts
//
// GET /api/stats/game/{gamePk} — one game in full (line score, box, every plate appearance and pitch).
// Public (it is MLB's own free live data); the Pro-only part of the Games page is the "last time" search,
// which has its own gated routes. The page polls this every 15 s while a game is live.

import { NextResponse } from 'next/server'
import { getGameExplorer } from '@/lib/game-explorer'

export const maxDuration = 30

export async function GET(_req: Request, { params }: { params: Promise<{ gamePk: string }> }) {
  const { gamePk } = await params
  const pk = Number(gamePk)
  if (!Number.isInteger(pk) || pk <= 0) return NextResponse.json({ error: 'Bad game id.' }, { status: 400 })
  const game = await getGameExplorer(pk)
  if (!game) return NextResponse.json({ error: 'MLB did not return that game.' }, { status: 404 })
  return NextResponse.json(game, { headers: { 'Cache-Control': 'no-store' } })
}
