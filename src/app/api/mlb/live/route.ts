// GET /api/mlb/live?date=YYYY-MM-DD: today's linescores only (score, inning, state per gamePk). Uncached; the /mlb page polls it every
// 30 seconds while a game is live. Public data from the MLB Stats API.
import { NextRequest, NextResponse } from 'next/server'
import { etDate, gameState } from '@/lib/mlb-home-dashboard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('date')
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : etDate()
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: 'MLB Stats API did not respond' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
    const j = await res.json()
    const games = ((j.dates?.[0]?.games ?? []) as any[]).map(g => {
      const st = gameState(g)
      return { gamePk: g.gamePk, group: st.group, state: st.state, awayScore: g.teams.away.score ?? null, homeScore: g.teams.home.score ?? null, startUtc: g.gameDate }
    })
    return NextResponse.json({ games }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[api/mlb/live] failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not reach the MLB Stats API' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
