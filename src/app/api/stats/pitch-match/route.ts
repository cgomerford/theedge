// src/app/api/stats/pitch-match/route.ts
//
// GET /api/stats/pitch-match — "when did this batter last see a pitch like this one?" Pro-only.
// Every parameter is validated to plain numbers / a short code before use.
//   batter (MLB id), type (pitch code), x, z (feet), speed (mph, optional), count ("1-2", optional),
//   pitcher (MLB id, optional), from / to (seasons)

import { NextRequest, NextResponse } from 'next/server'
import { isProViewer } from '@/lib/require-pro'
import { matchPitches } from '@/lib/pitch-match'
import { CURRENT_SEASON } from '@/lib/stats-query-catalog'

export const maxDuration = 60

const finite = (v: string | null): number | null => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export async function GET(req: NextRequest) {
  if (!(await isProViewer())) return NextResponse.json({ error: 'Pro required', upgrade: '/pricing' }, { status: 403 })
  const sp = new URL(req.url).searchParams
  const batterId = finite(sp.get('batter')), x = finite(sp.get('x')), z = finite(sp.get('z'))
  const type = sp.get('type') ?? ''
  if (!batterId || !Number.isInteger(batterId) || batterId > 1e9 || x == null || z == null || !/^[A-Z]{2,3}$/.test(type)) {
    return NextResponse.json({ error: 'Missing or invalid pitch details.' }, { status: 400 })
  }
  const count = sp.get('count') ?? ''
  const pitcher = finite(sp.get('pitcher'))
  const from = Math.max(2015, Math.min(CURRENT_SEASON, Math.round(finite(sp.get('from')) ?? CURRENT_SEASON - 2)))
  const to = Math.max(from, Math.min(CURRENT_SEASON, Math.round(finite(sp.get('to')) ?? CURRENT_SEASON)))
  if (to - from > 4) return NextResponse.json({ error: 'Use five seasons or fewer.' }, { status: 400 })
  try {
    const result = await matchPitches({
      batterId, type, x: Math.max(-4, Math.min(4, x)), z: Math.max(-1, Math.min(7, z)), speed: finite(sp.get('speed')),
      count: /^[0-3]-[0-2]$/.test(count) ? count : undefined,
      pitcherId: pitcher && Number.isInteger(pitcher) && pitcher < 1e9 ? pitcher : undefined,
      fromSeason: from, toSeason: to,
    })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[stats/pitch-match] failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not search that batter\'s pitches. Try again in a moment.' }, { status: 502 })
  }
}
