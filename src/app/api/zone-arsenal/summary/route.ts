// src/app/api/zone-arsenal/summary/route.ts
//
// FREE summary of a pitcher's zone arsenal (no gate, no cookies). Only the 'all' split, and per pitch only the headline fields plus,
// per zone 1-9, usage / BA against / pitches / low_sample. Everything deeper (handedness splits, SLG, whiff, hard-hit, wOBA, run value)
// lives on the guarded /api/zone-arsenal.
import { NextRequest, NextResponse } from 'next/server'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'

export const revalidate = 3600

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId')
  if (!playerId || isNaN(Number(playerId))) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  try {
    const all = (await getPitcherZoneArsenal(Number(playerId)))['all']
    if (!all) return NextResponse.json({ arsenal: {} })
    const pitches = Object.fromEntries(Object.entries(all.arsenal).map(([code, p]) => [code, {
      pitch_type: code, pitch_name: p.pitch_name, usage_pct: p.usage_pct, avg_velo: p.avg_velo, total_pitches: p.total_pitches,
      low_sample: Object.values(p.zones).every(z => z.low_sample),
      zones: Object.fromEntries(Object.entries(p.zones).map(([z, c]) => [z, { usage_pct: c.usage_pct, ba_against: c.ba_against, pitches: c.pitches, low_sample: c.low_sample }])),
    }]))
    return NextResponse.json({ arsenal: { all: { player_id: all.player_id, player_name: all.player_name, total_pitches: all.total_pitches, arsenal: pitches } } })
  } catch (err) {
    console.error('[zone-arsenal/summary] failed:', err)
    return NextResponse.json({ arsenal: {} }, { status: 500 })
  }
}
