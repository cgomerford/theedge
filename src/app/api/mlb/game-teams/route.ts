// src/app/api/mlb/game-teams/route.ts
//
// For a list of game ids: the away and home club and the ballpark. Public MLB Stats API data, cached a day (finished games do not change).
// Used by the Pitching Lab H2H tab to sort a pitcher's meetings by opponent and ballpark. At most 400 ids per call, fetched 100 at a time.
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const ids = (new URL(req.url).searchParams.get('gamePks') ?? '').split(',').map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 400)
  if (ids.length === 0) return NextResponse.json({ error: 'gamePks required' }, { status: 400 })
  const out: Record<number, { away: number; home: number; venueId: number | null; venue: string }> = {}
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePks=${ids.slice(i, i + 100).join(',')}&hydrate=venue`, { next: { revalidate: 86400 } })
      if (!res.ok) { console.error('[game-teams] HTTP', res.status); continue }
      const json = await res.json()
      for (const d of json.dates ?? []) for (const g of d.games ?? []) {
        out[g.gamePk] = { away: g.teams?.away?.team?.id, home: g.teams?.home?.team?.id, venueId: g.venue?.id ?? null, venue: g.venue?.name ?? '' }
      }
    }
    return NextResponse.json({ games: out })
  } catch (e) {
    console.error('[game-teams] failed:', (e as Error).message)
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }
}
