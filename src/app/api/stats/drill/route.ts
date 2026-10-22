// src/app/api/stats/drill/route.ts
//
// GET /api/stats/drill?level=team-players|player-games|game-detail — the rows that open under a
// table row. Pro-only (same as the team breakdown). Every id/param is validated before it is used
// in an MLB URL.

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { gameDetail, playerGames, teamPlayers } from '@/lib/stats-drill'
import { CURRENT_SEASON, FIRST_SEASON, GAME_TYPES, isValidSplit, type Group } from '@/lib/stats-query-catalog'

export const maxDuration = 60

const id = (v: string | null) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 1e9 ? n : null }

export async function GET(req: NextRequest) {
  if (!(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  const sp = new URL(req.url).searchParams
  const gp = sp.get('group')
  const group: Group = gp === 'pitching' || gp === 'fielding' ? gp : 'hitting'
  const gameType = GAME_TYPES.some(g => g.key === sp.get('gameType')) ? (sp.get('gameType') as string) : 'R'
  const yr = (v: string | null) => { const n = Number(v); return Number.isInteger(n) ? Math.min(CURRENT_SEASON, Math.max(FIRST_SEASON, n)) : CURRENT_SEASON }
  const from = yr(sp.get('from')), to = yr(sp.get('to'))
  const splitParam = sp.get('split') ?? ''
  const split = splitParam && isValidSplit(splitParam, group) ? splitParam : ''

  try {
    switch (sp.get('level')) {
      case 'team-players': {
        const teamId = id(sp.get('teamId'))
        if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })
        return NextResponse.json({ rows: await teamPlayers(group, teamId, gameType, from, to, split) }, { headers: { 'Cache-Control': 'private, max-age=300' } })
      }
      case 'player-games': {
        const playerId = id(sp.get('playerId'))
        if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })
        return NextResponse.json({ rows: await playerGames(group, playerId, gameType, from, to) }, { headers: { 'Cache-Control': 'private, max-age=300' } })
      }
      case 'game-detail': {
        const gamePk = id(sp.get('gamePk')), playerId = id(sp.get('playerId'))
        if (!gamePk || !playerId) return NextResponse.json({ error: 'gamePk and playerId required' }, { status: 400 })
        const atBat = id(sp.get('atBat')) ?? undefined
        return NextResponse.json(await gameDetail(group, gamePk, playerId, atBat), { headers: { 'Cache-Control': 'private, max-age=300' } })
      }
      default:
        return NextResponse.json({ error: 'unknown level' }, { status: 400 })
    }
  } catch (e) {
    console.error('[stats/drill] failed:', (e as Error).message)
    return NextResponse.json({ error: 'MLB Stats API did not respond. Try again in a moment.' }, { status: 502 })
  }
}
