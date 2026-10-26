// src/app/api/batter-zones/summary/route.ts
//
// FREE summary of a batter's hot zones (no gate, no cookies). Only the 'all' split, and per zone 1-9 only xwOBA and the pitch count
// behind it (the source names the sample field `pitches`; it has no low_sample flag). Everything deeper (BA, SLG, whiff, exit
// velocity, other splits) lives on the guarded /api/batter-zones.
import { NextRequest, NextResponse } from 'next/server'
import { getBatterHotZones } from '@/lib/hot-zones'

export const revalidate = 3600

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  if (!playerId || isNaN(Number(playerId))) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  try {
    const all = (await getBatterHotZones(Number(playerId)))['all']
    if (!all) return NextResponse.json({ zones: {} })
    const zones = Object.fromEntries(Object.entries(all.zones).map(([z, c]) => [z, { xwoba: c.xwoba ?? null, pitches: c.pitches ?? 0 }]))
    return NextResponse.json({ zones: { all: { player_id: all.player_id, player_name: all.player_name, total_pitches: all.total_pitches, zones } } })
  } catch (err) {
    console.error('[batter-zones/summary] failed:', err)
    return NextResponse.json({ zones: {} }, { status: 500 })
  }
}
