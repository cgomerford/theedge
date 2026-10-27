// src/app/api/stats/compare/route.ts
//
// Pro-only. Returns every player's values for one season/level/game type so the Stats graph can overlay another year.
// Reads the same MLB stats feed as the Stats page boards; nothing is written.
import { NextResponse } from 'next/server'
import { requirePro } from '@/lib/require-pro'
import { getBattingBoardFor, getPitchingBoardFor, LEVELS, GAME_TYPES, type StatsCtx } from '@/lib/stats-leaderboards'

export async function GET(req: Request) {
  const denied = await requirePro()
  if (denied) return denied
  const q = new URL(req.url).searchParams
  const season = Number(q.get('season'))
  const sportId = Number(q.get('level'))
  const gameType = GAME_TYPES.find(g => g.id === q.get('type'))?.id
  if (!(season >= 1990 && season <= new Date().getFullYear()) || !LEVELS.some(l => l.id === sportId) || !gameType) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const ctx: StatsCtx = { season, sportId, gameType }
  try {
    const board = q.get('group') === 'pitching' ? await getPitchingBoardFor(ctx) : await getBattingBoardFor(ctx)
    const out: Record<number, Record<string, number | null>> = {}
    for (const r of board.rows) out[r.id] = { ...r.v, __n: r.n }
    return NextResponse.json({ rows: out })
  } catch (e) {
    console.error('[stats/compare] failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
