// src/app/api/mlb/pitcher-bio/route.ts
//
// Thin client-fetchable wrapper around getPlayerPageData (real MLB Stats
// API bio/draft/education/awards/transactions/yearByYear — the exact same
// fetcher /mlb/players/[id] uses). The Pitching Lab shell is fully
// client-rendered (PitchingLabProvider context), so its Overview tab needs
// this over an API route rather than calling the server-only fetcher
// directly from a client component.

import { NextRequest, NextResponse } from 'next/server'
import { getPlayerPageData } from '@/lib/player-page'
import { requirePro } from '@/lib/require-pro'

export const revalidate = 3600

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const playerId = Number(searchParams.get('playerId'))
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  const data = await getPlayerPageData(playerId)
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(data)
}
