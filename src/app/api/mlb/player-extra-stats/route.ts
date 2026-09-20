// src/app/api/mlb/player-extra-stats/route.ts
//
// On-demand extras for the game-preview "Standard Stats" modal — park
// record, vs-pitcher (batters only), and the two situational splits MLB's
// own sitCodes endpoint actually supports (RISP, bases loaded/empty).
// Deliberately NOT pre-fetched for every lineup slot server-side (that
// would be 9 batters × 2 teams × several external MLB API calls each on
// every single page load) — the client only calls this once, for
// whichever player's Standard Stats modal is actually opened. Same
// on-demand-fetch-on-select pattern already used by
// batting-lab/BatterHotZoneOverlay.tsx elsewhere in this app.
//
// No base-out-state splits beyond what MLB's sitCodes support (RISP,
// bases loaded/empty) — there is no real MLB Stats API split for e.g.
// "runner on first only" or "runners on 1st and 3rd" specifically; that
// would require parsing raw play-by-play runner state per plate
// appearance, a real new data pipeline, not wired up here.

import { NextRequest, NextResponse } from 'next/server'
import { getBatterVenueRecord } from '@/lib/batter-venue-record'
import { getPitcherVenueRecord } from '@/lib/pitcher-venue-record'
import { getBatterVsPitcher } from '@/lib/batter-stats'
import { fetchHittingSplit, fetchPitchingSplit } from '@/lib/player-splits'

export const dynamic = 'force-dynamic'

function findVenueRow<T extends { venue: string }>(rows: T[], venueName: string): T | null {
  const needle = venueName.trim().toLowerCase()
  return rows.find(r => r.venue.trim().toLowerCase() === needle) ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') === 'pitcher' ? 'pitcher' : 'batter'
  const playerId = Number(searchParams.get('playerId'))
  const season = Number(searchParams.get('season') ?? new Date().getFullYear())
  const venueName = searchParams.get('venueName') ?? ''
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })

  if (type === 'pitcher') {
    const [parkRows, risp, basesEmpty] = await Promise.all([
      getPitcherVenueRecord(playerId, season, 'season'),
      fetchPitchingSplit(playerId, season, 'risp'),
      fetchPitchingSplit(playerId, season, 'e'),
    ])
    return NextResponse.json({
      parkRecord: venueName ? findVenueRow(parkRows, venueName) : null,
      risp, basesEmpty,
    })
  }

  const opposingPitcherId = Number(searchParams.get('opposingPitcherId') ?? 0)
  const [parkRows, vsPitcher, risp, basesLoaded] = await Promise.all([
    getBatterVenueRecord(playerId, season, 'season'),
    opposingPitcherId ? getBatterVsPitcher(playerId, opposingPitcherId) : Promise.resolve(null),
    fetchHittingSplit(playerId, season, 'risp'),
    fetchHittingSplit(playerId, season, 'l'),
  ])
  return NextResponse.json({
    parkRecord: venueName ? findVenueRow(parkRows, venueName) : null,
    vsPitcher, risp, basesLoaded,
  })
}
