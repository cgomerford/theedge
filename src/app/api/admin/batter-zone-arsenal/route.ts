// src/app/api/admin/batter-zone-arsenal/route.ts
//
// Thin server route so the client-side admin dropdown
// (ScoutReportGraphicSection.tsx) can fetch a specific batter's
// batter_zone_arsenal on selection, without exposing the service-role
// Supabase client (getBatterZoneArsenal uses createAdminClient) to the
// browser.

import { NextResponse } from 'next/server'
import { getBatterZoneArsenal } from '@/lib/batter-zone-arsenal'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerIdParam = searchParams.get('playerId')
  const playerId = playerIdParam ? Number(playerIdParam) : NaN

  if (!playerId || Number.isNaN(playerId)) {
    return NextResponse.json({ error: 'playerId query param required' }, { status: 400 })
  }

  const data = await getBatterZoneArsenal(playerId)
  return NextResponse.json({ arsenal: data })
}