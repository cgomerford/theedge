// src/app/api/stats/seasons/route.ts
//
// Returns the list of MLB seasons a player actually has game data for.
//
// Mirrors fetchYearByYearHitting in lib/lab.ts exactly (same query, same
// minimal filter) — that function is already proven against real players.
//
// force-dynamic + revalidate 0 added after the route returned an empty
// list for every player regardless of code changes inside it — same fix
// already used in spray-chart/route.ts for the same class of problem.

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const subject = searchParams.get('subject') === 'pitcher' ? 'pitcher' : 'batter'
    const playerId = Number(searchParams.get('playerId'))
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

    const group = subject === 'pitcher' ? 'pitching' : 'hitting'
    const res = await fetch(`${MLB_API}/people/${playerId}/stats?stats=yearByYear&group=${group}`, { cache: 'no-store' })

    console.log(`[stats/seasons] playerId=${playerId} subject=${subject} MLB API status=${res.status}`)

    if (!res.ok) throw new Error(`MLB API ${res.status}`)
    const json = await res.json()
    const splits = (json.stats?.[0]?.splits ?? []) as any[]

    console.log(`[stats/seasons] playerId=${playerId} raw splits=${splits.length}`)

    const seasons = Array.from(new Set(
      splits
        .filter((s: any) => s.season)
        .map((s: any) => Number(s.season))
        .filter((n: number) => !Number.isNaN(n))
    )).sort((a, b) => b - a)

    console.log(`[stats/seasons] playerId=${playerId} resolved seasons=${JSON.stringify(seasons)}`)

    return NextResponse.json({ seasons })
  } catch (err) {
    console.error('[stats/seasons] ERROR:', err)
    return NextResponse.json({ seasons: [], error: err instanceof Error ? err.message : 'Unknown error' }, { status: 200 })
  }
}