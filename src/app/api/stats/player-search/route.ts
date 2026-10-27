// src/app/api/stats/player-search/route.ts
//
// GET /api/stats/player-search?q=guerrero — type-ahead for the "player" filter. MLB Stats API people search
// (free, no auth). Open to everyone: it returns only public names, ids and clubs, and the ask lab needs it to read "Juan Soto vs Yankees". The text is URL-encoded and length-limited.

import { NextRequest, NextResponse } from 'next/server'
import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'
import { MLB_TEAMS } from '@/lib/teams'

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 40)
  if (q.length < 2) return NextResponse.json({ players: [] })
  try {
    const res = await throttledMlbFetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(q)}&hydrate=currentTeam&sportIds=1&limit=8`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`MLB Stats API ${res.status}`)
    const j = await res.json()
    const players = ((j.people ?? []) as any[]).map(p => ({
      id: Number(p.id), name: String(p.fullName ?? ''), pos: String(p.primaryPosition?.abbreviation ?? ''),
      team: MLB_TEAMS.find(t => t.id === p.currentTeam?.id)?.abbrev ?? '', active: !!p.active,
    }))
    return NextResponse.json({ players }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (e) {
    console.error('[stats/player-search] failed:', (e as Error).message)
    return NextResponse.json({ error: 'Player search did not respond.' }, { status: 502 })
  }
}
