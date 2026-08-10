// src/app/api/games/[gamePk]/live-superlatives/route.ts
//
// Backs <LiveSuperlatives />. Fetches the full GUMBO feed server-side and
// returns only the small computed payload — keeps the large feed off the
// client. `cache: 'no-store'` on the upstream fetch (inside getLiveFeed)
// means this route itself should be called sparingly; the client widget
// polls every 45s, which is the ceiling you want here, not something to
// tighten.
//
// NOTE ON FILE PATH: Next.js App Router expects the literal folder name
// `[gamePk]` (square brackets), not the URL-encoded `%5BgamePk%5D` — rename
// the folder after copying this in if your tooling round-tripped the name.
//
// FIX (this pass): Next.js 16 requires dynamic route `params` to be typed
// and awaited as a Promise — this route still had the old synchronous-object
// signature, which fails typecheck. Same pattern as postgame/page.tsx's
// `const { slug } = await params`.
import { NextRequest, NextResponse } from 'next/server'
import { getLiveFeed } from '@/lib/mlb-live-feed'
import { computeLiveSuperlatives } from '@/lib/postgame-aggregate'
import type { LiveSuperlativesPayload } from '@/types/postgame'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ gamePk: string }> },
) {
  const { gamePk: gamePkParam } = await params
  const gamePk = Number(gamePkParam)
  if (!Number.isFinite(gamePk)) {
    return NextResponse.json({ error: 'invalid gamePk' }, { status: 400 })
  }
  const feed = await getLiveFeed(gamePk)
  if (!feed) {
    return NextResponse.json({ error: 'feed unavailable' }, { status: 502 })
  }
  const superlatives = computeLiveSuperlatives(feed)
  const plays = feed.liveData.plays.allPlays ?? []
  const asOfInning = plays.length ? plays[plays.length - 1].about.inning : 1
  const isFinal = feed.gameData.status.abstractGameState === 'Final'
  const payload: LiveSuperlativesPayload = {
    ...superlatives,
    gamePk,
    asOfInning,
    isFinal,
  }
  return NextResponse.json(payload)
}