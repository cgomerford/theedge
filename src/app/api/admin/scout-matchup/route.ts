// src/app/api/admin/scout-matchup/route.ts
//
// Thin server route for the admin Scout Report Graphic builder: on batter
// selection it returns season line, handedness, H2H vs the pitcher, career
// record at the game's ballpark, and the batter's zone-by-pitch data. Server
// route because getBatterZoneArsenal needs the service-role Supabase client.

import { NextResponse } from 'next/server'
import { getScoutMatchup } from '@/lib/scout-matchup'

function posInt(v: string | null): number | null {
  const n = v ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const batterId = posInt(searchParams.get('batterId'))
  if (!batterId) {
    return NextResponse.json({ error: 'batterId query param required' }, { status: 400 })
  }
  const data = await getScoutMatchup(batterId, posInt(searchParams.get('pitcherId')), posInt(searchParams.get('venueId')))
  return NextResponse.json(data)
}
