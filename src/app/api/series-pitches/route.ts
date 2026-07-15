// Server-side proxy for the hover card — browser-to-Savant CORS is untested
// (flagged risk earlier this session re: fetchStatcastClientSide in
// BattingTabContent), so this route does the fetch, not the client.
import { NextRequest, NextResponse } from 'next/server'
import { getBatterPitchesInWindow } from '@/lib/series-pitches'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const batterId = Number(searchParams.get('batterId'))
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  if (!batterId || !start || !end) {
    return NextResponse.json({ error: 'batterId, start, end required' }, { status: 400 })
  }
const pitches = await getBatterPitchesInWindow(batterId, start, end)
  console.log(`[series-pitches] batter ${batterId}, ${start}–${end}: ${pitches.length} pitches`)
  return NextResponse.json({ pitches })
}